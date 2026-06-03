'use strict';

// Monochrome SVG-Icons als Ersatz für die SF Symbols des macOS-Originals.
// Alle nutzen currentColor, damit sie die Textfarbe des Eltern-Elements erben
// (im Menü .secondary, genau wie im Original).
window.ICONS = {
  // mic.fill — Blitztext (Transkription)
  mic: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 0 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5z"/>
    <path d="M18 11a1 1 0 0 0-2 0 4 4 0 0 1-8 0 1 1 0 0 0-2 0 6 6 0 0 0 5 5.92V19H8.5a1 1 0 0 0 0 2h7a1 1 0 0 0 0-2H13v-2.08A6 6 0 0 0 18 11z"/>
  </svg>`,

  // text.badge.checkmark — Blitztext+ (Textverbesserung)
  textCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="4" y1="6" x2="20" y2="6"/>
    <line x1="4" y1="11" x2="13" y2="11"/>
    <line x1="4" y1="16" x2="11" y2="16"/>
    <polyline points="14.5 16.5 17 19 21.5 13.5"/>
  </svg>`,

  // flame.fill — Blitztext $%&! (Dampf ablassen)
  flame: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13.6 1.8c.6 2.9-1.2 4.3-2.7 5.8C9.3 9.2 8 10.6 8 13a4 4 0 0 0 8 0c0-1-.3-2-1-3 1.9 1 3.2 3.1 3.2 5.6a6.6 6.6 0 0 1-13.2 0C5 11 9.1 8 9.8 4.9c.3-1.6 1.9-2.7 3.8-3.1z"/>
  </svg>`,

  // face.smiling — Blitztext :) (Emoji-Text)
  smile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
    <path d="M8.2 14.2s1.4 2 3.8 2 3.8-2 3.8-2" stroke-linecap="round"/>
    <circle cx="9" cy="10" r="1.05" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="10" r="1.05" fill="currentColor" stroke="none"/>
  </svg>`,

  // gear — Einstellungen
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`,

  // network — Online-Modus
  network: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>
  </svg>`,

  // lock.shield.fill — sicherer lokaler Modus
  lockShield: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l7 3v6c0 4.6-3.1 8.3-7 9.3C8.1 19.3 5 15.6 5 11V5l7-3z"/>
  </svg>`,

  // key.fill — nicht konfiguriert
  key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="7.5" cy="15.5" r="3.5"/>
    <line x1="10" y1="13" x2="20" y2="3"/>
    <line x1="16.5" y1="6.5" x2="19.5" y2="9.5"/>
    <line x1="13.5" y1="9.5" x2="16.5" y2="12.5"/>
  </svg>`,

  // chevron.left — Zurück
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`,

  // checkmark.circle.fill — Done (Eingefügt)
  checkCircle: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="currentColor"/>
    <path d="M6.8 12.4l3.2 3.2L17.2 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // exclamationmark.triangle.fill — Error
  warnTriangle: `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.2 22.4 20.4H1.6z" fill="currentColor"/>
    <rect x="11" y="9" width="2" height="6.2" rx="1" fill="#fff"/>
    <rect x="11" y="16.6" width="2" height="2" rx="1" fill="#fff"/>
  </svg>`,
};
