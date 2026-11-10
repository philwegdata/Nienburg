import { describe, expect, it } from 'vitest';
import { buildingAt, population } from '../src/core/actions';
import { endTurn, forecast, seasonOf, yearOf } from '../src/core/sim/turn';
import type { GameState, HouseData } from '../src/core/types';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = [
  '#G####################',
  '#....................#',
  '#....................#',
  '#....................#',
  '######################',
];

const turns = (state: GameState, n: number): GameState => {
  let next = state;
  for (let i = 0; i < n; i++) next = endTurn(next, RULES);
  return next;
};

const houseAt = (state: GameState, x: number, y = 1): HouseData => buildingAt(state, x, y)!.house!;

function setHouse(state: GameState, x: number, house: HouseData): GameState {
  const b = buildingAt(state, x, 1)!;
  return { ...state, buildings: { ...state.buildings, [b.id]: { ...b, house } } };
}

/** Street along y = 2, ten houses above it at x 1..10. */
function street(): GameState {
  let state = fillWith(richGame(MAP), 'street', 1, 2, 20, 2);
  state = fillWith(state, 'house', 1, 1, 10, 1);
  return state;
}

/** The street plus well, market stall on a plaza, chapel and fire watch, all within reach. */
function fullService(): GameState {
  let state = street();
  state = put(state, 'well', 1, 3);
  state = put(state, 'well', 7, 3);
  state = put(state, 'plaza', 3, 3);
  state = put(state, 'stall', 4, 3);
  state = put(state, 'chapel', 5, 3, 1);
  state = put(state, 'firewatch', 8, 3);
  return state;
}

