import { deserialize, SAVE_VERSION } from './save';
import type { GameState, Terrain } from './types';

/**
 * A town packed for a link: everything that cannot be worked out again from the city's plan.
 * Terrain is stored only where it differs from the plan (land bought, wall taken down).
 */
export interface SharedTown {
  /** Save version the state was written with. */
  v: number;
  s: Omit<GameState, 'terrain' | 'occupancy' | 'lastReport'>;
  t: [number, Terrain][];
}

export function packTown(state: GameState, plan: readonly Terrain[]): SharedTown {
  const rest: Partial<GameState> = { ...state };
  delete rest.terrain;
  delete rest.occupancy;
  delete rest.lastReport;
  const t: [number, Terrain][] = [];
  state.terrain.forEach((x, i) => {
    if (x !== plan[i]) t.push([i, x]);
  });
  return { v: SAVE_VERSION, s: rest as SharedTown['s'], t };
}

/**
 * Unpacks a shared town onto the city's plan. Returns null for anything that does not fit:
 * a different plan, an unknown city, a save from the future.
 */
export function unpackTown(
  shared: SharedTown,
  plan: readonly Terrain[],
  knownCities: readonly string[],
): GameState | null {
  if (typeof shared !== 'object' || shared === null || typeof shared.s !== 'object') return null;
  const { width, height } = shared.s;
  if (width * height !== plan.length || !Array.isArray(shared.t)) return null;
  const terrain = plan.slice();
  for (const entry of shared.t) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'number' || !(entry[0] in terrain))
      return null;
    terrain[entry[0]] = entry[1];
  }
  const occupancy = new Array<number>(plan.length).fill(0);
  for (const b of Object.values(shared.s.buildings ?? {})) {
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) return null;
        occupancy[y * width + x] = b.id;
      }
    }
  }
  const state = { ...shared.s, terrain, occupancy, lastReport: null };
  return deserialize(JSON.stringify({ saveVersion: shared.v, state }), knownCities);
}
