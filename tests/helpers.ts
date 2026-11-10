import { placeBuilding } from '../src/core/actions';
import { newGame } from '../src/core/city';
import type { CityDef, GameState } from '../src/core/types';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { RULES } from '../src/data/rules';

export function cityFrom(map: string[], range: [number, number] = [1, 1000]): CityDef {
  return {
    id: 'test',
    name: { de: 'Test', en: 'Test' },
    region: { de: '', en: '' },
    blurb: { de: '', en: '' },
    difficulty: 1,
    buildableRange: range,
    map,
  };
}

/** A new game with plenty of everything, so tests are not about affordability by accident. */
export function richGame(map: string[]): GameState {
  return {
    ...newGame(cityFrom(map), 1, RULES.balance),
    gold: 100000,
    materials: 100000,
    buildPoints: 100000,
  };
}

export function put(
  state: GameState,
  id: BuildingId,
  x: number,
  y: number,
  rot: 0 | 1 = 0,
): GameState {
  const result = placeBuilding(state, BUILDINGS, BUILDINGS[id]!, x, y, rot);
  if (!result.ok) throw new Error(`cannot place ${id} at ${x},${y}: ${result.reason}`);
  return result.state;
}

/** Places 1×1 buildings on every tile from (x0, y0) to (x1, y1). */
export function fillWith(
  state: GameState,
  id: BuildingId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): GameState {
  let next = state;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) next = put(next, id, x, y);
  return next;
}
