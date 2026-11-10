import { population } from '../actions';
import { inBounds, indexOf, NEIGHBOURS_4 } from '../grid';
import type { Building, GameState, Need, Point, Rules, ServiceKind } from '../types';
import { adjacentPaths, buildingsAlong, pathAt, pathDistances } from './coverage';

export type IdleReason = 'noAccess' | 'needsPlaza' | 'unstaffed';

/** Everything that follows from the current layout, before a turn is played. */
export interface Analysis {
  /** Buildings with a path next to them. */
  access: Set<number>;
  /** Non-path, non-house buildings that are currently not operating, and why. */
  idle: Map<number, IdleReason>;
  /** Houses reached by each service. */
  covered: Record<ServiceKind, Set<number>>;
  population: number;
  workforce: number;
  workersNeeded: number;
  foodCap: number;
  materialsCap: number;
  /** Per turn, before seasonal effects. */
  foodDelivery: number;
  materialsDelivery: number;
  gates: number;
}

function touchesPlaza(state: GameState, rules: Rules, b: Building): boolean {
  return adjacentPaths(state, rules, b).some(
    (t) => pathAt(state, rules, t.x, t.y) === rules.balance.plazaPath,
  );
}

export function analyze(state: GameState, rules: Rules): Analysis {
  const { balance } = rules;
  const all = Object.values(state.buildings).sort((a, b) => a.id - b.id);
  const pop = population(state);
  const analysis: Analysis = {
    access: new Set(),
    idle: new Map(),
    covered: { water: new Set(), food: new Set(), faith: new Set(), fire: new Set() },
    population: pop,
    workforce: Math.floor(pop * balance.workerShare),
    workersNeeded: 0,
    foodCap: balance.baseStorage.food,
    materialsCap: balance.baseStorage.materials,
    foodDelivery: 0,
    materialsDelivery: 0,
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

  // Workers are handed out in building order, oldest first.
  let freeWorkers = analysis.workforce;
  for (const b of all) {
    const def = rules.buildings[b.def];
    if (!def || def.category === 'path') continue;
    const paths = adjacentPaths(state, rules, b);
    if (paths.length > 0) analysis.access.add(b.id);
    if (def.category === 'housing') continue;

    analysis.foodCap += def.storage?.food ?? 0;
    analysis.materialsCap += def.storage?.materials ?? 0;
    analysis.workersNeeded += def.workers;

    if (paths.length === 0) {
      analysis.idle.set(b.id, 'noAccess');
      continue;
    }
    if (def.needsPlaza && !touchesPlaza(state, rules, b)) {
      analysis.idle.set(b.id, 'needsPlaza');
      continue;
    }
    if (def.workers > freeWorkers) {
      analysis.idle.set(b.id, 'unstaffed');
      continue;
    }
    freeWorkers -= def.workers;

    if (def.service) {
      const reached = pathDistances(state, rules, paths, def.service.range);
      for (const id of buildingsAlong(state, rules, reached)) {
        if (state.buildings[id]?.house) analysis.covered[def.service.kind].add(id);
      }
    }
    if (def.delivery) {
      const connected = paths.some((t) => gateNetwork.has(indexOf(state.width, t.x, t.y)));
      if (connected) {
        analysis.foodDelivery += def.delivery.food ?? 0;
        analysis.materialsDelivery += def.delivery.materials ?? 0;
      }
    }
  }
  return analysis;
}

/** The needs of `level` that the house does not currently have met. */
export function missingNeeds(
  rules: Rules,
  analysis: Analysis,
  houseId: number,
  level: number,
  hungry: boolean,
): Need[] {
  const def = rules.housing[level - 1];
  if (!def) return [];
  return def.needs.filter((need) => {
    if (need === 'road') return !analysis.access.has(houseId);
    if (need === 'food' && hungry) return true;
    return !analysis.covered[need].has(houseId);
  });
}
