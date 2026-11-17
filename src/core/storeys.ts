import { buildingAt } from './actions';
import { analyze } from './sim/analyze';
import type { Building, GameState, Rules } from './types';

export type RaiseError =
  /** Only houses can be raised. */
  | 'notHouse'
  | 'maxStoreys'
  /** The house has to reach a higher level first. */
  | 'level'
  /** Taller houses need a fire watch within reach. */
  | 'needsFire'
  | 'damaged'
  | 'noGold'
  | 'noMaterials'
  | 'noBuildPoints';

export interface RaiseCost {
  gold: number;
  materials: number;
  buildPoints: number;
}

/** What the next floor costs: the same for every tile of the plot. */
export function raiseCost(rules: Rules, b: Building): RaiseCost {
  const { gold, materials, buildPoints } = rules.balance.storey;
  const tiles = b.w * b.h;
  return { gold: gold * tiles, materials: materials * tiles, buildPoints: buildPoints * tiles };
}

/** The housing level a house needs for its next floor. */
export function levelForStorey(rules: Rules, b: Building): number {
  return rules.balance.storey.minLevel + (b.house?.storeys ?? 0);
}

/** Why the house at (x, y) cannot get another floor right now, if anything stands in the way. */
export function raiseError(
  state: GameState,
  rules: Rules,
  x: number,
  y: number,
  covered: (b: Building) => boolean = (b) => analyze(state, rules).covered.fire.has(b.id),
): RaiseError | null {
  const b = buildingAt(state, x, y);
  if (!b?.house) return 'notHouse';
  if ((b.house.storeys ?? 0) >= rules.balance.storey.max) return 'maxStoreys';
  if (b.house.level < levelForStorey(rules, b)) return 'level';
  if (b.damaged) return 'damaged';
  if (!covered(b)) return 'needsFire';
  if (state.sandbox) return null;
  const cost = raiseCost(rules, b);
  if (state.buildPoints < cost.buildPoints) return 'noBuildPoints';
  if (state.gold < cost.gold) return 'noGold';
  if (state.materials < cost.materials) return 'noMaterials';
  return null;
}

export type RaiseResult = { ok: true; state: GameState } | { ok: false; reason: RaiseError };

/** Adds a floor to the house at (x, y). More room, more fire risk, more shade next door. */
export function raiseHouse(state: GameState, rules: Rules, x: number, y: number): RaiseResult {
  const error = raiseError(state, rules, x, y);
  if (error) return { ok: false, reason: error };
  const b = buildingAt(state, x, y)!;
  const house = b.house!;
  const cost = state.sandbox ? { gold: 0, materials: 0, buildPoints: 0 } : raiseCost(rules, b);
  return {
    ok: true,
    state: {
      ...state,
      gold: state.gold - cost.gold,
      materials: state.materials - cost.materials,
      buildPoints: state.buildPoints - cost.buildPoints,
      buildings: {
        ...state.buildings,
        [b.id]: { ...b, house: { ...house, storeys: (house.storeys ?? 0) + 1 } },
      },
    },
  };
}
