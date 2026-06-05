'use strict';

// ===========================================================================
// Schritt 2: vollständiges UI der Hauptseite (noch ohne echte Funktionalität).
// Zustandslogik 1:1 aus AppState.swift (workflowSubtitle / isWorkflowAvailable).
// ===========================================================================

// --- Workflow-Definitionen (Reihenfolge wie WorkflowType.mainMenuCases) -----
const WORKFLOWS = [
  { type: 'transcription', name: 'Blitztext',      icon: 'mic',       hotkey: 'Ctrl + Shift + B', accent: 'blue',   subtitle: 'Sprache rein. Text raus.' },
  { type: 'textImprover',  name: 'Blitztext+',     icon: 'textCheck', hotkey: 'Ctrl + Shift + T', accent: 'purple', subtitle: 'Geschrieben sprechen.' },
  { type: 'dampfAblassen', name: 'Blitztext $%&!', icon: 'flame',     hotkey: 'Ctrl + Shift + D', accent: 'orange', subtitle: 'Frust rein. Entspannt raus.' },
  { type: 'emojiText',     name: 'Blitztext :)',   icon: 'smile',     hotkey: 'Ctrl + Shift + E', accent: 'cyan',   subtitle: 'Text rein. Emojis dazu.' },
];

// --- Dev-Flags aus der Query (nur zum Testen/Screenshotten) ----------------
const QUERY = new URLSearchParams(location.search);
const DEV = QUERY.get('dev') === '1';
const NOPASTE = QUERY.get('nopaste') === '1'; // im Test deaktivieren, um Strg+V im Terminal zu vermeiden
const FORCE_LOCAL = QUERY.get('forcelocal') === '1'; // Slice 1: lokalen Modus erzwingen (temporär, ohne UI)

// Lokaler Modus aktiv? Slice 1: nur per Zwang (BLITZTEXT_FORCE_LOCAL). Slice 2
// ergänzt hier state.secureLocalModeEnabled aus dem echten Schalter.
function useLocalMode() {
  return FORCE_LOCAL || state.secureLocalModeEnabled;
}

// --- UI-Zustand (wird in späteren Schritten durch echte Settings ersetzt) ---
const state = {
  isConfigured: true,            // Schritt 8: echter API-Key-/Modell-Status
  secureLocalModeEnabled: false, // Online-Modus als Standard
  localModelInstalled: false,
};

// --- Abbild von AppState.isWorkflowAvailable(_:) ---------------------------
function isWorkflowAvailable(type) {
  if (type === 'transcription') {
    return state.secureLocalModeEnabled ? state.localModelInstalled : state.isConfigured;
  }
  // textImprover / dampfAblassen / emojiText
  return !state.secureLocalModeEnabled && state.isConfigured;
}

// --- Abbild von AppState.workflowSubtitle(for:) ----------------------------
function workflowSubtitle(wf) {
  if (wf.type === 'transcription') {
    if (state.secureLocalModeEnabled) {
      return state.localModelInstalled ? 'Lokal: Whisper auf diesem Gerät.' : 'Lokales Modell fehlt.';
    }
    return 'Online: Whisper über OpenAI.';
  }
  if (state.secureLocalModeEnabled) {
    return 'Im lokalen Modus pausiert.';
  }
  return wf.subtitle;
}

// --- Hotkey-Badge: jeder Key als eigene Kapsel -----------------------------
function buildHotkeyBadge(label) {
  const badge = document.createElement('div');
  badge.className = 'hotkey-badge';
  label.split(' + ').forEach((keyText) => {
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = keyText;
    badge.appendChild(key);
  });
  return badge;
}

