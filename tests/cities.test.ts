import { describe, expect, it } from 'vitest';
import { PLANS, planTown, runBot } from '../scripts/bot';
import { buildingAt, canPlace, lockOf, placeBuilding } from '../src/core/actions';
import { newGame, parseCity, validateCity } from '../src/core/city';
import { goalProgress } from '../src/core/goals';
import { indexOf } from '../src/core/grid';
import { analyze } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import type { CityDef, GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { CITIES } from '../src/data/cities';
import { strings } from '../src/data/i18n';
import { RULES, rulesFor } from '../src/data/rules';
import { cityFrom, put, richGame } from './helpers';

const byId = (id: string): CityDef => CITIES.find((c) => c.id === id)!;
const rich = (city: CityDef): GameState => ({
  ...newGame(city, 1, RULES.balance),
  gold: 1e6,
  materials: 1e6,
  buildPoints: 1e6,
  peakPop: 1e5,
});

describe('the ten cities', () => {
  it('are all there, each with its own id and place on the map', () => {
    expect(CITIES).toHaveLength(10);
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(10);
    for (const c of CITIES) {
      expect(c.location.lat, c.id).toBeGreaterThan(-60);
      expect(c.location.lat, c.id).toBeLessThan(70);
      expect(Math.abs(c.location.lon), c.id).toBeLessThanOrEqual(180);
      expect(validateCity(c), c.id).toEqual([]);
      expect(c.blurb.de.length, c.id).toBeGreaterThan(30);
      expect(c.blurb.en.length, c.id).toBeGreaterThan(30);
    }
  });

  it('differ in size from the tiny island to the big square town', () => {
    const size = (id: string) =>
      parseCity(byId(id)).terrain.filter((t) => t === 'buildable').length;
    expect(size('montsaintmichel')).toBeLessThan(230);
    expect(size('pingyao')).toBeGreaterThan(450);
    expect(parseCity(byId('pingyao')).terrain.filter((t) => t === 'gate')).toHaveLength(6);
    expect(parseCity(byId('montsaintmichel')).terrain.filter((t) => t === 'gate')).toHaveLength(1);
  });

  it('have goals that only ask for buildings the town can build', () => {
    for (const c of CITIES) {
      for (const goal of c.goals) {
        if (goal.kind !== 'building') continue;
        const def = BUILDINGS[goal.def];
        expect(def, `${c.id}: ${goal.def}`).toBeDefined();
        expect(!def!.cities || def!.cities.includes(c.id), `${c.id}: ${goal.def}`).toBe(true);
        if (def!.unique) expect(goal.count ?? 1, c.id).toBe(1);
      }
    }
  });

  it('only rename buildings that exist, in both languages', () => {
    for (const c of CITIES) {
      for (const [id, name] of Object.entries(c.names ?? {})) {
        expect(BUILDINGS[id], `${c.id}: ${id}`).toBeDefined();
        expect(name.de && name.en, `${c.id}: ${id}`).toBeTruthy();
      }
      if (parseCity(c).terrain.includes('landmark')) {
        expect(c.landmarkName, c.id).toBeDefined();
      }
    }
  });
});

describe('canals and bridges', () => {
  // Two banks with a canal between them; the gate is on the western bank.
  const town = cityFrom(['#G#####', '#..=..#', '#..=..#', '#######']);
  const bruges = (): GameState => ({ ...richGame(town.map), cityId: 'bruges' });
  const bridge = BUILDINGS.bridge!;

  it('count land beyond a canal as reachable when checking a map', () => {
    expect(validateCity(town)).toEqual([]);
    expect(validateCity(cityFrom(['#G#####', '#..#..#', '#######'])).join()).toMatch(
      /cannot be reached/,
    );
  });

  it('take bridges on canals only, and nothing else there', () => {
    const s = bruges();
    expect(canPlace(s, BUILDINGS, bridge, 3, 1).ok).toBe(true);
    expect(canPlace(s, BUILDINGS, bridge, 2, 1)).toEqual({ ok: false, reason: 'notBuildable' });
    for (const id of ['street', 'house', 'well', 'tree']) {
      expect(canPlace(s, BUILDINGS, BUILDINGS[id]!, 3, 1), id).toEqual({
        ok: false,
        reason: 'notBuildable',
      });
    }
  });

  it('carry services and the gate link across the water', () => {
    let s = bruges();
    for (const x of [1, 2]) s = put(s, 'street', x, 1);
    for (const x of [4, 5]) s = put(s, 'street', x, 1);
    s = put(put(s, 'well', 1, 2), 'house', 5, 2);
    const house = buildingAt(s, 5, 2)!.id;
    expect(analyze(s, RULES).covered.water.has(house)).toBe(false);
    s = put(s, 'bridge', 3, 1);
    expect(analyze(s, RULES).covered.water.has(house)).toBe(true);
    // A bridge does not use up building land.
    expect(s.occupancy[indexOf(s.width, 3, 1)]).toBeGreaterThan(0);
    expect(s.terrain[indexOf(s.width, 3, 1)]).toBe('canal');
  });

  it('are offered in Bruges only', () => {
    expect(lockOf(rich(byId('bruges')), bridge)).toBeNull();
    expect(lockOf(rich(byId('nienburg')), bridge)).toEqual({ kind: 'elsewhere' });
    const elsewhere = { ...richGame(town.map), cityId: 'nienburg' };
    expect(placeBuilding(elsewhere, BUILDINGS, bridge, 3, 1)).toEqual({
      ok: false,
      reason: 'locked',
    });
  });

  it('let a house by the canal breathe', () => {
    // Houses left and right, wall behind, street in front… and the canal counts as open.
    let s = bruges();
    s = put(put(s, 'street', 1, 1), 'street', 2, 1);
    s = put(put(s, 'house', 1, 2), 'house', 2, 2);
    const a = analyze(s, RULES);
    expect(a.boxedIn.has(buildingAt(s, 2, 2)!.id)).toBe(false);
    expect(a.boxedIn.has(buildingAt(s, 1, 2)!.id)).toBe(true);
  });
});

describe('town specialities', () => {
  it('leave the general rules alone where a town has none', () => {
    expect(rulesFor(byId('nienburg'))).toBe(RULES);
    expect(rulesFor(byId('carcassonne'))).toBe(RULES);
  });

  it('pay merchants better in Dubrovnik', () => {
    const price = rulesFor(byId('dubrovnik')).buildings.kontor!.trade!.price;
    expect(price).toBe(Math.round(BUILDINGS.kontor!.trade!.price * 1.4));
    expect(BUILDINGS.kontor!.trade!.price).toBe(5);
  });

  it('make the tanneries of Fès earn more', () => {
    expect(rulesFor(byId('fes')).buildings.tannery!.yields!.gold).toBe(40);
    expect(BUILDINGS.tannery!.yields!.gold).toBe(25);
  });

  it('bring little through each of Pingyao’s many gates and much through the island’s only one', () => {
    const base = RULES.balance.gateDelivery;
    const perTurn = (id: string) => {
      const city = byId(id);
      return analyze(newGame(city, 1, RULES.balance), rulesFor(city)).foodDelivery;
    };
    expect(perTurn('pingyao')).toBe(6 * Math.round(base.food * 0.5));
    expect(perTurn('montsaintmichel')).toBe(2 * base.food);
    expect(perTurn('nienburg')).toBe(2 * base.food);
  });

  it('make it pleasant to live near Bhaktapur’s temple squares, and nowhere else by default', () => {
    const city = byId('bhaktapur');
    const s = newGame(city, 1, RULES.balance);
    const appeal = analyze(s, rulesFor(city)).appeal;
    // Temple at x 8..10, y 11..13.
    expect(appeal[indexOf(s.width, 7, 12)]).toBeGreaterThanOrEqual(2);
    expect(appeal[indexOf(s.width, 6, 12)]).toBeGreaterThanOrEqual(2);
    expect(appeal[indexOf(s.width, 13, 20)]).toBe(0);
    // The stacking limit applies to landmarks too.
    expect(Math.max(...appeal)).toBe(4);
    const carcassonne = byId('carcassonne');
    const plain = analyze(newGame(carcassonne, 1, RULES.balance), rulesFor(carcassonne)).appeal;
    expect(Math.max(...plain)).toBe(0);
  });

  it('offer family towers in San Gimignano only; they earn gold and raise the neighbourhood', () => {
    const tower = BUILDINGS.towerhouse!;
    const city = byId('sangimignano');
    expect(lockOf(rich(city), tower)).toBeNull();
    expect(lockOf(rich(byId('fes')), tower)).toEqual({ kind: 'elsewhere' });
    let s = rich(city);
    const spot = parseCity(city).terrain.indexOf('buildable') + s.width + 2;
    const [x, y] = [spot % s.width, Math.floor(spot / s.width)];
    const r = placeBuilding(s, BUILDINGS, tower, x, y);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Like every building, it needs a path next to it.
    expect(analyze(r.state, RULES).goldYield).toBe(0);
    const road = placeBuilding(r.state, BUILDINGS, BUILDINGS.alley!, x, y + 1);
    expect(road.ok).toBe(true);
    if (!road.ok) return;
    s = road.state;
    const a = analyze(s, RULES);
    expect(a.goldYield).toBe(tower.yields!.gold);
    expect(a.appeal[indexOf(s.width, x + 2, y)]).toBe(2);
    expect(a.idle.size).toBe(0);
  });
});

describe('goals that count buildings', () => {
  it('want that many finished ones', () => {
    const goal = { kind: 'building', def: 'well', count: 3 } as const;
    let s = richGame(['#G#####', '#.....#', '#######']);
    expect(goalProgress(s, goal)).toEqual({ current: 0, target: 3, done: false });
    s = put(put(s, 'well', 1, 1), 'well', 2, 1);
    expect(goalProgress(s, goal)).toMatchObject({ current: 2, done: false });
    s = put(s, 'well', 3, 1);
    expect(goalProgress(s, goal)).toMatchObject({ current: 3, done: true });
    expect(goalProgress(s, { kind: 'building', def: 'well' }).target).toBe(1);
  });

  it('award the star through play', () => {
    const goals = [goal('well', 2), goal('well', 9), goal('well', 9)] as const;
    let s = put(put(richGame(['#G#####', '#.....#', '#######']), 'well', 1, 1), 'well', 2, 1);
    s = endTurn(s, RULES, goals);
    expect(s.stars).toEqual([true, false, false]);
  });
});

function goal(def: string, count: number) {
  return { kind: 'building', def, count } as const;
}

describe('texts for the new towns', () => {
  it('name canals, bridges and towers in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.terrain.canal && t.building.bridge && t.building.towerhouse).toBeTruthy();
      expect(t.goal.buildings).toContain('{n}');
      // Hints no longer assume a European town.
      expect(t.hint.noFaith[1]).not.toMatch(/Kapelle|chapel/);
      expect(t.hint.noFun[1]).not.toMatch(/Schenke|tavern/);
    }
  });
});

describe('every city, played by the bot', () => {
  it.each(CITIES.map((c) => [c.id, c] as const))(
    '%s: the layout fits and the first star falls without help',
    (_id, city) => {
      const rules = rulesFor(city);
      const specs = PLANS[city.id];
      expect(specs?.length, city.id).toBeGreaterThan(0);
      const spec = specs![0]!;
      const plan = planTown(city, spec, rules);
      expect(plan.filter((o) => o.def === 'house').length).toBeGreaterThanOrEqual(8);
      const r = runBot(city, spec, rules, 80);
      const label = `${city.id}: stars ${r.stars.join(' / ')}, ${r.population} people`;
      expect(r.stars[0], label).not.toBeNull();
      expect(r.stars[0], label).toBeLessThanOrEqual(60);
      expect(r.subsidies, label).toBe(0);
    },
  );
});
