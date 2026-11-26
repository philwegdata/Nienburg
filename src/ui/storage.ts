import { deserialize, serialize } from '../core/save';
import type { CustomPlan } from '../core/editor';
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

const CUSTOM = 'nienburg.plans';

/** Plans the player has drawn, oldest first. */
export function customPlans(): CustomPlan[] {
  try {
    const list = JSON.parse(read(CUSTOM) ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (p): p is CustomPlan =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as CustomPlan).id === 'string' &&
        typeof (p as CustomPlan).name === 'string' &&
        Array.isArray((p as CustomPlan).map),
    );
  } catch {
    return [];
  }
}

export function storeCustomPlan(plan: CustomPlan): void {
  const others = customPlans().filter((p) => p.id !== plan.id);
  write(CUSTOM, JSON.stringify([...others, plan]));
}

export function deleteCustomPlan(id: string): void {
  write(CUSTOM, JSON.stringify(customPlans().filter((p) => p.id !== id)));
}

const ACHIEVED = 'nienburg.achievements';

/** Ids of the achievements earned so far, in any game. */
export function achieved(): string[] {
  try {
    const list = JSON.parse(read(ACHIEVED) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addAchieved(ids: readonly string[]): void {
  if (ids.length === 0) return;
  write(ACHIEVED, JSON.stringify([...new Set([...achieved(), ...ids])]));
}

const DAILY = 'nienburg.daily';

/** Best scores of each day's challenge, best first; only the last two weeks are kept. */
function dailyTable(): Record<string, number[]> {
  try {
    const table = JSON.parse(read(DAILY) ?? '{}') as unknown;
    return typeof table === 'object' && table !== null ? (table as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

export function dailyScores(date: string): number[] {
  const list = dailyTable()[date];
  return Array.isArray(list) ? list.filter((n) => typeof n === 'number') : [];
}

export function addDailyScore(date: string, score: number): void {
  const table = dailyTable();
  const list = [...dailyScores(date), score].sort((a, b) => b - a).slice(0, 5);
  const recent = Object.keys(table).sort().slice(-13);
  const kept: Record<string, number[]> = {};
  for (const d of recent) if (d !== date) kept[d] = table[d]!;
  kept[date] = list;
  write(DAILY, JSON.stringify(kept));
}

const SOLVED = 'nienburg.puzzles';

/** Ids of the puzzles solved so far. */
export function solvedPuzzles(): string[] {
  try {
    const list = JSON.parse(read(SOLVED) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markPuzzleSolved(id: string): void {
  const list = solvedPuzzles();
  if (!list.includes(id)) write(SOLVED, JSON.stringify([...list, id]));
}

export function saveGame(state: GameState): void {
  const sandbox = state.sandbox === true;
  write(slot(state.cityId, sandbox), serialize(state));
  // A puzzle is a side trip: the next start still opens the town played last.
  if (state.puzzle) return;
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
