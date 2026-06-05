# Lokaler/Privacy-Modus — Implementierungsplan (Vertical Slices)

> Vorlage für eine neue Claude-Code-Session. Ziel: Offline-Transkription via
> **whisper.cpp** (Windows-Pendant zu WhisperKit) hinter dem „Sicherer lokaler
> Modus"-Schalter. Community/experimentell — muss nicht perfekt sein, sollte aber
> möglichst auch auf fremden Rechnern laufen.
>
> **Methode: vertikales Slicing.** Jede Slice geht durch alle Schichten
> (Binary → Audio → Transkription → Ergebnis), ist eigenständig lauffähig und hat
> ein klares Testkriterium. Reihenfolge ist nach Risiko sortiert (Riskantestes zuerst).
> Erst die nächste Slice beginnen, wenn die aktuelle ihr Testkriterium erfüllt.

## Zuerst lesen
- Skill `blitztext-windows`.
- `original-mac-app/BlitztextMac/Services/LocalTranscriptionService.swift` (liegt lokal, **nicht** im Repo) — Modell-Liste & Verhalten als Vorlage.
- Memories `blitztext-packaging` (Staging-Build) und `blitztext-dev-screenshot` (Dev-/Test-Hooks).

## Aktueller Stand (relevant)
- Schalter ist **entschärft**: `#secure-toggle disabled` + `#mode-hint`, gesetzt in `renderer/renderer.js` → `wireEvents()`. UI-Zustandslogik existiert schon: `isWorkflowAvailable()`, `workflowSubtitle()`, `renderModePanel()`, `state.secureLocalModeEnabled`.
- `services/storage.js` → `defaultSettings()` hat `secureLocalModeEnabled`. **Fehlt:** `selectedLocalTranscriptionModelName`.
- `main.js` → `run-workflow` ruft **immer** `openai.transcribe`; es gibt **keinen** lokalen Pfad.
- Aufnahme = webm/opus; `renderer/recorder.js` `stop()` liefert `{buffer, duration, mimeType}`, der webm-Buffer geht an `run-workflow`.
- GPT-Workflows (Blitztext+/$%&!/:)) bleiben im lokalen Modus **pausiert** (wie im Original). Lokal funktioniert nur reine Transkription.

---

## Slice 0 — Spike: whisper.cpp läuft auf diesem Rechner
**Liefert:** Nachweis, dass Binary + Modell + Aufruf + Output-Parsing funktionieren (höchstes Risiko zuerst, bevor irgendetwas anderes gebaut wird).
- Manuell `whisper-cli.exe` (+ alle DLLs) und ein Modell (`ggml-base.bin`) nach `bin/whisper/` legen.
- Mini-Funktion im Main, die whisper-cli auf eine fixe Test-WAV spawnt und den Text per `dlog()` ausgibt; über einen temporären Dev-Hook (env) auslösen.
- **Test:** korrekter Text im Log. Startet das Binary nicht (fehlende DLL / kein AVX) → anderen Prebuilt-Build wählen, **jetzt**, nicht später.

## Slice 1 — Echte Aufnahme offline transkribieren (verdrahteter Dev-Pfad)
**Liefert:** kompletter End-to-End-Flow offline mit einem fixen Modell — der eigentliche „Privacy-Modus läuft"-Moment, nur noch ohne Bedien-UI.
- `renderer`: `blobToWav16k()` (siehe Tech-Ref) — Aufnahme → 16-kHz-Mono-WAV. In `realStop()`: wenn lokaler Modus erzwungen, WAV statt webm an `runWorkflow` senden (`mimeType:'audio/wav'`).
- `services/local-transcription.js`: `transcribe(wavPath,{binPath,modelPath,language})` via `spawn`, stdout parsen.
- `main.js` `run-workflow`: lokaler Zweig → WAV in Temp schreiben → lokale Transkription (fixer Modellpfad) statt OpenAI → `quality.cleanedTranscript`/`isLikelyArtifact` wie online → Paste wie gehabt.
- Auslösen über temporären Zwang, z. B. `BLITZTEXT_FORCE_LOCAL=1`.
- **Test:** autorec lokal → Text erscheint & wird eingefügt; **kein** Netzwerk-Call (prüfen, z. B. ohne API-Key/offline).

