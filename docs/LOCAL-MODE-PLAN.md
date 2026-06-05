# Implementierungsplan: Sicherer lokaler Modus (Offline-Transkription) auf Windows

> Vorlage für eine **neue Claude-Code-Session**. Ziel: den „Sicheren lokalen Modus"
> (Offline-Whisper, kein Server) auf Windows umsetzen — das Windows-Pendant zu
> WhisperKit auf macOS. Empfohlener Weg: **whisper.cpp** über `child_process`.

---

## 0. Kontext & Referenzen (zuerst lesen!)

- **Skill** `blitztext-windows` (in `~/.claude/skills/blitztext-windows/`) — Bauanleitung, Design-Specs, Original-Code-Auszüge. Enthält den Hinweis „Whisper lokal: whisper.cpp via child_process".
- **Original-Swift (nur lokal, NICHT im Repo, da `.gitignore`):** `original-mac-app/BlitztextMac/Services/LocalTranscriptionService.swift` — Quelle der Wahrheit für Modell-Liste, Modellnamen, `recommendedFastModelName`, Install-States, Download-Logik. **Vor Beginn lesen.** Außerdem `MenuBarView.swift` (`transcriptionModePanel`) und `SettingsContentView.swift` (`CustomizeSettingsView`, Abschnitt „Sicherer Lokaler Modus") als UI-Vorlage.
- **Dev-/Test-Hooks & Screenshot-Workflow:** siehe Memory `blitztext-dev-screenshot` und `blitztext-packaging`.

---

## 1. Aktueller Stand (was schon da ist)

- Der Modus-Schalter im Hauptpanel ist **bewusst deaktiviert** („entschärft"), damit niemand in einen Zustand ohne nutzbare Workflows gerät. Stelle dies beim Implementieren wieder her — siehe Aufgabe **F**.
  - Ort: `renderer/renderer.js` in `wireEvents()` (Kommentar „Lokaler Modus ist auf Windows noch nicht verfügbar"); HTML `#secure-toggle` hat `disabled`; Hinweis `#mode-hint` in `renderer/index.html`.
- **Settings/State haben das Feld schon teilweise:** `services/storage.js` → `defaultSettings()` enthält `secureLocalModeEnabled: false`. **Fehlt noch:** `selectedLocalTranscriptionModelName`. Hinzufügen.
- Die UI-Zustandslogik existiert bereits (Abbild von `AppState`):
  - `renderer/renderer.js`: `state.secureLocalModeEnabled`, `isWorkflowAvailable()`, `workflowSubtitle()`, `renderModePanel()`. Im lokalen Modus werden die GPT-Workflows (textImprover/dampfAblassen/emojiText) korrekt „pausiert" und nur `transcription` ist relevant.
- **Online-Pfad** ist komplett: `main.js` IPC `run-workflow` → `services/openai.js` `transcribe()` (Whisper) bzw. `improve/dampfAblassen/addEmojis` (GPT). Hier muss der lokale Zweig rein (Aufgabe E).
- **Aufnahme** liegt als webm/opus vor (`renderer/recorder.js`, `stop()` liefert `{buffer, duration, mimeType}`); aktuell wird der webm-Buffer an `run-workflow` geschickt.

---

## 2. Architektur / Pipeline (lokaler Modus)

```
Renderer: MediaRecorder (webm/opus)
   └─ bei lokalem Modus: decodeAudioData → 16 kHz Mono → 16-bit PCM WAV
        └─ WAV-Buffer per IPC an Main
Main: WAV in Temp-Datei schreiben
   └─ whisper-cli.exe  -m <modell.bin> -f <audio.wav> -l de -nt   (child_process)
        └─ stdout = Transkript → bereinigen (quality.js) → an Renderer (done)
```

- **Kein ffmpeg nötig:** Die webm→WAV-Konvertierung passiert im Renderer per Web Audio (Chromium decodiert webm/opus). Nur im **lokalen** Modus konvertieren; im Online-Modus weiterhin webm direkt senden.
- GPT-Workflows bleiben im lokalen Modus pausiert (wie im Original). `run-workflow` sollte für improver-Typen im lokalen Modus gar nicht aufgerufen werden (UI verhindert es bereits).

---

## 3. Aufgaben (einzeln testbar — wie die bisherigen Schritte)

### A. whisper.cpp-Binary bündeln
- Prebuilt Windows-x64-Build von whisper.cpp besorgen (`github.com/ggerganov/whisper.cpp/releases`, z. B. `whisper-bin-x64.zip`). Enthält i. d. R. `whisper-cli.exe` (ältere Builds: `main.exe`) **plus DLLs** (`ggml.dll`, `ggml-cpu.dll`, `whisper.dll` o. ä. — alle mitnehmen).
- Ablegen unter `bin/whisper/` im Projekt.
- In `package.json` → `build.files` und `build.asarUnpack` aufnehmen; beim electron-packager-Staging-Build nach `build-staging/bin/...` kopieren (siehe `blitztext-packaging`-Memory).
- Pfadauflösung wie bei `win-input.ps1`: `path.join(__dirname,'bin','whisper','whisper-cli.exe')`, bei `app.asar` → `app.asar.unpacked` ersetzen.
- **Test:** `whisper-cli.exe -h` aus dem Main spawnen, Exit 0 prüfen.

### B. `selectedLocalTranscriptionModelName` in Settings
- `services/storage.js` `defaultSettings()`: Feld ergänzen (Default = empfohlenes schnelles Modell, z. B. `ggml-base`). Modell-Liste an `LocalTranscriptionService.swift` orientieren.

### C. Modell-Verwaltung (Download + Auswahl)
- Modelle nach `app.getPath('userData')/models/` laden, z. B. von `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin`.
- Neue IPC-Handler in `main.js`: `local-models:list` (verfügbar + installiert), `local-models:download` (mit Fortschritt via `event.sender.send('local-model-progress', ...)`), `local-models:select`.
- `services/local-models.js`: Modell-Metadaten (Name, Größe, URL, Anzeigename), Installstatus (Datei vorhanden?), Download mit Streaming + Fortschritt.
- **Test:** kleines Modell (`ggml-base` ~140 MB) herunterladen, Fortschritt + Datei prüfen.

### D. Audio → 16 kHz Mono WAV (Renderer)
- In `renderer/recorder.js` (oder neue `renderer/wav.js`): Funktion `blobToWav16k(blob)`:
  ```js
  async function blobToWav16k(blob) {
    const buf = await blob.arrayBuffer();
    const ac = new AudioContext();
    const decoded = await ac.decodeAudioData(buf);
    ac.close();
    const len = Math.ceil(decoded.duration * 16000);
    const off = new OfflineAudioContext(1, len, 16000);
    const src = off.createBufferSource(); src.buffer = decoded;
    src.connect(off.destination); src.start();
    const rendered = await off.startRendering();
    const pcm = rendered.getChannelData(0); // Float32, 16 kHz, mono
    return encodeWav16(pcm, 16000);          // -> Uint8Array (RIFF/PCM16)
  }
  function encodeWav16(float32, rate) {
    const n = float32.length; const buf = new ArrayBuffer(44 + n*2); const dv = new DataView(buf);
    const w = (o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
    w(0,'RIFF'); dv.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); dv.setUint32(16,16,true);
    dv.setUint16(20,1,true); dv.setUint16(22,1,true); dv.setUint32(24,rate,true);
    dv.setUint32(28,rate*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
    w(36,'data'); dv.setUint32(40,n*2,true);
    let o=44; for(let i=0;i<n;i++){let s=Math.max(-1,Math.min(1,float32[i]));dv.setInt16(o,s<0?s*0x8000:s*0x7FFF,true);o+=2;}
    return new Uint8Array(buf);
  }
  ```
- In `renderer.js` `realStop()`: wenn lokaler Modus → `blobToWav16k` und WAV-Buffer + `mimeType:'audio/wav'` an `runWorkflow` senden; sonst wie bisher webm.

### E. Lokale Transkription (Main) + run-workflow-Branch
- `services/local-transcription.js`:
  ```js
  const { spawn } = require('child_process');
  function transcribe(wavPath, { binPath, modelPath, language='de' }) {
    return new Promise((resolve, reject) => {
      const p = spawn(binPath, ['-m', modelPath, '-f', wavPath, '-l', language, '-nt'], { windowsHide:true });
      let out=''; let err='';
      p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
      p.on('error', reject);
      p.on('close', code => code===0 ? resolve(out.trim()) : reject(new Error('whisper.cpp: '+(err||code))));
    });
  }
  ```
- `main.js` `run-workflow`: `const settings = storage.getSettings();` → wenn `settings.secureLocalModeEnabled`:
  - Modellpfad aus `userData/models/<selectedLocalTranscriptionModelName>.bin`; wenn fehlt → `{ok:false, error:'Lokales Modell fehlt.'}`.
  - WAV (aus payload, da Renderer konvertiert) in Temp schreiben → `localTranscription.transcribe(...)` → `quality.cleanedTranscript` + `isLikelyArtifact` (wie online) → done.
  - GPT-Schritt entfällt (improver sind im lokalen Modus pausiert).
- **Test:** mit Dev-Hooks (`BLITZTEXT_DEV_AUTOREC`, `BLITZTEXT_LOGFILE`) eine echte Aufnahme lokal transkribieren; Text prüfen. CPU-Tempo beachten (`base`/`small` ok).

### F. UI wieder aktivieren
- Defuse entfernen: `#secure-toggle` wieder interaktiv (kein `disabled`), `#mode-hint` raus/ersetzen.
- `renderer.js` `wireEvents()`: Toggle-Handler wieder anschließen — bei Änderung `state.secureLocalModeEnabled` setzen, `window.api.saveSettings({secureLocalModeEnabled})`, `renderModePanel()/renderWorkflows()`.
- Modell-Picker + Download-Button + Fortschritt ins Mode-Panel (und/oder Settings „Anpassen") einbauen — Design 1:1 aus `transcriptionModePanel` / `CustomizeSettingsView`.
- `renderModePanel()` erweitern: lokaler Modus → lock.shield-Icon (grün), Modellname/Installstatus, Picker.
- Beim Start (`get-settings`) `secureLocalModeEnabled` aus dem Store laden und Toggle/State setzen.

### G. Packaging
- `bin/whisper/**` in `package.json` `build.files` + `asarUnpack`; im Staging-Build (`@electron/packager --no-prune`) nach `build-staging/bin/` kopieren. Pfadauflösung im Build testen.

### H. Reale Tests
- Verschiedene Modelle, deutsche + englische Sprache, kurze/lange Aufnahmen, Fehlerfälle (Modell fehlt, Binary fehlt). Vergleich Qualität/Tempo vs. Online.

---

## 4. Stolpersteine
- **CPU-Features:** whisper.cpp-Builds brauchen oft AVX/AVX2. Breit kompatiblen Build wählen oder Fallback dokumentieren.
- **DLL-Abhängigkeiten:** alle DLLs neben `whisper-cli.exe` mitliefern, sonst startet es nicht.
- **GPU:** CUDA/Vulkan-Builds sind größer & hardware-abhängig — erstmal CPU-Build.
- **Modellgröße:** `base` ~140 MB, `small` ~480 MB, `medium` ~1,5 GB. Download-UX (Fortschritt, Abbruch) wichtig.
- **WAV-Format exakt:** 16 kHz, Mono, 16-bit PCM, RIFF — sonst liefert whisper.cpp Müll/Fehler.
- **`-nt`** (no timestamps) hält stdout sauber; sonst Zeilen mit `[00:00.000 --> ...]` parsen.
- **Output-Encoding:** stdout ggf. UTF-8 erzwingen.

---

## 5. Dateien zum Anfassen (Überblick)
- `services/storage.js` (Feld + ggf. Modellpfad-Helfer)
- `services/local-transcription.js` (neu)
- `services/local-models.js` (neu, Download/Liste)
- `main.js` (IPC: run-workflow-Branch, local-models:*; bin-Pfadauflösung)
- `preload.js` (neue IPC-Methoden + Progress-Listener)
- `renderer/recorder.js` oder `renderer/wav.js` (WAV-Encoding)
- `renderer/renderer.js` (Toggle reaktivieren, lokaler realStop-Zweig, Modell-UI)
- `renderer/index.html` + `style.css` (Modell-Picker/Download-UI; Defuse entfernen)
- `package.json` (`build.files`/`asarUnpack` für `bin/whisper`)
- `bin/whisper/` (neu: Binary + DLLs)

## 6. Akzeptanzkriterium
Toggle „Sicherer lokaler Modus" an → Modell installiert → Aufnahme wird **vollständig offline** transkribiert und eingefügt (kein Netzwerk-Call an OpenAI). Online-Modus unverändert. GPT-Workflows im lokalen Modus weiterhin pausiert (wie im Original).
