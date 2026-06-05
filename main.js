'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, session, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, spawn } = require('child_process');

const storage = require('./services/storage');
const openai = require('./services/openai');
const quality = require('./services/quality');
const localTranscription = require('./services/local-transcription');

// ---------------------------------------------------------------------------
// Globale Referenzen (verhindern, dass der GC Fenster/Tray einsammelt)
// ---------------------------------------------------------------------------
let win = null;
let tray = null;
let isQuitting = false;
let pasteTargetHwnd = null; // Fenster, in das nach dem Workflow eingefügt wird

// Dev-Modus: Fenster beim Start sichtbar + kein Auto-Hide (nur zum Prüfen des UI).
const DEV = process.env.BLITZTEXT_DEV === '1';

// Debug-Log: in Konsole (Dev) und optional in eine Datei (für gepackte GUI-Exe).
function dlog(msg) {
  if (DEV) console.log(msg);
  const f = process.env.BLITZTEXT_LOGFILE;
  if (f) { try { fs.appendFileSync(f, msg + '\n'); } catch (_) { /* ignore */ } }
}
process.on('uncaughtException', (e) => dlog('[uncaught] ' + (e && e.stack ? e.stack : e)));

const WINDOW_WIDTH = 340;
const WINDOW_HEIGHT = 480; // Startwert — wird später dynamisch an den Inhalt angepasst

// ---------------------------------------------------------------------------
// Tray-Icon
// Das Original zeichnet 4 abnehmende Streifen (12/10/8/6) als Markenzeichen.
// Wir laden assets/tray-icon.png; falls die Datei fehlt, wird ein leeres
// nativeImage benutzt, damit die App trotzdem startet.
// ---------------------------------------------------------------------------
function loadTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }
  // Auf Windows ist ein 16px-Tray-Icon üblich.
  return image.resize({ width: 16, height: 16 });
}

// ---------------------------------------------------------------------------
// Hauptfenster (Popover-Stil): rahmenlos, transparent, immer im Vordergrund
// ---------------------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000', // voll transparent — Glassmorphism kommt aus dem CSS
    resizable: false,
    movable: true,
    skipTaskbar: true, // nicht in der Taskleiste — wie ein Menubar-Popover
    alwaysOnTop: true,
    show: false,
    hasShadow: false, // Schatten kommt aus dem CSS, sonst doppelter Rand
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // Timer laufen auch bei verstecktem Fenster (Cleanup nach Paste)
    },
  });

  const loadOptions = {};
  if (DEV) {
    loadOptions.query = { dev: '1' };
    if (process.env.BLITZTEXT_DEV_PHASE) loadOptions.query.phase = process.env.BLITZTEXT_DEV_PHASE;
    if (process.env.BLITZTEXT_DEV_TYPE) loadOptions.query.type = process.env.BLITZTEXT_DEV_TYPE;
    if (process.env.BLITZTEXT_DEV_AUTOREC === '1') loadOptions.query.autorec = '1';
    if (process.env.BLITZTEXT_DEV_OPEN) loadOptions.query.open = process.env.BLITZTEXT_DEV_OPEN;
    if (process.env.BLITZTEXT_DEV_TAB) loadOptions.query.tab = process.env.BLITZTEXT_DEV_TAB;
    if (process.env.BLITZTEXT_DEV_SETPROMPT) loadOptions.query.setprompt = process.env.BLITZTEXT_DEV_SETPROMPT;
    if (process.env.BLITZTEXT_DEV_NOPASTE === '1') loadOptions.query.nopaste = '1';
    if (process.env.BLITZTEXT_DEV_RECMS) loadOptions.query.recms = process.env.BLITZTEXT_DEV_RECMS;
    if (process.env.BLITZTEXT_FORCE_LOCAL === '1') loadOptions.query.forcelocal = '1';
  }
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), loadOptions);

  // Wie ein macOS-Popover: schließt sich, sobald der Fokus verloren geht.
  win.on('blur', () => {
    if (!isQuitting && !DEV) {
      win.hide();
    }
  });

  // Fenster nicht zerstören, nur verstecken (X gibt es eh nicht, aber sicher ist sicher).
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

