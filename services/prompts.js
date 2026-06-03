'use strict';

// ===========================================================================
// prompts.js — System-Prompts 1:1 aus LLMService.swift + den Settings-Defaults
// (WorkflowProtocol.swift). Die Builder berücksichtigen schon Ton/Begriffe/
// Kontext/Dichte für Schritt 8 (Settings-UI).
// ===========================================================================

// Default aus DampfAblassenSettings.systemPrompt
const DAMPF_DEFAULT_PROMPT =
  'Du erhältst ein emotional gesprochenes Transkript. Erkenne zuerst das eigentliche Ziel, Anliegen und den wahren Frust der Person. Formuliere daraus eine klare, respektvolle und wirksame Nachricht, mit der die Person ihr Ziel eher erreicht. Bewahre relevante Fakten, konkrete Probleme, Grenzen, Erwartungen und die nötige Dringlichkeit. Entferne Beleidigungen, Drohungen, Sarkasmus, Unterstellungen und unnötige Eskalation. Wenn mehrere Vorwürfe genannt werden, verdichte sie auf die entscheidenden Kernpunkte. Der Ton soll ruhig, menschlich, bestimmt und lösungsorientiert sein. Gib NUR die fertige Nachricht zurück.';

// Default-Settings (entsprechen den Swift-Structs)
const DEFAULT_IMPROVE_SETTINGS = {
  systemPrompt: '',
  customTerms: [],
  context: '',
  tone: 'neutral', // formal | neutral | casual
};

// Abbild von LLMService.buildSystemPrompt(settings:)
function buildImproveSystemPrompt(settings = DEFAULT_IMPROVE_SETTINGS) {
  const s = { ...DEFAULT_IMPROVE_SETTINGS, ...settings };

  if (s.systemPrompt && s.systemPrompt.length > 0) {
    let prompt = s.systemPrompt;
    if (s.customTerms && s.customTerms.length > 0) {
      prompt += '\n\nWichtig: Diese Eigennamen und Fachbegriffe muessen exakt so geschrieben werden: ' +
        s.customTerms.join(', ');
    }
    return prompt;
  }

  let prompt =
    'Du bist ein Lektor und Schreibassistent. Verbessere den folgenden Text:\n' +
    '- Korrigiere Rechtschreibung und Grammatik\n' +
    '- Verbessere die Formulierung und den Lesefluss\n' +
    '- Behalte die urspruengliche Bedeutung bei\n' +
    '- Gib NUR den verbesserten Text zurueck, keine Erklaerungen';

  switch (s.tone) {
    case 'formal':
      prompt += '\n- Verwende einen formellen, professionellen Ton';
      break;
    case 'casual':
      prompt += '\n- Verwende einen lockeren, natuerlichen Ton';
      break;
    default:
      prompt += '\n- Verwende einen neutralen, klaren Ton';
  }

  if (s.customTerms && s.customTerms.length > 0) {
    prompt += '\n\nWichtig: Diese Eigennamen und Fachbegriffe muessen exakt so geschrieben werden: ' +
      s.customTerms.join(', ');
  }
  if (s.context && s.context.length > 0) {
    prompt += '\n\nKontext: ' + s.context;
  }

  return prompt;
}

// Abbild von LLMService.buildEmojiSystemPrompt(density:)
function buildEmojiSystemPrompt(density = 'mittel') {
  let densityInstruction;
  switch (density) {
    case 'wenig':
      densityInstruction = 'Setze nur vereinzelt Emojis ein, maximal 1-2 pro Absatz.';
      break;
    case 'viel':
      densityInstruction = 'Setze grosszuegig Emojis ein, gerne mehrere pro Satz.';
      break;
    default:
      densityInstruction = 'Setze regelmaessig passende Emojis ein, etwa alle 1-2 Saetze.';
  }
  return 'Du erhaeltst ein gesprochenes Transkript. Gib den Text moeglichst originalgetreu zurueck, ' +
    'aber fuege passende Emojis ein. ' + densityInstruction +
    ' Korrigiere offensichtliche Sprach- und Grammatikfehler. Behalte den Stil und die Bedeutung bei. ' +
    'Gib NUR den Text mit Emojis zurueck, keine Erklaerungen.';
}

module.exports = {
  DAMPF_DEFAULT_PROMPT,
  DEFAULT_IMPROVE_SETTINGS,
  buildImproveSystemPrompt,
  buildEmojiSystemPrompt,
};
