import { describe, expect, it } from 'vitest';
import { festivalError, festivalNow, holdFestival } from '../src/core/actions';
import { analyze } from '../src/core/sim/analyze';
import { deserialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = ['##########', '#........#', '#........G', '#........#', '##########'];
const fest = RULES.balance.festivals;
const plaza = RULES.balance.plazaPath;

function town(turn: number, withPlaza = true): GameState {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 7, 2);
  if (withPlaza) s = put(s, 'plaza', 8, 2);
  s = fillWith(s, 'house', 1, 1, 8, 1);
  for (const b of Object.values(s.buildings)) {
    if (b.house) s.buildings[b.id] = { ...b, house: { level: 1, pop: 1, lacking: 0 } };
  }
  return { ...s, turn };
}
const hold = (s: GameState) => {
  const r = holdFestival(s, BUILDINGS, fest.cost, plaza);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};

describe('festivals', () => {
  it('follow the seasons', () => {
    expect([0, 1, 2, 3].map((turn) => festivalNow(town(turn)))).toEqual([
      'mayday',
      'midsummer',
      'harvest',
      'wintermarket',
    ]);
  });

  it('need a plaza and the supplies, and happen once a season', () => {
    expect(festivalError(town(0, false), BUILDINGS, fest.cost, plaza)).toBe('noPlaza');
    expect(festivalError({ ...town(0), gold: 0 }, BUILDINGS, fest.cost, plaza)).toBe('noGold');
    expect(festivalError({ ...town(2), food: 0 }, BUILDINGS, fest.cost, plaza)).toBe('noFood');
    expect(festivalError({ ...town(1), materials: 0 }, BUILDINGS, fest.cost, plaza)).toBe(
      'noMaterials',
    );
    const held = hold(town(0));
    expect(festivalError(held, BUILDINGS, fest.cost, plaza)).toBe('already');
    expect(held.gold).toBe(town(0).gold - fest.cost.mayday.gold);
    expect(held.festival).toBe('mayday');
    expect(held.festivals).toBe(1);
  });

  it('last until the end of the turn and are reported', () => {
    const next = endTurn(hold(town(0)), RULES);
    expect(next.festival).toBeNull();
    expect(next.lastReport!.festival).toBe('mayday');
  });

  it('bring newcomers faster in May', () => {
    const people = (s: GameState) =>
      Object.values(s.buildings).reduce((n, b) => n + (b.house?.pop ?? 0), 0);
    expect(people(endTurn(hold(town(0)), RULES))).toBeGreaterThan(people(endTurn(town(0), RULES)));
  });

  it('raise the appeal of every house at midsummer', () => {
    const s = town(1);
    const id = Object.values(s.buildings).find((b) => b.house)!.id;
    const before = analyze(s, RULES).houseAppeal.get(id)!;
    expect(analyze(hold(s), RULES).houseAppeal.get(id)).toBe(before + fest.appeal);
  });

  it('fill the stores at harvest time', () => {
    const s = { ...town(2), food: 0 };
    const plain = endTurn(s, RULES).food;
    const feast = endTurn(hold({ ...s, food: fest.cost.harvest.food }), RULES).food;
    expect(feast).toBeGreaterThan(plain);
  });

  it('bring extra taxes at the winter market', () => {
    const s = town(3);
    expect(endTurn(hold(s), RULES).lastReport!.taxes).toBeGreaterThanOrEqual(
      endTurn(s, RULES).lastReport!.taxes,
    );
    const rich = { ...s, buildings: { ...s.buildings } };
    for (const b of Object.values(rich.buildings)) {
      if (b.house) rich.buildings[b.id] = { ...b, house: { level: 3, pop: 40, lacking: 0 } };
    }
    const plain = endTurn(rich, RULES).lastReport!.taxes;
    const feast = endTurn(hold(rich), RULES).lastReport!.taxes;
    // A fifth more, give or take the rounding.
    expect(feast).toBeGreaterThanOrEqual(Math.floor(plain * (1 + fest.tax)));
    expect(feast).toBeLessThanOrEqual(Math.ceil((plain + 1) * (1 + fest.tax)));
  });

  it('are free in a sandbox', () => {
    const s = { ...town(0), sandbox: true, gold: 0, food: 0 };
    expect(hold(s).gold).toBe(0);
  });

  it('start old saves without one', () => {
    const old: Record<string, unknown> = { ...town(0), version: 11 };
    delete old.festival;
    delete old.festivals;
    const back = deserialize(JSON.stringify({ saveVersion: 11, state: old }), ['test']);
    expect(back).toMatchObject({ version: 13, festival: null, festivals: 0 });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(strings(lang).festival.name.harvest.length).toBeGreaterThan(0);
    }
  });
});
