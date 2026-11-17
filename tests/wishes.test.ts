import { describe, expect, it } from 'vitest';
import { buildingAt, demolish } from '../src/core/actions';
import { endTurn } from '../src/core/sim/turn';
import type { GameState, Wish } from '../src/core/types';
import { rollWish, wishLost, wishProgress } from '../src/core/wishes';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { WISH_NAMES } from '../src/data/wishes';
import { fillWith, put, richGame } from './helpers';

const MAP = [
  '############',
  '#..........#',
  '#..........G',
  '#..........#',
  '#..........#',
  '#..........#',
  '############',
];
const cfg = RULES.balance.wishes;

function town(): GameState {
  let s = richGame(MAP);
  s = fillWith(s, 'street', 1, 2, 10, 2);
  s = fillWith(s, 'house', 1, 1, 3, 1);
  const buildings = { ...s.buildings };
  for (const b of Object.values(buildings)) {
    if (b.house) buildings[b.id] = { ...b, house: { level: 2, pop: 5, lacking: 0 } };
  }
  return { ...s, buildings, turn: cfg.quietTurns + 1 };
}
const homeId = (s: GameState) => buildingAt(s, 1, 1)!.id;

describe('wishes', () => {
  it('knows when a building is close enough to home', () => {
    let s = town();
    const wish: Wish = { kind: 'near', house: homeId(s), name: 0, def: 'tree', reward: 50 };
    expect(wishProgress(s, RULES, wish).done).toBe(false);
    // Too far away.
    s = put(s, 'tree', 1 + cfg.radius + 2, 4);
    expect(wishProgress(s, RULES, wish).done).toBe(false);
    s = put(s, 'tree', 1 + cfg.radius, 4);
    expect(wishProgress(s, RULES, wish).done).toBe(true);
  });

  it('counts buildings and house levels', () => {
    const s = town();
    const more: Wish = {
      kind: 'count',
      house: homeId(s),
      name: 1,
      def: 'tree',
      count: 2,
      reward: 1,
    };
    expect(wishProgress(s, RULES, more)).toMatchObject({ current: 0, target: 2, done: false });
    const two = put(put(s, 'tree', 5, 4), 'tree', 6, 4);
    expect(wishProgress(two, RULES, more).done).toBe(true);
    const level: Wish = { kind: 'level', house: homeId(s), name: 1, level: 3, reward: 1 };
    expect(wishProgress(s, RULES, level)).toMatchObject({ current: 2, target: 3, done: false });
  });

  it('pays the reward once the wish comes true, then makes room for another', () => {
    let s = town();
    const wish: Wish = { kind: 'near', house: homeId(s), name: 2, def: 'tree', reward: 77 };
    s = put({ ...s, wish }, 'tree', 2, 3);
    const plain = endTurn({ ...s, wish: null, rng: s.rng }, RULES);
    const next = endTurn(s, RULES);
    expect(next.lastReport!.wishGranted).toEqual(wish);
    expect(next.wishesGranted).toBe(1);
    expect(next.gold - plain.gold).toBe(77);
    expect(next.wish).toBeNull();
  });

  it('keeps an open wish without any deadline', () => {
    let s = town();
    const wish: Wish = { kind: 'near', house: homeId(s), name: 2, def: 'fountain', reward: 10 };
    s = { ...s, wish };
    for (let i = 0; i < 12; i++) s = endTurn(s, RULES);
    expect(s.wish).toEqual(wish);
  });

  it('drops a wish quietly when the home is gone', () => {
    const s = town();
    const wish: Wish = { kind: 'near', house: homeId(s), name: 2, def: 'fountain', reward: 10 };
    const gone = demolish({ ...s, wish }, BUILDINGS, 0.5, 1, 1);
    expect(wishLost(gone, wish)).toBe(true);
    expect(endTurn(gone, RULES).wish?.house).not.toBe(wish.house);
  });

  it('only speaks up after the first turns, and only for inhabited homes', () => {
    expect(rollWish({ ...town(), turn: cfg.quietTurns }, RULES)).toBeNull();
    const empty = town();
    for (const b of Object.values(empty.buildings)) {
      if (b.house) empty.buildings[b.id] = { ...b, house: { ...b.house, pop: 0 } };
    }
    for (let seed = 0; seed < 50; seed++)
      expect(rollWish({ ...empty, rng: seed }, RULES)).toBeNull();
  });

  it('wishes for things that can be built and are not there yet', () => {
    const s = town();
    let seen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const wish = rollWish({ ...s, rng: seed }, RULES);
      if (!wish) continue;
      seen++;
      expect(wish.name).toBeLessThan(WISH_NAMES.length);
      expect(s.buildings[wish.house]?.house).toBeDefined();
      expect(wish.reward).toBeGreaterThan(0);
      expect(wishProgress(s, RULES, wish).done).toBe(false);
      if (wish.kind !== 'level') expect(BUILDINGS[wish.def]).toBeDefined();
    }
    // Roughly the configured share of turns brings a wish.
    expect(seen).toBeGreaterThan(200 * cfg.chance * 0.6);
  });

  it('leaves the rest of the game as it would have been', () => {
    const s = town();
    const a = endTurn({ ...s, wish: null }, RULES);
    const b = endTurn(
      { ...s, wish: { kind: 'level', house: homeId(s), name: 0, level: 5, reward: 1 } },
      RULES,
    );
    expect(a.rng).toBe(b.rng);
    expect(a.lastReport!.event).toEqual(b.lastReport!.event);
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.wish.near).toContain('{thing}');
      expect(t.wish.granted).toContain('{gold}');
    }
  });
});
