import { lockOf } from './actions';
import { rngStep } from './rng';
import type { Building, GameState, Rules, Wish } from './types';

/** Tiles between two footprints (0 when they touch or overlap), counting diagonals as one. */
function gap(a: Building, b: Building): number {
  const dx = Math.max(0, b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1)) - 1;
  const dy = Math.max(0, b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1)) - 1;
  return Math.max(0, dx, dy);
}

/** How far the wish has come: `current` of `target`. */
export function wishProgress(
  state: GameState,
  rules: Rules,
  wish: Wish,
): { current: number; target: number; done: boolean } {
  const all = Object.values(state.buildings);
  const home = state.buildings[wish.house];
  if (wish.kind === 'near') {
    const close =
      !!home &&
      all.some(
        (b) =>
          b.def === wish.def &&
          !b.construction &&
          b.id !== home.id &&
          gap(home, b) <= rules.balance.wishes.radius,
      );
    return { current: close ? 1 : 0, target: 1, done: close };
  }
  if (wish.kind === 'level') {
    const level = home?.house?.level ?? 0;
    return { current: level, target: wish.level, done: level >= wish.level };
  }
  const count = all.filter((b) => b.def === wish.def && !b.construction).length;
  return { current: count, target: wish.count, done: count >= wish.count };
}

/** A wish is dropped quietly when the resident's home is gone. */
export function wishLost(state: GameState, wish: Wish): boolean {
  return !state.buildings[wish.house]?.house;
}

/**
 * Perhaps one of the residents speaks up. Uses its own draw from the town's random state, so
 * the rest of the game plays out the same with or without wishes.
 */
export function rollWish(state: GameState, rules: Rules): Wish | null {
  const cfg = rules.balance.wishes;
  if (state.turn <= cfg.quietTurns) return null;
  let seed = (state.rng ^ 0x5bd1e995) | 0;
  const draw = (): number => {
    const r = rngStep(seed);
    seed = r.next;
    return r.value;
  };
  if (draw() >= cfg.chance) return null;
  const homes = Object.values(state.buildings)
    .filter((b) => b.house && b.house.pop > 0)
    .sort((a, b) => a.id - b.id);
  if (homes.length === 0) return null;
  const home = homes[Math.floor(draw() * homes.length)]!;
  const level = home.house!.level;
  const name = Math.floor(draw() * cfg.names);
  const reward = cfg.reward + cfg.perLevel * level;
  const available = (id: string) => {
    const def = rules.buildings[id];
    return !!def && lockOf(state, def) === null;
  };

  // Most wishes are about the neighbourhood.
  const kinds: Wish['kind'][] = ['near', 'near', 'count', 'level'];
  const kind = kinds[Math.floor(draw() * kinds.length)]!;
  if (kind === 'level' && level < rules.housing.length) {
    return { kind, house: home.id, name, level: level + 1, reward: reward + cfg.perLevel };
  }
  if (kind === 'count') {
    const choices = cfg.more.filter(available);
    if (choices.length > 0) {
      const def = choices[Math.floor(draw() * choices.length)]!;
      const have = Object.values(state.buildings).filter((b) => b.def === def).length;
      return { kind, house: home.id, name, def, count: have + 1, reward };
    }
  }
  // Something close to home that is not there yet.
  const choices = cfg.near.filter(
    (def) =>
      available(def) &&
      !wishProgress(state, rules, { kind: 'near', house: home.id, name, def, reward }).done,
  );
  if (choices.length === 0) return null;
  const def = choices[Math.floor(draw() * choices.length)]!;
  return { kind: 'near', house: home.id, name, def, reward };
}