// ---------------------------------------------------------------------------
// Tray + Kontextmenü
// ---------------------------------------------------------------------------
function createTray() {
  tray = new Tray(loadTrayIcon());
  tray.setToolTip('Blitztext ist bereit');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Öffnen',
      click: () => showWindowAtTray(),
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  // Linksklick togglet das Fenster, Rechtsklick zeigt das Menü.
  tray.on('click', () => toggleWindow());
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

// ---------------------------------------------------------------------------
// Fenster unter dem Tray-Icon positionieren (Windows: Tray ist meist unten rechts)
// ---------------------------------------------------------------------------
function positionWindowAtTray() {
  const trayBounds = tray.getBounds();
  const winBounds = win.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const workArea = display.workArea;

  // Horizontal am Tray-Icon zentrieren ...
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  // ... aber innerhalb des sichtbaren Bereichs halten.
  x = Math.min(Math.max(x, workArea.x + 4), workArea.x + workArea.width - winBounds.width - 4);

  // Taskleiste unten (Standard): Fenster oberhalb des Tray-Icons.
  let y;
  if (trayBounds.y > workArea.height / 2) {
    y = Math.round(trayBounds.y - winBounds.height - 4);
  } else {
    // Taskleiste oben: Fenster unterhalb.
    y = Math.round(trayBounds.y + trayBounds.height + 4);
  }
  y = Math.min(Math.max(y, workArea.y + 4), workArea.y + workArea.height - winBounds.height - 4);

  win.setPosition(x, y, false);
}

function showWindowPositioned() {
  positionWindowAtTray();
  win.show();
  win.focus();
}

async function showWindowAtTray() {
  // Ziel-App erfassen, BEVOR unser Fenster den Fokus übernimmt.
  await captureForegroundTarget();
  showWindowPositioned();
}

// ---------------------------------------------------------------------------
// Globale Hotkeys (Abbild von handleHotkeyDown/-Up; globalShortcut kennt nur
// Tastendruck, daher beide Modi als diskrete Start/Stop-Trigger).
// ---------------------------------------------------------------------------
const HOTKEYS = {
  'CommandOrControl+Shift+B': 'transcription',
  'CommandOrControl+Shift+T': 'textImprover',
  'CommandOrControl+Shift+D': 'dampfAblassen',
  'CommandOrControl+Shift+E': 'emojiText',
};

function registerHotkeys() {
  for (const [accel, type] of Object.entries(HOTKEYS)) {
    const ok = globalShortcut.register(accel, () => handleHotkey(type));
    if (!ok && DEV) console.log('[hotkey] Registrierung fehlgeschlagen:', accel);
  }
}

async function handleHotkey(type) {
  if (!win) return;
  const settings = storage.getSettings();
  const mode = settings.hotkeyMode || 'hold';
  const configured = storage.hasApiKey() || !!process.env.OPENAI_API_KEY;
  if (!configured) return; // wie handleHotkeyDown: ohne Konfiguration ignorieren

  // Ziel-App für das spätere Einfügen erfassen (vor evtl. Fensteranzeige).
  await captureForegroundTarget();
  win.webContents.send('hotkey', { type, mode });
}

function toggleWindow() {
  if (win.isVisible()) {
    win.hide();
  } else {
    showWindowAtTray();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Persistenter Win32-Helfer (Fokus erfassen + Einfügen) — entspricht der
// Paste-Target-Logik aus AppState (captureCurrentFrontmostApp + activate + paste).
// ---------------------------------------------------------------------------
let inputHelper = null;
let helperPending = []; // FIFO-Resolver für Antwortzeilen
let helperBuffer = '';

function startInputHelper() {
  try {
    let scriptPath = path.join(__dirname, 'scripts', 'win-input.ps1');
    // Im gepackten Build liegt das Skript ausgepackt neben dem asar.
    if (scriptPath.includes('app.asar')) {
      scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
    }
    inputHelper = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true }
    );
    inputHelper.stdout.setEncoding('utf8');
    inputHelper.stdout.on('data', (chunk) => {
      helperBuffer += chunk;
      let idx;
      while ((idx = helperBuffer.indexOf('\n')) >= 0) {
        const line = helperBuffer.slice(0, idx).replace(/\r$/, '');
        helperBuffer = helperBuffer.slice(idx + 1);
        if (line === 'ready') continue; // Bereitschaftssignal ignorieren
        const resolver = helperPending.shift();
        if (resolver) resolver(line);
      }
    });
    inputHelper.on('exit', () => { inputHelper = null; });
  } catch (err) {
    if (DEV) console.log('[helper] start failed:', err.message);
    inputHelper = null;
  }
}

function helperCommand(cmd, timeoutMs = 1500) {
  if (!inputHelper) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    helperPending.push(finish);
    try { inputHelper.stdin.write(cmd + '\n'); } catch (_) { finish(null); }
    setTimeout(() => finish(null), timeoutMs);
  });
}

