import type { GameState } from './types';

/** Version of the save format written by this build. */
export const SAVE_VERSION = 2;

interface SaveFile {
  saveVersion: number;
  state: unknown;
}

/**
 * Upgrades from version N to N + 1. Add an entry whenever GameState changes shape,
 * and bump SAVE_VERSION.
 */
const MIGRATIONS: Record<number, (old: unknown) => unknown> = {
  // 1 → 2: craft goods, unlocks by peak population, stars.
  1: (old) => {
    const s = old as Record<string, unknown> & {
      buildings?: Record<string, { house?: { pop?: number } }>;
    };
    let pop = 0;
    for (const b of Object.values(s.buildings ?? {})) pop += b.house?.pop ?? 0;
    return {
      ...s,
      version: 2,
      goods: { cloth: 0, tools: 0, beer: 0 },
      peakPop: pop,
      stars: [false, false, false],
    };
  },
};

export function serialize(state: GameState): string {
  const file: SaveFile = { saveVersion: SAVE_VERSION, state };
  return JSON.stringify(file);
}

function looksLikeState(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  const numbers = ['width', 'height', 'turn', 'gold', 'food', 'materials', 'buildPoints', 'rng'];
  if (numbers.some((key) => typeof s[key] !== 'number')) return false;
  if (typeof s.cityId !== 'string' || typeof s.buildings !== 'object' || s.buildings === null) {
    return false;
  }
  if (typeof s.goods !== 'object' || s.goods === null || !Array.isArray(s.stars)) return false;
  const size = (s.width as number) * (s.height as number);
  return (
    Array.isArray(s.terrain) &&
    Array.isArray(s.occupancy) &&
    s.terrain.length === size &&
    s.occupancy.length === size
  );
}

/**
 * Reads a save written by this or an older build.
 * Returns null for anything unreadable, from the future, or for a city that no longer exists.
 */
export function deserialize(text: string, knownCities: readonly string[]): GameState | null {
  let file: SaveFile;
  try {
    file = JSON.parse(text) as SaveFile;
  } catch {
    return null;
  }
  if (typeof file !== 'object' || file === null || typeof file.saveVersion !== 'number') {
    return null;
  }
  if (file.saveVersion > SAVE_VERSION) return null;
  let state = file.state;
  for (let v = file.saveVersion; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return null;
    state = migrate(state);
  }
  if (!looksLikeState(state) || !knownCities.includes(state.cityId)) return null;
  return state;
}
