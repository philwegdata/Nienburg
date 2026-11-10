import { describe, expect, it } from 'vitest';
import { buildingAt, canPlace, countTiles, demolish, placeBuilding } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { commitBuild, commitDemolish, planBuild, planDemolish } from '../src/core/planning';
import type { CityDef, GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';

const town: CityDef = {
  id: 'test',
  name: { de: 'Test', en: 'Test' },
  region: { de: '', en: '' },
  blurb: { de: '', en: '' },
  difficulty: 1,
  buildableRange: [1, 100],
  // Buildable interior: x 1..4, y 1..3
  map: ['##G###', '#....#', '#....#', '#....#', '######'],
};

const alley = BUILDINGS.alley!;
const street = BUILDINGS.street!;
const house = BUILDINGS.house!;
const chapel = BUILDINGS.chapel!;

function fresh(): GameState {
  return newGame(town, 1);
}

function place(state: GameState, def = house, x = 1, y = 1, rot: 0 | 1 = 0): GameState {
  const result = placeBuilding(state, BUILDINGS, def, x, y, rot);
  if (!result.ok) throw new Error(`placement failed: ${result.reason}`);
  return result.state;
}

describe('placeBuilding', () => {
  it('places a building and marks its tiles', () => {
    const state = place(fresh(), house, 2, 2);
    expect(buildingAt(state, 2, 2)).toMatchObject({ def: 'house', x: 2, y: 2, w: 1, h: 1 });
    expect(countTiles(state)).toEqual({ buildable: 12, free: 11 });
  });

  it('does not mutate the previous state', () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    place(before);
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
    const state = place(fresh(), house, 1, 1);
    expect(canPlace(state, BUILDINGS, house, 1, 1)).toEqual({ ok: false, reason: 'occupied' });
    expect(canPlace(state, BUILDINGS, alley, 1, 1)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('gives every building a fresh id', () => {
    let state = place(fresh(), house, 1, 1);
    state = demolish(state, 1, 1);
    state = place(state, house, 1, 1);
    expect(buildingAt(state, 1, 1)?.id).toBe(2);
  });
});

describe('footprints and rotation', () => {
  it('occupies 1×2 unrotated and 2×1 rotated', () => {
    const upright = place(fresh(), chapel, 1, 1, 0);
    expect(buildingAt(upright, 1, 2)?.def).toBe('chapel');
    expect(buildingAt(upright, 2, 1)).toBeUndefined();

    const turned = place(fresh(), chapel, 1, 1, 1);
    expect(buildingAt(turned, 2, 1)).toMatchObject({ def: 'chapel', w: 2, h: 1, rot: 1 });
    expect(buildingAt(turned, 1, 2)).toBeUndefined();
  });

  it('needs every tile of the footprint to be free and buildable', () => {
    // Bottom half would be in the wall.
    expect(canPlace(fresh(), BUILDINGS, chapel, 1, 3, 0).ok).toBe(false);
    // The same anchor works when turned sideways.
    expect(canPlace(fresh(), BUILDINGS, chapel, 1, 3, 1).ok).toBe(true);
    const blocked = place(fresh(), house, 1, 2);
    expect(canPlace(blocked, BUILDINGS, chapel, 1, 1, 0)).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });
});

describe('paths', () => {
  it('can be laid over a different kind of path', () => {
    let state = place(fresh(), alley, 1, 1);
    state = place(state, street, 1, 1);
    expect(buildingAt(state, 1, 1)?.def).toBe('street');
    expect(Object.keys(state.buildings)).toHaveLength(1);
  });

  it('reports identical paths as nothing to do', () => {
    const state = place(fresh(), alley, 1, 1);
    expect(canPlace(state, BUILDINGS, alley, 1, 1)).toEqual({ ok: false, reason: 'same' });
  });
});

describe('demolish', () => {
  it('removes the whole building from any of its tiles', () => {
    let state = place(fresh(), chapel, 1, 1, 0);
    state = demolish(state, 1, 2);
    expect(state.buildings).toEqual({});
    expect(state.occupancy.every((id) => id === 0)).toBe(true);
  });

  it('is a no-op on empty tiles and outside the map', () => {
    const state = fresh();
    expect(demolish(state, 1, 1)).toBe(state);
    expect(demolish(state, -3, 40)).toBe(state);
  });
});

describe('planning', () => {
  it('builds a row of houses and skips blocked tiles', () => {
    const start = place(fresh(), BUILDINGS.well!, 2, 1);
    const plan = planBuild(start, BUILDINGS, house, { x: 1, y: 1 }, { x: 5, y: 1 }, 0);
    expect(plan.tiles.map((t) => t.ok)).toEqual([true, false, true, true, false]);
    const state = commitBuild(start, BUILDINGS, house, plan, 0);
    expect(countTiles(state).free).toBe(12 - 4);
    expect(buildingAt(state, 2, 1)?.def).toBe('well');
  });

  it('fills a rectangle with plaza tiles', () => {
    const plaza = BUILDINGS.plaza!;
    const plan = planBuild(fresh(), BUILDINGS, plaza, { x: 3, y: 3 }, { x: 2, y: 2 }, 0);
    expect(plan.anchors).toHaveLength(4);
  });

  it('skips tiles that already carry the same path', () => {
    const start = place(fresh(), alley, 2, 1);
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
  });

  it('demolishes every building touched by a rectangle, each one completely', () => {
    let state = place(fresh(), chapel, 1, 1, 0);
    state = place(state, house, 3, 1);
    state = place(state, house, 4, 3);
    const tiles = planDemolish(state, { x: 1, y: 2 }, { x: 3, y: 1 });
    expect(tiles).toHaveLength(3);
    state = commitDemolish(state, tiles);
    expect(Object.values(state.buildings).map((b) => [b.x, b.y])).toEqual([[4, 3]]);
  });
});
