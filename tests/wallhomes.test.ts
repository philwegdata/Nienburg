import { describe, expect, it } from 'vitest';
import { buildingAt, canPlace } from '../src/core/actions';
import { analyze, houseCapacity } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import { raiseError } from '../src/core/storeys';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

// A tower in the top-left corner, a gate on the right.
const MAP = ['T########', '#.......#', '#.......G', '#.......#', '#########'];
const wallhouse = BUILDINGS.wallhouse!;

function town(): GameState {
  let s = richGame(MAP);
  s = fillWith(s, 'street', 1, 1, 7, 1);
  s = fillWith(s, 'street', 7, 2, 7, 2);
  return s;
}

describe('homes on the wall', () => {
  it('go on wall and tower tiles, not on the ground or in a gate', () => {
    const s = town();
    expect(canPlace(s, BUILDINGS, wallhouse, 3, 0).ok).toBe(true);
    expect(canPlace(s, BUILDINGS, wallhouse, 0, 0).ok).toBe(true);
    expect(canPlace(s, BUILDINGS, wallhouse, 3, 2).ok).toBe(false);
    expect(canPlace(s, BUILDINGS, wallhouse, 8, 2).ok).toBe(false);
    // Nothing else goes onto the wall.
    expect(canPlace(s, BUILDINGS, BUILDINGS.house!, 3, 0).ok).toBe(false);
    expect(canPlace(put(s, 'wallhouse', 3, 0), BUILDINGS, wallhouse, 3, 0).ok).toBe(false);
  });

  it('know whether they sit in a tower', () => {
    const s = put(put(town(), 'wallhouse', 0, 0), 'wallhouse', 3, 0);
    expect(buildingAt(s, 0, 0)!.inTower).toBe(true);
    expect(buildingAt(s, 3, 0)!.inTower).toBeUndefined();
  });

  it('take people in like houses, but fewer', () => {
    let s = put(town(), 'wallhouse', 3, 0);
    const home = buildingAt(s, 3, 0)!;
    expect(analyze(s, RULES).access.has(home.id)).toBe(true);
    for (let i = 0; i < 3; i++) s = endTurn(s, RULES);
    expect(buildingAt(s, 3, 0)!.house!.pop).toBeGreaterThan(0);
    const level = RULES.housing[1]!.capacity;
    expect(houseCapacity(RULES, home, 2)).toBe(Math.floor(level * wallhouse.capacityFactor!));
  });

  it('leave the ground inside free', () => {
    const s = town();
    const free = (t: GameState) =>
      t.occupancy.filter((id, i) => !id && t.terrain[i] === 'buildable');
    expect(free(put(s, 'wallhouse', 3, 0)).length).toBe(free(s).length);
  });

  it('get no extra floors and do not merge', () => {
    const s = put(put(town(), 'wallhouse', 3, 0), 'wallhouse', 4, 0);
    for (const x of [3, 4]) {
      const b = buildingAt(s, x, 0)!;
      s.buildings[b.id] = { ...b, house: { level: 4, pop: 50, lacking: 0 } };
    }
    expect(raiseError(s, RULES, 3, 0)).toBe('notHouse');
    expect(buildingAt(endTurn(s, RULES), 3, 0)).toMatchObject({ w: 1, h: 1 });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(strings(lang).building.wallhouse.length).toBeGreaterThan(0);
    }
  });
});
