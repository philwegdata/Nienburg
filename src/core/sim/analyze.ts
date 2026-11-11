import { buildingAt, population } from '../actions';
import { inBounds, indexOf, NEIGHBOURS_4 } from '../grid';
import {
  SERVICES,
  type Building,
  type BuildingDef,
  type GameState,
  type Good,
  type Need,
  type Point,
  type Rules,
  type ServiceKind,
} from '../types';
import { adjacentPaths, borderTiles, buildingsAlong, pathAt, pathDistances } from './coverage';

export type IdleReason =
  | 'noAccess'
  | 'needsPlaza'
  | 'needsWater'
  /** Merchants without a path to a gate. */
  | 'noGate'
  | 'unstaffed'
  | 'construction'
  | 'damaged'
  /** A well that an event has dried up for this turn. */
  | 'dry';

/** Everything that follows from the current layout, before a turn is played. */
export interface Analysis {
  /** Buildings with a path next to them. */
  access: Set<number>;
  /** Non-path, non-house buildings that are currently not operating, and why. */
  idle: Map<number, IdleReason>;
  /** Buildings (houses and others) reached by each service. */
  covered: Record<ServiceKind, Set<number>>;
  /** Path tiles (by index) each service travels along. */
  reach: Record<ServiceKind, Set<number>>;
  /** Appeal of every tile, row-major. */
  appeal: number[];
  /** Appeal as felt by each house, including the malus for being boxed in. */
  houseAppeal: Map<number, number>;
  /** Canal tiles (by index) that carry water. */
  flowing: Set<number>;
  /** Dug canals that reach neither the wall nor another flowing canal. */
  dryCanals: Set<number>;
  /** Houses with fewer than two open sides. */
  boxedIn: Set<number>;
  population: number;
  workforce: number;
  workersNeeded: number;
  foodCap: number;
  materialsCap: number;
  /** Food arriving through the gates per turn, before seasonal effects. */
  foodDelivery: number;
  /** Food made in town per turn. */
  foodYield: number;
  materialsDelivery: number;
  production: Record<Good, number>;
  goldYield: number;
  /** Craft goods the town's merchants can sell per turn, and the best price they get. */
  tradeCapacity: number;
  tradePrice: number;
  /** Units of each kind of craft goods the houses want per turn. */
  goodsDemand: number;
  /** Build points the town will have next turn. */
  buildPoints: number;
  /** Factor applied to taxes. */
  taxFactor: number;
  gates: number;
}

function kindSets<T>(make: () => T): Record<ServiceKind, T> {
  return Object.fromEntries(SERVICES.map((k) => [k, make()])) as Record<ServiceKind, T>;
}

function touchesPlaza(state: GameState, rules: Rules, b: Building): boolean {
  return adjacentPaths(state, rules, b).some(
    (t) => pathAt(state, rules, t.x, t.y) === rules.balance.plazaPath,
  );
}

/** Appeal per tile: each building radiates its value; the same kind stacks only so often. */
function appealGrid(state: GameState, rules: Rules): number[] {
  const size = state.width * state.height;
  const total = new Array<number>(size).fill(0);
  const counts = new Map<string, Uint8Array>();
  const radiate = (
    kind: string,
    x0: number,
    y0: number,
    w: number,
    h: number,
    effect: { value: number; radius: number },
  ) => {
    let seen = counts.get(kind);
    if (!seen) counts.set(kind, (seen = new Uint8Array(size)));
    for (let y = y0 - effect.radius; y < y0 + h + effect.radius; y++) {
      for (let x = x0 - effect.radius; x < x0 + w + effect.radius; x++) {
        if (!inBounds(state.width, state.height, x, y)) continue;
        const i = indexOf(state.width, x, y);
        if (seen[i]! >= rules.balance.appeal.stack) continue;
        seen[i]!++;
        total[i]! += effect.value;
      }
    }
  };
  // Fixed historic buildings, where the town has that.
  const landmark = rules.balance.landmarkAppeal;
  if (landmark) {
    state.terrain.forEach((t, i) => {
      if (t !== 'landmark') return;
      radiate('landmark', i % state.width, Math.floor(i / state.width), 1, 1, landmark);
    });
  }
  const all = Object.values(state.buildings).sort((a, b) => a.id - b.id);
  for (const b of all) {
    const effect = rules.buildings[b.def]?.appeal;
    if (!effect || b.construction) continue;
    radiate(b.def, b.x, b.y, b.w, b.h, effect);
  }
  return total;
}

