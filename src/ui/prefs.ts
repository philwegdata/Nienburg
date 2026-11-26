import type { Lang } from '../core/types';

const KEYS = {
  lang: 'nienburg.lang',
  motion: 'nienburg.motion',
  sound: 'nienburg.sound',
  music: 'nienburg.music',
  daynight: 'nienburg.daynight',
  tutorial: 'nienburg.tutorial',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences simply do not stick without storage.
  }
}

/** The language the player chose, if any. */
export function storedLang(): Lang | null {
  const value = read(KEYS.lang);
  return value === 'de' || value === 'en' ? value : null;
}

export function storeLang(lang: Lang): void {
  write(KEYS.lang, lang);
}

/** Whether the player switched ambient motion off (on top of the system setting). */
export function motionOff(): boolean {
  return read(KEYS.motion) === 'off';
}

export function storeMotionOff(off: boolean): void {
  write(KEYS.motion, off ? 'off' : 'auto');
}

export function soundOn(): boolean {
  return read(KEYS.sound) === 'on';
}

export function storeSoundOn(on: boolean): void {
  write(KEYS.sound, on ? 'on' : 'off');
}

/** Quiet music; off until the player switches it on, like sounds. */
export function musicOn(): boolean {
  return read(KEYS.music) === 'on';
}

export function storeMusicOn(on: boolean): void {
  write(KEYS.music, on ? 'on' : 'off');
}

/** Day and night pass while the picture moves; on unless switched off. */
export function dayNightOn(): boolean {
  return read(KEYS.daynight) !== 'off';
}

export function storeDayNightOn(on: boolean): void {
  write(KEYS.daynight, on ? 'on' : 'off');
}

/** Whether the tutorial has ever been started, finished or skipped on this device. */
export function tutorialKnown(): boolean {
  return read(KEYS.tutorial) !== null;
}

/** The tutorial step the player is on, or null once it is finished or skipped. */
export function tutorialStep(): number | null {
  const value = read(KEYS.tutorial);
  if (value === 'done') return null;
  const step = Number(value ?? 0);
  return Number.isInteger(step) && step >= 0 ? step : 0;
}

export function storeTutorialStep(step: number | null): void {
  write(KEYS.tutorial, step === null ? 'done' : String(step));
}
