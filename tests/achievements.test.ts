import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newAchievements, townValue } from '../src/core/achievements';
import { newPuzzle } from '../src/core/puzzle';
import { analyze } from '../src/core/sim/analyze';
import type { GameState } from '../src/core/types';
import { strings } from '../src/data/i18n';
import { PUZZLES } from '../src/data/puzzles';
import { RULES } from '../src/data/rules';
import { fillWith, richGame } from './helpers';

const MAP = ['##########', '#........#', '#........G', '#........#', '##########'];
const progress = { puzzlesSolved: 0, puzzles: 5 };

function town(level: number, pop: number): GameState {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 8, 2);
  s = fillWith(s, 'house', 1, 1, 8, 1);
  for (const b of Object.values(s.buildings)) {
    if (b.house) s.buildings[b.id] = { ...b, house: { level, pop, lacking: 0 } };
  }
  return { ...s, peakPop: pop * 8 };
}
const earned = (s: GameState, known: string[] = [], p = progress) =>
  newAchievements(s, analyze(s, RULES), p, known);

describe('achievements', () => {
  it('are earned by what the town has done', () => {
    const got = earned(town(5, 20));
    expect(got).toEqual(expect.arrayContaining(['firstHouse', 'hundred', 'burgher', 'patrician']));
    expect(got).not.toContain('thousand');
  });

  it('are told only once', () => {
    expect(earned(town(5, 20), ['firstHouse', 'hundred', 'burgher', 'patrician'])).toEqual([]);
  });

  it('are not earned in a sandbox or a puzzle', () => {
    expect(earned({ ...town(5, 20), sandbox: true })).toEqual([]);
    const puzzle = newPuzzle(PUZZLES[0]!, RULES.balance);
    expect(earned(puzzle)).toEqual([]);
    // Solving every puzzle counts wherever it is noticed.
    expect(earned(puzzle, [], { puzzlesSolved: 5, puzzles: 5 })).toEqual(['allPuzzles']);
  });

  it('have names and descriptions in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      for (const a of ACHIEVEMENTS) {
        const [name, text] = strings(lang).achievements.list[a.id];
        expect(name && text, `${lang} ${a.id}`).toBeTruthy();
      }
    }
  });
});

describe('town value', () => {
  it('grows with people, better houses and good deeds', () => {
    const small = townValue(town(1, 4), RULES);
    const big = townValue(town(3, 11), RULES);
    expect(big).toBeGreaterThan(small);
    expect(townValue({ ...town(1, 4), wishesGranted: 2 }, RULES)).toBe(small + 40);
  });
});
