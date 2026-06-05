'use strict';

// ===========================================================================
// local-transcription.js — Offline-Transkription via whisper.cpp.
//   Windows-Pendant zu LocalTranscriptionService.swift (WhisperKit auf macOS).
//   Ruft `whisper-cli.exe -m <modell> -f <audio.wav> -l <sprache> -nt` auf:
//     • stdout = reiner Text (mit `-nt` ohne Zeitstempel)
//     • stderr = Diagnose (Modell-Load, Timings, system_info)
//   Audio muss 16-kHz-Mono-16-bit-WAV sein (Konvertierung im Renderer, Slice 1).
//
//   Slice 0: nur Spike — fixe Test-WAV, festes Modell im bin-Ordner. Spätere
//   Slices verdrahten echte Aufnahmen und das Modell aus userData.
//
//   WICHTIG (Slice-0-Erkenntnis): whisper-cli CRASHT (Exit 0xC0000409), wenn ein
//   per `spawn` übergebenes -m/-f-ARGUMENT nicht-ASCII-Zeichen enthält (z. B. das
//   "ü" im Projektpfad "…/Blitztext für windows/…" oder ein Benutzername wie
//   "Müller" in %APPDATA%). Direkt aus der Shell läuft es; via spawn nicht.
//   Lösung: Wir übergeben Modell- und Audiodatei als reine ASCII-BASENAMES und
//   setzen das Verzeichnis über `cwd` (geht als eigener wide-Parameter an
//   CreateProcessW und verträgt nicht-ASCII). Dafür liegen beide Dateien im
//   selben Ordner — die WAV wird bei Bedarf neben das Modell kopiert.
//   (8.3-Kurzpfade wären die Alternative, sind aber abschaltbar → unzuverlässig.)
// ===========================================================================

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Verzeichnis mit whisper-cli.exe + DLLs (+ Slice-0-Modell). Im gepackten Build
// liegt es ausgepackt neben dem asar → 'app.asar' → 'app.asar.unpacked' (Slice 4,
// wie scripts/win-input.ps1 in main.js).
function defaultBinDir() {
  let dir = path.join(__dirname, '..', 'bin', 'whisper');
  if (dir.includes('app.asar')) dir = dir.replace('app.asar', 'app.asar.unpacked');
  return dir;
}

function defaultBinPath() {
  return path.join(defaultBinDir(), 'whisper-cli.exe');
}

// Slice 0: festes Test-Modell direkt im bin-Ordner. Ab Slice 2 kommt der
// Modellpfad aus userData/models/<name>.bin.
function defaultModelPath() {
  return path.join(defaultBinDir(), 'ggml-base.bin');
}

// whisper-cli starten und stdout sammeln. Args sind reine ASCII-Basenames,
// das (evtl. nicht-ASCII-)Verzeichnis kommt über cwd.
function runWhisper(binPath, cwd, modelName, audioName, language) {
  return new Promise((resolve, reject) => {
    // -nt = no timestamps → stdout ist reiner Text.
    const args = ['-m', modelName, '-f', audioName, '-l', language, '-nt'];
    let stdout = '';
    let stderr = '';

    let child;
    try {
      child = spawn(binPath, args, { cwd, windowsHide: true });
    } catch (err) {
      return reject(err);
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject); // z. B. fehlende DLL → Spawn-Fehler
    child.on('close', (code) => {
      if (code !== 0) {
        const tail = stderr.trim().split('\n').slice(-3).join(' ');
        return reject(new Error('whisper-cli beendet mit Code ' + code + (tail ? ': ' + tail : '')));
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Transkribiert eine 16-kHz-Mono-WAV vollständig offline via whisper-cli.
 * @param {string} wavPath  Pfad zur WAV-Datei (16 kHz, Mono, 16-bit PCM)
 * @param {object} [options]
 * @param {string} [options.binPath]   Pfad zu whisper-cli.exe
 * @param {string} [options.modelPath] Pfad zum ggml-Modell (.bin)
 * @param {string} [options.language]  Sprachcode (Default 'de')
 * @returns {Promise<string>} reiner, getrimmter Transkriptionstext
 */
async function transcribe(wavPath, options = {}) {
  const binPath = options.binPath || defaultBinPath();
  const modelPath = options.modelPath || defaultModelPath();
  const language = options.language || 'de';

  if (!fs.existsSync(binPath)) {
    throw new Error('whisper-cli.exe fehlt: ' + binPath);
  }
  if (!fs.existsSync(modelPath)) {
    throw new Error('Lokales Modell fehlt: ' + modelPath);
  }
  if (!fs.existsSync(wavPath)) {
    throw new Error('Audio-Datei fehlt: ' + wavPath);
  }

  const workDir = path.dirname(modelPath);
  const modelName = path.basename(modelPath);

  // Audio muss als ASCII-Basename neben dem Modell liegen (siehe Kopf-Kommentar).
  let audioName = path.basename(wavPath);
  let stagedAudio = null;
  const sameDir = path.resolve(path.dirname(wavPath)) === path.resolve(workDir);
  if (!sameDir || /[^\x20-\x7E]/.test(audioName)) {
    audioName = `blitztext-stage-${Date.now()}.wav`;
    stagedAudio = path.join(workDir, audioName);
    await fs.promises.copyFile(wavPath, stagedAudio);
  }

  try {
    return await runWhisper(binPath, workDir, modelName, audioName, language);
  } finally {
    if (stagedAudio) {
      try { await fs.promises.unlink(stagedAudio); } catch (_) { /* ignore */ }
    }
  }
}

module.exports = { transcribe, defaultBinDir, defaultBinPath, defaultModelPath };
