import { describe, expect, it } from 'vitest';
import { borrow, loanLimit, loanRoom, repayLoan, settleLoan } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { deserialize, serialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import type { GameState, LoanTerms } from '../src/core/types';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { cityFrom } from './helpers';

const city = cityFrom(['#####', '#...G', '#...#', '#####']);
const terms: LoanTerms = { step: 100, base: 300, perHead: 2, interest: 0.03, installment: 0.1 };
const game = (sandbox = false): GameState => newGame(city, 1, RULES.balance, sandbox);
const withPop = (s: GameState, pop: number): GameState => ({
  ...s,
  buildings: {
    1: {
      id: 1,
      def: 'house',
      x: 1,
      y: 1,
      w: 1,
      h: 1,
      rot: 0,
      house: { level: 1, pop, lacking: 0 },
    },
  } as GameState['buildings'],
});

describe('bank', () => {
  it('starts without debt', () => {
    expect(game().debt).toBe(0);
  });

  it('lends up to a limit that grows with the town, in whole steps', () => {
    expect(loanLimit(game(), terms)).toBe(300);
    expect(loanLimit(withPop(game(), 75), terms)).toBe(400);
    expect(loanLimit(withPop(game(), 74), terms)).toBe(400);
    expect(loanLimit(withPop(game(), 49), terms)).toBe(300);
  });

  it('adds borrowed gold to treasury and debt', () => {
    const s = game();
    const r = borrow(s, terms, 200);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.gold).toBe(s.gold + 200);
    expect(r.state.debt).toBe(200);
    expect(loanRoom(r.state, terms)).toBe(100);
  });

  it('refuses more than the limit, nothing at all, and any loan in a sandbox', () => {
    expect(borrow(game(), terms, 400)).toEqual({ ok: false, reason: 'loanLimit' });
    expect(borrow(game(), terms, 0)).toEqual({ ok: false, reason: 'loanLimit' });
    expect(borrow(game(true), terms, 100)).toEqual({ ok: false, reason: 'loanLimit' });
  });

  it('pays back no more than the debt or the gold there is', () => {
    const s = { ...game(), gold: 50, debt: 120 };
    const r = repayLoan(s, 100);
    expect(r.ok && r.state).toMatchObject({ gold: 0, debt: 70 });
    expect(repayLoan({ ...s, gold: 0 }, 10)).toEqual({ ok: false, reason: 'noGold' });
    expect(repayLoan(game(), 10)).toEqual({ ok: false, reason: 'nothingToRepay' });
    const all = repayLoan({ ...s, gold: 500 }, 1000);
    expect(all.ok && all.state).toMatchObject({ gold: 380, debt: 0 });
  });

  it('adds interest, then takes an instalment from the gold left over', () => {
    expect(settleLoan(500, 0, terms)).toEqual({ gold: 500, debt: 0, interest: 0, paid: 0 });
    // 200 debt: 6 interest, 206 owed, 21 paid back.
    expect(settleLoan(500, 200, terms)).toEqual({ gold: 479, debt: 185, interest: 6, paid: 21 });
    // An empty treasury pays nothing; the debt just grows a little.
    expect(settleLoan(0, 200, terms)).toEqual({ gold: 0, debt: 206, interest: 6, paid: 0 });
    // A small debt is paid off at once.
    expect(settleLoan(500, 5, terms).debt).toBeLessThan(5);
  });

  it('settles the loan at the end of a turn and reports it', () => {
    const lent = borrow(game(), RULES.balance.loan, 200);
    if (!lent.ok) throw new Error('no loan');
    const next = endTurn(lent.state, RULES);
    expect(next.debt).toBeLessThan(200);
    expect(next.lastReport!.loanInterest).toBeGreaterThan(0);
    expect(next.lastReport!.loanPaid).toBe(200 + next.lastReport!.loanInterest - next.debt);
    expect(next.subsidies).toBe(0);
  });

  it('never drives the treasury below zero', () => {
    const s = { ...game(), gold: 0, debt: 300 };
    const next = endTurn(s, RULES);
    expect(next.gold).toBeGreaterThanOrEqual(0);
    expect(next.debt).toBeGreaterThanOrEqual(300);
  });

  it('is paid off completely over time', () => {
    const lent = borrow(game(), RULES.balance.loan, 300);
    if (!lent.ok) throw new Error('no loan');
    let s = lent.state;
    for (let i = 0; i < 80 && s.debt > 0; i++) s = endTurn({ ...s, gold: s.gold + 100 }, RULES);
    expect(s.debt).toBe(0);
  });

  it('keeps the debt in a save and gives old saves none', () => {
    const lent = borrow(game(), terms, 100);
    if (!lent.ok) throw new Error('no loan');
    expect(deserialize(serialize(lent.state), [city.id])!.debt).toBe(100);
    const old: Record<string, unknown> = { ...game(), version: 4 };
    delete old.debt;
    const restored = deserialize(JSON.stringify({ saveVersion: 4, state: old }), [city.id]);
    expect(restored).toMatchObject({ version: 12, debt: 0 });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.bank.title.length).toBeGreaterThan(0);
      expect(t.report.loan).toContain('{n}');
    }
  });
});
