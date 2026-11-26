import { describe, expect, it } from 'vitest';
import { newGame, validateCity } from '../src/core/city';
import {
  blankPlan,
  checkPlan,
  customCity,
  paintPlan,
  PLAN_MIN_BUILDABLE,
  resizePlan,
} from '../src/core/editor';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';

describe('the map editor', () => {
  it('starts from a walled square with a gate that can be played', () => {
    const map = blankPlan(20, 16);
    expect(map).toHaveLength(16);
    expect(map.every((row) => row.length === 20)).toBe(true);
    expect(checkPlan(map)).toEqual([]);
    const city = customCity({ id: 'custom-a', name: 'Testburg', map });
    expect(validateCity(city)).toEqual([]);
    expect(newGame(city, 1, RULES.balance).cityId).toBe('custom-a');
  });

  it('finds a missing gate, an open wall, cut-off ground and too little room', () => {
    const map = blankPlan(20, 16);
    const gate = map.findIndex((row) => row.includes('G'));
    const gx = map[gate]!.indexOf('G');
    expect(checkPlan(paintPlan(map, gx, gate, 'wall'))).toContain('noGate');
    expect(checkPlan(paintPlan(map, 2, 5, 'outside'))).toContain('open');
    // A wall across the town cuts off its left part from the gate on the right.
    let split = map;
    for (let y = 3; y < 13; y++) split = paintPlan(split, 8, y, 'wall');
    expect(checkPlan(split)).toContain('unreachable');
    expect(checkPlan(blankPlan(10, 10))).toContain('tooSmall');
    expect(PLAN_MIN_BUILDABLE).toBeGreaterThan(0);
  });

  it('allows a pond inside the walls', () => {
    let map = blankPlan(20, 16);
    for (let x = 7; x < 10; x++) map = paintPlan(map, x, 8, 'water');
    expect(checkPlan(map)).toEqual([]);
  });

  it('lets canals cross the town', () => {
    let map = blankPlan(20, 16);
    for (let y = 3; y < 13; y++) map = paintPlan(map, 8, y, 'canal');
    expect(checkPlan(map)).toEqual([]);
  });

  it('keeps what was drawn when the plan grows or shrinks', () => {
    const map = blankPlan(20, 16);
    const bigger = resizePlan(map, 24, 18);
    expect(bigger).toHaveLength(18);
    expect(bigger[5]!.slice(0, 20)).toBe(map[5]);
    expect(resizePlan(bigger, 20, 16)).toEqual(map);
  });

  it('sets goals that grow with the town', () => {
    const small = customCity({ id: 'a', name: 'A', map: blankPlan(14, 12) });
    const big = customCity({ id: 'b', name: 'B', map: blankPlan(40, 30) });
    const people = (c: typeof small) => (c.goals[0].kind === 'population' ? c.goals[0].value : 0);
    expect(people(big)).toBeGreaterThan(people(small));
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(Object.keys(strings(lang).editor.problem).sort()).toEqual([
        'noGate',
        'open',
        'tooSmall',
        'unreachable',
      ]);
    }
  });
});