// Vordergrundfenster (Ziel-App) erfassen — VOR dem Anzeigen unseres Fensters.
async function captureForegroundTarget() {
  const result = await helperCommand('capture');
  if (result && /^\d+$/.test(result) && result !== '0') {
    pasteTargetHwnd = result;
  }
}

// ---------------------------------------------------------------------------
// Auto-Paste (Windows) — entspricht AppState.pasteAtCursor:
//   Clipboard schreiben -> Fenster verstecken -> Ziel-App aktivieren -> Strg+V
// ---------------------------------------------------------------------------
function simulatePasteFallback() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "(New-Object -ComObject WScript.Shell).SendKeys('^v')"],
      { windowsHide: true },
      (err) => resolve(!err)
    );
  });
}

async function pasteText(text) {
  clipboard.writeText(text || '');
  if (win && win.isVisible()) win.hide();
  await delay(150); // Fokuswechsel abwarten (wie die 150ms im Original)

  let ok = false;
  if (inputHelper) {
    // Helfer sendet Strg+V per keybd_event und bewahrt NumLock (hwnd 0 = aktuelles Vordergrundfenster).
    const res = await helperCommand('paste ' + (pasteTargetHwnd || '0'), 2500);
    ok = res === 'ok';
  } else {
    ok = await simulatePasteFallback();
  }
  dlog('[paste] clipboard set + Ctrl+V sent ok=' + ok +
    ' target=' + pasteTargetHwnd + ' len=' + (text ? text.length : 0));
  return ok;
}