/** Sides of a house that face open ground, a path or greenery. */
function openSides(state: GameState, rules: Rules, b: Building): number {
  let open = 0;
  for (const t of borderTiles(b)) {
    if (!inBounds(state.width, state.height, t.x, t.y)) continue;
    const terrain = state.terrain[indexOf(state.width, t.x, t.y)];
    // A canal next door is as good as open ground.
    if (terrain === 'canal') open++;
    if (terrain !== 'buildable') continue;
    const other = buildingAt(state, t.x, t.y);
    const def = other && rules.buildings[other.def];
    // Paths, greenery and canals leave a house room to breathe.
    if (!other || def?.category === 'path' || def?.category === 'green' || def?.canal) open++;
  }
  return open;
}

export function houseCapacity(rules: Rules, b: Building, level: number): number {
  const base = rules.housing[level - 1]?.capacity ?? 0;
  const tiles = b.w * b.h;
  return tiles === 1 ? base : Math.floor(base * (tiles + rules.balance.mergeBonus));
}

export function analyze(state: GameState, rules: Rules): Analysis {
  const { balance } = rules;
  const all = Object.values(state.buildings).sort((a, b) => a.id - b.id);
  const pop = population(state);
  const analysis: Analysis = {
    access: new Set(),
    idle: new Map(),
    covered: kindSets(() => new Set<number>()),
    reach: kindSets(() => new Set<number>()),
    appeal: appealGrid(state, rules),
    houseAppeal: new Map(),
    flowing: new Set(),
    dryCanals: new Set(),
    boxedIn: new Set(),
    population: pop,
    workforce: Math.floor(pop * balance.workerShare),
    workersNeeded: 0,
    foodCap: balance.baseStorage.food,
    materialsCap: balance.baseStorage.materials,
    foodDelivery: 0,
    foodYield: 0,
    materialsDelivery: 0,
    production: { cloth: 0, tools: 0, beer: 0 },
    goldYield: 0,
    tradeCapacity: 0,
    tradePrice: 0,
    goodsDemand: 0,
    buildPoints: balance.buildPointsPerTurn,
    taxFactor: 1,
    gates: 0,
  };

  // Path tiles that connect to a gate, however far away.
  const gateSources: Point[] = [];
  state.terrain.forEach((t, i) => {
    if (t !== 'gate') return;
    analysis.gates++;
    const gx = i % state.width;
    const gy = Math.floor(i / state.width);
    for (const n of NEIGHBOURS_4) {
      const x = gx + n.x;
      const y = gy + n.y;
      if (inBounds(state.width, state.height, x, y) && pathAt(state, rules, x, y)) {
        gateSources.push({ x, y });
      }
    }
  });
  const gateNetwork = pathDistances(state, rules, gateSources, Infinity);
  analysis.foodDelivery = analysis.gates * balance.gateDelivery.food;
  analysis.materialsDelivery = analysis.gates * balance.gateDelivery.materials;

  // Pass 1: who has a path, and who gets workers (handed out oldest building first).
  const running: { b: Building; def: BuildingDef; paths: Point[] }[] = [];
  let freeWorkers = analysis.workforce;
  for (const b of all) {
    const def = rules.buildings[b.def];
    if (!def || def.category === 'path') continue;
    const paths = adjacentPaths(state, rules, b);
    if (paths.length > 0) analysis.access.add(b.id);
    if (def.category === 'housing') {
      const boxed = openSides(state, rules, b) < 2;
      if (boxed) analysis.boxedIn.add(b.id);
      const best = Math.max(
        ...tilesOf(b).map((t) => analysis.appeal[indexOf(state.width, t.x, t.y)]!),
      );
      analysis.houseAppeal.set(b.id, best + (boxed ? balance.appeal.boxedIn : 0));
      continue;
    }
    if (b.construction) {
      analysis.idle.set(b.id, 'construction');
      continue;
    }
    analysis.foodCap += def.storage?.food ?? 0;
    analysis.materialsCap += def.storage?.materials ?? 0;
    if (b.damaged) {
      analysis.idle.set(b.id, 'damaged');
      continue;
    }
    if (state.event?.kind === 'dryWell' && state.event.building === b.id) {
      analysis.idle.set(b.id, 'dry');
      continue;
    }
    // Greenery and the like simply stand there.
    const passive =
      def.workers === 0 &&
      !def.services &&
      !def.delivery &&
      !def.produces &&
      !def.yields &&
      !def.trade;
    if (passive) continue;
    analysis.workersNeeded += def.workers;
    if (paths.length === 0) {
      analysis.idle.set(b.id, 'noAccess');
    } else if (def.needsPlaza && !touchesPlaza(state, rules, b)) {
      analysis.idle.set(b.id, 'needsPlaza');
    } else if (def.workers > freeWorkers) {
      analysis.idle.set(b.id, 'unstaffed');
    } else {
      freeWorkers -= def.workers;
      running.push({ b, def, paths });
    }
  }

  const spread = (entry: (typeof running)[number], onlyWater: boolean) => {
    for (const service of entry.def.services ?? []) {
      if ((service.kind === 'water') !== onlyWater) continue;
      const reached = pathDistances(state, rules, entry.paths, service.range);
      for (const i of reached.keys()) analysis.reach[service.kind].add(i);
      for (const id of buildingsAlong(state, rules, reached)) {
        analysis.covered[service.kind].add(id);
      }
    }
  };

  // Pass 2: water first, because bath houses depend on it.
  for (const entry of running) spread(entry, true);
  canalWater(state, rules, analysis, all);
  const operating = running.filter(({ b, def }) => {
    if (def.needsWater && !analysis.covered.water.has(b.id)) {
      analysis.idle.set(b.id, 'needsWater');
      return false;
    }
    return true;
  });
  const guildhalls = operating.filter(({ def }) => def.guildBoost);

  // Pass 3: everything else operating buildings do.
  for (const entry of operating) {
    const { b, def, paths } = entry;
    const connected = paths.some((t) => gateNetwork.has(indexOf(state.width, t.x, t.y)));
    if (def.trade) {
      if (!connected) {
        analysis.idle.set(b.id, 'noGate');
        continue;
      }
      analysis.tradeCapacity += def.trade.capacity;
      analysis.tradePrice = Math.max(analysis.tradePrice, def.trade.price);
    }
    spread(entry, false);
    if (def.delivery) {
      if (connected) {
        analysis.foodDelivery += def.delivery.food ?? 0;
        analysis.materialsDelivery += def.delivery.materials ?? 0;
      }
    }
    let boost = 0;
    if (def.category === 'craft' && !def.guildBoost) {
      for (const g of guildhalls) {
        if (touching(b, g.b)) boost = Math.max(boost, g.def.guildBoost ?? 0);
      }
    }
    if (def.produces) {
      analysis.production[def.produces.good] += Math.floor(def.produces.amount * (1 + boost));
    }
    analysis.goldYield += Math.floor((def.yields?.gold ?? 0) * (1 + boost));
    analysis.foodYield += def.yields?.food ?? 0;
    analysis.buildPoints += def.buildPointsBonus ?? 0;
    analysis.taxFactor += def.taxBonus ?? 0;
  }

  // Houses of the upper levels within reach of a market hall want craft goods.
  let goodsPop = 0;
  for (const b of all) {
    if (b.house && b.house.level >= balance.mergeLevel && analysis.covered.goods.has(b.id)) {
      goodsPop += b.house.pop;
    }
  }
  analysis.goodsDemand = Math.ceil(goodsPop * balance.goodsPerHead);
  return analysis;
}

