import { describe, expect, it } from 'vitest';
import {
  buildingAt,
  buyLand,
  canPlace,
  countTiles,
  demolish,
  landError,
  landPrice,
  placeBuilding,
} from '../src/core/actions';
import { indexOf } from '../src/core/grid';
import { deserialize, serialize } from '../src/core/save';
import { analyze } from '../src/core/sim/analyze';
import { pathAt, pathDistances } from '../src/core/sim/coverage';
import { endTurn } from '../src/core/sim/turn';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

// A walled field with a gate in the east wall and countryside beyond it.
//           0123456789012
const MAP = [
  '#########    ',
  '#.......#    ',
  '#.......#    ',
  '#.......G    ',
  '#.......#    ',
  '#.......#  ~~',
  '#########  ~~',
];
const town = (): GameState => richGame(MAP);
const raze = (s: GameState, x: number, y: number) => demolish(s, BUILDINGS, 0.5, x, y);
const water = (s: GameState, x: number, y: number) =>
  analyze(s, RULES).covered.water.has(buildingAt(s, x, y)!.id);

describe('dug canals', () => {
  it('carry water from the wall to everything within two tiles, without any path', () => {
    let s = fillWith(town(), 'canal', 1, 3, 4, 3);
    s = put(s, 'house', 2, 1); // two tiles from the canal
    s = put(s, 'house', 6, 5); // two tiles from its end, diagonally
    s = put(s, 'house', 7, 1); // too far
    const a = analyze(s, RULES);
    expect(a.flowing.size).toBe(4);
    expect(a.dryCanals.size).toBe(0);
    expect(water(s, 2, 1)).toBe(true);
    expect(water(s, 6, 5)).toBe(true);
    expect(water(s, 7, 1)).toBe(false);
  });

  it('stay dry until they reach the wall, another flowing canal or a gate', () => {
    let s = fillWith(town(), 'canal', 3, 3, 5, 3);
    s = put(s, 'house', 4, 2);
    let a = analyze(s, RULES);
    expect(a.flowing.size).toBe(0);
    expect(a.dryCanals.size).toBe(3);
    expect(water(s, 4, 2)).toBe(false);
    expect(endTurn(s, RULES).lastReport!.hints).toContainEqual({
      kind: 'dryCanal',
      count: 3,
      x: 3,
      y: 3,
    });
    // Two more tiles link it to the western wall.
    s = fillWith(s, 'canal', 1, 3, 2, 3);
    a = analyze(s, RULES);
    expect(a.flowing.size).toBe(5);
    expect(a.dryCanals.size).toBe(0);
    expect(water(s, 4, 2)).toBe(true);
  });

  it('branch: a side arm flows as long as it joins the main canal', () => {
    let s = fillWith(town(), 'canal', 1, 3, 4, 3);
    s = fillWith(s, 'canal', 4, 4, 4, 5);
    expect(analyze(s, RULES).flowing.size).toBe(6);
    // Cut the link and the arm still flows, because it touches the southern wall itself.
    s = raze(s, 4, 4);
    expect(analyze(s, RULES).flowing.has(indexOf(s.width, 4, 5))).toBe(true);
    // An arm in the middle of town does not.
    let middle = fillWith(town(), 'canal', 1, 2, 3, 2);
    middle = put(middle, 'canal', 5, 3);
    expect(analyze(middle, RULES).dryCanals.size).toBe(1);
  });

  it('are not paths, need no path, and leave a house room to breathe', () => {
    let s = fillWith(town(), 'canal', 1, 3, 4, 3);
    expect(pathAt(s, RULES, 2, 3)).toBeNull();
    const a0 = analyze(s, RULES);
    expect(a0.idle.size).toBe(0);
    // A house between two others, wall behind it… and the canal in front.
    s = fillWith(s, 'house', 1, 2, 3, 2);
    s = fillWith(s, 'house', 1, 1, 3, 1);
    const a = analyze(s, RULES);
    expect(a.boxedIn.has(buildingAt(s, 2, 2)!.id)).toBe(true); // only the canal side is open
    expect(a.boxedIn.has(buildingAt(s, 3, 2)!.id)).toBe(false); // canal and free ground
  });

  it('let a bath house work', () => {
    let s = fillWith(town(), 'canal', 1, 4, 3, 4);
    s = fillWith(s, 'street', 1, 3, 7, 3);
    s = fillWith(s, 'house', 4, 4, 7, 4);
    for (let x = 4; x <= 7; x++) {
      const b = buildingAt(s, x, 4)!;
      s = {
        ...s,
        buildings: { ...s.buildings, [b.id]: { ...b, house: { level: 2, pop: 7, lacking: 0 } } },
      };
    }
    s = put(s, 'bathhouse', 2, 1);
    expect(analyze(s, RULES).idle.has(buildingAt(s, 2, 1)!.id)).toBe(false);
  });
});

