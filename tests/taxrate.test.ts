import { describe, expect, it } from 'vitest';
import { setTaxRate } from '../src/core/actions';
import { deserialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import type { GameState, TaxRate } from '../src/core/types';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, richGame } from './helpers';

const MAP = ['##########', '#........#', '#........G', '#........#', '##########'];

function town(rate: TaxRate, pop = 0): GameState {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 8, 2);
  s = fillWith(s, 'house', 1, 1, 8, 1);
  for (const b of Object.values(s.buildings)) {
    if (b.house) s.buildings[b.id] = { ...b, house: { level: 1, pop, lacking: 0 } };
  }
  return setTaxRate(s, rate);
}
const people = (s: GameState) =>
  Object.values(s.buildings).reduce((n, b) => n + (b.house?.pop ?? 0), 0);

describe('tax rate', () => {
  it('starts as usual', () => {
    expect(richGame(MAP).taxRate).toBe(1);
  });

  it('brings newcomers faster when mild and slower when high', () => {
    const grown = ([0, 1, 2] as const).map((r) => people(endTurn(town(r), RULES)));
    expect(grown[0]).toBeGreaterThan(grown[1]!);
    expect(grown[1]).toBeGreaterThan(grown[2]!);
  });

  it('takes less when mild and more when high', () => {
    const taxes = ([0, 1, 2] as const).map((r) => endTurn(town(r, 4), RULES).lastReport!.taxes);
    expect(taxes[0]).toBeLessThan(taxes[1]!);
    expect(taxes[2]).toBeGreaterThan(taxes[1]!);
    const usual = RULES.balance.taxRates[1]!;
    expect(usual).toEqual({ tax: 1, growth: 0.5 });
  });

  it('changes nothing when set to what it already is', () => {
    const s = town(1);
    expect(setTaxRate(s, 1)).toBe(s);
  });

  it('is usual for old saves', () => {
    const old: Record<string, unknown> = { ...town(2), version: 9 };
    delete old.taxRate;
    const back = deserialize(JSON.stringify({ saveVersion: 9, state: old }), ['test']);
    expect(back).toMatchObject({ version: 12, taxRate: 1 });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) expect(strings(lang).tax.rates).toHaveLength(3);
  });
});
