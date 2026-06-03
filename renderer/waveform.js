'use strict';

// ===========================================================================
// Waveform — 1:1 Portierung von WaveformView.swift / WaveformState.
//   - 40 Bars, Breite 2.5px, Abstand 2px, Capsule-Form
//   - Timer mit 30fps
//   - tick(): phase += 0.15; jitter ∈ [-0.06, 0.06]; breathe = sin(phase)*0.03
//             newLevel = clamp(base + jitter + breathe, 0.03, 1.0)
//   - Bar-Höhe: max(2, level * 40); Opacity: 0.25 + level * 0.75 (Farbe .primary)
//   - Stop: Timer aus + easeOut-Reset über 0.4s zurück auf 0.03
// ===========================================================================
(function () {
  const BAR_COUNT = 40;
  const BAR_WIDTH = 2.5;
  const BAR_GAP = 2;
  const REST_LEVEL = 0.03;
  const MAX_BAR_HEIGHT = 40;

  class Waveform {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.levels = new Array(BAR_COUNT).fill(REST_LEVEL);
      this.phase = 0;
      this.currentLevel = 0;
      this.timer = null;
      this.resetRAF = null;
      this.resize();
    }

    // Canvas auf die tatsächliche CSS-Größe + DPI skalieren (scharfe Bars).
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.cssW = rect.width || 260;
      this.cssH = rect.height || 44;
      this.canvas.width = Math.round(this.cssW * dpr);
      this.canvas.height = Math.round(this.cssH * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }

    setLevel(level) {
      this.currentLevel = Math.max(0, Math.min(1, level));
    }

    start() {
      if (this.timer) return;
      if (this.resetRAF) { cancelAnimationFrame(this.resetRAF); this.resetRAF = null; }
      this.timer = setInterval(() => this.tick(), 1000 / 30);
    }

    stop() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      this.animateReset();
    }

    // Sofortiges Aufräumen (z.B. beim Verlassen der Seite) — ohne Animation.
    dispose() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.resetRAF) { cancelAnimationFrame(this.resetRAF); this.resetRAF = null; }
    }

    tick() {
      this.phase += 0.15;
      const base = this.currentLevel;
      const jitter = Math.random() * 0.12 - 0.06; // [-0.06, 0.06]
      const breathe = Math.sin(this.phase) * 0.03;
      const newLevel = Math.max(REST_LEVEL, Math.min(1, base + jitter + breathe));
      this.levels.shift();
      this.levels.push(newLevel);
      this.draw();
    }

    // easeOut-Reset über 0.4s zurück auf REST_LEVEL (wie withAnimation(.easeOut(0.4))).
    animateReset() {
      const start = performance.now();
      const duration = 400;
      const from = this.levels.slice();
      const easeOut = (t) => 1 - Math.pow(1 - t, 3);

      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeOut(t);
        for (let i = 0; i < BAR_COUNT; i++) {
          this.levels[i] = from[i] + (REST_LEVEL - from[i]) * e;
        }
        this.draw();
        if (t < 1) {
          this.resetRAF = requestAnimationFrame(step);
        } else {
          this.resetRAF = null;
          this.phase = 0;
        }
      };
      this.resetRAF = requestAnimationFrame(step);
    }

    draw() {
      const ctx = this.ctx;
      const W = this.cssW;
      const H = this.cssH;
      ctx.clearRect(0, 0, W, H);

      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const totalW = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
      let x = (W - totalW) / 2;
      const r = BAR_WIDTH / 2;

      for (const level of this.levels) {
        const barH = Math.max(2, level * MAX_BAR_HEIGHT);
        const opacity = 0.25 + level * 0.75;
        ctx.fillStyle = isDark
          ? `rgba(255,255,255,${opacity})`
          : `rgba(0,0,0,${opacity})`;
        const y = (H - barH) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barH, r);
        ctx.fill();
        x += BAR_WIDTH + BAR_GAP;
      }
    }
  }

  window.Waveform = Waveform;
})();
