import { newGame } from './city';
import { population } from './actions';
import type { Balance, CityDef, GameState } from './types';

/** Turns in a daily challenge: five years. */
export const CHALLENGE_TURNS = 20;

/** Days since 1 January 1970 for a date written as YYYY-MM-DD. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** The city of the day: every day the next one, the same for everyone. */
export function dailyCity(cities: readonly CityDef[], date: string): CityDef {
  return cities[dayNumber(date) % cities.length]!;
}

/** The seed of the day, so that every attempt meets the same fires and fairs. */
export function dailySeed(date: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 0x01000193);
  return h | 0;
}

/** The challenge as a city of its own, with its own save. */
export function challengeCity(base: CityDef): CityDef {
  return { ...base, id: 'daily' };
}

export function newChallenge(base: CityDef, date: string, balance: Balance): GameState {
  return {
    ...newGame(challengeCity(base), dailySeed(date), balance),
    challenge: { date, turns: CHALLENGE_TURNS },
  };
}

/** Whether all the challenge's turns have been played. */
export function challengeOver(state: GameState): boolean {
  return !!state.challenge && state.turn >= state.challenge.turns;
}

/** The score of a challenge: inhabitants at the end. */
export function challengeScore(state: GameState): number {
  return population(state);
}