## Slice 2 — Schalter steuert den lokalen Modus
**Liefert:** Nutzer kann per Toggle offline diktieren (Modell vorausgesetzt).
- `selectedLocalTranscriptionModelName` in `storage.js` (Default `ggml-base`).
- `renderer`: Defuse entfernen (Toggle interaktiv, `#mode-hint` weg); bei Änderung `state` setzen + `saveSettings({secureLocalModeEnabled})` + `renderModePanel/renderWorkflows`; Stand beim Start aus `get-settings` laden.
- `run-workflow`: Branch auf `settings.secureLocalModeEnabled`; Modellpfad `userData/models/<name>.bin`; fehlt → `{ok:false,error:'Lokales Modell fehlt.'}`.
- **Test:** Toggle an → diktieren → offline; Toggle aus → online unverändert.

## Slice 3 — Modell aus der App herunterladen
**Liefert:** funktioniert auch bei anderen ohne manuelle Schritte (das „läuft bei anderen"-Ziel).
- `services/local-models.js` + IPC `local-models:list|download|select`; Download mit Fortschritt (`event.sender.send('local-model-progress',…)`); zuerst **ein** empfohlenes Modell (`ggml-base`).
- UI: „installieren"-Button + Fortschritt im Mode-Panel (Design aus `transcriptionModePanel`).
- **Test:** ohne Modell → installieren → Fortschritt → danach offline-Transkription.

## Slice 4 — Im gepackten Build enthalten
**Liefert:** Feature in der verteilten `.exe`.
- `bin/whisper/**` in `package.json` `build.files` + `asarUnpack`; im Staging-Build (`@electron/packager --no-prune`) nach `build-staging/bin/` kopieren; Pfad `app.asar`→`app.asar.unpacked` auflösen (wie bei `win-input.ps1`).
- **Test:** gepackte `.exe` → lokaler Modus funktioniert; ggf. auf einem zweiten Rechner.

## Slice 5 — Breite & Robustheit (optional, nicht blockierend)
**Liefert:** mehr Auswahl/Stabilität für andere.
- Mehrere Modelle (Picker auch in Settings „Anpassen"), klare Fehlermeldung bei fehlender DLL/AVX, „experimentell"-Label, „Bekannte Einschränkungen" in README.

---

## Tech-Referenz (kompakt)

**Binary:** Prebuilt Windows-x64 (CPU) von `github.com/ggerganov/whisper.cpp/releases` — `whisper-cli.exe` + **alle** beiliegenden DLLs. Braucht AVX/AVX2 → breit kompatiblen Build wählen.

**Aufruf:** `whisper-cli.exe -m <model.bin> -f <audio.wav> -l de -nt` → stdout = reiner Text (UTF-8 erzwingen). `-nt` = keine Zeitstempel.

**Modelle:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin` (`base` ~140 MB, `small` ~480 MB). Ablage: `app.getPath('userData')/models/`.

**Audio:** whisper.cpp braucht **16 kHz, Mono, 16-bit PCM, RIFF/WAV**. Konvertierung im Renderer (kein ffmpeg):
```js
async function blobToWav16k(blob) {
  const ac = new AudioContext();
  const decoded = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration*16000), 16000);
  const s = off.createBufferSource(); s.buffer = decoded; s.connect(off.destination); s.start();
  const pcm = (await off.startRendering()).getChannelData(0); // Float32, 16k, mono
  const n = pcm.length, b = new ArrayBuffer(44+n*2), dv = new DataView(b);
  const w=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i));};
  w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);
  dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,16000,true);
  dv.setUint32(28,32000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
  w(36,'data');dv.setUint32(40,n*2,true);
  let o=44;for(let i=0;i<n;i++){const v=Math.max(-1,Math.min(1,pcm[i]));dv.setInt16(o,v<0?v*0x8000:v*0x7FFF,true);o+=2;}
  return new Uint8Array(b);
}
```

**Pfadauflösung (Build):** `path.join(__dirname,'bin','whisper','whisper-cli.exe').replace('app.asar','app.asar.unpacked')`.

**Test-Hooks:** `BLITZTEXT_DEV=1`, `BLITZTEXT_DEV_AUTOREC=1`, `BLITZTEXT_DEV_TYPE`, `BLITZTEXT_LOGFILE=<pfad>` (Logs der gepackten GUI-exe). Gepackte App immer über `node_modules\electron\dist\electron.exe` bzw. die fertige `.exe` starten, **nicht** über `electron.cmd` (siehe Memory).

## Gesamt-Akzeptanzkriterium
Toggle „Sicherer lokaler Modus" an + Modell installiert → Aufnahme wird **vollständig offline** transkribiert & eingefügt (kein OpenAI-Call). Online-Modus unverändert. GPT-Workflows im lokalen Modus pausiert.
