import { useMemo } from 'react';

/**
 * One shared AudioContext per app instead of one per component render —
 * constructing AudioContexts repeatedly both janks the main thread and hits
 * the browser's per-page context cap (after which sounds silently die).
 */
let sharedContext: AudioContext | undefined;

const ensureContext = (): AudioContext | undefined => {
  try {
    sharedContext ??= new AudioContext();
    if (sharedContext.state === 'suspended') void sharedContext.resume().catch(() => {});
    return sharedContext;
  } catch {
    return undefined; // audio unavailable
  }
};

const tone = (
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainValue = 0.08,
): void => {
  try {
    const audioContext = ensureContext();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* audio unavailable */ }
};

export interface SoundHandlers {
  playStone: () => void;
  capture: () => void;
  pass: () => void;
  finish: () => void;
}

const handlers: SoundHandlers = {
  playStone: () => tone(220, 0.12, 'triangle', 0.1),
  capture: () => { tone(520, 0.09); window.setTimeout(() => tone(390, 0.11), 55); },
  pass: () => tone(180, 0.18),
  finish: () => { tone(330, 0.16); setTimeout(() => tone(494, 0.2), 130); },
};

/** Stable identity across renders so effect deps never re-fire spuriously. */
export const useSound = (): SoundHandlers => useMemo(() => handlers, []);
