import { write } from './chronicle';
import { footprint, inBounds, indexOf } from './grid';
import {
  FESTIVALS,
  type Building,
  type BuildingDef,
  type FestivalKind,
  type GameState,
  type Good,
  type LoanTerms,
  type Point,
  type Rotation,
  type TaxRate,
} from './types';

export type PlaceError =
  /** Some tile lies outside the walls or on non-buildable terrain. */
  | 'notBuildable'
  /** Some tile is already taken by another building. */
  | 'occupied'
  /** Fields and the like only go on land outside the walls. */
  | 'notCountryside'
  /** The very same path type is already there; nothing to do. */
  | 'same'
  /** Not available yet, or a one-of-a-kind building that already stands. */
  | 'locked'
  | 'noGold'
  | 'noMaterials'
  | 'noBuildPoints'
  /** A puzzle has no more pieces of this kind. */
  | 'noPieces';

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
    if (def.onWall) {
      // Homes on the wall walk or in a tower; never in a gate.
      if (terrain !== 'wall' && terrain !== 'tower') return { ok: false, reason: 'notBuildable' };
      if (existing) return { ok: false, reason: existing.def === def.id ? 'same' : 'occupied' };
      continue;
    }
    if (def.onCanal) {
      // Bridges go over canal water: a canal of the map, or one the town has dug.
      if (existing?.def === def.id) return { ok: false, reason: 'same' };
      if (existingDef?.canal) continue;
      if (terrain !== 'canal') return { ok: false, reason: 'notBuildable' };
      if (existing) return { ok: false, reason: 'occupied' };
      continue;
    }
    if (terrain !== 'buildable') return { ok: false, reason: 'notBuildable' };
    if (def.countryside && !isCountryside(state, t.x, t.y)) {
      return { ok: false, reason: 'notCountryside' };
    }
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

const BARRIERS = new Set(['wall', 'tower', 'gate', 'canal']);
const outsideCache = new WeakMap<readonly string[], Uint8Array>();

/**
 * Tiles outside the walls: everything reachable from the edge of the map without crossing a
 * wall, tower, gate or canal. Cached per terrain array, which only changes when land is bought.
 */
export function outsideWalls(state: GameState): Uint8Array {
  const cached = outsideCache.get(state.terrain);
  if (cached) return cached;
  const { width, height, terrain } = state;
  // Where the old wall stood is still the town's inner edge, even without stones.
  const razed = new Set(state.razed ?? []);
  const out = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (out[i] || BARRIERS.has(terrain[i]!) || razed.has(i)) continue;
    out[i] = 1;
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
  outsideCache.set(state.terrain, out);
  return out;
}

/** Building ground outside the walls: land the town has bought. */
export function isCountryside(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state.width, state.height, x, y)) return false;
  const i = indexOf(state.width, x, y);
  return state.terrain[i] === 'buildable' && outsideWalls(state)[i] === 1;
}

/** Why a building cannot be chosen at the moment. */
export type Lock =
  | { kind: 'pop'; value: number }
  | { kind: 'requires'; def: string }
  | { kind: 'unique' }
  /** A building that belongs to another town. */
  | { kind: 'elsewhere' };

