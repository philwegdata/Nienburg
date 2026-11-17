import { newGame } from './city';
import { analyze } from './sim/analyze';
import type { Balance, CityDef, GameState, Need, PuzzleDef, Rules } from './types';

/** The plan of a puzzle as a city map, so that it can be played with the same tools. */
export function puzzleCity(def: PuzzleDef): CityDef {
  return {
    id: `puzzle-${def.id}`,
    name: def.name,
    region: { de: 'Rätsel', en: 'Puzzle' },
    blurb: def.blurb,
    location: { lat: 0, lon: 0 },
    difficulty: 1,
    buildableRange: [1, 10000],
    goals: [
      { kind: 'population', value: 0 },
      { kind: 'population', value: 0 },
      { kind: 'population', value: 0 },
    ],
    map: def.map,
  };
}

export function newPuzzle(def: PuzzleDef, balance: Balance): GameState {
  return {
    ...newGame(puzzleCity(def), 1, balance, true),
    puzzle: { id: def.id, pieces: { ...def.pieces }, needs: [...def.needs] },
  };
}

export interface PuzzleStatus {
  /** Pieces of each kind still to place. */
  left: Record<string, number>;
  houses: number;
  /** Houses that have everything the puzzle asks for. */
  served: number;
  /** For each house that lacks something, what it lacks. */
  lacking: Map<number, Need[]>;
  solved: boolean;
}

/** How far the puzzle has come. Solved when every piece is placed and every house is served. */
export function puzzleStatus(state: GameState, rules: Rules): PuzzleStatus {
  const puzzle = state.puzzle;
  const left: Record<string, number> = {};
  const all = Object.values(state.buildings);
  for (const [id, n] of Object.entries(puzzle?.pieces ?? {})) {
    left[id] = n - all.filter((b) => b.def === id).length;
  }
  const analysis = analyze(state, rules);
  const lacking = new Map<number, Need[]>();
  let houses = 0;
  for (const b of all) {
    if (!b.house) continue;
    houses++;
    const missing = (puzzle?.needs ?? []).filter((need) => {
      if (need === 'road') return !analysis.access.has(b.id);
      if (need === 'appeal1') {
        return (analysis.houseAppeal.get(b.id) ?? 0) < rules.balance.appeal.pleasant;
      }
      if (need === 'appeal2') {
        return (analysis.houseAppeal.get(b.id) ?? 0) < rules.balance.appeal.fine;
      }
      if (need === 'goods1' || need === 'goods2') return !analysis.covered.goods.has(b.id);
      return !analysis.covered[need].has(b.id);
    });
    if (missing.length > 0) lacking.set(b.id, missing);
  }
  const placedAll = Object.values(left).every((n) => n <= 0);
  return {
    left,
    houses,
    served: houses - lacking.size,
    lacking,
    solved: !!puzzle && placedAll && houses > 0 && lacking.size === 0,
  };
}
