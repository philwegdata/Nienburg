import { describe, expect, it } from 'vitest';
import { buildingAt } from '../src/core/actions';
import { analyze } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import type { GameState, HouseData } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

// Open field: buildable x 1..24, y 1..12, gate above (1, 1).
const FIELD = [
  '#G########################',
  ...Array<string>(12).fill('#........................#'),
  '##########################',
];
const kontor = BUILDINGS.kontor!.trade!;

function setHouse(state: GameState, x: number, y: number, house: HouseData): GameState {
  const b = buildingAt(state, x, y)!;
  return { ...state, buildings: { ...state.buildings, [b.id]: { ...b, house } } };
}

/** A street from the gate with enough residents to staff workshops and merchants. */
function quarter(): GameState {
  let s = fillWith(richGame(FIELD), 'street', 1, 1, 1, 6);
  s = fillWith(s, 'street', 2, 6, 24, 6);
  s = fillWith(s, 'house', 2, 7, 11, 7);
  for (let x = 2; x <= 11; x++) s = setHouse(s, x, 7, { level: 2, pop: 7, lacking: 0 });
  return s;
}
const withGoods = (s: GameState, cloth: number, tools = 0, beer = 0): GameState => ({
  ...s,
  goods: { cloth, tools, beer },
});

describe('merchants', () => {
  it('sell craft goods through the gate for gold', () => {
    const s = withGoods(put(quarter(), 'kontor', 3, 4), 20);
    const a = analyze(s, RULES);
    expect(a.idle.size).toBe(0);
    expect(a.tradeCapacity).toBe(kontor.capacity);
    const after = endTurn(s, RULES);
    expect(after.goods.cloth).toBe(20 - kontor.capacity);
    expect(after.lastReport).toMatchObject({
      goodsSold: kontor.capacity,
      tradeIncome: kontor.capacity * kontor.price,
    });
    // Compared with the same town without merchants, the turn brings in the sales minus upkeep.
    const base = withGoods(quarter(), 20);
    const gain = after.gold - s.gold - (endTurn(base, RULES).gold - base.gold);
    expect(gain).toBe(kontor.capacity * kontor.price - BUILDINGS.kontor!.upkeep);
  });

  it('sell more with a second office, and never more than there is', () => {
    let s = put(put(quarter(), 'kontor', 3, 4), 'kontor', 6, 4);
    expect(analyze(s, RULES).tradeCapacity).toBe(2 * kontor.capacity);
    s = withGoods(s, 5, 4, 0);
    const after = endTurn(s, RULES);
    expect(after.lastReport!.goodsSold).toBe(9);
    expect(after.goods).toEqual({ cloth: 0, tools: 0, beer: 0 });
  });

  it('take from the fullest store first', () => {
    const s = withGoods(put(quarter(), 'kontor', 3, 4), 10, 6, 2);
    // Eight sales: cloth down to 6, then cloth and tools in turn.
    expect(endTurn(s, RULES).goods).toEqual({ cloth: 4, tools: 4, beer: 2 });
  });

  it('leave the houses what they need for the coming turns', () => {
    let s = put(put(quarter(), 'kontor', 3, 4), 'markethall', 13, 7);
    s = setHouse(s, 2, 7, { level: 4, pop: 350, lacking: 0 }); // wants 3 of each kind per turn
    expect(analyze(s, RULES).goodsDemand).toBe(3);
    const after = endTurn(withGoods(s, 14, 14, 14), RULES);
    // Houses take 3 each (11 left); merchants then sell down to the reserve of 9.
    const reserve = 3 * RULES.balance.goodsReserveTurns;
    expect(after.goods).toEqual({ cloth: reserve, tools: reserve, beer: reserve });
    expect(after.lastReport).toMatchObject({ goodsTypes: 3, goodsSold: 6 });
  });

  it('need a path to a gate', () => {
    // On a stretch of street that does not reach the gate.
    let s = fillWith(richGame(FIELD), 'street', 5, 6, 24, 6);
    s = fillWith(s, 'house', 5, 7, 14, 7);
    for (let x = 5; x <= 14; x++) s = setHouse(s, x, 7, { level: 2, pop: 7, lacking: 0 });
    s = withGoods(put(s, 'kontor', 6, 4), 20);
    const id = buildingAt(s, 6, 4)!.id;
    expect(analyze(s, RULES).idle.get(id)).toBe('noGate');
    const stuck = endTurn(s, RULES);
    expect(stuck.lastReport!.goodsSold).toBe(0);
    expect(stuck.lastReport!.hints.map((h) => h.kind)).toContain('noGate');
    // Link the street to the gate and trade starts.
    s = fillWith(fillWith(s, 'street', 1, 1, 1, 6), 'street', 2, 6, 4, 6);
    expect(analyze(s, RULES).idle.has(id)).toBe(false);
    expect(endTurn(s, RULES).lastReport!.goodsSold).toBe(kontor.capacity);
  });

  it('need workers like any other business', () => {
    let s = fillWith(richGame(FIELD), 'street', 1, 1, 1, 6);
    s = withGoods(put(s, 'kontor', 2, 4), 20);
    expect(analyze(s, RULES).idle.get(buildingAt(s, 2, 4)!.id)).toBe('unstaffed');
    expect(endTurn(s, RULES).lastReport!.goodsSold).toBe(0);
  });
});

describe('manufactory', () => {
  it('makes far more cloth than a weaver', () => {
    const s = put(quarter(), 'manufactory', 3, 4);
    const made = analyze(s, RULES).production.cloth;
    expect(made).toBe(BUILDINGS.manufactory!.produces!.amount);
    expect(made).toBeGreaterThan(2 * BUILDINGS.weaver!.produces!.amount);
  });

  it('benefits from a guild hall next door', () => {
    let s = put(quarter(), 'townhall', 20, 2);
    s = put(s, 'manufactory', 3, 4);
    s = put(s, 'guildhall', 6, 3);
    expect(analyze(s, RULES).production.cloth).toBe(Math.floor(9 * 1.5));
  });

  it('with a merchants’ office turns into a steady income that pays for itself', () => {
    let s = put(put(quarter(), 'manufactory', 3, 4), 'kontor', 7, 4);
    const before = endTurn(quarter(), RULES).lastReport!;
    for (let i = 0; i < 6; i++) s = endTurn(s, RULES);
    const r = s.lastReport!;
    expect(r.goodsSold).toBe(kontor.capacity);
    const extraUpkeep = r.upkeep - before.upkeep;
    expect(extraUpkeep).toBe(BUILDINGS.manufactory!.upkeep + BUILDINGS.kontor!.upkeep);
    expect(r.tradeIncome - extraUpkeep).toBeGreaterThanOrEqual(20);
    // One office cannot keep up with a manufactory: the store slowly fills.
    expect(s.goods.cloth).toBeGreaterThan(0);
  });

  it('still earns a little without merchants, once the store overflows', () => {
    let s = withGoods(put(quarter(), 'manufactory', 3, 4), RULES.balance.goodsCap);
    s = endTurn(s, RULES);
    expect(s.goods.cloth).toBe(RULES.balance.goodsCap);
    expect(s.lastReport).toMatchObject({ goodsSold: 0, tradeIncome: 9 * RULES.balance.goodsPrice });
    expect(kontor.price).toBeGreaterThan(RULES.balance.goodsPrice);
  });
});

describe('texts for trade', () => {
  it('exist in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.building.kontor && t.building.manufactory).toBeTruthy();
      expect(t.idle.noGate && t.hint.noGate[1] && t.report.sold[1]).toBeTruthy();
      expect(t.tradeInfo).toContain('{n}');
    }
  });
});
