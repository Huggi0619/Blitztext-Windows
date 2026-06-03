'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Sichere Bridge zwischen Renderer und Main Process.
// Wird Schritt für Schritt erweitert (Workflows, Settings, Audio, ...).
contextBridge.exposeInMainWorld('api', {
  // Fenster-Steuerung
  hideWindow: () => ipcRenderer.send('hide-window'),
  showWindow: () => ipcRenderer.send('show-window'),
  quit: () => ipcRenderer.send('quit'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height),

  // Globale Hotkeys (vom Main ausgelöst)
  onHotkey: (cb) => ipcRenderer.on('hotkey', (_e, data) => cb(data)),

  // Status / Einstellungen
  getStatus: () => ipcRenderer.invoke('get-status'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial),
  setLoginItem: (enabled) => ipcRenderer.invoke('set-login-item', enabled),

  // Workflow ausführen: Audio -> Whisper (-> GPT) -> Text
  runWorkflow: (payload) => ipcRenderer.invoke('run-workflow', payload),

  // Zwischen-Status während der Verarbeitung (z.B. "Text wird verbessert …")
  onWorkflowProgress: (cb) => ipcRenderer.on('workflow-progress', (_e, data) => cb(data)),

  // Auto-Paste: Text einfügen (Clipboard + Strg+V) bzw. nur kopieren/lesen
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  getClipboard: () => ipcRenderer.invoke('read-clipboard'),

  // Nur Dev: Renderer-Meldungen in die Main-Konsole (zum Testen).
  devLog: (msg) => ipcRenderer.send('dev-log', String(msg)),
});