function tilesOf(b: Building): Point[] {
  const tiles: Point[] = [];
  for (let dy = 0; dy < b.h; dy++)
    for (let dx = 0; dx < b.w; dx++) tiles.push({ x: b.x + dx, y: b.y + dy });
  return tiles;
}

/** Whether two buildings share an edge. */
function touching(a: Building, b: Building): boolean {
  return borderTiles(a).some((t) => t.x >= b.x && t.x < b.x + b.w && t.y >= b.y && t.y < b.y + b.h);
}

/**
 * Canals carry water from the town wall (or from a canal of the map) along their whole length,
 * and everything within a few tiles of flowing water is supplied.
 */
function canalWater(state: GameState, rules: Rules, analysis: Analysis, all: Building[]): void {
  const { width, height } = state;
  const dug = new Map<number, Building>();
  for (const b of all) {
    if (rules.buildings[b.def]?.canal || b.overCanal) dug.set(indexOf(width, b.x, b.y), b);
  }
  const isCanal = (i: number) => state.terrain[i] === 'canal' || dug.has(i);
  const feeds = (t: string | undefined) =>
    t === 'wall' || t === 'tower' || t === 'gate' || t === 'water' || t === 'canal';

  const queue: number[] = [];
  const start = (i: number) => {
    if (analysis.flowing.has(i)) return;
    analysis.flowing.add(i);
    queue.push(i);
  };
  state.terrain.forEach((t, i) => {
    if (t === 'canal') start(i);
  });
  for (const i of dug.keys()) {
    const x = i % width;
    const y = Math.floor(i / width);
    const fed = NEIGHBOURS_4.some(
      (n) =>
        inBounds(width, height, x + n.x, y + n.y) &&
        feeds(state.terrain[indexOf(width, x + n.x, y + n.y)]),
    );
    if (fed) start(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const n of NEIGHBOURS_4) {
      if (!inBounds(width, height, x + n.x, y + n.y)) continue;
      const j = indexOf(width, x + n.x, y + n.y);
      if (isCanal(j)) start(j);
    }
  }
  for (const [i, b] of dug) if (!analysis.flowing.has(i)) analysis.dryCanals.add(b.id);
  if (analysis.flowing.size === 0) return;

  const reach = rules.balance.canalReach;
  const wet = new Uint8Array(width * height);
  for (const i of analysis.flowing) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (inBounds(width, height, x + dx, y + dy)) wet[indexOf(width, x + dx, y + dy)] = 1;
      }
    }
    analysis.reach.water.add(i);
  }
  for (const b of all) {
    if (rules.buildings[b.def]?.category === 'path' || dug.has(indexOf(width, b.x, b.y))) continue;
    if (tilesOf(b).some((t) => wet[indexOf(width, t.x, t.y)])) analysis.covered.water.add(b.id);
  }
}

