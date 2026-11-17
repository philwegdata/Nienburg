import type { GameState, Good, Rules } from './types';

/** A number in [0, 1) from a few integers; the same inputs always give the same number. */
function hash01(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function textHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h;
}

const GOOD_INDEX: Record<Good, number> = { cloth: 1, tools: 2, beer: 3 };

/**
 * How dear a craft good is in a given turn, as a factor on the merchants' price: the season's
 * usual price, nudged by how the year goes in this part of the world.
 */
export function priceFactor(state: GameState, rules: Rules, good: Good, turn = state.turn): number {
  const { season, drift } = rules.balance.market;
  const year = Math.floor(turn / 4);
  const swing = (hash01(textHash(state.cityId), year, GOOD_INDEX[good]) * 2 - 1) * drift;
  return season[good][turn % 4]! * (1 + swing);
}

/** Gold the merchants get for one unit of `good` in a turn, at the town's best trade price. */
export function goodPrice(
  state: GameState,
  rules: Rules,
  basePrice: number,
  good: Good,
  turn = state.turn,
): number {
  if (basePrice <= 0) return 0;
  return Math.max(1, Math.round(basePrice * priceFactor(state, rules, good, turn)));
}
