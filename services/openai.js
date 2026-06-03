'use strict';

// ===========================================================================
// openai.js — OpenAI-Aufrufe im Main Process (API-Key nie im Renderer).
//   transcribe(): 1:1 Portierung von TranscriptionService.swift
//   Nutzt globales fetch/FormData/Blob (Node 20 in Electron 31) — keine Extra-Deps.
//   GPT-Rewrite (chat) folgt in Schritt 6.
// ===========================================================================

const fs = require('fs');
const prompts = require('./prompts');

// Override z.B. für Proxy/Azure/Self-Host oder lokale Tests.
const TRANSCRIPTIONS_URL =
  process.env.OPENAI_TRANSCRIPTIONS_URL || 'https://api.openai.com/v1/audio/transcriptions';
const CHAT_URL =
  process.env.OPENAI_CHAT_URL || 'https://api.openai.com/v1/chat/completions';
const WHISPER_MODEL = 'whisper-1';
const REQUEST_TIMEOUT_MS = 60000;
const CHAT_TIMEOUT_MS = 45000;

// Modelle wie RewriteModel (LLMService.swift)
const MODEL_FAST = 'gpt-4o-mini'; // fastEdit
const MODEL_RAGE = 'gpt-4o';      // rageMode

async function transcribe(audioPath, options = {}) {
  const { apiKey, language = 'de', customTerms = [] } = options;

  if (!apiKey) {
    const err = new Error('OpenAI API Key fehlt. Bitte in den Einstellungen hinterlegen.');
    err.code = 'notConfigured';
    throw err;
  }

  const audioData = await fs.promises.readFile(audioPath);

  const form = new FormData();
  form.append('file', new Blob([audioData], { type: 'audio/webm' }), 'audio.webm');
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'text');

  if (customTerms && customTerms.length > 0) {
    form.append('prompt', 'Eigennamen und Begriffe: ' + customTerms.join(', '));
  }
  if (language && language.trim()) {
    form.append('language', language.trim());
  }

  let response;
  try {
    response = await fetch(TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/plain, application/json',
      },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error('Netzwerkfehler: ' + (err && err.message ? err.message : String(err)));
  }

  if (!response.ok) {
    let message = `Status ${response.status}`;
    try {
      const data = await response.json();
      if (data && data.error && data.error.message) message = data.error.message;
    } catch (_) { /* keine JSON-Fehlermeldung */ }
    throw new Error('OpenAI-Fehler: ' + message);
  }

  const text = (await response.text()).trim();
  if (!text) {
    throw new Error('OpenAI-Fehler: Transkription fehlgeschlagen');
  }
  return text;
}

// ---------------------------------------------------------------------------
// GPT-Rewrites — 1:1 Portierung von LLMService.complete(...)
// ---------------------------------------------------------------------------
async function complete(text, systemPrompt, model, temperature, apiKey) {
  if (!apiKey) {
    const err = new Error('OpenAI API Key fehlt. Bitte in den Einstellungen hinterlegen.');
    err.code = 'notConfigured';
    throw err;
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature,
  });

  let response;
  try {
    response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error('Verbindungsproblem: ' + (err && err.message ? err.message : String(err)));
  }

  if (!response.ok) {
    let message = `Status ${response.status}`;
    try {
      const data = await response.json();
      if (data && data.error && data.error.message) message = data.error.message;
    } catch (_) { /* keine JSON-Fehlermeldung */ }
    throw new Error('Fehler von OpenAI: ' + message);
  }

  let content = null;
  try {
    const data = await response.json();
    content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
  } catch (_) { /* ignore */ }

  if (!content || !content.trim()) {
    throw new Error('Keine Antwort erhalten. Bitte nochmal versuchen.');
  }
  return content.trim();
}

// Blitztext+ : gpt-4o-mini, temp 0.3
async function improve(text, { apiKey, settings } = {}) {
  return complete(text, prompts.buildImproveSystemPrompt(settings), MODEL_FAST, 0.3, apiKey);
}

// Blitztext $%&! : gpt-4o, temp 0.4
async function dampfAblassen(text, { apiKey, systemPrompt } = {}) {
  const prompt = systemPrompt && systemPrompt.trim() ? systemPrompt : prompts.DAMPF_DEFAULT_PROMPT;
  return complete(text, prompt, MODEL_RAGE, 0.4, apiKey);
}

// Blitztext :) : gpt-4o-mini, temp 0.3
async function addEmojis(text, { apiKey, density } = {}) {
  return complete(text, prompts.buildEmojiSystemPrompt(density), MODEL_FAST, 0.3, apiKey);
}

module.exports = { transcribe, complete, improve, dampfAblassen, addEmojis };