// ---------------------------------------------------------------------------
// IPC — Grundgerüst für die folgenden Schritte
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.on('hide-window', () => {
    if (win) win.hide();
  });

  // Fenster anzeigen ohne erneutes Fokus-Erfassen (für Hotkey-Toggle).
  ipcMain.on('show-window', () => {
    if (win) showWindowPositioned();
  });

  ipcMain.on('quit', () => {
    isQuitting = true;
    app.quit();
  });

  // Nur Dev: Renderer-Logs in der Main-Konsole/Datei ausgeben.
  ipcMain.on('dev-log', (_event, msg) => {
    dlog('[renderer] ' + msg);
  });

  // Konfigurationsstatus (Key vorhanden?) — steuert "Bereit" vs. "Einrichtung nötig".
  ipcMain.handle('get-status', () => {
    try {
      return { isConfigured: storage.hasApiKey() || !!process.env.OPENAI_API_KEY };
    } catch (err) {
      dlog('[get-status error] ' + (err && err.stack ? err.stack : err));
      return { isConfigured: false };
    }
  });

  // Auto-Paste: Text einfügen (Clipboard + Strg+V), Fenster verstecken.
  ipcMain.handle('paste-text', async (_event, text) => {
    try {
      const ok = await pasteText(text);
      return { ok };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // Nur Clipboard setzen (ohne Einfügen) — entspricht copyToClipboard.
  ipcMain.handle('copy-text', (_event, text) => {
    clipboard.writeText(text || '');
    return { ok: true };
  });

  // Clipboard lesen (für "Einfügen" beim API-Key).
  ipcMain.handle('read-clipboard', () => clipboard.readText());

  // API-Key speichern.
  ipcMain.handle('set-api-key', (_event, key) => {
    try {
      storage.setApiKey(key);
      return { ok: true, isConfigured: storage.hasApiKey(), apiKeyMasked: storage.apiKeyMasked() };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // Alle Settings + Status laden.
  ipcMain.handle('get-settings', () => {
    try {
      return {
        settings: storage.getSettings(),
        hasApiKey: storage.hasApiKey() || !!process.env.OPENAI_API_KEY,
        apiKeyMasked: storage.apiKeyMasked(),
        loginItem: app.getLoginItemSettings().openAtLogin,
      };
    } catch (err) {
      dlog('[get-settings error] ' + (err && err.stack ? err.stack : err));
      return null;
    }
  });

  // Settings (Teil-Update) speichern.
  ipcMain.handle('save-settings', (_event, partial) => {
    try {
      const merged = storage.updateSettings(partial);
      return { ok: true, settings: merged };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // Autostart beim Anmelden (Windows).
  ipcMain.handle('set-login-item', (_event, enabled) => {
    try {
      app.setLoginItemSettings({ openAtLogin: !!enabled });
      return { ok: true, enabled: app.getLoginItemSettings().openAtLogin };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // Workflow ausführen: Audio -> Temp-Datei -> Whisper -> bereinigter Text.
  // (Schritt 6 hängt für die Verbesserer-Workflows hier den GPT-Rewrite an.)
  ipcMain.handle('run-workflow', async (event, payload) => {
    let file = null;
    try {
      if (!payload || !payload.buffer) {
        return { ok: false, error: 'Keine Audiodaten erhalten.' };
      }
      const duration = payload.duration || 0;
      if (quality.shouldRejectRecording(duration)) {
        return { ok: false, error: 'Keine Aufnahme erkannt.' };
      }

      const settings = storage.getSettings();
      const language = settings.language || 'de';
      // Slice 1: lokalen Modus per Zwang (BLITZTEXT_FORCE_LOCAL). Slice 2 ersetzt
      // dies durch settings.secureLocalModeEnabled.
      const useLocal = process.env.BLITZTEXT_FORCE_LOCAL === '1';

      const buffer = Buffer.from(payload.buffer);
      // Lokal kommt bereits eine WAV (16 kHz) aus dem Renderer; online bleibt webm.
      const ext = (useLocal || payload.mimeType === 'audio/wav') ? 'wav' : 'webm';
      file = path.join(os.tmpdir(), `blitztext-${Date.now()}.${ext}`);
      await fs.promises.writeFile(file, buffer);

      let raw;
      if (useLocal) {
        // Lokaler Pfad: whisper.cpp statt OpenAI — kein Netzwerk-Call. Fester
        // Modellpfad (Slice 0/1); Slice 2 nimmt das Modell aus userData.
        raw = await localTranscription.transcribe(file, { language });
      } else {
        const apiKey = storage.getApiKey() || process.env.OPENAI_API_KEY || '';
        // Eigennamen nur bei längeren Aufnahmen als Vokabular-Hinweis (wie im Original, >= 0.9s).
        const customTerms = duration >= 0.9 ? (settings.textImprovement.customTerms || []) : [];
        raw = await openai.transcribe(file, { apiKey, language, customTerms });
      }

      const cleaned = quality.cleanedTranscript(raw);

      if (quality.isLikelyArtifact(cleaned, duration)) {
        return { ok: false, error: 'Keine Aufnahme erkannt.' };
      }

      const type = payload.type || 'transcription';
      // Lokaler Modus: nur reine Transkription — GPT-Workflows bleiben pausiert
      // (wie im Original). Online: Verbesserer-Workflows hängen GPT an.
      if (useLocal || type === 'transcription') {
        return { ok: true, text: cleaned };
      }

      // Verbesserer-Workflows: zweite Phase melden, dann GPT anwenden.
      const secondMessage = {
        textImprover: 'Text wird verbessert …',
        dampfAblassen: 'Wird umformuliert …',
        emojiText: 'Emojis werden eingefügt …',
      }[type] || 'Wird verarbeitet …';
      try { event.sender.send('workflow-progress', { message: secondMessage }); } catch (_) { /* ignore */ }

      let improved;
      if (type === 'textImprover') {
        improved = await openai.improve(cleaned, { apiKey, settings: settings.textImprovement });
      } else if (type === 'dampfAblassen') {
        improved = await openai.dampfAblassen(cleaned, { apiKey, systemPrompt: settings.dampfAblassen.systemPrompt });
      } else if (type === 'emojiText') {
        improved = await openai.addEmojis(cleaned, { apiKey, density: settings.emojiText.emojiDensity });
      } else {
        return { ok: true, text: cleaned };
      }

      const cleanedImproved = quality.cleanedTranscript(improved);
      // Sentinel wie im Original (nur dampf & emoji): GPT meldet "keine Aufnahme".
      if ((type === 'dampfAblassen' || type === 'emojiText') &&
          cleanedImproved === 'KEINE_AUFNAHME_ERKANNT') {
        return { ok: false, error: 'Keine Aufnahme erkannt.' };
      }
      return { ok: true, text: cleanedImproved };
    } catch (err) {
      dlog('[run-workflow error] ' + (err && err.stack ? err.stack : err));
      return { ok: false, error: String(err && err.message ? err.message : err) };
    } finally {
      if (file) {
        try { await fs.promises.unlink(file); } catch (_) { /* ignore */ }
      }
    }
  });

  // Fensterhöhe dynamisch an den Inhalt anpassen (vom Renderer aufgerufen).
  ipcMain.on('resize-window', (_event, height) => {
    if (!win) return;
    const clamped = Math.min(600, Math.max(200, Math.round(height)));
    win.setSize(WINDOW_WIDTH, clamped, false);
  });
}

// ---------------------------------------------------------------------------
// App-Lebenszyklus
// ---------------------------------------------------------------------------

// Single-Instance: nur eine Blitztext-Instanz erlauben.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) showWindowAtTray();
  });

  app.whenReady().then(() => {
    // Mikrofon-Zugriff für getUserMedia erlauben (Electron verweigert sonst).
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media' || permission === 'audioCapture');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'media' || permission === 'audioCapture';
    });

    // Slice 0 (temporär): Spike-Hook für den lokalen Modus. Beweist, dass
    // whisper.cpp (Binary + Modell + Aufruf + Output-Parsing) auf diesem Rechner
    // läuft. Transkribiert eine fixe Test-WAV, loggt das Ergebnis und beendet.
    // Wird in den nächsten Slices durch den echten lokalen Pfad ersetzt.
    if (process.env.BLITZTEXT_DEV_WHISPER_TEST === '1') {
      const testWav = path.join(__dirname, 'bin', 'whisper', 'test-de.wav');
      dlog('[whisper-test] starte lokale Transkription: ' + testWav);
      localTranscription.transcribe(testWav, { language: 'de' })
        .then((text) => dlog('[whisper-test] OK Text="' + text + '"'))
        .catch((err) => dlog('[whisper-test] FEHLER ' + (err && err.message ? err.message : err)))
        .finally(() => { isQuitting = true; setTimeout(() => app.quit(), 200); });
      return;
    }

    startInputHelper();
    createWindow();
    createTray();
    registerIpc();
    registerHotkeys();

    // Auf Windows gibt es kein Dock; die App lebt im Tray.
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }

    // Dev-Modus: Fenster zentriert anzeigen, damit das UI geprüft werden kann.
    if (DEV) {
      captureForegroundTarget().finally(() => {
        win.center();
        win.show();
        win.focus();
      });
    }
  });

  // Fenster offen halten, auch wenn alle Fenster geschlossen sind (Tray-App).
  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (inputHelper) { try { inputHelper.kill(); } catch (_) { /* ignore */ } }
  });
}