// --- Eine WorkflowRow bauen (Abbild von WorkflowRowView) -------------------
function buildWorkflowRow(wf) {
  const enabled = isWorkflowAvailable(wf.type);

  const row = document.createElement('button');
  row.className = 'workflow-row' + (enabled ? '' : ' disabled');
  row.dataset.type = wf.type;
  row.dataset.accent = wf.accent;

  const icon = document.createElement('div');
  icon.className = 'workflow-icon';
  icon.innerHTML = window.ICONS[wf.icon];

  const text = document.createElement('div');
  text.className = 'workflow-text';
  const name = document.createElement('div');
  name.className = 'workflow-name';
  name.textContent = wf.name;
  const sub = document.createElement('div');
  sub.className = 'workflow-subtitle';
  sub.textContent = workflowSubtitle(wf);
  text.append(name, sub);

  row.append(icon, text, buildHotkeyBadge(wf.hotkey));

  row.addEventListener('click', () => {
    if (!enabled) return;
    openWorkflowPage(wf);
  });

  return row;
}

function renderWorkflows() {
  const list = document.getElementById('workflow-list');
  list.innerHTML = '';
  WORKFLOWS.forEach((wf) => list.appendChild(buildWorkflowRow(wf)));
}

// --- Mode-Panel aktualisieren (Abbild von transcriptionModePanel) ----------
function renderModePanel() {
  const iconEl = document.getElementById('mode-icon');
  const titleEl = document.getElementById('mode-title');
  const subEl = document.getElementById('mode-subtitle');

  if (state.secureLocalModeEnabled) {
    iconEl.className = 'mode-icon local';
    iconEl.innerHTML = window.ICONS.lockShield;
    titleEl.textContent = 'Sicherer lokaler Modus';
    subEl.textContent = state.localModelInstalled
      ? 'Lokal mit Whisper auf diesem Gerät.'
      : 'Lokales Modell ist noch nicht installiert.';
  } else {
    iconEl.className = 'mode-icon online';
    iconEl.innerHTML = window.ICONS.network;
    titleEl.textContent = 'Online Whisper';
    subEl.textContent = 'Blitztext nutzt gerade die OpenAI-Transkription.';
  }
}

// --- Konfiguriert / nicht konfiguriert ------------------------------------
function renderStatus() {
  document.getElementById('status-configured').hidden = !state.isConfigured;
  document.getElementById('status-unconfigured').hidden = state.isConfigured;
}

// Konfigurationsstatus (API-Key) neu laden und Hauptseite aktualisieren.
function refreshStatus() {
  if (!window.api || !window.api.getStatus) return;
  window.api.getStatus().then((status) => {
    if (!status) return;
    state.isConfigured = !!status.isConfigured;
    renderStatus();
    renderModePanel();
    renderWorkflows();
    fitWindowToContent();
  }).catch(() => { /* ignore */ });
}

// --- Statische Icons setzen ------------------------------------------------
function injectStaticIcons() {
  document.getElementById('open-settings').innerHTML = window.ICONS.gear;
  document.getElementById('setup-icon').innerHTML = window.ICONS.key;
  document.querySelectorAll('.chevron-left').forEach((el) => {
    el.innerHTML = window.ICONS.chevronLeft;
  });
}

// --- Seiten-Navigation -----------------------------------------------------
function showPage(id) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  fitWindowToContent();
}

