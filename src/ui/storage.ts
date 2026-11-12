import { deserialize, serialize } from '../core/save';
import type { GameState } from '../core/types';

const SAVE_PREFIX = 'nienburg.save.';
const LEGACY_SAVE = 'nienburg.save';
const LAST_CITY = 'nienburg.last';
const LAST_MODE = 'nienburg.lastMode';
const STARS = 'nienburg.stars';

export type Stars = [boolean, boolean, boolean];

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
    // Storage may be unavailable (private mode, quota); the game still works without it.
  }
}

/** Saves from before there was more than one city belonged to Nienburg. */
export function adoptLegacySave(): void {
  const old = read(LEGACY_SAVE);
  if (old === null) return;
  if (read(SAVE_PREFIX + 'nienburg') === null) write(SAVE_PREFIX + 'nienburg', old);
  try {
    localStorage.removeItem(LEGACY_SAVE);
  } catch {
    // Nothing to clean up then.
  }
}

const slot = (cityId: string, sandbox: boolean) =>
  SAVE_PREFIX + cityId + (sandbox ? '.sandbox' : '');

/** The saved game of a city: the normal one, or its separate sandbox. */
export function loadGame(cityId: string, sandbox = false): GameState | null {
  const text = read(slot(cityId, sandbox));
  const state = text ? deserialize(text, [cityId]) : null;
  // A save in the wrong slot is not trusted to be what the slot says.
  return state && Boolean(state.sandbox) === sandbox ? state : null;
}

export function saveGame(state: GameState): void {
  const sandbox = state.sandbox === true;
  write(slot(state.cityId, sandbox), serialize(state));
  write(LAST_CITY, state.cityId);
  write(LAST_MODE, sandbox ? 'sandbox' : 'normal');
  if (sandbox) return;
  // Stars stay earned even if the town is started over.
  const best = bestStars(state.cityId);
  const merged = state.stars.map((s, i) => s || best[i]) as Stars;
  const all = allStars();
  all[state.cityId] = merged;
  write(STARS, JSON.stringify(all));
}

/** Whether the game last played was a sandbox. */
export function lastWasSandbox(): boolean {
  return read(LAST_MODE) === 'sandbox';
}

function allStars(): Record<string, Stars> {
  try {
    const parsed: unknown = JSON.parse(read(STARS) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, Stars>) : {};
  } catch {
    return {};
  }
}

export function bestStars(cityId: string): Stars {
  const stars = allStars()[cityId];
  return Array.isArray(stars) && stars.length === 3
    ? (stars.map(Boolean) as Stars)
    : [false, false, false];
}

export function lastCity(): string | null {
  return read(LAST_CITY);
}
