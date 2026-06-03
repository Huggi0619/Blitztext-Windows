'use strict';

// ===========================================================================
// Settings-UI (Abbild von SettingsContentView.swift — Windows-relevante Teile).
//   Tab "Anpassen": Hotkeys/Modus, Blitztext+ (Ton/Prompt/Kontext),
//                   Blitztext $%&! (Prompt), Blitztext :) (Dichte), Eigennamen
//   Tab "Zugang":   OpenAI API Key, Autostart, Hinweis
// Anpassen-Felder speichern live; der API-Key über "Speichern".
// ===========================================================================
(function () {
  const $ = (id) => document.getElementById(id);

  let loaded = false;
  let s = null; // aktuelle Settings

  // Anzeige der Tastenkürzel (statisch, Windows-Belegung).
  const HOTKEYS = [
    { name: 'Blitztext', keys: 'Ctrl + Shift + B' },
    { name: 'Blitztext+', keys: 'Ctrl + Shift + T' },
    { name: 'Blitztext $%&!', keys: 'Ctrl + Shift + D' },
    { name: 'Blitztext :)', keys: 'Ctrl + Shift + E' },
  ];

  const KEY_RE = /^sk-[A-Za-z0-9_-]{20,}$/;
  const saveTimers = {};

  function saveNow(partial) { if (window.api) window.api.saveSettings(partial); }
  function saveDebounced(partial, key) {
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => saveNow(partial), 400);
  }

  async function open() {
    window.Blitztext.showPage('page-settings');
    await load();
  }

  async function load() {
    if (!window.api || !window.api.getSettings) return;
    const data = await window.api.getSettings();
    if (!data) return;
    s = data.settings;

    renderHotkeyList();
    setSegment('hotkey-mode', s.hotkeyMode);
    setSegment('ti-tone', s.textImprovement.tone);
    $('ti-prompt').value = s.textImprovement.systemPrompt || '';
    $('ti-context').value = s.textImprovement.context || '';
    $('da-prompt').value = s.dampfAblassen.systemPrompt || '';
    setSegment('et-density', s.emojiText.emojiDensity);
    renderChips();

    applyKeyState(data.hasApiKey, data.apiKeyMasked);
    $('login-toggle').checked = !!data.loginItem;

    if (!loaded) { wire(); loaded = true; }
    window.Blitztext.fitWindowToContent();
  }

  function renderHotkeyList() {
    const list = $('hotkey-list');
    list.innerHTML = '';
    HOTKEYS.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'hotkey-item';
      const k = document.createElement('span');
      k.className = 'hk-keys';
      k.textContent = h.keys;
      const n = document.createElement('span');
      n.className = 'hk-name';
      n.textContent = h.name;
      row.append(k, n);
      list.appendChild(row);
    });
  }

  function setSegment(containerId, value) {
    document.querySelectorAll('#' + containerId + ' .seg').forEach((b) => {
      b.classList.toggle('active', b.dataset.val === value);
    });
  }

  function renderChips() {
    const wrap = $('term-chips');
    wrap.innerHTML = '';
    (s.textImprovement.customTerms || []).forEach((term) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const t = document.createElement('span');
      t.textContent = term;
      const x = document.createElement('button');
      x.className = 'chip-remove subtle';
      x.textContent = '✕';
      x.title = 'Entfernen';
      x.addEventListener('click', () => removeTerm(term));
      chip.append(t, x);
      wrap.appendChild(chip);
    });
  }

  function addTerm() {
    const inp = $('term-input');
    const v = inp.value.trim();
    if (!v) return;
    const terms = s.textImprovement.customTerms || [];
    if (terms.includes(v)) { inp.value = ''; return; }
    terms.push(v);
    s.textImprovement.customTerms = terms;
    inp.value = '';
    renderChips();
    saveNow({ textImprovement: { customTerms: terms } });
    window.Blitztext.fitWindowToContent();
  }

  function removeTerm(term) {
    s.textImprovement.customTerms = (s.textImprovement.customTerms || []).filter((t) => t !== term);
    renderChips();
    saveNow({ textImprovement: { customTerms: s.textImprovement.customTerms } });
    window.Blitztext.fitWindowToContent();
  }

  function applyKeyState(hasKey, masked) {
    if (hasKey) {
      $('key-display').hidden = false;
      $('key-masked').textContent = masked || '';
      $('key-edit').hidden = true;
      $('key-change').hidden = false;
    } else {
      $('key-display').hidden = true;
      $('key-edit').hidden = false;
      $('key-change').hidden = true;
    }
    $('key-error').hidden = true;
  }

  function showKeyError(msg) {
    const e = $('key-error');
    e.textContent = msg;
    e.hidden = false;
  }

  async function pasteKey() {
    const text = window.api.getClipboard ? await window.api.getClipboard() : '';
    const first = (text || '').split(/\r?\n/)[0].trim();
    if (!KEY_RE.test(first)) {
      showKeyError('Zwischenablage enthält keinen plausiblen OpenAI API Key.');
      return;
    }
    $('key-input').value = first;
    $('key-error').hidden = true;
    if (window.api.copyText) window.api.copyText(''); // Clipboard leeren (wie im Original)
  }

  async function saveKey() {
    const v = $('key-input').value.trim();
    if (!v) { showKeyError('Bitte trage deinen OpenAI API Key ein.'); return; }
    const r = await window.api.setApiKey(v);
    if (r && r.ok) {
      $('key-input').value = '';
      applyKeyState(true, r.apiKeyMasked);
      flashSaved();
      if (window.Blitztext.refreshStatus) window.Blitztext.refreshStatus();
    } else {
      showKeyError((r && r.error) || 'Speichern fehlgeschlagen.');
    }
  }

  function flashSaved() {
    const btn = $('key-save');
    btn.textContent = '✓ Gespeichert';
    btn.classList.add('saved');
    setTimeout(() => { btn.textContent = 'Speichern'; btn.classList.remove('saved'); }, 2000);
  }

  function wireSegment(id, cb) {
    document.querySelectorAll('#' + id + ' .seg').forEach((b) => {
      b.addEventListener('click', () => { setSegment(id, b.dataset.val); cb(b.dataset.val); });
    });
  }

  function wire() {
    // Tabs
    document.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        $('settings-customize').hidden = tab !== 'customize';
        $('settings-access').hidden = tab !== 'access';
        window.Blitztext.fitWindowToContent();
      });
    });

    // Segmentierte Picker
    wireSegment('hotkey-mode', (v) => { s.hotkeyMode = v; saveNow({ hotkeyMode: v }); });
    wireSegment('ti-tone', (v) => { s.textImprovement.tone = v; saveNow({ textImprovement: { tone: v } }); });
    wireSegment('et-density', (v) => { s.emojiText.emojiDensity = v; saveNow({ emojiText: { emojiDensity: v } }); });

    // Textfelder (live, leicht entprellt)
    $('ti-prompt').addEventListener('input', (e) => {
      s.textImprovement.systemPrompt = e.target.value;
      saveDebounced({ textImprovement: { systemPrompt: e.target.value } }, 'tip');
    });
    $('ti-context').addEventListener('input', (e) => {
      s.textImprovement.context = e.target.value;
      saveDebounced({ textImprovement: { context: e.target.value } }, 'tic');
    });
    $('da-prompt').addEventListener('input', (e) => {
      s.dampfAblassen.systemPrompt = e.target.value;
      saveDebounced({ dampfAblassen: { systemPrompt: e.target.value } }, 'dap');
    });

    // Eigennamen
    $('term-add-btn').addEventListener('click', addTerm);
    $('term-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addTerm(); }
    });

    // API-Key
    $('key-change').addEventListener('click', () => {
      $('key-display').hidden = true;
      $('key-edit').hidden = false;
      $('key-change').hidden = true;
      $('key-input').focus();
    });
    $('key-paste').addEventListener('click', pasteKey);
    $('key-save').addEventListener('click', saveKey);

    // Autostart
    $('login-toggle').addEventListener('change', async (e) => {
      const r = await window.api.setLoginItem(e.target.checked);
      if (r && typeof r.enabled === 'boolean') e.target.checked = r.enabled;
    });
  }

  window.SettingsUI = { open, load };
})();
