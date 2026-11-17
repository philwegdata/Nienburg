import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/city';
import { goodPrice, priceFactor } from '../src/core/market';
import { GOODS } from '../src/core/types';
import { RULES } from '../src/data/rules';
import { cityFrom } from './helpers';

const state = newGame(cityFrom(['###', '#.G', '###']), 1, RULES.balance);
const { season, drift } = RULES.balance.market;

describe('market prices', () => {
  it('follow the seasons, within the year’s drift', () => {
    for (const g of GOODS) {
      for (let turn = 0; turn < 40; turn++) {
        const f = priceFactor(state, RULES, g, turn);
        const usual = season[g][turn % 4]!;
        expect(f).toBeGreaterThanOrEqual(usual * (1 - drift) - 1e-9);
        expect(f).toBeLessThanOrEqual(usual * (1 + drift) + 1e-9);
      }
    }
  });

  it('make cloth dear in winter and beer dear in summer', () => {
    expect(season.cloth[3]).toBeGreaterThan(season.cloth[1]);
    expect(season.beer[1]).toBeGreaterThan(season.beer[3]);
  });

  it('stay the same for the same town and year, and change from year to year', () => {
    expect(priceFactor(state, RULES, 'cloth', 5)).toBe(priceFactor(state, RULES, 'cloth', 5));
    const years = new Set(
      Array.from({ length: 12 }, (_, y) => priceFactor(state, RULES, 'cloth', y * 4).toFixed(4)),
    );
    expect(years.size).toBeGreaterThan(1);
  });

  it('average out to about the usual price', () => {
    for (const g of GOODS) {
      let sum = 0;
      for (let turn = 0; turn < 400; turn++) sum += priceFactor(state, RULES, g, turn);
      expect(sum / 400).toBeGreaterThan(0.9);
      expect(sum / 400).toBeLessThan(1.15);
    }
  });

  it('never drop to nothing', () => {
    for (const g of GOODS) expect(goodPrice(state, RULES, 1, g, 1)).toBeGreaterThanOrEqual(1);
    expect(goodPrice(state, RULES, 0, 'cloth')).toBe(0);
  });
});
