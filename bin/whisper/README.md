# bin/whisper — whisper.cpp (Offline-Modus)

Inhalt dieses Ordners (per `.gitignore` ausgeschlossen — **nicht** im Repo, weil
Binärdateien/Modelle groß sind). Wer den lokalen Modus bauen/testen will, legt
die Dateien hier ab.

## Binary (CPU, breit kompatibel)
Aus dem Prebuilt-Release `whisper-bin-x64.zip` von
<https://github.com/ggml-org/whisper.cpp/releases> (getestet: **v1.8.6**),
Ordner `Release/`, folgende Dateien hierher kopieren:

- `whisper-cli.exe`
- `whisper.dll`
- `ggml.dll`
- `ggml-base.dll`
- `ggml-cpu.dll`

> Der CPU-Build braucht **AVX/AVX2**. Startet das Binary nicht (fehlende DLL /
> kein AVX), einen anderen Prebuilt-Build wählen.

## Modell (Slice 0/1: festes Test-Modell)
- `ggml-base.bin` (~142 MB) von
  <https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin>

Ab Slice 2 liegt das Nutzer-Modell stattdessen in
`%APPDATA%\<App>\models\<name>.bin` (electron `userData`).

## Test-WAV (Slice 0)
- `test-de.wav` — 16-kHz-Mono-16-bit-WAV mit einem deutschen Satz. Lokal per
  Windows-TTS erzeugbar:

```powershell
Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, `
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, `
  [System.Speech.AudioFormat.AudioChannel]::Mono)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoice("Microsoft Hedda Desktop") } catch {}
$s.SetOutputToWaveFile("bin\whisper\test-de.wav", $fmt)
$s.Speak("Dies ist ein Test der lokalen Spracherkennung mit Blitztext.")
$s.Dispose()
```

## Spike auslösen (Slice 0)
```powershell
$env:BLITZTEXT_DEV_WHISPER_TEST = '1'
$env:BLITZTEXT_LOGFILE = "$env:TEMP\blitztext-whisper-test.log"
.\node_modules\electron\dist\electron.exe .
# danach: Log lesen → erwartete Zeile "[whisper-test] OK Text=..."
```