describe('bridges over dug canals', () => {
  /** A canal down the middle with a street running up to it on both sides. */
  function split(): GameState {
    let s = fillWith(town(), 'canal', 4, 1, 4, 5);
    s = fillWith(s, 'street', 1, 3, 3, 3);
    s = fillWith(s, 'street', 5, 3, 7, 3);
    return s;
  }
  const crosses = (s: GameState) =>
    pathDistances(s, RULES, [{ x: 1, y: 3 }], 30).has(indexOf(s.width, 6, 3));

  it('replace the stretch of canal they span, and nothing else', () => {
    const s = split();
    const bridge = BUILDINGS.bridge!;
    expect(canPlace(s, BUILDINGS, bridge, 4, 3).ok).toBe(true);
    expect(canPlace(s, BUILDINGS, bridge, 2, 2)).toEqual({ ok: false, reason: 'notBuildable' });
    expect(canPlace(s, BUILDINGS, BUILDINGS.street!, 4, 3)).toEqual({
      ok: false,
      reason: 'occupied',
    });
    const bridged = put(s, 'bridge', 4, 3);
    expect(buildingAt(bridged, 4, 3)).toMatchObject({ def: 'bridge', overCanal: true });
    expect(canPlace(bridged, BUILDINGS, bridge, 4, 3)).toEqual({ ok: false, reason: 'same' });
  });

  it('carry the path across while the water keeps flowing underneath', () => {
    let s = split();
    expect(crosses(s)).toBe(false);
    s = put(s, 'bridge', 4, 3);
    expect(crosses(s)).toBe(true);
    const a = analyze(s, RULES);
    expect(a.flowing.size).toBe(5);
    expect(a.dryCanals.size).toBe(0);
  });

  it('give the canal back when they are torn down', () => {
    let s = put(split(), 'bridge', 4, 3);
    s = raze(s, 4, 3);
    expect(buildingAt(s, 4, 3)).toMatchObject({ def: 'canal' });
    expect(buildingAt(s, 4, 3)!.overCanal).toBeUndefined();
    expect(crosses(s)).toBe(false);
    expect(analyze(s, RULES).flowing.size).toBe(5);
    // The canal itself can then be filled in as usual.
    expect(buildingAt(raze(s, 4, 3), 4, 3)).toBeUndefined();
  });
});

describe('gates', () => {
  it('count as a stretch of path through the wall', () => {
    const s = town();
    expect(pathAt(s, RULES, 8, 3)).toBe('gate');
    expect(pathAt(s, RULES, 8, 2)).toBeNull();
    // A house right by the gate has its path.
    const a = analyze(put(s, 'house', 7, 3), RULES);
    expect(a.access.size).toBe(1);
  });
});

