import { describe, expect, it } from 'vitest';
import { placeBuilding, population } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { serialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import type { GameState } from '../src/core/types';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { nienburg } from '../src/data/cities/nienburg';
import { RULES } from '../src/data/rules';

type Order = [id: BuildingId, x: number, y: number];

function row(id: BuildingId, x0: number, x1: number, y: number): Order[] {
  const orders: Order[] = [];
  for (let x = x0; x <= x1; x++) orders.push([id, x, y]);
  return orders;
}

/** A sensible opening on the Nienburg map: main street between the gates, houses, services. */
const BUILD_ORDER: Order[] = [
  ...row('street', 7, 16, 12),
  ...row('house', 8, 12, 11),
  ['well', 10, 13],
  ...row('street', 17, 27, 12),
  ['plaza', 13, 13],
  ['stall', 14, 13],
  ...row('house', 13, 19, 11),
  ['well', 17, 13],
  ['firewatch', 15, 13],
  ['chapel', 12, 13],
  ...row('house', 20, 26, 11),
  ['well', 23, 13],
  ['plaza', 21, 13],
  ['stall', 22, 13],
];

/** Builds as far down the list as the town can afford each turn, then ends the turn. */
function play(turns: number): GameState {
  let state = newGame(nienburg, 12345, RULES.balance);
  let next = 0;
  for (let turn = 0; turn < turns; turn++) {
    while (next < BUILD_ORDER.length) {
      const [id, x, y] = BUILD_ORDER[next]!;
      const result = placeBuilding(state, BUILDINGS, BUILDINGS[id]!, x, y);
      if (!result.ok) {
        // Only running short may hold the bot up; a bad spot would be a bug in the script.
        expect(['noGold', 'noMaterials', 'noBuildPoints']).toContain(result.reason);
        break;
      }
      state = result.state;
      next++;
    }
    state = endTurn(state, RULES);
  }
  expect(next).toBe(BUILD_ORDER.length);
  return state;
}

function levels(state: GameState): number[] {
  const counts = [0, 0, 0];
  for (const b of Object.values(state.buildings)) {
    if (b.house) counts[b.house.level - 1]!++;
  }
  return counts;
}

describe('scripted playthrough on Nienburg', () => {
  it('grows from huts to half-timbered houses within 20 turns', () => {
    const state = play(20);
    expect(state.turn).toBe(20);
    expect(levels(state)).toEqual([0, 3, 16]);
    expect(population(state)).toBe(197);
    expect(state.subsidies).toBe(0);
    // The three houses furthest east are out of the chapel's reach and stay clay houses.
    expect({ gold: state.gold, food: state.food, materials: state.materials }).toEqual({
      gold: 572,
      food: 40,
      materials: 80,
    });
  });

  it('is deterministic', () => {
    expect(serialize(play(20))).toBe(serialize(play(20)));
  });

  it('keeps a comfortable town stable for years', () => {
    const state = play(60);
    expect(levels(state)).toEqual(levels(play(20)));
    expect(state.lastReport?.hungry).toBe(false);
    expect(state.lastReport?.downgraded).toBe(0);
    expect(state.subsidies).toBe(0);
    expect(state.gold).toBeGreaterThan(play(20).gold);
  });
});
