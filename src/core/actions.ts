import { footprint, inBounds, indexOf } from './grid';
import type { Building, BuildingDef, GameState, Point, Rotation } from './types';

export type PlaceError =
  /** Some tile lies outside the walls or on non-buildable terrain. */
  | 'notBuildable'
  /** Some tile is already taken by another building. */
  | 'occupied'
  /** The very same path type is already there; nothing to do. */
  | 'same'
  /** Not available yet, or a one-of-a-kind building that already stands. */
  | 'locked'
  | 'noGold'
  | 'noMaterials'
  | 'noBuildPoints';

export type PlaceCheck = { ok: true; tiles: Point[] } | { ok: false; reason: PlaceError };

type Defs = Readonly<Record<string, BuildingDef>>;

export function rotatedSize(def: BuildingDef, rot: Rotation): { w: number; h: number } {
  return rot === 1 ? { w: def.size.h, h: def.size.w } : { w: def.size.w, h: def.size.h };
}

export function buildingAt(state: GameState, x: number, y: number): Building | undefined {
  if (!inBounds(state.width, state.height, x, y)) return undefined;
  const id = state.occupancy[indexOf(state.width, x, y)];
  return id ? state.buildings[id] : undefined;
}

/**
 * Checks whether `def` fits with its top-left tile at (x, y); says nothing about the price.
 * `defs` is passed in so that core stays independent of the concrete catalogue.
 */
export function canPlace(
  state: GameState,
  defs: Defs,
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
    // Bridges go on canal water, everything else on land.
    const ground = def.onCanal ? 'canal' : 'buildable';
    if (state.terrain[indexOf(state.width, t.x, t.y)] !== ground) {
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

/** Why a building cannot be chosen at the moment. */
export type Lock =
  | { kind: 'pop'; value: number }
  | { kind: 'requires'; def: string }
  | { kind: 'unique' }
  /** A building that belongs to another town. */
  | { kind: 'elsewhere' };

export function lockOf(state: GameState, def: BuildingDef): Lock | null {
  if (def.cities && !def.cities.includes(state.cityId)) return { kind: 'elsewhere' };
  if (def.unlockPop && state.peakPop < def.unlockPop) return { kind: 'pop', value: def.unlockPop };
  const all = Object.values(state.buildings);
  if (def.requires) {
    const needed = def.requires;
    if (!all.some((b) => b.def === needed && !b.construction)) {
      return { kind: 'requires', def: needed };
    }
  }
  if (def.unique && all.some((b) => b.def === def.id)) return { kind: 'unique' };
  return null;
}

/** The first thing the town is short of for building `def`, if any. */
export function affordError(state: GameState, def: BuildingDef): PlaceError | null {
  if (state.buildPoints < def.buildPoints) return 'noBuildPoints';
  if (state.gold < def.cost) return 'noGold';
  if (state.materials < def.materials) return 'noMaterials';
  return null;
}

export type PlaceResult = { ok: true; state: GameState } | { ok: false; reason: PlaceError };

function removeBuilding(state: GameState, target: Building): GameState {
  const occupancy = state.occupancy.map((id) => (id === target.id ? 0 : id));
  const buildings = { ...state.buildings };
  delete buildings[target.id];
  return { ...state, occupancy, buildings };
}

export function placeBuilding(
  state: GameState,
  defs: Defs,
  def: BuildingDef,
  x: number,
  y: number,
  rot: Rotation = 0,
): PlaceResult {
  const check = canPlace(state, defs, def, x, y, rot);
  if (!check.ok) return check;
  if (lockOf(state, def)) return { ok: false, reason: 'locked' };
  const short = affordError(state, def);
  if (short) return { ok: false, reason: short };

  // Paths being paved over simply disappear; there is no refund for them.
  let base = state;
  for (const t of check.tiles) {
    const old = buildingAt(base, t.x, t.y);
    if (old) base = removeBuilding(base, old);
  }

  const { w, h } = rotatedSize(def, rot);
  const id = base.nextBuildingId;
  const occupancy = base.occupancy.slice();
  for (const t of check.tiles) occupancy[indexOf(base.width, t.x, t.y)] = id;
  const building: Building = { id, def: def.id, x, y, w, h, rot };
  if (def.category === 'housing') building.house = { level: 1, pop: 0, lacking: 0 };
  if (def.construction) building.construction = def.construction.turns;
  return {
    ok: true,
    state: {
      ...base,
      occupancy,
      buildings: { ...base.buildings, [id]: building },
      nextBuildingId: id + 1,
      gold: base.gold - def.cost,
      materials: base.materials - def.materials,
      buildPoints: base.buildPoints - def.buildPoints,
    },
  };
}

/**
 * Removes whatever building covers (x, y) and returns part of its gold cost.
 * Returns the same state if there is nothing to remove.
 */
export function demolish(
  state: GameState,
  defs: Defs,
  refundShare: number,
  x: number,
  y: number,
): GameState {
  const target = buildingAt(state, x, y);
  if (!target) return state;
  const refund = Math.floor((defs[target.def]?.cost ?? 0) * refundShare);
  return { ...removeBuilding(state, target), gold: state.gold + refund };
}

export function repairCost(def: BuildingDef, repairShare: number): number {
  return Math.ceil(def.cost * repairShare);
}

export type RepairResult =
  { ok: true; state: GameState } | { ok: false; reason: 'nothing' | 'noGold' | 'noBuildPoints' };

/** Restores a fire-damaged building at (x, y) for gold and one build point. */
export function repair(
  state: GameState,
  defs: Defs,
  repairShare: number,
  x: number,
  y: number,
): RepairResult {
  const target = buildingAt(state, x, y);
  const def = target && defs[target.def];
  if (!target?.damaged || !def) return { ok: false, reason: 'nothing' };
  if (state.buildPoints < 1) return { ok: false, reason: 'noBuildPoints' };
  const cost = repairCost(def, repairShare);
  if (state.gold < cost) return { ok: false, reason: 'noGold' };
  const fixed = { ...target };
  delete fixed.damaged;
  return {
    ok: true,
    state: {
      ...state,
      buildings: { ...state.buildings, [target.id]: fixed },
      gold: state.gold - cost,
      buildPoints: state.buildPoints - 1,
    },
  };
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

export function population(state: GameState): number {
  let total = 0;
  for (const b of Object.values(state.buildings)) total += b.house?.pop ?? 0;
  return total;
}
