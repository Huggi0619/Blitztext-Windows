'use strict';

// ===========================================================================
// AudioRecorder — Abbild von AudioRecorder.swift für Web/Electron.
//   - getUserMedia (Mono, 16 kHz angefragt)
//   - MediaRecorder (webm/opus) sammelt die Chunks
//   - Live-Pegel via Web Audio AnalyserNode (RMS) -> Waveform
//   - stop() liefert { buffer, duration, mimeType } für den Versand an Main
// ===========================================================================
(function () {
  function pickMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];
    for (const t of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  class AudioRecorder {
    constructor() {
      this.stream = null;
      this.recorder = null;
      this.chunks = [];
      this.mimeType = '';
      this.startTime = 0;
      this.duration = 0;
      this.onLevel = null;

      this.audioCtx = null;
      this.analyser = null;
      this.source = null;
      this.levelData = null;
      this.meterRAF = null;
    }

    get isRecording() {
      return !!(this.recorder && this.recorder.state === 'recording');
    }

    // Startet die Aufnahme. onLevel(level 0..1) wird ~60x/s aufgerufen.
    async start(onLevel) {
      this.onLevel = onLevel;
      this.chunks = [];

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mimeType = pickMimeType();
      const options = this.mimeType ? { mimeType: this.mimeType } : undefined;
      this.recorder = new MediaRecorder(this.stream, options);
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };

      this.startTime = performance.now();
      this.recorder.start(250); // Timeslice: alle 250ms ein Chunk (robuster als nur bei stop)

      this._startMetering();
    }

    _startMetering() {
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.source = this.audioCtx.createMediaStreamSource(this.stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.source.connect(this.analyser);
        this.levelData = new Float32Array(this.analyser.fftSize);
        this._meter();
      } catch (err) {
        // Pegelanzeige ist optional — Aufnahme läuft auch ohne weiter.
        console.warn('Metering nicht verfügbar:', err);
      }
    }

    _meter() {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.levelData);
      let sum = 0;
      for (let i = 0; i < this.levelData.length; i++) {
        const v = this.levelData[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.levelData.length);
      const level = Math.max(0, Math.min(1, rms * 8)); // Verstärkung wie averagePower-Mapping
      if (this.onLevel) this.onLevel(level);
      this.meterRAF = requestAnimationFrame(() => this._meter());
    }

    // Stoppt die Aufnahme und liefert die Audiodaten.
    stop() {
      return new Promise((resolve, reject) => {
        if (!this.recorder) {
          resolve(null);
          return;
        }
        this.duration = (performance.now() - this.startTime) / 1000;
        this.recorder.onstop = async () => {
          this._teardownMetering();
          this._stopTracks();
          try {
            const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
            const buffer = new Uint8Array(await blob.arrayBuffer());
            resolve({ buffer, duration: this.duration, mimeType: this.mimeType || 'audio/webm' });
          } catch (err) {
            reject(err);
          }
        };
        try {
          this.recorder.stop();
        } catch (err) {
          reject(err);
        }
      });
    }

    // Verwerfen ohne Auswertung (z.B. beim Verlassen der Seite).
    discard() {
      this._teardownMetering();
      try {
        if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
      } catch (_) { /* ignore */ }
      this._stopTracks();
      this.chunks = [];
    }

    _teardownMetering() {
      if (this.meterRAF) { cancelAnimationFrame(this.meterRAF); this.meterRAF = null; }
      if (this.audioCtx) {
        try { this.audioCtx.close(); } catch (_) { /* ignore */ }
        this.audioCtx = null;
      }
      this.analyser = null;
      this.source = null;
    }

    _stopTracks() {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
    }
  }

  window.AudioRecorder = AudioRecorder;
})();
