import { describe, expect, it } from 'vitest';
import { canPlace, isCountryside, outsideWalls } from '../src/core/actions';
import { indexOf } from '../src/core/grid';
import { deserialize } from '../src/core/save';
import { analyze } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = [
  '#########      ',
  '#.......#      ',
  '#.......G      ',
  '#.......#      ',
  '#.......#      ',
  '#########      ',
];

/** Makes the given outside tiles the town's own, as if bought. */
function own(state: GameState, tiles: [number, number][]): GameState {
  const terrain = state.terrain.slice();
  for (const [x, y] of tiles) terrain[indexOf(state.width, x, y)] = 'buildable';
  return { ...state, terrain };
}

/** People to work: two houses with ten inhabitants each. */
function staffed(state: GameState): GameState {
  const buildings = { ...state.buildings };
  for (const b of Object.values(buildings)) {
    if (b.house) buildings[b.id] = { ...b, house: { ...b.house, pop: 10 } };
  }
  return { ...state, buildings };
}

/** A town with a street to the gate, two houses, a bakery and land outside with a street. */
function farmTown(withField: boolean, turn = 2): GameState {
  let s = own(richGame(MAP), [
    [9, 2],
    [9, 3],
    [10, 2],
    [11, 2],
    [10, 3],
    [11, 3],
  ]);
  s = fillWith(s, 'street', 1, 2, 7, 2);
  s = fillWith(s, 'street', 9, 2, 9, 3);
  s = fillWith(s, 'house', 1, 1, 2, 1);
  s = put(s, 'bakery', 6, 3);
  if (withField) s = put(s, 'field', 10, 2);
  return { ...staffed(s), turn };
}

describe('countryside', () => {
  it('knows which tiles lie outside the walls', () => {
    const s = own(richGame(MAP), [[9, 2]]);
    const out = outsideWalls(s);
    expect(out[indexOf(s.width, 3, 2)]).toBe(0);
    expect(out[indexOf(s.width, 12, 4)]).toBe(1);
    expect(out[indexOf(s.width, 8, 2)]).toBe(0); // the gate itself
    expect(isCountryside(s, 9, 2)).toBe(true);
    expect(isCountryside(s, 3, 2)).toBe(false);
    // Open country that has not been bought is not building ground.
    expect(isCountryside(s, 12, 4)).toBe(false);
  });

  it('puts fields, pastures and woods only on bought land outside the walls', () => {
    const s = farmTown(false);
    for (const id of ['field', 'pasture', 'woodlot']) {
      const def = BUILDINGS[id]!;
      expect(canPlace(s, BUILDINGS, def, 3, 3).ok, id).toBe(false);
      expect(canPlace(s, BUILDINGS, def, 3, 3), id).toEqual({
        ok: false,
        reason: 'notCountryside',
      });
      expect(canPlace(s, BUILDINGS, def, 10, 2).ok, id).toBe(true);
      // Not on land that has not been bought.
      expect(canPlace(s, BUILDINGS, def, 12, 2).ok, id).toBe(false);
    }
  });

  it('harvests by the season', () => {
    const grain = (turn: number) => analyze(farmTown(true, turn), RULES).harvest.grain;
    const amount = BUILDINGS.field!.harvest!.amount;
    const season = RULES.balance.raw.season.grain;
    expect([0, 1, 2, 3].map(grain)).toEqual(season.map((f) => Math.round(amount * f)));
    expect(grain(3)).toBe(0);
  });

  it('lets a supplied workshop make more', () => {
    const without = analyze(farmTown(false), RULES);
    const supplied = analyze(farmTown(true), RULES);
    const bakery = BUILDINGS.bakery!;
    expect(without.foodYield).toBe(bakery.yields!.food);
    expect(supplied.foodYield).toBe(bakery.yields!.food! * (1 + bakery.consumes!.bonus));
    const id = Object.values(farmTown(true).buildings).find((b) => b.def === 'bakery')!.id;
    expect(without.supplied.get(id)).toBe(false);
    expect(supplied.supplied.get(id)).toBe(true);
    expect(supplied.rawUsed.grain).toBe(bakery.consumes!.amount);
  });

  it('keeps what is left in store for later seasons', () => {
    const s = farmTown(true);
    const a = analyze(s, RULES);
    const next = endTurn(s, RULES);
    expect(next.raw.grain).toBe(a.harvest.grain - a.rawUsed.grain);
    // In winter nothing grows, but the bakery lives on the stores.
    const winter = analyze({ ...next, turn: 3 }, RULES);
    expect(winter.harvest.grain).toBe(0);
    const id = Object.values(s.buildings).find((b) => b.def === 'bakery')!.id;
    expect(winter.supplied.get(id)).toBe(next.raw.grain >= BUILDINGS.bakery!.consumes!.amount);
  });

  it('sells what does not fit into storage', () => {
    const cap = RULES.balance.raw.cap;
    const s = { ...farmTown(true), raw: { grain: cap, wool: 0, wood: 0 } };
    const a = analyze(s, RULES);
    const next = endTurn(s, RULES);
    expect(next.raw.grain).toBe(cap);
    const sold = a.harvest.grain - a.rawUsed.grain;
    const plain = endTurn({ ...s, raw: { grain: 0, wool: 0, wood: 0 } }, RULES);
    expect(next.lastReport!.tradeIncome - plain.lastReport!.tradeIncome).toBe(
      sold * RULES.balance.raw.price,
    );
  });

  it('gives every raw material a use in town', () => {
    for (const farm of ['field', 'pasture', 'woodlot']) {
      const good = BUILDINGS[farm]!.harvest!.good;
      const users = Object.values(BUILDINGS).filter((d) => d.consumes?.good === good);
      expect(users.length, good).toBeGreaterThan(0);
    }
  });

  it('starts old saves with empty stores', () => {
    const old: Record<string, unknown> = { ...richGame(MAP), version: 5 };
    delete old.raw;
    const restored = deserialize(JSON.stringify({ saveVersion: 5, state: old }), ['test']);
    expect(restored).toMatchObject({ version: 10, raw: { grain: 0, wool: 0, wood: 0 } });
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      for (const g of ['grain', 'wool', 'wood'] as const)
        expect(t.raw[g].length).toBeGreaterThan(0);
      expect(t.category.farm.length).toBeGreaterThan(0);
    }
  });
});