// ===========================================================================
// Workflow-Detailseite — Phasen-Maschine (Abbild der *ActiveView-Structs)
//   Phasen: 'recording' → 'processing' → 'done' | 'error'
//   applyPhase() ist die zentrale Eintrittsstelle; ab Schritt 4/5 ruft sie
//   window.api.onWorkflowUpdate(...) auf. Bis dahin treibt sie eine Simulation.
// ===========================================================================
const WorkflowUI = (() => {
  let current = null;     // aktuelles Workflow-Objekt
  let waveform = null;    // Waveform-Instanz
  let recorder = null;    // echte AudioRecorder-Instanz
  let levelTimer = null;  // simulierter Audiopegel (nur Dev-Query-Pfad)
  let simTimers = [];      // simulierte Phasenübergänge (nur Dev-Query-Pfad)
  let cleanupTimer = null; // Reset zur Hauptseite nach Done (wie scheduleWorkflowCleanup)
  let simulate = false;   // true nur im Dev-Query-Pfad (statische Screenshots)
  let stopping = false;   // verhindert doppeltes Stoppen

  const content = () => document.getElementById('workflow-content');

  function open(wf, opts = {}) {
    current = wf;
    simulate = opts.simulate === true;
    stopping = false;

    // Kopf: Icon in Akzentfarbe + Name (wie workflowPage-Header)
    const headIcon = document.getElementById('workflow-head-icon');
    const headName = document.getElementById('workflow-head-name');
    headIcon.innerHTML = window.ICONS[wf.icon];
    headIcon.style.color = `var(--accent-${wf.accent})`;
    headName.textContent = wf.name;

    showPage('page-workflow');
    applyPhase(opts.phase || 'recording', opts.payload);
  }

  function clearTimers() {
    if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }
    if (cleanupTimer) { clearTimeout(cleanupTimer); cleanupTimer = null; }
    simTimers.forEach((t) => clearTimeout(t));
    simTimers = [];
  }

  // Nach erfolgreichem Workflow zurück zur Hauptseite (wie scheduleWorkflowCleanup, 1.05s).
  function scheduleCleanup() {
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => { cleanupTimer = null; exit(); }, 1050);
  }

  function disposeWaveform() {
    if (waveform) { waveform.dispose(); waveform = null; }
  }

  function discardRecorder() {
    if (recorder) {
      try { recorder.discard(); } catch (_) { /* ignore */ }
      recorder = null;
    }
  }

  function exit() {
    clearTimers();
    disposeWaveform();
    discardRecorder();
    current = null;
    stopping = false;
    showPage('page-main');
  }

  // Zentrale Phasen-Anwendung — von Simulation ODER echten Events aufgerufen.
  function applyPhase(phase, payload) {
    clearTimers();
    const el = content();
    el.innerHTML = '';

    switch (phase) {
      case 'recording':
        stopping = false;
        disposeWaveform();
        el.appendChild(buildRecordingView());
        startWaveform();
        if (simulate) {
          startSimulatedLevel();
        } else {
          startRealRecording();
        }
        break;

      case 'processing':
        disposeWaveform();
        el.appendChild(buildProcessingView(payload || 'Wird transkribiert …'));
        break;

      case 'done':
        disposeWaveform();
        el.appendChild(buildDoneView(payload || ''));
        break;

      case 'error':
        disposeWaveform();
        el.appendChild(buildErrorView(payload || 'Etwas ist schiefgelaufen.'));
        break;
    }
    if (DEV && window.api && window.api.devLog) {
      window.api.devLog('phase=' + phase + (payload ? ' :: ' + payload : ''));
    }
    fitWindowToContent();
  }

  // --- Recording -----------------------------------------------------------
  function buildRecordingView() {
    const box = document.createElement('div');
    box.className = 'wf-recording';

    const canvas = document.createElement('canvas');
    canvas.className = 'waveform';
    canvas.id = 'waveform';

    const stop = document.createElement('button');
    stop.className = 'stop-btn';
    stop.title = 'Stoppen';
    const square = document.createElement('span');
    square.className = 'stop-square';
    stop.appendChild(square);
    stop.addEventListener('click', onStop);

    const hint = document.createElement('div');
    hint.className = 'wf-hint';
    hint.textContent = 'Ich höre zu … Klicke zum Stoppen.';

    box.append(canvas, stop, hint);
    return box;
  }

  function startWaveform() {
    requestAnimationFrame(() => {
      const canvas = document.getElementById('waveform');
      if (!canvas) return;
      waveform = new window.Waveform(canvas);
      waveform.start();
    });
  }

  // Platzhalter-Audiopegel bis Schritt 4 (echtes Mikrofon).
  function startSimulatedLevel() {
    let target = 0.4;
    let level = 0.2;
    levelTimer = setInterval(() => {
      if (Math.random() < 0.25) target = 0.25 + Math.random() * 0.55;
      level += (target - level) * 0.25;
      if (waveform) waveform.setLevel(level);
    }, 70);
  }

  function onStop() {
    if (stopping) return;
    stopping = true;
    clearTimers();
    if (waveform) waveform.stop();
    if (simulate) {
      simulatedStop();
    } else {
      realStop();
    }
  }

  // --- Echte Aufnahme (Schritt 4) -----------------------------------------
  async function startRealRecording() {
    if (!window.AudioRecorder) {
      applyPhase('error', 'Aufnahme nicht verfügbar.');
      return;
    }
    recorder = new window.AudioRecorder();
    try {
      await recorder.start((level) => {
        if (waveform) waveform.setLevel(level);
      });
      if (DEV && window.api && window.api.devLog) {
        const tracks = recorder.stream ? recorder.stream.getAudioTracks() : [];
        const t = tracks[0];
        window.api.devLog('rec started mime=' + recorder.mimeType + ' tracks=' + tracks.length +
          (t ? ' label="' + t.label + '" muted=' + t.muted + ' state=' + t.readyState : ''));
      }
    } catch (err) {
      recorder = null;
      applyPhase('error', micErrorMessage(err));
    }
  }

  async function realStop() {
    let result = null;
    try {
      result = recorder ? await recorder.stop() : null;
    } catch (err) {
      discardRecorder();
      applyPhase('error', 'Aufnahme fehlgeschlagen: ' + (err && err.message ? err.message : err));
      return;
    }
    recorder = null;

    if (DEV && window.api && window.api.devLog) {
      window.api.devLog('stop dur=' + (result ? result.duration.toFixed(2) : 'null') +
        ' bytes=' + (result && result.buffer ? result.buffer.length : 'null'));
    }

    if (!result || !result.buffer || result.buffer.length === 0) {
      applyPhase('error', 'Keine Aufnahme erkannt.');
      return;
    }
    // Qualitätsprüfung wie TranscriptionQualityService: zu kurze Aufnahmen verwerfen (< 0.3s).
    if (result.duration < 0.3) {
      applyPhase('error', 'Keine Aufnahme erkannt.');
      return;
    }

    applyPhase('processing', 'Wird transkribiert …');

    // Lokaler Modus: Aufnahme zu 16-kHz-Mono-WAV umwandeln (whisper.cpp-Format),
    // statt das webm/opus an OpenAI zu schicken.
    let buffer = result.buffer;
    let mimeType = result.mimeType;
    if (useLocalMode()) {
      try {
        const blob = new Blob([result.buffer], { type: result.mimeType || 'audio/webm' });
        buffer = await window.blobToWav16k(blob);
        mimeType = 'audio/wav';
        if (DEV && window.api && window.api.devLog) {
          window.api.devLog('local: wav16k bytes=' + buffer.length);
        }
      } catch (err) {
        applyPhase('error', 'Audio-Umwandlung fehlgeschlagen: ' + (err && err.message ? err.message : err));
        return;
      }
    }

    try {
      const res = await window.api.runWorkflow({
        type: current ? current.type : 'transcription',
        buffer,
        mimeType,
        duration: result.duration,
      });
      if (res && res.ok) {
        applyPhase('done', res.text);
        // Auto-Paste: Text in die zuvor aktive App einfügen (Fenster wird versteckt).
        if (!NOPASTE && window.api && window.api.pasteText) {
          window.api.pasteText(res.text);
        }
        scheduleCleanup();
      } else {
        applyPhase('error', (res && res.error) || 'Transkription fehlgeschlagen.');
      }
    } catch (err) {
      applyPhase('error', 'Verarbeitung fehlgeschlagen: ' + (err && err.message ? err.message : err));
    }
  }

  function micErrorMessage(err) {
    const name = err && err.name ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Mikrofon-Zugriff verweigert. Bitte in den Windows-Einstellungen erlauben.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'Kein Mikrofon gefunden.';
    }
    return 'Mikrofon konnte nicht gestartet werden.';
  }

  // --- Simulierte Verarbeitung (nur Dev-Query-Pfad) ------------------------
  function simulatedStop() {
    const isImprover = current && current.type !== 'transcription';
    applyPhase('processing', 'Wird transkribiert …');
    simTimers.push(setTimeout(() => {
      if (isImprover) {
        applyPhase('processing', 'Text wird verbessert …');
        simTimers.push(setTimeout(() => {
          applyPhase('done', 'Beispieltext — die echte Transkription folgt in Schritt 5.');
        }, 1100));
      } else {
        applyPhase('done', 'Beispieltext — die echte Transkription folgt in Schritt 5.');
      }
    }, 1100));
  }

  // --- Processing ----------------------------------------------------------
  function buildProcessingView(message) {
    const box = document.createElement('div');
    box.className = 'wf-processing';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    const status = document.createElement('div');
    status.className = 'wf-status';
    status.textContent = message;
    box.append(spinner, status);
    return box;
  }

  // --- Done (autoPaste) ----------------------------------------------------
  function buildDoneView(text) {
    const box = document.createElement('div');
    box.className = 'wf-done';
    const icon = document.createElement('div');
    icon.className = 'done-icon';
    icon.innerHTML = window.ICONS.checkCircle;
    const title = document.createElement('div');
    title.className = 'done-title';
    title.textContent = 'Eingefügt';
    const preview = document.createElement('div');
    preview.className = 'done-text';
    preview.textContent = text;
    box.append(icon, title, preview);
    return box;
  }

  // --- Error ---------------------------------------------------------------
  function buildErrorView(message) {
    const box = document.createElement('div');
    box.className = 'wf-error';
    const icon = document.createElement('div');
    icon.className = 'error-icon';
    icon.innerHTML = window.ICONS.warnTriangle;
    const msg = document.createElement('div');
    msg.className = 'error-msg';
    msg.textContent = message;
    const retry = document.createElement('button');
    retry.className = 'retry-btn subtle';
    retry.textContent = 'Nochmal versuchen';
    retry.addEventListener('click', () => applyPhase('recording'));
    box.append(icon, msg, retry);
    return box;
  }

  // Globaler Hotkey: startet bzw. stoppt den Workflow (diskreter Toggle).
  function hotkey(type, mode) {
    const wf = WORKFLOWS.find((w) => w.type === type);
    if (!wf) return;
    if (DEV && window.api && window.api.devLog) window.api.devLog('hotkey type=' + type + ' mode=' + mode);

    // Läuft bereits derselbe Workflow und nimmt auf -> stoppen.
    if (current && current.type === type && recorder && recorder.isRecording) {
      onStop();
      return;
    }
    // Anderer Workflow nimmt noch auf -> still verwerfen.
    if (recorder && recorder.isRecording) {
      clearTimers();
      discardRecorder();
      disposeWaveform();
    }
    // Starten. Toggle zeigt das Fenster; Hold läuft im Hintergrund (Fenster bleibt versteckt).
    if (mode === 'toggle' && window.api && window.api.showWindow) {
      window.api.showWindow();
    }
    open(wf);
  }

  // Zwischenmeldung der zweiten Phase (vom Main via 'workflow-progress').
  function setProcessingMessage(message) {
    const status = document.querySelector('#workflow-content .wf-status');
    if (status) status.textContent = message;
    else applyPhase('processing', message);
    if (DEV && window.api && window.api.devLog) window.api.devLog('progress :: ' + message);
  }

  return { open, exit, applyPhase, devStop: onStop, setProcessingMessage, hotkey };
})();

