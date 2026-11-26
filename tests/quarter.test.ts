import { describe, expect, it } from 'vitest';
import { buildingAt } from '../src/core/actions';
import { analyze } from '../src/core/sim/analyze';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = [
  '##############',
  '#............#',
  '#............G',
  '#............#',
  '#............#',
  '##############',
];

/** Weavers (2×2) in a row below the street, `gap` tiles apart; plenty of people to work. */
function row(count: number, gap = 0): GameState {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 12, 2);
  s = fillWith(s, 'house', 1, 1, 12, 1);
  for (const b of Object.values(s.buildings)) {
    if (b.house) s.buildings[b.id] = { ...b, house: { level: 2, pop: 20, lacking: 0 } };
  }
  for (let i = 0; i < count; i++) s = put(s, 'weaver', 1 + i * (2 + gap), 3);
  return s;
}
const cloth = BUILDINGS.weaver!.produces!.amount;
const bonus = RULES.balance.guildQuarter.bonus;

describe('guild quarters', () => {
  it('form from three touching workshops of one kind', () => {
    const a = analyze(row(3), RULES);
    expect(a.quarter.size).toBe(3);
    expect(a.production.cloth).toBe(3 * Math.floor(cloth * (1 + bonus)));
  });

  it('need enough of them, and they must touch', () => {
    expect(analyze(row(2), RULES).quarter.size).toBe(0);
    expect(analyze(row(3, 1), RULES).quarter.size).toBe(0);
    expect(analyze(row(2), RULES).production.cloth).toBe(2 * cloth);
  });

  it('do not mix kinds', () => {
    let s = row(2);
    s = put(s, 'brewery', 5, 3);
    expect(analyze(s, RULES).quarter.size).toBe(0);
    expect(buildingAt(s, 5, 3)!.def).toBe('brewery');
  });
});
