import { population } from './actions';
import type { GameState, Goal } from './types';

export interface GoalProgress {
  current: number;
  target: number;
  done: boolean;
}

export function goalProgress(state: GameState, goal: Goal): GoalProgress {
  const all = Object.values(state.buildings);
  let current: number;
  let target: number;
  if (goal.kind === 'population') {
    current = population(state);
    target = goal.value;
  } else if (goal.kind === 'houses') {
    // A merged house counts once per plot it grew from.
    current = all
      .filter((b) => b.house && b.house.level >= goal.level)
      .reduce((sum, b) => sum + b.w * b.h, 0);
    target = goal.count;
  } else {
    current = all.some((b) => b.def === goal.def && !b.construction && !b.damaged) ? 1 : 0;
    target = 1;
  }
  return { current: Math.min(current, target), target, done: current >= target };
}