export function lockOf(state: GameState, def: BuildingDef): Lock | null {
  // A puzzle offers exactly its own pieces.
  if (state.puzzle) return state.puzzle.pieces[def.id] ? null : { kind: 'elsewhere' };
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
  if (state.puzzle) {
    const allowed = state.puzzle.pieces[def.id] ?? 0;
    const used = Object.values(state.buildings).filter((b) => b.def === def.id).length;
    // Paving over a path of the same kind uses no new piece, but a fresh tile does.
    if (used >= allowed) return { ok: false, reason: 'noPieces' };
  }

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
  if (def.onWall && base.terrain[indexOf(base.width, x, y)] === 'tower') building.inTower = true;
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

/** The most the bank will have lent at once; grows with the town. */
export function loanLimit(state: GameState, terms: LoanTerms): number {
  const raw = terms.base + terms.perHead * population(state);
  return Math.floor(raw / terms.step) * terms.step;
}

/** How much more the town could borrow right now. */
export function loanRoom(state: GameState, terms: LoanTerms): number {
  if (state.sandbox) return 0;
  return Math.max(0, loanLimit(state, terms) - state.debt);
}

export type LoanError =
  /** The bank will not lend more than the limit. */
  | 'loanLimit'
  /** Nothing to pay back, or no gold to pay with. */
  | 'nothingToRepay'
  | 'noGold';

export type LoanResult = { ok: true; state: GameState } | { ok: false; reason: LoanError };

/** Borrows `amount` gold from the bank. */
export function borrow(state: GameState, terms: LoanTerms, amount: number): LoanResult {
  const sum = Math.floor(amount);
  if (sum <= 0 || sum > loanRoom(state, terms)) return { ok: false, reason: 'loanLimit' };
  return { ok: true, state: { ...state, gold: state.gold + sum, debt: state.debt + sum } };
}

/** Pays back up to `amount` gold; never more than the debt or the gold there is. */
export function repayLoan(state: GameState, amount: number): LoanResult {
  if (state.debt <= 0) return { ok: false, reason: 'nothingToRepay' };
  const sum = Math.min(Math.floor(amount), state.debt, state.gold);
  if (sum <= 0) return { ok: false, reason: 'noGold' };
  return { ok: true, state: { ...state, gold: state.gold - sum, debt: state.debt - sum } };
}

/**
 * The bank's share of the end of a turn: interest goes onto the debt, then an instalment is paid
 * from the gold left over. A treasury that has nothing left simply pays nothing this time.
 */
export function settleLoan(
  gold: number,
  debt: number,
  terms: LoanTerms,
): { gold: number; debt: number; interest: number; paid: number } {
  if (debt <= 0) return { gold, debt: 0, interest: 0, paid: 0 };
  const interest = Math.ceil(debt * terms.interest);
  const owed = debt + interest;
  // Small sums are paid off in one go, so a debt never lingers on forever.
  const due = Math.min(owed, Math.max(Math.ceil(owed * terms.installment), terms.step / 10));
  const paid = Math.max(0, Math.min(due, gold));
  return { gold: gold - paid, debt: owed - paid, interest, paid };
}

/** Tells the merchants to keep a kind of craft goods in store, or to sell it again. */
export function setHold(state: GameState, good: Good, hold: boolean): GameState {
  const current = state.hold ?? [];
  if (current.includes(good) === hold) return state;
  return { ...state, hold: hold ? [...current, good] : current.filter((g) => g !== good) };
}

/** Sets how hard the town is taxed: milder taxes bring newcomers faster. */
export function setTaxRate(state: GameState, rate: TaxRate): GameState {
  return state.taxRate === rate ? state : { ...state, taxRate: rate };
}

/** Whether the town has finished its new ring of walls around the land outside the old one. */
export function hasOuterWall(state: GameState, defs: Defs): boolean {
  return Object.values(state.buildings).some((b) => defs[b.def]?.outerWall && !b.construction);
}

export type RazeError =
  /** The new ring of walls has to stand first. */
  | 'noRing'
  /** Only plain stretches of wall; towers and gates stay. */
  | 'notWall'
  /** A home on the wall has to go first. */
  | 'occupied'
  /** The wall still faces open country or water on some side. */
  | 'notEnclosed'
  | 'noGold';

export type RazeResult = { ok: true; state: GameState } | { ok: false; reason: RazeError };

/** Why the tile of wall at (x, y) cannot be taken down right now, if anything stands in the way. */
export function razeError(
  state: GameState,
  defs: Defs,
  costs: { gold: number },
  x: number,
  y: number,
): RazeError | null {
  if (!hasOuterWall(state, defs)) return 'noRing';
  if (!inBounds(state.width, state.height, x, y)) return 'notWall';
  if (state.terrain[indexOf(state.width, x, y)] !== 'wall') return 'notWall';
  if (buildingAt(state, x, y)) return 'occupied';
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (!inBounds(state.width, state.height, x + dx, y + dy)) return 'notEnclosed';
    const t = state.terrain[indexOf(state.width, x + dx, y + dy)];
    if (t === 'outside' || t === 'water' || t === 'rock') return 'notEnclosed';
  }
  if (!state.sandbox && state.gold < costs.gold) return 'noGold';
  return null;
}

/**
 * Takes down a tile of the old wall once the new ring stands: it becomes building ground, and
 * some of its stones come back as materials.
 */