export interface NeedContext {
  /** The food stores ran dry this turn. */
  hungry: boolean;
  /** Kinds of craft goods available this turn. */
  goodsTypes: number;
  /** Jugglers are in town: everyone is entertained. */
  festive?: boolean;
}

/** The needs of `level` that the house does not currently have met. */
export function missingNeeds(
  rules: Rules,
  analysis: Analysis,
  houseId: number,
  level: number,
  ctx: NeedContext,
): Need[] {
  const def = rules.housing[level - 1];
  if (!def) return [];
  const appeal = analysis.houseAppeal.get(houseId) ?? 0;
  const hasGoods = analysis.covered.goods.has(houseId);
  return def.needs.filter((need) => {
    switch (need) {
      case 'road':
        return !analysis.access.has(houseId);
      case 'food':
        return ctx.hungry || !analysis.covered.food.has(houseId);
      case 'goods1':
        return !hasGoods || ctx.goodsTypes < 1;
      case 'goods2':
        return !hasGoods || ctx.goodsTypes < 2;
      case 'appeal1':
        return appeal < rules.balance.appeal.pleasant;
      case 'appeal2':
        return appeal < rules.balance.appeal.fine;
      case 'fun':
        return !ctx.festive && !analysis.covered.fun.has(houseId);
      default:
        return !analysis.covered[need].has(houseId);
    }
  });
}
