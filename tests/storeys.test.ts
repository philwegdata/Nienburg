import { describe, expect, it } from 'vitest';
import { buildingAt } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { indexOf } from '../src/core/grid';
import { analyze, houseCapacity } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import { levelForStorey, raiseCost, raiseError, raiseHouse } from '../src/core/storeys';
import type { GameState } from '../src/core/types';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { cityFrom, fillWith, put, richGame } from './helpers';

const MAP = ['#########', '#.......#', '#.......G', '#.......#', '#.......#', '#########'];
const storey = RULES.balance.storey;

/** A row of houses along a street, with a fire watch, all at the given level. */
function town(level: number, fire = true): GameState {
  let s = richGame(MAP);
  s = fillWith(s, 'street', 1, 2, 7, 2);
  s = fillWith(s, 'house', 1, 1, 5, 1);
  if (fire) s = put(s, 'firewatch', 7, 1);
  const buildings = { ...s.buildings };
  for (const b of Object.values(buildings)) {
    if (b.house) buildings[b.id] = { ...b, house: { level, pop: 3, lacking: 0 } };
  }
  return { ...s, buildings };
}

const raise = (s: GameState, x = 3, y = 1): GameState => {
  const r = raiseHouse(s, RULES, x, y);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('building upwards', () => {
  it('adds a floor for gold, materials and build points', () => {
    const s = town(2);
    const next = raise(s);
    expect(buildingAt(next, 3, 1)!.house!.storeys).toBe(1);
    expect(s.gold - next.gold).toBe(storey.gold);
    expect(s.materials - next.materials).toBe(storey.materials);
    expect(s.buildPoints - next.buildPoints).toBe(storey.buildPoints);
  });

  it('needs a higher level for each further floor, up to the maximum', () => {
    expect(raiseError(town(1), RULES, 3, 1)).toBe('level');
    const once = raise(town(2));
    expect(levelForStorey(RULES, buildingAt(once, 3, 1)!)).toBe(storey.minLevel + 1);
    expect(raiseError(once, RULES, 3, 1)).toBe('level');
    const twice = raise(raise(town(3)));
    expect(buildingAt(twice, 3, 1)!.house!.storeys).toBe(storey.max);
    expect(raiseError(twice, RULES, 3, 1)).toBe('maxStoreys');
  });

  it('only raises houses, and only within reach of a fire watch', () => {
    expect(raiseError(town(3), RULES, 3, 2)).toBe('notHouse');
    expect(raiseError(town(3, false), RULES, 3, 1)).toBe('needsFire');
    const damaged = town(3);
    const b = buildingAt(damaged, 3, 1)!;
    damaged.buildings[b.id] = { ...b, damaged: true };
    expect(raiseError(damaged, RULES, 3, 1)).toBe('damaged');
  });

  it('says what the town is short of', () => {
    expect(raiseError({ ...town(3), gold: 0 }, RULES, 3, 1)).toBe('noGold');
    expect(raiseError({ ...town(3), materials: 0 }, RULES, 3, 1)).toBe('noMaterials');
    expect(raiseError({ ...town(3), buildPoints: 0 }, RULES, 3, 1)).toBe('noBuildPoints');
  });

  it('is free in a sandbox', () => {
    let s = newGame(cityFrom(MAP), 1, RULES.balance, true);
    s = put(s, 'street', 3, 2);
    s = put(s, 'house', 3, 1);
    s = put(s, 'firewatch', 4, 2);
    const b = buildingAt(s, 3, 1)!;
    // Enough people to staff the fire watch.
    s.buildings[b.id] = { ...b, house: { level: 3, pop: 10, lacking: 0 } };
    const next = raise(s);
    expect(next.gold).toBe(s.gold);
    expect(next.materials).toBe(s.materials);
  });

  it('costs more for a merged house', () => {
    const s = town(4);
    const b = buildingAt(s, 3, 1)!;
    expect(raiseCost(RULES, { ...b, w: 2 }).gold).toBe(2 * storey.gold);
  });

  it('makes room for more people', () => {
    const s = raise(town(2));
    const b = buildingAt(s, 3, 1)!;
    const plain = RULES.housing[1]!.capacity;
    expect(houseCapacity(RULES, b, 2)).toBe(Math.floor(plain * (1 + storey.capacity)));
    // The floor stays, whatever happens to the house.
    const later = endTurn(endTurn(endTurn(s, RULES), RULES), RULES);
    expect(buildingAt(later, 3, 1)!.house!.storeys).toBe(1);
  });

  it('casts shade on the tiles around it, not on itself', () => {
    const before = analyze(town(2), RULES).appeal;
    const after = analyze(raise(town(2)), RULES).appeal;
    const at = (x: number, y: number) => indexOf(MAP[0]!.length, x, y);
    expect(after[at(3, 1)]).toBe(before[at(3, 1)]);
    expect(after[at(2, 1)]).toBe(before[at(2, 1)]! + storey.shade);
    expect(after[at(3, 2)]).toBe(before[at(3, 2)]! + storey.shade);
    expect(after[at(5, 3)]).toBe(before[at(5, 3)]);
  });

  it('keeps raised houses from merging', () => {
    let s = town(4);
    s = raise(s, 3, 1);
    // Fill every house and keep them content, then let a turn pass.
    for (const b of Object.values(s.buildings)) {
      if (b.house) s.buildings[b.id] = { ...b, house: { ...b.house, pop: 99 } };
    }
    const next = endTurn(s, RULES);
    expect(buildingAt(next, 3, 1)).toMatchObject({ w: 1, h: 1 });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.toolRaise.length).toBeGreaterThan(0);
      expect(t.raiseNo.level).toContain('{level}');
    }
  });
});