export function razeWall(
  state: GameState,
  defs: Defs,
  costs: { gold: number; materials: number },
  x: number,
  y: number,
): RazeResult {
  const error = razeError(state, defs, costs, x, y);
  if (error) return { ok: false, reason: error };
  const i = indexOf(state.width, x, y);
  const terrain = state.terrain.slice();
  terrain[i] = 'buildable';
  return {
    ok: true,
    state: {
      ...state,
      terrain,
      razed: [...(state.razed ?? []), i],
      // The first stone to fall is worth remembering.
      chronicle:
        (state.razed ?? []).length === 0
          ? write(state, [{ turn: state.turn, kind: 'wall' }]).chronicle
          : state.chronicle,
      gold: state.gold - (state.sandbox ? 0 : costs.gold),
      materials: state.materials + costs.materials,
    },
  };
}

/** What moving a building costs: a share of what it cost to build. */
export function moveCost(def: BuildingDef, share: number): number {
  return Math.ceil(def.cost * share);
}

export type MoveError = PlaceError | 'nothing' | 'notMovable';
export type MoveResult = { ok: true; state: GameState } | { ok: false; reason: MoveError };

/**
 * Picks building `id` up and sets it down with its top-left tile at (x, y), keeping everything
 * about it: its inhabitants, floors, building progress and damage. Paths and canals are not moved;
 * they are simply built anew.
 */
export function moveBuilding(
  state: GameState,
  defs: Defs,
  share: number,
  id: number,
  x: number,
  y: number,
  rot: Rotation = 0,
): MoveResult {
  const b = state.buildings[id];
  if (!b) return { ok: false, reason: 'nothing' };
  const def = defs[b.def];
  if (!def || def.category === 'path' || def.canal) return { ok: false, reason: 'notMovable' };
  const lifted = removeBuilding(state, b);
  const check = canPlace(lifted, defs, def, x, y, rot);
  if (!check.ok) return check;
  const cost = state.sandbox || state.puzzle ? 0 : moveCost(def, share);
  if (state.gold < cost) return { ok: false, reason: 'noGold' };
  const { w, h } = rotatedSize(def, rot);
  const occupancy = lifted.occupancy.slice();
  for (const t of check.tiles) occupancy[indexOf(state.width, t.x, t.y)] = id;
  const moved: Building = { ...b, x, y, w, h, rot };
  delete moved.inTower;
  if (def.onWall && state.terrain[indexOf(state.width, x, y)] === 'tower') moved.inTower = true;
  return {
    ok: true,
    state: {
      ...lifted,
      occupancy,
      gold: state.gold - cost,
      buildings: { ...lifted.buildings, [id]: moved },
    },
  };
}

/** The festival that belongs to the current season. */
export function festivalNow(state: GameState): FestivalKind {
  return FESTIVALS[state.turn % 4]!;
}

export type FestivalError = 'noPlaza' | 'already' | 'noGold' | 'noFood' | 'noMaterials';
export type FestivalResult = { ok: true; state: GameState } | { ok: false; reason: FestivalError };

/** Why the season's festival cannot be held right now, if anything stands in the way. */
export function festivalError(
  state: GameState,
  defs: Defs,
  costs: Record<FestivalKind, { gold: number; food: number; materials: number }>,
  plazaDef: string,
): FestivalError | null {
  if (state.festival) return 'already';
  if (!Object.values(state.buildings).some((b) => b.def === plazaDef && defs[b.def])) {
    return 'noPlaza';
  }
  if (state.sandbox) return null;
  const cost = costs[festivalNow(state)];
  if (state.gold < cost.gold) return 'noGold';
  if (state.food < cost.food) return 'noFood';
  if (state.materials < cost.materials) return 'noMaterials';
  return null;
}

/** Holds the season's festival on the plaza; its effects come as the turn ends. */
export function holdFestival(
  state: GameState,
  defs: Defs,
  costs: Record<FestivalKind, { gold: number; food: number; materials: number }>,
  plazaDef: string,
): FestivalResult {
  const error = festivalError(state, defs, costs, plazaDef);
  if (error) return { ok: false, reason: error };
  const cost = state.sandbox ? { gold: 0, food: 0, materials: 0 } : costs[festivalNow(state)];
  return {
    ok: true,
    state: {
      ...state,
      gold: state.gold - cost.gold,
      food: state.food - cost.food,
      materials: state.materials - cost.materials,
      festival: festivalNow(state),
      festivals: (state.festivals ?? 0) + 1,
    },
  };
}
