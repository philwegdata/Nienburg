import { describe, expect, it } from 'vitest';
import { buildingAt, lockOf, placeBuilding, population, repair } from '../src/core/actions';
import { goalProgress } from '../src/core/goals';
import { indexOf } from '../src/core/grid';
import { deserialize, SAVE_VERSION, serialize } from '../src/core/save';
import { analyze, houseCapacity, missingNeeds } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import type { GameState, Goal, HouseData } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { RULES } from '../src/data/rules';
import { cityFrom, fillWith, put, richGame } from './helpers';

// Open field: buildable x 1..24, y 1..12, gate above (1, 1).
const FIELD = [
  '#G########################',
  ...Array<string>(12).fill('#........................#'),
  '##########################',
];

const field = (): GameState => richGame(FIELD);
const turns = (state: GameState, n: number, goals: readonly Goal[] = []): GameState => {
  let next = state;
  for (let i = 0; i < n; i++) next = endTurn(next, RULES, goals);
  return next;
};
const setHouse = (state: GameState, x: number, y: number, house: HouseData): GameState => {
  const b = buildingAt(state, x, y)!;
  return { ...state, buildings: { ...state.buildings, [b.id]: { ...b, house } } };
};
const appealAt = (state: GameState, x: number, y: number) =>
  analyze(state, RULES).appeal[indexOf(state.width, x, y)];
const ctx = { hungry: false, goodsTypes: 3 };

describe('appeal', () => {
  it('radiates from a building over its radius, corners included', () => {
    const state = put(field(), 'garden', 10, 6); // +2, radius 2
    expect(appealAt(state, 10, 6)).toBe(2);
    expect(appealAt(state, 12, 8)).toBe(2);
    expect(appealAt(state, 13, 6)).toBe(0);
    expect(appealAt(state, 10, 9)).toBe(0);
  });

  it('measures the radius from the edge of large buildings', () => {
    const state = put(field(), 'tannery', 10, 6); // 2×2, −4, radius 4
    expect(appealAt(state, 6, 6)).toBe(-4);
    expect(appealAt(state, 15, 11)).toBe(-4);
    expect(appealAt(state, 5, 6)).toBe(0);
    expect(appealAt(state, 16, 6)).toBe(0);
  });

  it('counts the same kind of building at most twice per tile', () => {
    let state = field();
    for (const x of [8, 9, 10, 11]) state = put(state, 'garden', x, 6);
    expect(appealAt(state, 9, 5)).toBe(4);
    // Different kinds still add up.
    state = put(state, 'tree', 9, 4);
    expect(appealAt(state, 9, 5)).toBe(5);
  });

  it('adds up pleasant and unpleasant neighbours', () => {
    let state = put(field(), 'garden', 10, 6);
    state = put(state, 'tannery', 13, 6);
    expect(appealAt(state, 10, 5)).toBe(-2);
  });

  it('ignores buildings that are still under construction', () => {
    let state = put(field(), 'townhall', 1, 1);
    state = put(state, 'cathedral', 10, 3);
    expect(appealAt(state, 9, 3)).toBe(0);
  });

  it('takes two points off houses with fewer than two open sides', () => {
    // A terrace along a street: the end houses have an open side, the middle one does not…
    let state = fillWith(field(), 'street', 5, 7, 9, 7);
    state = fillWith(state, 'house', 5, 6, 7, 6);
    state = fillWith(state, 'house', 5, 5, 7, 5);
    let a = analyze(state, RULES);
    const middle = buildingAt(state, 6, 6)!.id;
    const corner = buildingAt(state, 7, 6)!.id;
    expect(a.boxedIn.has(middle)).toBe(true);
    expect(a.houseAppeal.get(middle)).toBe(-2);
    expect(a.boxedIn.has(corner)).toBe(false);
    expect(a.houseAppeal.get(corner)).toBe(0);
    // …until a little green replaces the house behind it.
    const behind = buildingAt(state, 6, 5)!;
    const buildings = { ...state.buildings };
    delete buildings[behind.id];
    state = {
      ...state,
      buildings,
      occupancy: state.occupancy.map((id) => (id === behind.id ? 0 : id)),
    };
    state = put(state, 'tree', 6, 5);
    a = analyze(state, RULES);
    expect(a.boxedIn.has(middle)).toBe(false);
    expect(a.houseAppeal.get(middle)).toBe(1);
    expect(missingNeeds(RULES, a, middle, 3, ctx)).not.toContain('appeal1');
    expect(missingNeeds(RULES, a, middle, 5, ctx)).toContain('appeal2');
  });
});

