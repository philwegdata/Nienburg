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
    if (!inBounds(state.width, state.height, t.x, t.y)) {
      return { ok: false, reason: 'notBuildable' };
    }
    const terrain = state.terrain[indexOf(state.width, t.x, t.y)];
    const existing = buildingAt(state, t.x, t.y);
    const existingDef = existing && defs[existing.def];
    if (def.onCanal) {
      // Bridges go over canal water: a canal of the map, or one the town has dug.
      if (existing?.def === def.id) return { ok: false, reason: 'same' };
      if (existingDef?.canal) continue;
      if (terrain !== 'canal') return { ok: false, reason: 'notBuildable' };
      if (existing) return { ok: false, reason: 'occupied' };
      continue;
    }
    if (terrain !== 'buildable') return { ok: false, reason: 'notBuildable' };
    if (!existing) continue;
    // A path may be laid over a different kind of path (e.g. paving an alley).
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
  // In a sandbox everything can be built at once, as often as one likes.
  if (state.sandbox) return null;
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
  if (state.sandbox) return null;
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
  // A bridge over a dug canal remembers the canal beneath it.
  let base = state;
  let overCanal = false;
  for (const t of check.tiles) {
    const old = buildingAt(base, t.x, t.y);
    if (!old) continue;
    if (defs[old.def]?.canal) overCanal = true;
    base = removeBuilding(base, old);
  }

  const { w, h } = rotatedSize(def, rot);
  const id = base.nextBuildingId;
  const occupancy = base.occupancy.slice();
  for (const t of check.tiles) occupancy[indexOf(base.width, t.x, t.y)] = id;
  const building: Building = { id, def: def.id, x, y, w, h, rot };
  if (def.category === 'housing') building.house = { level: 1, pop: 0, lacking: 0 };
  if (def.construction) building.construction = def.construction.turns;
  if (overCanal) building.overCanal = true;
  return {
    ok: true,
    state: {
      ...base,
      occupancy,
      buildings: { ...base.buildings, [id]: building },
      nextBuildingId: id + 1,
      // Nothing costs anything in a sandbox.
      ...(base.sandbox
        ? {}
        : {
            gold: base.gold - def.cost,
            materials: base.materials - def.materials,
            buildPoints: base.buildPoints - def.buildPoints,
          }),
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
  const cleared = { ...removeBuilding(state, target), gold: state.gold + refund };
  if (!target.overCanal) return cleared;
  // Taking a bridge away leaves the canal it spanned.
  const canal = Object.values(defs).find((d) => d.canal);
  if (!canal) return cleared;
  const id = cleared.nextBuildingId;
  const occupancy = cleared.occupancy.slice();
  occupancy[indexOf(cleared.width, target.x, target.y)] = id;
  return {
    ...cleared,
    occupancy,
    buildings: {
      ...cleared.buildings,
      [id]: { id, def: canal.id, x: target.x, y: target.y, w: 1, h: 1, rot: 0 },
    },
    nextBuildingId: id + 1,
  };
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
  const free = state.sandbox === true;
  if (!free && state.buildPoints < 1) return { ok: false, reason: 'noBuildPoints' };
  const cost = free ? 0 : repairCost(def, repairShare);
  if (state.gold < cost) return { ok: false, reason: 'noGold' };
  const fixed = { ...target };
  delete fixed.damaged;
  return {
    ok: true,
    state: {
      ...state,
      buildings: { ...state.buildings, [target.id]: fixed },
      gold: state.gold - cost,
      buildPoints: state.buildPoints - (free ? 0 : 1),
    },
  };
}

/** What the next tile of land outside the walls costs. */
export function landPrice(state: GameState, land: { base: number; step: number }): number {
  return land.base + land.step * state.landBought;
}

export type LandError =
  /** Not open countryside: water, rock, walls, or land the town already has. */
  | 'notOutside'
  /** Not next to a gate or to land the town already has. */
  | 'notAdjacent'
  | 'noGold';

/** Whether the town could buy the tile at (x, y), money aside. */
export function landError(state: GameState, x: number, y: number): LandError | null {
  if (!inBounds(state.width, state.height, x, y)) return 'notOutside';
  if (state.terrain[indexOf(state.width, x, y)] !== 'outside') return 'notOutside';
  const next = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const adjacent = next.some(([dx, dy]) => {
    if (!inBounds(state.width, state.height, x + dx, y + dy)) return false;
    const t = state.terrain[indexOf(state.width, x + dx, y + dy)];
    return t === 'gate' || t === 'buildable';
  });
  return adjacent ? null : 'notAdjacent';
}

export type LandResult = { ok: true; state: GameState } | { ok: false; reason: LandError };

/**
 * Buys a tile of countryside next to a gate or to the town's own land and makes it building
 * ground. Every tile costs more than the last.
 */
export function buyLand(
  state: GameState,
  land: { base: number; step: number },
  x: number,
  y: number,
): LandResult {
  const error = landError(state, x, y);
  if (error) return { ok: false, reason: error };
  const price = state.sandbox ? 0 : landPrice(state, land);
  if (state.gold < price) return { ok: false, reason: 'noGold' };
  const terrain = state.terrain.slice();
  terrain[indexOf(state.width, x, y)] = 'buildable';
  return {
    ok: true,
    state: { ...state, terrain, gold: state.gold - price, landBought: state.landBought + 1 },
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