describe('buying land outside the walls', () => {
  const land = RULES.balance.land;

  it('is offered next to a gate, and then next to land already bought', () => {
    const s = town();
    expect(landError(s, 9, 3)).toBeNull();
    expect(landError(s, 10, 3)).toBe('notAdjacent');
    expect(landError(s, 9, 2)).toBe('notAdjacent');
    const one = buyLand(s, land, 9, 3);
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(landError(one.state, 10, 3)).toBeNull();
    expect(landError(one.state, 9, 2)).toBeNull();
    expect(landError(one.state, 9, 3)).toBe('notOutside');
  });

  it('never includes walls, water, the town itself or anything off the map', () => {
    const s = town();
    for (const [x, y] of [
      [8, 2],
      [8, 3],
      [3, 3],
      [11, 5],
      [13, 3],
      [-1, 3],
    ] as const) {
      expect(landError(s, x, y), `${x},${y}`).toBe('notOutside');
    }
  });

  it('costs more with every tile', () => {
    let s = town();
    const paid: number[] = [];
    for (const [x, y] of [
      [9, 3],
      [10, 3],
      [10, 2],
    ] as const) {
      const before = s.gold;
      expect(landPrice(s, land)).toBe(land.base + land.step * s.landBought);
      const r = buyLand(s, land, x, y);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
      paid.push(before - s.gold);
    }
    expect(paid).toEqual([land.base, land.base + land.step, land.base + 2 * land.step]);
    expect(s.landBought).toBe(3);
    expect(buyLand({ ...s, gold: 10 }, land, 11, 3)).toEqual({ ok: false, reason: 'noGold' });
  });

  it('turns countryside into building ground without touching the old state', () => {
    const s = town();
    const snapshot = JSON.stringify(s);
    const r = buyLand(s, land, 9, 3);
    expect(JSON.stringify(s)).toBe(snapshot);
    if (!r.ok) throw new Error(r.reason);
    expect(countTiles(r.state).buildable).toBe(countTiles(s).buildable + 1);
    expect(placeBuilding(r.state, BUILDINGS, BUILDINGS.house!, 9, 3).ok).toBe(true);
    expect(placeBuilding(s, BUILDINGS, BUILDINGS.house!, 9, 3).ok).toBe(false);
  });

  it('lets a suburb be supplied through the gate', () => {
    let s = town();
    for (const [x, y] of [
      [9, 3],
      [10, 3],
      [10, 2],
    ] as const) {
      const r = buyLand(s, land, x, y);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    // A well inside the walls, a street out through the gate, a house in the suburb.
    s = fillWith(s, 'street', 6, 3, 7, 3);
    s = fillWith(s, 'street', 9, 3, 10, 3);
    s = put(s, 'well', 7, 2);
    s = put(s, 'house', 10, 2);
    expect(water(s, 10, 2)).toBe(true);
    // And people move in.
    expect(buildingAt(endTurn(s, RULES), 10, 2)!.house!.pop).toBe(2);
  });

  it('survives saving and loading', () => {
    const r = buyLand(town(), land, 9, 3);
    if (!r.ok) throw new Error(r.reason);
    const back = deserialize(serialize(r.state), ['test']);
    expect(back).toEqual(r.state);
    expect(back!.terrain[indexOf(back!.width, 9, 3)]).toBe('buildable');
  });

  it('opens saves from before there was land to buy', () => {
    const old: Record<string, unknown> = { ...town(), version: 3 };
    delete old.landBought;
    const back = deserialize(JSON.stringify({ saveVersion: 3, state: old }), ['test']);
    expect(back).toMatchObject({ version: 4, landBought: 0 });
  });
});

describe('texts for canals and land', () => {
  it('exist in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.building.canal && t.buildingInfo.canal && t.toolLand).toBeTruthy();
      expect(t.hintLand).toContain('{n}');
      expect(Object.keys(t.landNo).sort()).toEqual(['noGold', 'notAdjacent', 'notOutside']);
      expect(t.hint.dryCanal).toHaveLength(2);
    }
  });
});
