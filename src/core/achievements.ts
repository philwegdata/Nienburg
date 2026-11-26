import type { Analysis } from './sim/analyze';
import type { GameState, Rules } from './types';

export type AchievementId =
  | 'firstHouse'
  | 'hundred'
  | 'fiveHundred'
  | 'thousand'
  | 'burgher'
  | 'patrician'
  | 'tower'
  | 'wallFolk'
  | 'countryside'
  | 'guildQuarter'
  | 'festive'
  | 'wishes'
  | 'trader'
  | 'landlord'
  | 'newRing'
  | 'cathedral'
  | 'threeStars'
  | 'allPuzzles';

/** Things the player has done across all games, kept on the device. */
export interface Progress {
  /** Puzzles solved and puzzles there are. */
  puzzlesSolved: number;
  puzzles: number;
}

const has = (state: GameState, def: string, count = 1) =>
  Object.values(state.buildings).filter((b) => b.def === def && !b.construction).length >= count;

const houses = (state: GameState) =>
  Object.values(state.buildings)
    .filter((b) => b.house)
    .map((b) => b.house!);

/** Every achievement, with the test that earns it. Order is the order they are shown in. */
export const ACHIEVEMENTS: readonly {
  id: AchievementId;
  earned: (state: GameState, analysis: Analysis, progress: Progress) => boolean;
}[] = [
  { id: 'firstHouse', earned: (s) => houses(s).some((h) => h.pop > 0) },
  { id: 'hundred', earned: (s) => s.peakPop >= 100 },
  { id: 'fiveHundred', earned: (s) => s.peakPop >= 500 },
  { id: 'thousand', earned: (s) => s.peakPop >= 1000 },
  { id: 'burgher', earned: (s) => houses(s).some((h) => h.level >= 4) },
  { id: 'patrician', earned: (s) => houses(s).some((h) => h.level >= 5) },
  { id: 'tower', earned: (s) => houses(s).some((h) => (h.storeys ?? 0) >= 2) },
  { id: 'wallFolk', earned: (s) => has(s, 'wallhouse', 5) },
  { id: 'countryside', earned: (s) => has(s, 'field') && has(s, 'pasture') && has(s, 'woodlot') },
  { id: 'guildQuarter', earned: (_s, a) => a.quarter.size > 0 },
  { id: 'festive', earned: (s) => (s.festivals ?? 0) >= 4 },
  { id: 'wishes', earned: (s) => (s.wishesGranted ?? 0) >= 5 },
  { id: 'trader', earned: (s) => (s.ordersDone ?? 0) >= 3 },
  { id: 'landlord', earned: (s) => s.landBought >= 20 },
  { id: 'newRing', earned: (s) => has(s, 'wallworks') },
  { id: 'cathedral', earned: (s) => has(s, 'cathedral') },
  { id: 'threeStars', earned: (s) => s.stars.every(Boolean) },
  { id: 'allPuzzles', earned: (_s, _a, p) => p.puzzles > 0 && p.puzzlesSolved >= p.puzzles },
];

/** Achievements earned by this game that are not yet in `known`. Sandboxes and puzzles earn none. */
export function newAchievements(
  state: GameState,
  analysis: Analysis,
  progress: Progress,
  known: readonly string[],
): AchievementId[] {
  const playing = !state.sandbox && !state.puzzle;
  return ACHIEVEMENTS.filter(
    (a) =>
      !known.includes(a.id) &&
      (a.id === 'allPuzzles' || playing) &&
      a.earned(state, analysis, progress),
  ).map((a) => a.id);
}

/**
 * The town's worth, beyond its three stars: its people weighed by how well they live, what its
 * buildings cost, and what it has done for others.
 */
export function townValue(state: GameState, rules: Rules): number {
  let value = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.house) value += b.house.pop * b.house.level;
    else if (!b.construction) value += Math.floor((rules.buildings[b.def]?.cost ?? 0) / 10);
  }
  value += 20 * ((state.wishesGranted ?? 0) + (state.ordersDone ?? 0));
  value += 10 * (state.festivals ?? 0);
  return value;
}
