import { describe, expect, it } from 'vitest';
import { buildingAt } from '../src/core/actions';
import { indexOf } from '../src/core/grid';
import { analyze, missingNeeds } from '../src/core/sim/analyze';
import { borderTiles, pathDistances } from '../src/core/sim/coverage';
import type { GameState } from '../src/core/types';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

// One long corridor: buildable x 1..20, y 1..3. Gate above (1, 1).
const MAP = [
  '#G####################',
  '#....................#',
  '#....................#',
  '#....................#',
  '######################',
];

const corridor = (): GameState => richGame(MAP);
const dist = (state: GameState, d: Map<number, number>, x: number, y: number) =>
  d.get(indexOf(state.width, x, y));

describe('pathDistances', () => {
  it('counts one step per street tile and stops at the range', () => {
    const state = fillWith(corridor(), 'street', 1, 2, 20, 2);
    const d = pathDistances(state, RULES, [{ x: 1, y: 2 }], 5);
    expect(dist(state, d, 1, 2)).toBe(1);
    expect(dist(state, d, 5, 2)).toBe(5);
    expect(dist(state, d, 6, 2)).toBeUndefined();
  });

  it('counts alleys double', () => {
    const state = fillWith(corridor(), 'alley', 1, 2, 20, 2);
    const d = pathDistances(state, RULES, [{ x: 1, y: 2 }], 6);
    expect(dist(state, d, 3, 2)).toBe(6);
    expect(dist(state, d, 4, 2)).toBeUndefined();
  });

  it('treats plazas like streets and prefers the cheaper route', () => {
    // Top row: alley, bottom row: street, joined at both ends.
    let state = fillWith(corridor(), 'alley', 2, 1, 5, 1);
    state = fillWith(state, 'plaza', 1, 3, 6, 3);
    state = put(put(state, 'street', 1, 1), 'street', 1, 2);
    state = put(put(state, 'street', 6, 1), 'street', 6, 2);
    const d = pathDistances(state, RULES, [{ x: 1, y: 1 }], 50);
    expect(dist(state, d, 5, 1)).toBe(9); // street(1) + four alleys(8)
    expect(dist(state, d, 6, 3)).toBe(8); // street, street, six plaza tiles
  });

  it('does not cross gaps in the network', () => {
    let state = fillWith(corridor(), 'street', 1, 2, 4, 2);
    state = fillWith(state, 'street', 6, 2, 9, 2);
    const d = pathDistances(state, RULES, [{ x: 1, y: 2 }], 50);
    expect(dist(state, d, 4, 2)).toBe(4);
    expect(dist(state, d, 6, 2)).toBeUndefined();
  });
});

describe('borderTiles', () => {
  it('lists the tiles sharing an edge with the footprint, without corners', () => {
    const state = put(corridor(), 'chapel', 5, 1, 1); // 2×1 at (5,1)
    const b = buildingAt(state, 5, 1)!;
    const tiles = borderTiles(b).map((t) => `${t.x},${t.y}`);
    expect(tiles.sort()).toEqual(['4,1', '5,0', '5,2', '6,0', '6,2', '7,1'].sort());
  });
});

describe('analyze', () => {
  /** A street with a row of houses above it and service buildings below. */
  function town(): GameState {
    let state = fillWith(corridor(), 'street', 1, 2, 20, 2);
    state = fillWith(state, 'house', 1, 1, 20, 1);
    return state;
  }
  const houseId = (state: GameState, x: number) => buildingAt(state, x, 1)!.id;

  it('covers houses along the paths within the service range', () => {
    const state = put(town(), 'well', 1, 3); // range 6, enters the street at (1, 2)
    const a = analyze(state, RULES);
    expect(a.covered.water.has(houseId(state, 1))).toBe(true);
    expect(a.covered.water.has(houseId(state, 6))).toBe(true);
    expect(a.covered.water.has(houseId(state, 7))).toBe(false);
    expect(a.idle.size).toBe(0);
  });

  it('marks buildings without a path as idle and houses without a path as cut off', () => {
    let state = put(corridor(), 'well', 5, 3);
    state = put(state, 'house', 5, 2);
    const a = analyze(state, RULES);
    expect(a.idle.get(buildingAt(state, 5, 3)!.id)).toBe('noAccess');
    expect(a.access.has(buildingAt(state, 5, 2)!.id)).toBe(false);
    expect(missingNeeds(RULES, a, buildingAt(state, 5, 2)!.id, 1, false)).toEqual(['road']);
  });

  it('needs workers for staffed buildings, oldest building first', () => {
    // No inhabitants yet, so nobody can run a fire watch.
    let state = put(town(), 'firewatch', 1, 3);
    state = put(state, 'firewatch', 3, 3);
    let a = analyze(state, RULES);
    expect([...a.idle.values()]).toEqual(['unstaffed', 'unstaffed']);
    expect(a.workersNeeded).toBe(6);

    // Eight inhabitants give three workers: enough for the first watch only.
    const first = buildingAt(state, 1, 1)!;
    state = {
      ...state,
      buildings: {
        ...state.buildings,
        [first.id]: { ...first, house: { level: 1, pop: 8, lacking: 0 } },
      },
    };
    a = analyze(state, RULES);
    expect(a.workforce).toBe(3);
    expect(a.idle.has(buildingAt(state, 1, 3)!.id)).toBe(false);
    expect(a.idle.get(buildingAt(state, 3, 3)!.id)).toBe('unstaffed');
    expect(a.covered.fire.size).toBeGreaterThan(0);
  });

  it('lets market stalls work only next to a plaza', () => {
    let state = put(town(), 'stall', 10, 3);
    expect(analyze(state, RULES).idle.get(buildingAt(state, 10, 3)!.id)).toBe('needsPlaza');
    state = put(state, 'plaza', 11, 3);
    // Still idle, but now only for lack of workers.
    expect(analyze(state, RULES).idle.get(buildingAt(state, 10, 3)!.id)).toBe('unstaffed');
  });

  it('counts storage always, and extra deliveries only with a path to a gate', () => {
    const base = analyze(corridor(), RULES);
    expect(base.gates).toBe(1);
    expect(base.foodDelivery).toBe(RULES.balance.gateDelivery.food);

    // A granary on a street that does not reach the gate at (1, 0).
    let state = fillWith(corridor(), 'street', 5, 1, 9, 1);
    state = put(state, 'granary', 6, 2);
    const worker = put(state, 'house', 10, 1);
    const h = buildingAt(worker, 10, 1)!;
    state = {
      ...worker,
      buildings: {
        ...worker.buildings,
        [h.id]: { ...h, house: { level: 1, pop: 10, lacking: 0 } },
      },
    };
    let a = analyze(state, RULES);
    expect(a.foodCap).toBe(base.foodCap + 100);
    expect(a.idle.size).toBe(0);
    expect(a.foodDelivery).toBe(base.foodDelivery);

    state = fillWith(state, 'street', 1, 1, 4, 1);
    a = analyze(state, RULES);
    expect(a.foodDelivery).toBe(base.foodDelivery + 15);
  });
});