describe('unlocking', () => {
  it('opens buildings once the town has ever been large enough', () => {
    const chapel = BUILDINGS.chapel!;
    const young = { ...field(), peakPop: 19 };
    expect(lockOf(young, chapel)).toEqual({ kind: 'pop', value: 20 });
    expect(placeBuilding(young, BUILDINGS, chapel, 5, 5)).toEqual({ ok: false, reason: 'locked' });
    expect(lockOf({ ...young, peakPop: 20 }, chapel)).toBeNull();
    expect(lockOf(young, BUILDINGS.house!)).toBeNull();
  });

  it('remembers the peak even if people move away again', () => {
    let state = fillWith({ ...field(), peakPop: 0 }, 'street', 1, 2, 10, 2);
    state = fillWith(state, 'house', 1, 1, 10, 1);
    state = turns(state, 3);
    expect(state.peakPop).toBe(40);
    expect(state.lastReport?.unlocked).toEqual([]);
    // Cut every house off from the street: they empty, but the unlocks stay.
    const kept = Object.values(state.buildings).filter((b) => b.def !== 'street');
    const ids = new Set(kept.map((b) => b.id));
    state = {
      ...state,
      buildings: Object.fromEntries(kept.map((b) => [b.id, b])),
      occupancy: state.occupancy.map((id) => (ids.has(id) ? id : 0)),
    };
    state = endTurn(state, RULES);
    expect(population(state)).toBe(0);
    expect(state.peakPop).toBe(40);
  });

  it('announces what a growing town can newly build', () => {
    let state = fillWith({ ...field(), peakPop: 0 }, 'street', 1, 2, 10, 2);
    state = fillWith(state, 'house', 1, 1, 10, 1);
    const after = endTurn(state, RULES); // 10 houses × 2 = 20 inhabitants
    expect(after.peakPop).toBe(20);
    expect(after.lastReport?.unlocked.sort()).toEqual(
      ['chapel', 'firewatch', 'garden', 'granary', 'warehouse'].sort(),
    );
  });

  it('makes some buildings wait for a finished town hall', () => {
    const school = BUILDINGS.school!;
    expect(lockOf(field(), school)).toEqual({ kind: 'requires', def: 'townhall' });
    expect(lockOf(put(field(), 'townhall', 1, 1), school)).toBeNull();
  });

  it('allows only one town hall', () => {
    const state = put(field(), 'townhall', 1, 1);
    expect(lockOf(state, BUILDINGS.townhall!)).toEqual({ kind: 'unique' });
    expect(placeBuilding(state, BUILDINGS, BUILDINGS.townhall!, 10, 5)).toEqual({
      ok: false,
      reason: 'locked',
    });
  });
});

describe('long building projects', () => {
  function site(): GameState {
    let state = put(field(), 'street', 1, 1);
    state = put(state, 'townhall', 2, 1);
    return put(state, 'cathedral', 6, 1);
  }
  const cathedral = (state: GameState) => buildingAt(state, 6, 1)!;

  it('start as a building site that does nothing yet and costs no upkeep', () => {
    const state = site();
    expect(cathedral(state).construction).toBe(8);
    const a = analyze(state, RULES);
    expect(a.idle.get(cathedral(state).id)).toBe('construction');
    expect(a.covered.faith.size).toBe(0);
    expect(endTurn(state, RULES).lastReport?.upkeep).toBe(BUILDINGS.townhall!.upkeep);
  });

  it('advance one step per turn for gold and materials, then stand finished', () => {
    const start = { ...site(), materials: 1000 };
    const one = endTurn(start, RULES);
    expect(cathedral(one).construction).toBe(7);
    expect(one.lastReport?.constructionCost).toBe(60);
    expect(start.materials + one.lastReport!.materialsDelivered - one.materials).toBe(25);

    const done = turns(start, 8);
    expect(cathedral(done).construction).toBeUndefined();
    expect(done.lastReport?.completed).toEqual(['cathedral']);
    expect(goalProgress(done, { kind: 'building', def: 'cathedral' }).done).toBe(true);
    expect(turns(done, 1).lastReport?.completed).toEqual([]);
  });

  it('rest without loss while the town cannot pay', () => {
    const broke = endTurn({ ...site(), gold: 0, materials: 1000 }, RULES);
    expect(cathedral(broke).construction).toBe(8);
    expect(broke.lastReport?.hints.map((h) => h.kind)).toContain('stalled');
    expect(broke.lastReport?.constructionCost).toBe(0);
    expect(goalProgress(broke, { kind: 'building', def: 'cathedral' }).done).toBe(false);
  });
});

