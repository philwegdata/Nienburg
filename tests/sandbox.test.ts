import { describe, expect, it } from 'vitest';
import { buildingAt, buyLand, lockOf, placeBuilding, repair } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { deserialize, serialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import type { GameState } from '../src/core/types';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { cityFrom } from './helpers';

const city = cityFrom([
  '#########    ',
  '#.......#    ',
  '#.......#    ',
  '#.......G    ',
  '#.......#    ',
  '#.......#    ',
  '#.......#    ',
  '#########    ',
]);
const sandbox = (): GameState => newGame(city, 1, RULES.balance, true);
const normal = (): GameState => newGame(city, 1, RULES.balance);

function put(s: GameState, id: BuildingId, x: number, y: number): GameState {
  const r = placeBuilding(s, BUILDINGS, BUILDINGS[id]!, x, y);
  if (!r.ok) throw new Error(`${id}: ${r.reason}`);
  return r.state;
}

describe('sandbox', () => {
  it('is a flag on a new game and absent otherwise', () => {
    expect(sandbox().sandbox).toBe(true);
    expect('sandbox' in normal()).toBe(false);
  });

  it('offers every building from the first turn', () => {
    const s = sandbox();
    for (const def of Object.values(BUILDINGS)) expect(lockOf(s, def), def.id).toBeNull();
    // In a normal game most of them are still locked.
    expect(lockOf(normal(), BUILDINGS.cathedral!)).not.toBeNull();
    expect(lockOf(normal(), BUILDINGS.towerhouse!)).toEqual({ kind: 'elsewhere' });
  });

  it('charges nothing for building, however much is built', () => {
    let s = sandbox();
    const before = { gold: s.gold, materials: s.materials, buildPoints: s.buildPoints };
    s = put(s, 'townhall', 1, 1);
    s = put(s, 'cathedral', 4, 1);
    for (let x = 1; x <= 3; x++) s = put(s, 'house', x, 5);
    expect({ gold: s.gold, materials: s.materials, buildPoints: s.buildPoints }).toEqual(before);
    // Even with an empty treasury.
    const broke = { ...sandbox(), gold: 0, materials: 0, buildPoints: 0 };
    expect(placeBuilding(broke, BUILDINGS, BUILDINGS.townhall!, 1, 1).ok).toBe(true);
    const poor = { ...normal(), peakPop: 999, gold: 0 };
    expect(placeBuilding(poor, BUILDINGS, BUILDINGS.townhall!, 1, 1)).toEqual({
      ok: false,
      reason: 'noGold',
    });
  });

  it('allows more than one of the one-of-a-kind buildings', () => {
    let s = put(sandbox(), 'townhall', 1, 1);
    s = put(s, 'townhall', 4, 1);
    expect(Object.values(s.buildings).filter((b) => b.def === 'townhall')).toHaveLength(2);
  });

  it('still obeys the map: no building on walls or on top of each other', () => {
    const s = put(sandbox(), 'house', 1, 1);
    expect(placeBuilding(s, BUILDINGS, BUILDINGS.house!, 1, 1)).toEqual({
      ok: false,
      reason: 'occupied',
    });
    expect(placeBuilding(s, BUILDINGS, BUILDINGS.house!, 0, 0)).toEqual({
      ok: false,
      reason: 'notBuildable',
    });
  });

  it('gives land and repairs away for free', () => {
    let s: GameState = { ...sandbox(), gold: 0, buildPoints: 0 };
    const land = buyLand(s, RULES.balance.land, 9, 3);
    expect(land.ok).toBe(true);
    if (land.ok) s = land.state;
    expect(s.gold).toBe(0);
    expect(s.landBought).toBe(1);
    s = put(s, 'bakery', 1, 1);
    const bakery = buildingAt(s, 1, 1)!;
    s = { ...s, buildings: { ...s.buildings, [bakery.id]: { ...bakery, damaged: true } } };
    const fixed = repair(s, BUILDINGS, RULES.balance.repairShare, 1, 1);
    expect(fixed.ok).toBe(true);
    if (fixed.ok) expect(buildingAt(fixed.state, 1, 1)!.damaged).toBeUndefined();
  });

  it('finishes long building projects without payment', () => {
    let s: GameState = {
      ...put(put(sandbox(), 'townhall', 1, 1), 'cathedral', 4, 1),
      gold: 0,
      materials: 0,
    };
    const turns = BUILDINGS.cathedral!.construction!.turns;
    for (let i = 0; i < turns; i++) s = endTurn(s, RULES, city.goals);
    expect(buildingAt(s, 4, 1)!.construction).toBeUndefined();
    expect(s.lastReport!.constructionCost).toBe(0);
  });

  it('plays on like any town, but never awards a star', () => {
    let s = sandbox();
    for (let x = 1; x <= 7; x++) s = put(s, 'street', x, 3);
    for (let x = 1; x <= 7; x++) s = put(s, 'house', x, 2);
    s = put(s, 'chapel', 1, 4);
    for (let i = 0; i < 6; i++) s = endTurn(s, RULES, city.goals);
    // The test city's goals (ten people, a chapel) are long met.
    expect(s.lastReport!.popAfter).toBeGreaterThan(10);
    expect(s.stars).toEqual([false, false, false]);
    expect(s.lastReport!.newStars).toEqual([]);
    // The same town in a normal game earns them.
    let n: GameState = { ...normal(), gold: 1e5, materials: 1e5, buildPoints: 1e5, peakPop: 1e5 };
    for (let x = 1; x <= 7; x++) n = put(n, 'street', x, 3);
    for (let x = 1; x <= 7; x++) n = put(n, 'house', x, 2);
    n = put(n, 'chapel', 1, 4);
    for (let i = 0; i < 6; i++) n = endTurn(n, RULES, city.goals);
    expect(n.stars[0]).toBe(true);
    expect(n.stars[2]).toBe(true);
  });

  it('keeps its flag through saving and loading', () => {
    const s = put(sandbox(), 'house', 1, 1);
    const back = deserialize(serialize(s), ['test']);
    expect(back).toEqual(s);
    expect(back!.sandbox).toBe(true);
    expect(deserialize(serialize(normal()), ['test'])!.sandbox).toBeUndefined();
  });

  it('is named and explained in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.sandbox && t.sandboxResume).toBeTruthy();
      expect(t.sandboxInfo.length).toBeGreaterThan(40);
    }
  });
});