describe('calendar', () => {
  it('cycles through four seasons per year', () => {
    expect([0, 1, 2, 3, 4].map(seasonOf)).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
      'spring',
    ]);
    expect([0, 3, 4, 11].map(yearOf)).toEqual([1, 1, 2, 3]);
  });

  it('advances the turn, refills build points and does not mutate the old state', () => {
    const before = { ...street(), buildPoints: 3 };
    const snapshot = JSON.stringify(before);
    const after = endTurn(before, RULES);
    expect(after.turn).toBe(1);
    expect(after.buildPoints).toBe(RULES.balance.buildPointsPerTurn);
    expect(after.lastReport?.turn).toBe(0);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('moving in', () => {
  it('fills houses with a path step by step up to their capacity', () => {
    let state = street();
    expect(population(state)).toBe(0);
    state = endTurn(state, RULES);
    expect(houseAt(state, 1).pop).toBe(2);
    state = endTurn(state, RULES);
    expect(houseAt(state, 1).pop).toBe(3);
    state = endTurn(state, RULES);
    expect(houseAt(state, 1).pop).toBe(4);
    expect(endTurn(state, RULES).lastReport?.popAfter).toBe(40);
  });

  it('leaves houses without a path empty and says so', () => {
    const state = endTurn(put(richGame(MAP), 'house', 10, 3), RULES);
    expect(houseAt(state, 10, 3).pop).toBe(0);
    expect(state.lastReport?.hints).toEqual([{ kind: 'noRoad', count: 1, x: 10, y: 3 }]);
  });
});

describe('housing levels', () => {
  it('stays a hut without water and food, and reports what is missing', () => {
    const state = turns(street(), 4);
    expect(houseAt(state, 1).level).toBe(1);
    const kinds = state.lastReport!.hints.map((h) => h.kind).sort();
    expect(kinds).toEqual(['noFood', 'noWater']);
    expect(state.lastReport!.hints.find((h) => h.kind === 'noWater')?.count).toBe(10);
  });

  it('rises one level per turn once the needs are met, up to the top level', () => {
    let state = fullService();
    // Turn 1: nobody lives here yet, so the stall, chapel and fire watch stand idle.
    state = endTurn(state, RULES);
    expect(houseAt(state, 2).level).toBe(1);
    expect(state.lastReport?.hints.find((h) => h.kind === 'unstaffed')?.count).toBe(3);
    // From turn 2 the first residents staff them, but a hut must fill up before it grows.
    state = turns(state, 2);
    expect(houseAt(state, 2)).toMatchObject({ level: 1, pop: 4 });
    state = endTurn(state, RULES);
    expect(houseAt(state, 2).level).toBe(2);
    expect(state.lastReport?.upgraded).toBe(10);
    state = endTurn(state, RULES);
    expect(houseAt(state, 2)).toMatchObject({ level: 2, pop: 7 });
    state = endTurn(state, RULES);
    expect(houseAt(state, 2).level).toBe(3);
    state = turns(state, 5);
    expect(houseAt(state, 2)).toEqual({ level: 3, pop: 11, lacking: 0 });
    expect(state.lastReport?.hints).toEqual([]);
  });

  it('declines only after the grace period, one level at a time', () => {
    let state = turns(fullService(), 10);
    expect(houseAt(state, 2).level).toBe(3);
    // Tear down the chapel: faith is gone.
    const chapel = buildingAt(state, 5, 3)!;
    const buildings = { ...state.buildings };
    delete buildings[chapel.id];
    state = {
      ...state,
      buildings,
      occupancy: state.occupancy.map((id) => (id === chapel.id ? 0 : id)),
    };

    state = endTurn(state, RULES);
    expect(houseAt(state, 2)).toMatchObject({ level: 3, lacking: 1 });
    expect(state.lastReport?.downgraded).toBe(0);
    state = endTurn(state, RULES);
    expect(houseAt(state, 2)).toMatchObject({ level: 2, lacking: 0, pop: 7 });
    expect(state.lastReport?.downgraded).toBe(10);
    // Level 2 needs are still met, so it stays there.
    state = turns(state, 4);
    expect(houseAt(state, 2).level).toBe(2);
  });

  it('forgives a short gap in supply', () => {
    let state = turns(fullService(), 10);
    state = setHouse(state, 2, { level: 3, pop: 11, lacking: 1 });
    state = endTurn(state, RULES);
    expect(houseAt(state, 2)).toEqual({ level: 3, pop: 11, lacking: 0 });
  });
});

describe('food', () => {
  it('delivers through the gate up to the storage limit and reports the overflow', () => {
    const empty = { ...richGame(MAP), food: 0 };
    const one = endTurn(empty, RULES);
    expect(one.food).toBe(15);
    expect(one.lastReport).toMatchObject({ foodDelivered: 15, foodWasted: 0 });

    const nearlyFull = endTurn({ ...empty, food: 55 }, RULES);
    expect(nearlyFull.food).toBe(60);
    expect(nearlyFull.lastReport).toMatchObject({ foodDelivered: 5, foodWasted: 10 });
  });

  it('follows the seasons: rich autumn, lean winter', () => {
    const at = (turn: number) =>
      endTurn({ ...richGame(MAP), food: 0, turn }, RULES).lastReport!.foodDelivered;
    expect([at(0), at(1), at(2), at(3)]).toEqual([15, 15, 23, 9]);
  });

  it('feeds everyone when there is enough, and more in winter', () => {
    let state = { ...street(), food: 50 };
    state = setHouse(state, 1, { level: 1, pop: 100, lacking: 0 });
    expect(forecast(state, RULES)).toMatchObject({ foodEaten: 8, hungry: false });
    expect(forecast({ ...state, turn: 3 }, RULES)).toMatchObject({ foodEaten: 10, hungry: false });
  });

  it('counts nobody as fed when the stores run dry', () => {
    let state = turns(fullService(), 10);
    expect(houseAt(state, 2).level).toBe(3);
    // Far more mouths than the gate can feed.
    state = setHouse({ ...state, food: 0 }, 1, { level: 3, pop: 5000, lacking: 0 });
    state = endTurn(state, RULES);
    expect(state.food).toBe(0);
    expect(state.lastReport?.hungry).toBe(true);
    expect(state.lastReport?.hints.map((h) => h.kind)).toContain('hungry');
    expect(houseAt(state, 2).lacking).toBe(1);
  });
});

describe('materials', () => {
  it('arrive every turn up to the storage limit', () => {
    const state = endTurn({ ...richGame(MAP), materials: 78 }, RULES);
    expect(state.materials).toBe(80);
    expect(state.lastReport).toMatchObject({ materialsDelivered: 2, materialsWasted: 3 });
  });
});

describe('treasury', () => {
  it('collects taxes per inhabitant and pays upkeep for every building', () => {
    let state = { ...street(), gold: 100 };
    state = put(state, 'well', 1, 3); // upkeep 2
    state = { ...setHouse(state, 1, { level: 1, pop: 4, lacking: 0 }), gold: 100 };
    const after = endTurn(state, RULES);
    // Nine new houses get 2 people each, the first stays at 4: 22 × 0.15 = 3.3 → 3.
    expect(after.lastReport).toMatchObject({ taxes: 3, upkeep: 2, subsidy: false });
    expect(after.gold).toBe(101);
  });

  it('never drops below zero: the sovereign covers the gap and it is counted', () => {
    let state = put(richGame(MAP), 'street', 1, 1);
    state = put(state, 'chapel', 2, 1); // has upkeep, but there is no income
    const after = endTurn({ ...state, gold: 1 }, RULES);
    expect(after.gold).toBe(0);
    expect(after.subsidies).toBe(1);
    expect(after.lastReport?.subsidy).toBe(true);
  });
});

describe('forecast', () => {
  it('matches what ending the turn then reports', () => {
    const state = turns(fullService(), 2);
    expect(forecast(state, RULES)).toEqual(endTurn(state, RULES).lastReport);
  });
});
