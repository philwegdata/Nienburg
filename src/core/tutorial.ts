import { indexOf, NEIGHBOURS_4 } from './grid';
import type { Analysis } from './sim/analyze';
import type { GameState, Rules } from './types';

export type TutorialStepId =
  'welcome' | 'street' | 'houses' | 'endTurn' | 'water' | 'market' | 'grow' | 'faith' | 'goal';

export interface TutorialStep {
  id: TutorialStepId;
  /** Whether the town already shows what this step teaches. Absent: the player just reads on. */
  done?: (state: GameState, analysis: Analysis, rules: Rules) => boolean;
}

function pathsAtGates(state: GameState, rules: Rules): boolean {
  return Object.values(state.buildings).some(
    (b) =>
      rules.buildings[b.def]?.category === 'path' &&
      NEIGHBOURS_4.some((n) => {
        const x = b.x + n.x;
        const y = b.y + n.y;
        return (
          x >= 0 &&
          y >= 0 &&
          x < state.width &&
          y < state.height &&
          state.terrain[indexOf(state.width, x, y)] === 'gate'
        );
      }),
  );
}

const count = (state: GameState, def: string) =>
  Object.values(state.buildings).filter((b) => b.def === def).length;

/** The guided first steps on Nienburg, in order. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'welcome' },
  {
    id: 'street',
    done: (state, _a, rules) => {
      const paths = Object.values(state.buildings).filter(
        (b) => rules.buildings[b.def]?.category === 'path',
      );
      return paths.length >= 5 && pathsAtGates(state, rules);
    },
  },
  {
    id: 'houses',
    done: (state, a) =>
      Object.values(state.buildings).filter((b) => b.house && a.access.has(b.id)).length >= 4,
  },
  { id: 'endTurn', done: (state) => state.turn >= 1 },
  {
    id: 'water',
    done: (state, a) =>
      Object.values(state.buildings).some((b) => b.house && a.covered.water.has(b.id)),
  },
  {
    id: 'market',
    done: (state, a) =>
      Object.values(state.buildings).some((b) => {
        const idle = a.idle.get(b.id);
        return b.def === 'stall' && idle !== 'needsPlaza' && idle !== 'noAccess';
      }),
  },
  {
    id: 'grow',
    done: (state) => Object.values(state.buildings).some((b) => (b.house?.level ?? 0) >= 2),
  },
  { id: 'faith', done: (state) => count(state, 'chapel') > 0 && count(state, 'firewatch') > 0 },
  { id: 'goal', done: (state) => state.stars[0] },
];

/**
 * The step the player is on, starting from `from`: every step whose lesson the town already
 * shows is passed. Steps without a condition wait for the player to read on.
 * Returns the number of steps when the tutorial is complete.
 */
export function tutorialProgress(
  from: number,
  state: GameState,
  analysis: Analysis,
  rules: Rules,
): number {
  let step = from;
  while (step < TUTORIAL_STEPS.length) {
    const done = TUTORIAL_STEPS[step]!.done;
    if (!done || !done(state, analysis, rules)) break;
    step++;
  }
  return step;
}
