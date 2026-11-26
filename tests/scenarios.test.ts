import { describe, expect, it } from 'vitest';
import { buyLand, landError, lockOf } from '../src/core/actions';
import { validateCity } from '../src/core/city';
import { newScenario, scenarioCity } from '../src/core/scenario';
import { analyze } from '../src/core/sim/analyze';
import { BUILDINGS } from '../src/data/buildings';
import { CITIES } from '../src/data/cities';
import { strings } from '../src/data/i18n';
import { RULES, rulesFor } from '../src/data/rules';
import { SCENARIOS } from '../src/data/scenarios';
import { put } from './helpers';

const base = (id: string) => CITIES.find((c) => c.id === id)!;
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe('scenarios', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id} is built on a real city with three goals`, () => {
      const city = scenarioCity(sc, base(sc.city));
      expect(city.id).toBe(`scenario-${sc.id}`);
      expect(city.goals).toHaveLength(3);
      expect(validateCity(city)).toEqual([]);
      for (const goal of city.goals) {
        if (goal.kind === 'building') expect(BUILDINGS[goal.def], goal.def).toBeDefined();
      }
      for (const id of sc.banned ?? []) expect(BUILDINGS[id], id).toBeDefined();
    });
  }

  it('can forbid buildings', () => {
    const sc = scenario('canals');
    const s = newScenario(sc, base(sc.city), 1, RULES.balance);
    expect(lockOf(s, BUILDINGS.well!)).toEqual({ kind: 'banned' });
    expect(lockOf({ ...s, peakPop: 1000 }, BUILDINGS.cistern!)).toEqual({ kind: 'banned' });
    expect(lockOf(s, BUILDINGS.canal!)).toBeNull();
  });

  it('can forbid buying land', () => {
    const sc = scenario('island');
    const s = newScenario(sc, base(sc.city), 1, RULES.balance);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        expect(landError(s, x, y)).toBe('noLand');
      }
    }
    expect(buyLand(s, RULES.balance.land, 0, 0)).toEqual({ ok: false, reason: 'noLand' });
  });

  it('can let pilgrims leave gold at places of faith', () => {
    const sc = scenario('pilgrims');
    const city = scenarioCity(sc, base(sc.city));
    const rules = rulesFor(city);
    expect(rules.buildings.chapel!.yields?.gold).toBe(sc.modifiers!.shrineGold);
    expect(rulesFor(base(sc.city)).buildings.chapel!.yields?.gold).toBeUndefined();
    // A chapel with a path and people to work brings gold.
    let s = { ...newScenario(sc, base(sc.city), 1, rules.balance), peakPop: 1000 };
    const free = s.terrain.findIndex(
      (t, i) =>
        t === 'buildable' &&
        s.terrain[i + 1] === 'buildable' &&
        s.terrain[i + s.width] === 'buildable' &&
        s.terrain[i + s.width + 1] === 'buildable',
    );
    const x = free % s.width;
    const y = Math.floor(free / s.width);
    s = put(s, 'street', x, y);
    s = put(s, 'chapel', x + 1, y);
    s = put(s, 'house', x, y + 1);
    const house = Object.values(s.buildings).find((b) => b.house)!;
    s.buildings[house.id] = { ...house, house: { level: 2, pop: 30, lacking: 0 } };
    expect(analyze(s, rules).goldYield).toBeGreaterThanOrEqual(sc.modifiers!.shrineGold!);
  });

  it('has texts in both languages', () => {
    for (const sc of SCENARIOS) {
      expect(sc.name.de.length * sc.name.en.length).toBeGreaterThan(0);
    }
    for (const lang of ['de', 'en'] as const) {
      expect(strings(lang).lock.banned.length).toBeGreaterThan(0);
      expect(strings(lang).landNo.noLand.length).toBeGreaterThan(0);
    }
  });
});