describe('fire', () => {
  /** Twenty inhabited houses along a street, nothing to protect them. */
  function tinderbox(seed: number): GameState {
    let state = fillWith(field(), 'street', 1, 2, 20, 2);
    state = fillWith(state, 'house', 1, 1, 20, 1);
    for (let x = 1; x <= 20; x++) state = setHouse(state, x, 1, { level: 1, pop: 4, lacking: 0 });
    return { ...state, rng: seed, turn: RULES.balance.fire.quietTurns };
  }
  const damaged = (state: GameState) => Object.values(state.buildings).filter((b) => b.damaged);

  it('spares a young town', () => {
    const state = turns({ ...tinderbox(1), turn: 0 }, RULES.balance.fire.quietTurns);
    expect(damaged(state)).toEqual([]);
  });

  it('blackens at most one unprotected building per turn and destroys nothing', () => {
    let state = tinderbox(1);
    const count = Object.keys(state.buildings).length;
    let fires = 0;
    for (let i = 0; i < 40; i++) {
      const before = damaged(state).length;
      state = endTurn(state, RULES);
      const now = damaged(state).length;
      expect(now - before).toBeLessThanOrEqual(1);
      if (state.lastReport?.fire) {
        fires++;
        expect(now - before).toBe(1);
        expect(buildingAt(state, state.lastReport.fire.x, state.lastReport.fire.y)?.damaged).toBe(
          true,
        );
      }
    }
    expect(fires).toBeGreaterThan(0);
    expect(Object.keys(state.buildings)).toHaveLength(count);
    expect(population(state)).toBe(80);
  });

  it('is decided by the seed alone', () => {
    const history = (seed: number) => {
      let state = tinderbox(seed);
      const log: string[] = [];
      for (let i = 0; i < 40; i++) {
        state = endTurn(state, RULES);
        if (state.lastReport?.fire) log.push(`${i}:${state.lastReport.fire.x}`);
      }
      return log.join(' ');
    };
    expect(history(7)).toBe(history(7));
    expect(history(7)).not.toBe(history(8));
  });

  it('never touches buildings a fire watch covers', () => {
    let state = tinderbox(1);
    state = put(state, 'firewatch', 10, 3);
    state = put(state, 'firewatch', 3, 3);
    state = put(state, 'firewatch', 17, 3);
    expect(damaged(turns(state, 60))).toEqual([]);
  });

  it('puts damaged workshops out of use and keeps damaged houses from rising', () => {
    let state = put(put(field(), 'street', 5, 5), 'bakery', 5, 6);
    const bakery = buildingAt(state, 5, 6)!;
    state = {
      ...state,
      buildings: { ...state.buildings, [bakery.id]: { ...bakery, damaged: true } },
    };
    expect(analyze(state, RULES).idle.get(bakery.id)).toBe('damaged');
    expect(endTurn(state, RULES).lastReport?.hints.map((h) => h.kind)).toContain('damaged');
  });

  it('is repaired for gold and a build point', () => {
    let state = put(put(field(), 'street', 5, 5), 'bakery', 5, 6);
    const bakery = buildingAt(state, 5, 6)!;
    expect(repair(state, BUILDINGS, 0.3, 5, 6)).toEqual({ ok: false, reason: 'nothing' });
    state = {
      ...state,
      buildings: { ...state.buildings, [bakery.id]: { ...bakery, damaged: true } },
    };
    expect(repair({ ...state, gold: 14 }, BUILDINGS, 0.3, 5, 7)).toEqual({
      ok: false,
      reason: 'noGold',
    });
    expect(repair({ ...state, buildPoints: 0 }, BUILDINGS, 0.3, 5, 7)).toEqual({
      ok: false,
      reason: 'noBuildPoints',
    });
    const result = repair(state, BUILDINGS, 0.3, 5, 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(buildingAt(result.state, 5, 6)?.damaged).toBeUndefined();
    expect(state.gold - result.state.gold).toBe(15); // 30 % of 50
    expect(state.buildPoints - result.state.buildPoints).toBe(1);
  });
});

describe('workshops and trade', () => {
  /** A street with enough residents to staff everything along it. */
  function quarter(): GameState {
    let state = fillWith(field(), 'street', 1, 6, 24, 6);
    state = fillWith(state, 'house', 1, 7, 10, 7);
    for (let x = 1; x <= 10; x++) state = setHouse(state, x, 7, { level: 2, pop: 7, lacking: 0 });
    return state;
  }

  it('make goods every turn; a guild hall next door adds half', () => {
    let state = put(quarter(), 'townhall', 20, 3);
    state = put(state, 'weaver', 2, 4);
    state = put(state, 'smithy', 10, 4);
    expect(analyze(state, RULES).production).toEqual({ cloth: 4, tools: 4, beer: 0 });
    state = put(state, 'guildhall', 4, 3);
    expect(analyze(state, RULES).production).toEqual({ cloth: 6, tools: 4, beer: 0 });
    expect(endTurn(state, RULES).goods).toEqual({ cloth: 6, tools: 4, beer: 0 });
  });

  it('sell what no longer fits into storage', () => {
    const state = put(quarter(), 'weaver', 2, 4);
    const full = { ...state, goods: { cloth: RULES.balance.goodsCap - 1, tools: 0, beer: 0 } };
    const after = endTurn(full, RULES);
    expect(after.goods.cloth).toBe(RULES.balance.goodsCap);
    expect(after.lastReport?.tradeIncome).toBe(3 * RULES.balance.goodsPrice);
  });

  it('earn gold directly at the tannery, and bread at the bakery', () => {
    let state = put(quarter(), 'tannery', 2, 4);
    state = put(state, 'bakery', 6, 4);
    const a = analyze(state, RULES);
    expect(a.goldYield).toBe(25);
    expect(a.foodYield).toBe(12);
    expect(endTurn(state, RULES).lastReport?.tradeIncome).toBe(25);
  });

  it('offer a kind of goods only while the stock covers what the houses want', () => {
    let state = put(quarter(), 'markethall', 12, 7);
    state = setHouse(state, 1, 7, { level: 4, pop: 200, lacking: 0 }); // wants 3 of each kind
    expect(analyze(state, RULES).goodsDemand).toBe(3);
    const after = endTurn({ ...state, goods: { cloth: 10, tools: 2, beer: 3 } }, RULES);
    expect(after.lastReport?.goodsTypes).toBe(2);
    expect(after.goods).toEqual({ cloth: 7, tools: 2, beer: 0 });
  });

  it('let a bath house work only with water within reach', () => {
    let state = put(quarter(), 'bathhouse', 2, 4);
    const bath = buildingAt(state, 2, 4)!.id;
    expect(analyze(state, RULES).idle.get(bath)).toBe('needsWater');
    state = put(state, 'well', 4, 5);
    const a = analyze(state, RULES);
    expect(a.idle.has(bath)).toBe(false);
    expect(a.covered.health.size).toBeGreaterThan(0);
  });

  it('raise taxes with a town hall and build points with a builders’ yard', () => {
    const plain = endTurn(quarter(), RULES);
    let state = put(quarter(), 'townhall', 2, 3);
    state = put(state, 'buildersyard', 6, 4);
    const after = endTurn(state, RULES);
    expect(after.lastReport!.taxes).toBe(Math.floor(70 * 0.25 * 1.2));
    expect(plain.lastReport!.taxes).toBe(Math.floor(70 * 0.25));
    expect(after.buildPoints).toBe(RULES.balance.buildPointsPerTurn + 10);
  });
});

describe('goals', () => {
  it('measure population, houses of a level and finished buildings', () => {
    let state = fillWith(field(), 'street', 1, 2, 5, 2);
    state = fillWith(state, 'house', 1, 1, 3, 1);
    state = setHouse(state, 1, 1, { level: 4, pop: 16, lacking: 0 });
    state = setHouse(state, 2, 1, { level: 2, pop: 7, lacking: 0 });
    expect(goalProgress(state, { kind: 'population', value: 20 })).toEqual({
      current: 20,
      target: 20,
      done: true,
    });
    expect(goalProgress(state, { kind: 'houses', level: 2, count: 3 })).toMatchObject({
      current: 2,
      done: false,
    });
    expect(goalProgress(state, { kind: 'building', def: 'chapel' }).done).toBe(false);
    expect(goalProgress(put(state, 'chapel', 5, 3), { kind: 'building', def: 'chapel' }).done).toBe(
      true,
    );
  });

  it('award each star once, in the turn its goal is reached, and keep it', () => {
    const goals = cityFrom(FIELD).goals; // 10 inhabitants, two houses of level 2, a chapel
    let state = fillWith(field(), 'street', 1, 2, 6, 2);
    state = fillWith(state, 'house', 1, 1, 6, 1);
    state = endTurn(state, RULES, goals);
    expect(state.stars).toEqual([true, false, false]);
    expect(state.lastReport?.newStars).toEqual([0]);
    state = endTurn(state, RULES, goals);
    expect(state.lastReport?.newStars).toEqual([]);
    state = put(state, 'chapel', 8, 3);
    state = endTurn(state, RULES, goals);
    expect(state.stars).toEqual([true, false, true]);
    expect(state.lastReport?.newStars).toEqual([2]);
    // Losing the chapel again does not take the star away.
    const chapel = buildingAt(state, 8, 3)!;
    const buildings = { ...state.buildings };
    delete buildings[chapel.id];
    state = endTurn({ ...state, buildings }, RULES, goals);
    expect(state.stars).toEqual([true, false, true]);
  });
});

describe('a complete quarter', () => {
  /** Everything a patrician could wish for, along one street. */
  function quarter(): GameState {
    let s = fillWith(field(), 'street', 1, 6, 24, 6);
    s = fillWith(s, 'street', 1, 1, 1, 5); // up to the gate
    s = fillWith(s, 'house', 4, 5, 13, 5);
    s = fillWith(s, 'tree', 4, 4, 13, 4);
    s = put(put(s, 'fountain', 5, 3), 'fountain', 10, 3);
    // What the first levels need, oldest first so it is staffed first.
    s = put(s, 'cistern', 3, 7);
    s = put(put(s, 'plaza', 6, 7), 'stall', 7, 7);
    s = put(s, 'chapel', 12, 7);
    s = put(s, 'firewatch', 13, 7);
    s = put(s, 'granary', 22, 4);
    s = put(s, 'bakery', 24, 4);
    // Burgher houses: entertainment, health, goods.
    s = put(s, 'tavern', 11, 7);
    s = put(s, 'bathhouse', 15, 7);
    s = put(s, 'markethall', 8, 7);
    s = put(s, 'weaver', 14, 4);
    s = put(s, 'brewery', 18, 4);
    // Patricians: order, education, a second kind of goods.
    s = put(s, 'nightwatch', 14, 7);
    s = put(s, 'townhall', 20, 7);
    s = put(s, 'school', 17, 7);
    s = put(s, 'guildhall', 16, 3);
    s = put(s, 'smithy', 20, 4);
    return s;
  }

  it('grows from empty plots to merged patrician houses and stays there', () => {
    let state = turns(quarter(), 45);
    const houses = Object.values(state.buildings).filter((b) => b.house);
    expect(houses).toHaveLength(5);
    for (const b of houses) {
      expect(b.w * b.h).toBe(2);
      expect(b.house).toEqual({ level: 5, pop: 49, lacking: 0 });
      expect(houseCapacity(RULES, b, 5)).toBe(49);
    }
    // Every tile of a merged house belongs to it.
    expect(buildingAt(state, 4, 5)!.id).toBe(buildingAt(state, 5, 5)!.id);
    expect(goalProgress(state, { kind: 'houses', level: 5, count: 10 }).done).toBe(true);
    expect(analyze(state, RULES).idle.size).toBe(0);

    state = turns(state, 40);
    expect(population(state)).toBe(245);
    expect(state.lastReport).toMatchObject({ hungry: false, downgraded: 0, goodsTypes: 3 });
    expect(Object.values(state.buildings).some((b) => b.damaged)).toBe(false);
  });

  it('reports each merge once', () => {
    let state = quarter();
    let merged = 0;
    for (let i = 0; i < 45; i++) {
      state = endTurn(state, RULES);
      merged += state.lastReport!.merged;
    }
    expect(merged).toBe(5);
  });
});

describe('saves from before craft goods existed', () => {
  it('are upgraded on load and can be played on', () => {
    let state = fillWith(field(), 'street', 1, 2, 6, 2);
    state = fillWith(state, 'house', 1, 1, 6, 1);
    state = turns(state, 2);
    const old: Record<string, unknown> = { ...state, version: 1 };
    delete old.goods;
    delete old.peakPop;
    delete old.stars;
    const restored = deserialize(JSON.stringify({ saveVersion: 1, state: old }), ['test']);
    expect(restored).not.toBeNull();
    expect(restored).toMatchObject({
      version: 2,
      goods: { cloth: 0, tools: 0, beer: 0 },
      peakPop: population(state),
      stars: [false, false, false],
    });
    expect(endTurn(restored!, RULES).turn).toBe(3);
    expect(JSON.parse(serialize(restored!)).saveVersion).toBe(SAVE_VERSION);
  });
});
