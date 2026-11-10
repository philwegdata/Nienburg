import { describe, expect, it } from 'vitest';
import {
  affordError,
  buildingAt,
  canPlace,
  countTiles,
  demolish,
  placeBuilding,
} from '../src/core/actions';
import { commitDemolish, planBuild, planDemolish } from '../src/core/planning';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { put, richGame } from './helpers';

// Buildable interior: x 1..4, y 1..3
const MAP = ['##G###', '#....#', '#....#', '#....#', '######'];

const alley = BUILDINGS.alley!;
const house = BUILDINGS.house!;
const chapel = BUILDINGS.chapel!;

const fresh = (): GameState => richGame(MAP);
const raze = (state: GameState, x: number, y: number) => demolish(state, BUILDINGS, 0.5, x, y);

describe('placeBuilding', () => {
  it('places a building and marks its tiles', () => {
    const state = put(fresh(), 'house', 2, 2);
    expect(buildingAt(state, 2, 2)).toMatchObject({ def: 'house', x: 2, y: 2, w: 1, h: 1 });
    expect(countTiles(state)).toEqual({ buildable: 12, free: 11 });
  });

  it('does not mutate the previous state', () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    put(before, 'house', 1, 1);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('refuses walls, gates, the outside and anything beyond the map', () => {
    const state = fresh();
    for (const [x, y] of [
      [0, 0],
      [2, 0],
      [5, 2],
      [-1, 1],
      [6, 1],
      [1, 9],
    ] as const) {
      expect(canPlace(state, BUILDINGS, house, x, y)).toEqual({
        ok: false,
        reason: 'notBuildable',
      });
    }
  });

  it('refuses occupied tiles', () => {
    const state = put(fresh(), 'house', 1, 1);
    expect(canPlace(state, BUILDINGS, house, 1, 1)).toEqual({ ok: false, reason: 'occupied' });
    expect(canPlace(state, BUILDINGS, alley, 1, 1)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('gives every building a fresh id', () => {
    let state = put(fresh(), 'house', 1, 1);
    state = raze(state, 1, 1);
    state = put(state, 'house', 1, 1);
    expect(buildingAt(state, 1, 1)?.id).toBe(2);
  });

  it('starts house plots as empty huts and leaves other buildings without house data', () => {
    let state = put(fresh(), 'house', 1, 1);
    state = put(state, 'well', 2, 1);
    expect(buildingAt(state, 1, 1)?.house).toEqual({ level: 1, pop: 0, lacking: 0 });
    expect(buildingAt(state, 2, 1)?.house).toBeUndefined();
  });
});

describe('paying for buildings', () => {
  it('charges gold, materials and build points', () => {
    const before = fresh();
    const after = put(before, 'chapel', 1, 1);
    expect(before.gold - after.gold).toBe(chapel.cost);
    expect(before.materials - after.materials).toBe(chapel.materials);
    expect(before.buildPoints - after.buildPoints).toBe(chapel.buildPoints);
  });

  it('refuses what the town cannot afford, naming what is short', () => {
    const state = fresh();
    expect(affordError(state, chapel)).toBeNull();
    expect(affordError({ ...state, gold: chapel.cost - 1 }, chapel)).toBe('noGold');
    expect(affordError({ ...state, materials: 0 }, chapel)).toBe('noMaterials');
    expect(affordError({ ...state, buildPoints: 1 }, chapel)).toBe('noBuildPoints');
    const poor = { ...state, gold: 0 };
    expect(placeBuilding(poor, BUILDINGS, chapel, 1, 1)).toEqual({ ok: false, reason: 'noGold' });
  });

  it('reports a bad spot rather than the price when both apply', () => {
    const poor = { ...fresh(), gold: 0 };
    expect(placeBuilding(poor, BUILDINGS, house, 0, 0)).toEqual({
      ok: false,
      reason: 'notBuildable',
    });
  });

  it('returns half the gold on demolition, rounded down', () => {
    const built = put(fresh(), 'alley', 1, 1); // costs 1 gold
    expect(raze(built, 1, 1).gold).toBe(built.gold);
    const withChapel = put(fresh(), 'chapel', 1, 1);
    expect(raze(withChapel, 1, 2).gold).toBe(withChapel.gold + chapel.cost / 2);
  });
});

describe('footprints and rotation', () => {
  it('occupies 1×2 unrotated and 2×1 rotated', () => {
    const upright = put(fresh(), 'chapel', 1, 1, 0);
    expect(buildingAt(upright, 1, 2)?.def).toBe('chapel');
    expect(buildingAt(upright, 2, 1)).toBeUndefined();

    const turned = put(fresh(), 'chapel', 1, 1, 1);
    expect(buildingAt(turned, 2, 1)).toMatchObject({ def: 'chapel', w: 2, h: 1, rot: 1 });
    expect(buildingAt(turned, 1, 2)).toBeUndefined();
  });

  it('needs every tile of the footprint to be free and buildable', () => {
    // Bottom half would be in the wall.
    expect(canPlace(fresh(), BUILDINGS, chapel, 1, 3, 0).ok).toBe(false);
    // The same anchor works when turned sideways.
    expect(canPlace(fresh(), BUILDINGS, chapel, 1, 3, 1).ok).toBe(true);
    const blocked = put(fresh(), 'house', 1, 2);
    expect(canPlace(blocked, BUILDINGS, chapel, 1, 1, 0)).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });
});

describe('paths', () => {
  it('can be laid over a different kind of path', () => {
    let state = put(fresh(), 'alley', 1, 1);
    state = put(state, 'street', 1, 1);
    expect(buildingAt(state, 1, 1)?.def).toBe('street');
    expect(Object.keys(state.buildings)).toHaveLength(1);
  });

  it('reports identical paths as nothing to do', () => {
    const state = put(fresh(), 'alley', 1, 1);
    expect(canPlace(state, BUILDINGS, alley, 1, 1)).toEqual({ ok: false, reason: 'same' });
  });
});

describe('demolish', () => {
  it('removes the whole building from any of its tiles', () => {
    let state = put(fresh(), 'chapel', 1, 1, 0);
    state = raze(state, 1, 2);
    expect(state.buildings).toEqual({});
    expect(state.occupancy.every((id) => id === 0)).toBe(true);
  });

  it('is a no-op on empty tiles and outside the map', () => {
    const state = fresh();
    expect(raze(state, 1, 1)).toBe(state);
    expect(raze(state, -3, 40)).toBe(state);
  });
});

describe('planning', () => {
  it('builds a row of houses and skips blocked tiles', () => {
    const start = put(fresh(), 'well', 2, 1);
    const plan = planBuild(start, BUILDINGS, house, { x: 1, y: 1 }, { x: 5, y: 1 }, 0);
    expect(plan.tiles.map((t) => t.ok)).toEqual([true, false, true, true, false]);
    expect(plan.shortOf).toBeNull();
    expect(countTiles(plan.result).free).toBe(12 - 4);
    expect(buildingAt(plan.result, 2, 1)?.def).toBe('well');
    expect(start.gold - plan.result.gold).toBe(3 * house.cost);
  });

  it('fills a rectangle with plaza tiles', () => {
    const plaza = BUILDINGS.plaza!;
    const plan = planBuild(fresh(), BUILDINGS, plaza, { x: 3, y: 3 }, { x: 2, y: 2 }, 0);
    expect(plan.anchors).toHaveLength(4);
  });

  it('skips tiles that already carry the same path', () => {
    const start = put(fresh(), 'alley', 2, 1);
    const plan = planBuild(start, BUILDINGS, alley, { x: 1, y: 1 }, { x: 3, y: 1 }, 0);
    expect(plan.tiles).toEqual([
      { x: 1, y: 1, ok: true },
      { x: 3, y: 1, ok: true },
    ]);
  });

  it('places single buildings at the end of a drag and previews the whole footprint', () => {
    const plan = planBuild(fresh(), BUILDINGS, chapel, { x: 1, y: 1 }, { x: 3, y: 3 }, 0);
    expect(plan.anchors).toEqual([]);
    expect(plan.tiles).toEqual([
      { x: 3, y: 3, ok: false },
      { x: 3, y: 4, ok: false },
    ]);
    // A bad spot is not an affordability problem.
    expect(plan.shortOf).toBeNull();
  });

  it('stops a drag where the budget ends and says what ran out', () => {
    const start = { ...fresh(), buildPoints: 2 * house.buildPoints + 1 };
    const plan = planBuild(start, BUILDINGS, house, { x: 1, y: 2 }, { x: 4, y: 2 }, 0);
    expect(plan.tiles.map((t) => t.ok)).toEqual([true, true, false, false]);
    expect(plan.shortOf).toBe('noBuildPoints');
    expect(plan.result.buildPoints).toBe(1);
  });

  it('demolishes every building touched by a rectangle, each one completely', () => {
    let state = put(fresh(), 'chapel', 1, 1, 0);
    state = put(state, 'house', 3, 1);
    state = put(state, 'house', 4, 3);
    const tiles = planDemolish(state, { x: 1, y: 2 }, { x: 3, y: 1 });
    expect(tiles).toHaveLength(3);
    state = commitDemolish(state, BUILDINGS, 0.5, tiles);
    expect(Object.values(state.buildings).map((b) => [b.x, b.y])).toEqual([[4, 3]]);
  });
});
