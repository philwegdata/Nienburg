import { describe, expect, it } from 'vitest';
import { deserialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import { deliverOrder, hasTradingHouse, rollOrder } from '../src/core/orders';
import type { GameState, TradeOrder } from '../src/core/types';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
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
const cfg = RULES.balance.orders;

function town(kontor = true): GameState {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 10, 2);
  if (kontor) s = put(s, 'kontor', 1, 3);
  return { ...s, turn: cfg.quietTurns + 1 };
}
const order = (over: Partial<TradeOrder> = {}): TradeOrder => ({
  from: 'bruges',
  good: 'cloth',
  amount: 10,
  delivered: 0,
  gold: 100,
  luxury: 5,
  ...over,
});

describe('orders from other towns', () => {
  it('only come once a trading house stands and the first years are over', () => {
    expect(hasTradingHouse(town(false), RULES)).toBe(false);
    for (let seed = 0; seed < 40; seed++) {
      expect(rollOrder({ ...town(false), rng: seed }, RULES, 5)).toBeNull();
      expect(rollOrder({ ...town(), rng: seed, turn: cfg.quietTurns }, RULES, 5)).toBeNull();
    }
  });

  it('come from other towns, for amounts that grow over the years', () => {
    let seen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const o = rollOrder({ ...town(), rng: seed, cityId: 'bruges' }, RULES, 5);
      if (!o) continue;
      seen++;
      expect(o.from).not.toBe('bruges');
      expect(cfg.partners).toContain(o.from);
      expect(o.amount).toBeGreaterThanOrEqual(cfg.base);
      expect(o.amount).toBeLessThanOrEqual(cfg.max);
      expect(o.gold).toBeGreaterThan(o.amount * 5);
    }
    expect(seen).toBeGreaterThan(200 * cfg.chance * 0.6);
    const late = rollOrder({ ...town(), rng: 3, turn: 400 }, RULES, 5);
    if (late) expect(late.amount).toBe(cfg.max);
  });

  it('are delivered bit by bit from the store', () => {
    const s = { ...town(), order: order(), goods: { cloth: 6, tools: 0, beer: 0 } };
    const r = deliverOrder(s, RULES);
    expect(r.ok && !r.done && r.state.order?.delivered).toBe(6);
    expect(r.ok && r.state.goods.cloth).toBe(0);
    if (!r.ok) return;
    expect(deliverOrder(r.state, RULES)).toEqual({ ok: false, reason: 'noGoods' });
  });

  it('pay gold and luxury goods once complete', () => {
    const s = { ...town(), order: order({ delivered: 7 }), goods: { cloth: 9, tools: 0, beer: 0 } };
    const r = deliverOrder(s, RULES);
    expect(r.ok && r.done).toBe(true);
    if (!r.ok) return;
    expect(r.state.goods.cloth).toBe(6);
    expect(r.state.gold).toBe(s.gold + 100);
    expect(r.state.luxury).toBe(5);
    expect(r.state.order).toBeNull();
    expect(r.state.ordersDone).toBe(1);
  });

  it('need a trading house to deliver', () => {
    const s = { ...town(false), order: order(), goods: { cloth: 20, tools: 0, beer: 0 } };
    expect(deliverOrder(s, RULES)).toEqual({ ok: false, reason: 'noTradingHouse' });
    expect(deliverOrder({ ...s, order: null }, RULES)).toEqual({ ok: false, reason: 'noOrder' });
  });

  it('stay open without a deadline', () => {
    let s: GameState = { ...town(), order: order() };
    for (let i = 0; i < 10; i++) s = endTurn(s, RULES);
    expect(s.order).toEqual(order());
  });

  it('leave the rest of the game as it would have been', () => {
    const s = town();
    const a = endTurn({ ...s, order: null }, RULES);
    const b = endTurn({ ...s, order: order() }, RULES);
    expect(a.rng).toBe(b.rng);
  });

  it('start old saves without one', () => {
    const old: Record<string, unknown> = { ...town(), version: 8 };
    delete old.order;
    delete old.ordersDone;
    delete old.luxury;
    const back = deserialize(JSON.stringify({ saveVersion: 8, state: old }), ['test']);
    expect(back).toMatchObject({ version: 9, order: null, ordersDone: 0, luxury: 0 });
  });
});

describe('luxury goods', () => {
  /** Upper houses within reach of a market hall. */
  function fine(luxury: number): GameState {
    let s = town();
    s = fillWith(s, 'house', 3, 1, 10, 1);
    s = put(s, 'markethall', 4, 3);
    for (const b of Object.values(s.buildings)) {
      if (b.house) s.buildings[b.id] = { ...b, house: { level: 4, pop: 40, lacking: 0 } };
    }
    return { ...s, luxury };
  }

  it('are used by the upper houses, who pay more taxes for them', () => {
    const without = endTurn(fine(0), RULES).lastReport!;
    const after = endTurn(fine(100), RULES);
    const r = after.lastReport!;
    expect(r.luxuryUsed).toBeGreaterThan(0);
    expect(after.luxury).toBe(100 - r.luxuryUsed!);
    expect(r.luxuryTaxes).toBeGreaterThan(0);
    expect(r.taxes).toBe(without.taxes + r.luxuryTaxes!);
  });

  it('are not touched when there is too little for everyone', () => {
    const after = endTurn(fine(1), RULES);
    expect(after.luxury).toBe(1);
    expect(after.lastReport!.luxuryTaxes).toBe(0);
  });
});

describe('texts', () => {
  it('exist in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(strings(lang).order.text).toContain('{good}');
      expect(strings(lang).luxury.name.length).toBeGreaterThan(0);
    }
  });
});
