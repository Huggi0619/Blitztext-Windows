'use strict';

// ===========================================================================
// quality.js — 1:1 Portierung von TranscriptionQualityService.swift
// ===========================================================================

const MINIMUM_RECORDING_DURATION = 0.3;

function shouldRejectRecording(duration) {
  return (duration || 0) < MINIMUM_RECORDING_DURATION;
}

function cleanedTranscript(text) {
  return (text || '').trim();
}

function isLikelyArtifact(text, recordingDuration) {
  const cleaned = cleanedTranscript(text);
  if (!cleaned) return true;

  const words = cleaned.split(/\s+/).filter(Boolean);
  // Buchstaben (Unicode-Letter) zählen — wie CharacterSet.letters in Swift.
  const letters = (cleaned.match(/\p{L}/gu) || []).length;
  // Zeichenanzahl auf Basis von Codepunkten (näher an Swifts String.count als .length).
  const charCount = Array.from(cleaned).length;

  if (letters === 0) return true;

  if (recordingDuration < 0.55 && (words.length >= 5 || charCount >= 32)) return true;
  if (recordingDuration < 0.8 && charCount >= 56) return true;

  return false;
}

module.exports = {
  MINIMUM_RECORDING_DURATION,
  shouldRejectRecording,
  cleanedTranscript,
  isLikelyArtifact,
};
