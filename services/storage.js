'use strict';

// ===========================================================================
// storage.js — Persistenz via electron-store (Ersatz für KeychainService.swift
// + Settings-Persistenz). Der API-Key wird verschlüsselt abgelegt.
//   Lazy-Init: Store erst bei erster Nutzung erzeugen (braucht app 'ready').
// ===========================================================================

let store = null;

function s() {
  if (!store) {
    const Store = require('electron-store');
    store = new Store({
      name: 'blitztext-settings',
      // Einfache Verschlüsselung wie im Skill vorgesehen (Windows-Pendant zum Keychain).
      encryptionKey: 'blitztext-secure-key-2024',
    });
  }
  return store;
}

const API_KEY = 'openai-api-key';
const SETTINGS = 'settings';

const prompts = require('./prompts');

// Default-Settings (Abbild der Swift-Structs).
function defaultSettings() {
  return {
    hotkeyMode: 'hold',            // 'hold' | 'toggle'
    secureLocalModeEnabled: false,
    language: 'de',
    textImprovement: {
      systemPrompt: '',
      customTerms: [],
      context: '',
      tone: 'neutral',             // 'formal' | 'neutral' | 'casual'
      customName: '',
    },
    dampfAblassen: {
      systemPrompt: prompts.DAMPF_DEFAULT_PROMPT,
      customName: '',
    },
    emojiText: {
      emojiDensity: 'mittel',      // 'wenig' | 'mittel' | 'viel'
      customName: '',
    },
  };
}

// Tiefe Zusammenführung (defaults <- gespeichert <- partial).
function deepMerge(base, override) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!override || typeof override !== 'object') return out;
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], ov);
    } else if (ov !== undefined) {
      out[key] = ov;
    }
  }
  return out;
}

module.exports = {
  getApiKey() {
    return s().get(API_KEY, '') || '';
  },
  setApiKey(value) {
    const v = (value || '').trim();
    if (v) s().set(API_KEY, v);
    else s().delete(API_KEY);
  },
  hasApiKey() {
    return !!s().get(API_KEY, '');
  },
  // Maskierte Anzeige wie AppState.apiKeyDisplayValue.
  apiKeyMasked() {
    const v = s().get(API_KEY, '') || '';
    if (!v) return '';
    const dots = '••••••••';
    return v.length > 8 ? v.slice(0, 4) + ' ' + dots : dots;
  },

  // Volle Settings (mit Defaults aufgefüllt).
  getSettings() {
    return deepMerge(defaultSettings(), s().get(SETTINGS, {}));
  },
  // Teil-Update tief in die Settings mergen.
  updateSettings(partial) {
    const merged = deepMerge(this.getSettings(), partial || {});
    s().set(SETTINGS, merged);
    return merged;
  },

  // Generischer Zugriff (z.B. Sprache) — liest aus den Settings.
  get(key, def) {
    const settings = this.getSettings();
    return settings[key] !== undefined ? settings[key] : def;
  },
  set(key, value) {
    this.updateSettings({ [key]: value });
  },
};
