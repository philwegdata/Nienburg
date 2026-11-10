import { footprint, inBounds, indexOf } from './grid';
import type { Building, BuildingDef, GameState, Point, Rotation } from './types';

export type PlaceError =
  /** Some tile lies outside the walls or on non-buildable terrain. */
  | 'notBuildable'
  /** Some tile is already taken by another building. */
  | 'occupied'
  /** The very same path type is already there; nothing to do. */
  | 'same';

export type PlaceCheck = { ok: true; tiles: Point[] } | { ok: false; reason: PlaceError };

export function rotatedSize(def: BuildingDef, rot: Rotation): { w: number; h: number } {
  return rot === 1 ? { w: def.size.h, h: def.size.w } : { w: def.size.w, h: def.size.h };
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  if (!inBounds(state.width, state.height, x, y)) return undefined;
  const id = state.occupancy[indexOf(state.width, x, y)];
  return id ? state.buildings[id] : undefined;
}

/**
 * Checks whether `def` fits with its top-left tile at (x, y).
 * `defs` is passed in so that core stays independent of the concrete catalogue.
 */
export function canPlace(
  state: GameState,
  defs: Readonly<Record<string, BuildingDef>>,
  def: BuildingDef,
  x: number,
  y: number,
  rot: Rotation = 0,
): PlaceCheck {
  const { w, h } = rotatedSize(def, rot);
  const tiles = footprint(x, y, w, h);
  for (const t of tiles) {
    if (!inBounds(state.width, state.height, t.x, t.y))
      return { ok: false, reason: 'notBuildable' };
    if (state.terrain[indexOf(state.width, t.x, t.y)] !== 'buildable') {
      return { ok: false, reason: 'notBuildable' };
    }
    const existing = buildingAt(state, t.x, t.y);
    if (!existing) continue;
    // A path may be laid over a different kind of path (e.g. paving an alley).
    const existingDef = defs[existing.def];
    if (def.category === 'path' && existingDef?.category === 'path') {
      if (existing.def === def.id) return { ok: false, reason: 'same' };
      continue;
    }
    return { ok: false, reason: 'occupied' };
  }
  return { ok: true, tiles };
}

export type PlaceResult = { ok: true; state: GameState } | { ok: false; reason: PlaceError };

export function placeBuilding(
  state: GameState,
  defs: Readonly<Record<string, BuildingDef>>,
  def: BuildingDef,
  x: number,
  y: number,
  rot: Rotation = 0,
): PlaceResult {
  const check = canPlace(state, defs, def, x, y, rot);
  if (!check.ok) return check;

  // Remove paths that are being replaced.
  let base = state;
  for (const t of check.tiles) {
    if (buildingAt(base, t.x, t.y)) base = demolish(base, t.x, t.y);
  }

  const { w, h } = rotatedSize(def, rot);
  const id = base.nextBuildingId;
  const occupancy = base.occupancy.slice();
  for (const t of check.tiles) occupancy[indexOf(base.width, t.x, t.y)] = id;
  return {
    ok: true,
    state: {
      ...base,
      occupancy,
      buildings: { ...base.buildings, [id]: { id, def: def.id, x, y, w, h, rot } },
      nextBuildingId: id + 1,
    },
  };
}

/** Removes whatever building covers (x, y). Returns the same state if there is none. */
export function demolish(state: GameState, x: number, y: number): GameState {
  const target = buildingAt(state, x, y);
  if (!target) return state;
  const occupancy = state.occupancy.map((id) => (id === target.id ? 0 : id));
  const buildings = { ...state.buildings };
  delete buildings[target.id];
  return { ...state, occupancy, buildings };
}

export interface TileCounts {
  buildable: number;
  free: number;
}

export function countTiles(state: GameState): TileCounts {
  let buildable = 0;
  let free = 0;
  state.terrain.forEach((t, i) => {
    if (t !== 'buildable') return;
    buildable++;
    if (!state.occupancy[i]) free++;
  });
  return { buildable, free };
}
