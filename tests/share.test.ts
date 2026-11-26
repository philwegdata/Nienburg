import { describe, expect, it } from 'vitest';
import { buyLand } from '../src/core/actions';
import { parseCity } from '../src/core/city';
import { packTown, unpackTown, type SharedTown } from '../src/core/share';
import { endTurn } from '../src/core/sim/turn';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { cityFrom, fillWith, put, richGame } from './helpers';

const MAP = ['#######   ', '#.....#   ', '#.....G   ', '#.....#   ', '#######   '];
const plan = parseCity(cityFrom(MAP)).terrain;

function town() {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 5, 2);
  s = put(s, 'well', 5, 1);
  s = fillWith(s, 'house', 1, 1, 3, 1);
  const bought = buyLand(s, RULES.balance.land, 7, 2);
  if (!bought.ok) throw new Error(bought.reason);
  return endTurn(endTurn(bought.state, RULES), RULES);
}

describe('sharing a town', () => {
  it('packs only what the plan cannot tell', () => {
    const s = town();
    const shared = packTown(s, plan);
    expect(shared.t).toEqual([[2 * 10 + 7, 'buildable']]);
    expect('occupancy' in shared.s).toBe(false);
    expect('terrain' in shared.s).toBe(false);
    expect(JSON.stringify(shared).length).toBeLessThan(JSON.stringify(s).length);
  });

  it('unpacks to the very same town', () => {
    const s = town();
    const back = unpackTown(JSON.parse(JSON.stringify(packTown(s, plan))) as SharedTown, plan, [
      'test',
    ]);
    expect(back).toEqual({ ...s, lastReport: null });
  });

  it('refuses what does not fit', () => {
    const shared = packTown(town(), plan);
    expect(unpackTown(shared, plan.slice(1), ['test'])).toBeNull();
    expect(unpackTown(shared, plan, ['elsewhere'])).toBeNull();
    expect(unpackTown({ ...shared, v: 999 }, plan, ['test'])).toBeNull();
    expect(unpackTown(null as unknown as SharedTown, plan, ['test'])).toBeNull();
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const)
      expect(strings(lang).share.receivedText).toContain('{n}');
  });
});
