import { describe, expect, it } from 'vitest';
import {
  buildingAt,
  canPlace,
  hasOuterWall,
  isCountryside,
  razeError,
  razeWall,
} from '../src/core/actions';
import { indexOf } from '../src/core/grid';
import { deserialize } from '../src/core/save';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { put, richGame } from './helpers';

// Town on the left, open country on the right of the east wall (x = 5).
const MAP = ['######     ', '#....#     ', '#....G     ', '#....#     ', '######     '];
const costs = RULES.balance.razing;

/** Makes tiles the town's own, as if bought. */
function own(state: GameState, tiles: [number, number][]): GameState {
  const terrain = state.terrain.slice();
  for (const [x, y] of tiles) terrain[indexOf(state.width, x, y)] = 'buildable';
  return { ...state, terrain };
}

/** Land bought all along the east wall, and the wall works finished on it. */
function ringed(): GameState {
  let s = own(richGame(MAP), [
    [6, 0],
    [6, 1],
    [6, 2],
    [6, 3],
    [6, 4],
    [7, 1],
    [7, 2],
  ]);
  s = put(s, 'wallworks', 6, 1);
  const works = buildingAt(s, 6, 1)!;
  const done = { ...works };
  delete done.construction;
  return { ...s, buildings: { ...s.buildings, [works.id]: done } };
}

describe('a new ring of walls', () => {
  it('rises only from finished wall works outside the walls', () => {
    const s = richGame(MAP);
    expect(canPlace(s, BUILDINGS, BUILDINGS.wallworks!, 2, 1).ok).toBe(false);
    const building = put(
      own(s, [
        [6, 1],
        [6, 2],
        [7, 1],
        [7, 2],
      ]),
      'wallworks',
      6,
      1,
    );
    expect(buildingAt(building, 6, 1)!.construction).toBeGreaterThan(0);
    expect(hasOuterWall(building, BUILDINGS)).toBe(false);
    expect(hasOuterWall(ringed(), BUILDINGS)).toBe(true);
  });

  it('lets the old wall come down where the town owns the land in front', () => {
    const s = ringed();
    expect(razeError(richGame(MAP), BUILDINGS, costs, 5, 1)).toBe('noRing');
    expect(razeError(s, BUILDINGS, costs, 5, 2)).toBe('notWall'); // the gate
    expect(razeError(s, BUILDINGS, costs, 2, 0)).toBe('notEnclosed'); // faces the map edge
    const r = razeWall(s, BUILDINGS, costs, 5, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.terrain[indexOf(s.width, 5, 3)]).toBe('buildable');
    expect(r.state.gold).toBe(s.gold - costs.gold);
    expect(r.state.materials).toBe(s.materials + costs.materials);
    expect(r.state.razed).toEqual([indexOf(s.width, 5, 3)]);
    // The new ground counts as inside: no fields there, but houses.
    expect(isCountryside(r.state, 5, 3)).toBe(false);
    expect(isCountryside(r.state, 3, 2)).toBe(false);
    expect(isCountryside(r.state, 6, 3)).toBe(true);
    expect(canPlace(r.state, BUILDINGS, BUILDINGS.house!, 5, 3).ok).toBe(true);
  });

  it('leaves homes on the wall alone', () => {
    const s = put(ringed(), 'wallhouse', 5, 3);
    expect(razeError(s, BUILDINGS, costs, 5, 3)).toBe('occupied');
  });

  it('needs the gold, except in a sandbox', () => {
    expect(razeError({ ...ringed(), gold: 0 }, BUILDINGS, costs, 5, 3)).toBe('noGold');
    expect(razeError({ ...ringed(), gold: 0, sandbox: true }, BUILDINGS, costs, 5, 3)).toBeNull();
  });

  it('starts old saves with the old wall whole', () => {
    const old: Record<string, unknown> = { ...richGame(MAP), version: 10 };
    delete old.razed;
    const back = deserialize(JSON.stringify({ saveVersion: 10, state: old }), ['test']);
    expect(back).toMatchObject({ version: 11, razed: [] });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(strings(lang).building.wallworks.length).toBeGreaterThan(0);
      expect(strings(lang).razeNo.noRing.length).toBeGreaterThan(0);
    }
  });
});
