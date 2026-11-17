import { describe, expect, it } from 'vitest';
import { buildingAt, lockOf, placeBuilding } from '../src/core/actions';
import { newPuzzle, puzzleStatus } from '../src/core/puzzle';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { PUZZLES } from '../src/data/puzzles';
import { RULES } from '../src/data/rules';

const PIECE: Record<string, string> = {
  H: 'house',
  S: 'street',
  A: 'alley',
  P: 'plaza',
  T: 'stall',
  W: 'well',
  C: 'chapel',
  F: 'firewatch',
};

/** Known solutions, row by row inside the walls; a chapel is two C's one above the other. */
const SOLUTIONS: Record<string, string[]> = {
  firstlane: ['WHHHH', 'SSSSS', 'HHHHH'],
  marketsquare: ['WHTHHH', 'SSPSSS', 'HHHHHH'],
  narrowlanes: ['HHWHHHWHH', 'AAAAAAAAA', 'HHHHHHHHH'],
  chapellane: ['HHHHHHH', 'SSSSSSS', 'HHTPCHH', 'HHWSCHH', 'SSSSSSS', 'HHHHHHH'],
  warren: ['HHWHHHWHH', 'AAAAAAAAA', 'HHHHFHHHH', 'AAAAAAAAA', 'HHWHHHWHH'],
};

function play(state: GameState, rows: string[]): GameState {
  let s = state;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const gx = x + 1;
      const gy = y + 1;
      if (buildingAt(s, gx, gy)) return;
      const def = BUILDINGS[PIECE[ch]!]!;
      const r = placeBuilding(s, BUILDINGS, def, gx, gy);
      if (!r.ok) throw new Error(`${def.id} at ${gx},${gy}: ${r.reason}`);
      s = r.state;
    });
  });
  return s;
}

describe('puzzles', () => {
  for (const def of PUZZLES) {
    it(`${def.id} can be solved`, () => {
      const start = newPuzzle(def, RULES.balance);
      expect(puzzleStatus(start, RULES).solved).toBe(false);
      const done = play(start, SOLUTIONS[def.id]!);
      const status = puzzleStatus(done, RULES);
      expect([...status.lacking.values()], def.id).toEqual([]);
      expect(status.left, def.id).toEqual(
        Object.fromEntries(Object.keys(def.pieces).map((k) => [k, 0])),
      );
      expect(status.solved).toBe(true);
    });

    it(`${def.id} fills its plan exactly`, () => {
      const start = newPuzzle(def, RULES.balance);
      const tiles = start.terrain.filter((t) => t === 'buildable').length;
      const pieces = Object.entries(def.pieces).reduce((sum, [id, n]) => {
        const size = BUILDINGS[id]!.size;
        return sum + n * size.w * size.h;
      }, 0);
      expect(pieces).toBe(tiles);
    });
  }

  it('offers only its own pieces, and only as many as given', () => {
    const def = PUZZLES[0]!;
    const s = newPuzzle(def, RULES.balance);
    expect(lockOf(s, BUILDINGS.house!)).toBeNull();
    expect(lockOf(s, BUILDINGS.chapel!)).not.toBeNull();
    let t = s;
    for (let x = 1; x <= 5; x++) {
      const r = placeBuilding(t, BUILDINGS, BUILDINGS.well!, x, 1);
      if (x === 1) expect(r.ok).toBe(true);
      else expect(r).toEqual({ ok: false, reason: 'noPieces' });
      if (r.ok) t = r.state;
    }
  });

  it('costs nothing', () => {
    const s = newPuzzle(PUZZLES[0]!, RULES.balance);
    const r = placeBuilding(s, BUILDINGS, BUILDINGS.house!, 1, 1);
    expect(r.ok && r.state.gold).toBe(s.gold);
  });

  it('says which houses still lack something', () => {
    const def = PUZZLES[0]!;
    const s = play(newPuzzle(def, RULES.balance), ['HHHHH', 'SSSSS']);
    const status = puzzleStatus(s, RULES);
    expect(status.houses).toBe(5);
    expect(status.served).toBe(0);
    expect([...status.lacking.values()][0]).toEqual(['water']);
  });

  it('has texts in both languages', () => {
    for (const def of PUZZLES) {
      expect(def.name.de.length).toBeGreaterThan(0);
      expect(def.name.en.length).toBeGreaterThan(0);
    }
    expect(strings('de').puzzle.title.length).toBeGreaterThan(0);
  });
});