function openWorkflowPage(wf) {
  WorkflowUI.open(wf);
}

// --- Fensterhöhe an aktive Seite anpassen ----------------------------------
function fitWindowToContent() {
  if (!window.api) return;
  requestAnimationFrame(() => {
    const active = document.querySelector('.page.active');
    const height = active ? active.getBoundingClientRect().height : document.getElementById('app').getBoundingClientRect().height;
    window.api.resizeWindow(Math.ceil(height) + 2); // +2 für Border oben/unten
  });
}

// --- Event-Verdrahtung -----------------------------------------------------
function wireEvents() {
  const openSettings = () => {
    if (window.SettingsUI) window.SettingsUI.open();
    else showPage('page-settings');
  };
  document.getElementById('open-settings').addEventListener('click', openSettings);
  document.getElementById('open-settings-2').addEventListener('click', openSettings);

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => showPage('page-main'));
  });

  document.querySelectorAll('[data-back-workflow]').forEach((btn) => {
    btn.addEventListener('click', () => WorkflowUI.exit());
  });

  document.querySelectorAll('#quit-btn, [data-quit]').forEach((btn) => {
    btn.addEventListener('click', () => window.api && window.api.quit());
  });

  if (window.api && window.api.onWorkflowProgress) {
    window.api.onWorkflowProgress((data) => {
      if (data && data.message) WorkflowUI.setProcessingMessage(data.message);
    });
  }

  // Lokaler Modus ist auf Windows noch nicht verfügbar -> Schalter deaktiviert,
  // damit niemand in einen Zustand ohne nutzbare Workflows gerät.
  // (Implementierung via whisper.cpp folgt — siehe docs/LOCAL-MODE-PLAN.md.)
  const toggle = document.getElementById('secure-toggle');
  state.secureLocalModeEnabled = false;
  toggle.checked = false;
  toggle.disabled = true;
}

// --- Init ------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Helfer für settings.js zugänglich machen.
  window.Blitztext = { showPage, fitWindowToContent, refreshStatus };

  injectStaticIcons();
  renderStatus();
  renderModePanel();
  renderWorkflows();
  wireEvents();
  fitWindowToContent();

  // Echten Konfigurationsstatus laden (API-Key vorhanden?).
  refreshStatus();

  // Globale Hotkeys vom Main verarbeiten.
  if (window.api && window.api.onHotkey) {
    window.api.onHotkey((data) => {
      if (data && data.type) WorkflowUI.hotkey(data.type, data.mode);
    });
  }

  // Dev-Hilfe: ?phase=recording|processing|done|error&type=… öffnet eine
  // Workflow-Phase direkt — nur zum Prüfen/Screenshotten (Schritt 3).
  const params = QUERY;
  const phase = params.get('phase');
  if (phase) {
    const type = params.get('type') || 'transcription';
    const wf = WORKFLOWS.find((w) => w.type === type) || WORKFLOWS[0];
    const samplePayload = {
      done: 'Beispieltext — die echte Transkription folgt in Schritt 5.',
      error: 'Keine Aufnahme erkannt.',
      processing: 'Wird transkribiert …',
    }[phase];
    WorkflowUI.open(wf, { phase, payload: samplePayload, simulate: true });
  } else if (params.get('autorec') === '1') {
    // Dev-Selbsttest: echte Aufnahme starten und nach 1.6s automatisch stoppen.
    const type = params.get('type') || 'transcription';
    const wf = WORKFLOWS.find((w) => w.type === type) || WORKFLOWS[0];
    WorkflowUI.open(wf); // simulate = false → echtes Mikrofon
    const ms = parseInt(params.get('recms') || '3000', 10);
    setTimeout(() => WorkflowUI.devStop(), ms);
  }

  // Dev: Settings direkt öffnen (für Screenshots).
  if (params.get('open') === 'settings' && window.SettingsUI) {
    window.SettingsUI.open().then(() => {
      const tab = params.get('tab');
      if (tab === 'access') {
        const btn = document.querySelector('.seg-btn[data-tab="access"]');
        if (btn) btn.click();
      }
    });
  }

  // Dev: Custom-Prompt setzen (Persistenz-/GPT-Test).
  if (params.get('setprompt') && window.api && window.api.saveSettings) {
    window.api.saveSettings({ textImprovement: { systemPrompt: params.get('setprompt') } })
      .then(() => { if (window.api.devLog) window.api.devLog('saved systemPrompt'); });
  }
});
