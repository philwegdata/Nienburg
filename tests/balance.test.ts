import { describe, expect, it } from 'vitest';
import { PLANS, planTown, runBot, type BotResult } from '../scripts/bot';
import { demolish, placeBuilding, population } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { endTurn } from '../src/core/sim/turn';
import type { GameState } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { CITIES } from '../src/data/cities';
import { nienburg } from '../src/data/cities/nienburg';
import { RULES } from '../src/data/rules';

const TURNS = 160;
const SEEDS = [1, 15838, 23757];

const city = (id: string) => CITIES.find((c) => c.id === id)!;
const runs = (id: string, plan: number): BotResult[] =>
  SEEDS.map((seed) => runBot(city(id), PLANS[id]![plan]!, RULES, TURNS, seed));

describe('rules that keep the game winnable', () => {
  it('lets every building be afforded within one turn’s build points', () => {
    for (const def of Object.values(BUILDINGS)) {
      expect(def.buildPoints, def.id).toBeLessThanOrEqual(RULES.balance.buildPointsPerTurn);
    }
  });

  it('lets every building fit into an empty material store', () => {
    for (const def of Object.values(BUILDINGS)) {
      expect(def.materials, def.id).toBeLessThanOrEqual(RULES.balance.baseStorage.materials);
      expect(def.construction?.materials ?? 0, def.id).toBeLessThanOrEqual(
        RULES.balance.baseStorage.materials,
      );
    }
  });

  it('unlocks nothing later than a town can grow', () => {
    // What a town needs to be allowed to build must not require the building itself.
    for (const def of Object.values(BUILDINGS)) {
      if (def.requires) expect(BUILDINGS[def.requires], def.id).toBeDefined();
      expect(def.unlockPop ?? 0, def.id).toBeLessThanOrEqual(400);
    }
    // Everything the first three housing levels need is there from 20 inhabitants on.
    const early = ['well', 'stall', 'plaza', 'chapel', 'firewatch', 'tree'];
    for (const id of early) expect(BUILDINGS[id]!.unlockPop ?? 0, id).toBeLessThanOrEqual(20);
  });

  it('pays for a hamlet’s first services out of its taxes', () => {
    // Ten clay houses must carry a well, a stall, a chapel and a fire watch.
    const taxes = Math.floor(10 * RULES.housing[1]!.capacity * RULES.housing[1]!.taxPerHead);
    const upkeep = ['well', 'stall', 'chapel', 'firewatch']
      .map((id) => BUILDINGS[id]!.upkeep)
      .reduce((a, b) => a + b, 0);
    expect(taxes).toBeGreaterThan(upkeep);
  });
});

describe('no dead ends', () => {
  /** A town that spent everything on a chapel nobody lives near. */
  function ruined(): GameState {
    let s: GameState = { ...newGame(nienburg, 1, RULES.balance), peakPop: 100 };
    for (const [id, x, y] of [
      ['street', 10, 12],
      ['chapel', 10, 13],
      ['firewatch', 11, 12],
    ] as const) {
      const r = placeBuilding(s, BUILDINGS, BUILDINGS[id]!, x, y);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    return { ...s, gold: 0, materials: 0 };
  }

  it('never lets the treasury go below zero', () => {
    let s = ruined();
    for (let i = 0; i < 12; i++) {
      s = endTurn(s, RULES, nienburg.goals);
      expect(s.gold).toBeGreaterThanOrEqual(0);
    }
    expect(s.subsidies).toBeGreaterThan(0);
  });

  it('lets a broke town recover by selling what it cannot afford and settling people', () => {
    let s = ruined();
    s = endTurn(s, RULES, nienburg.goals);
    expect(s.gold).toBe(0);
    // Demolition is free and returns half the price.
    s = demolish(s, BUILDINGS, RULES.balance.demolishRefund, 10, 13);
    s = demolish(s, BUILDINGS, RULES.balance.demolishRefund, 11, 12);
    expect(s.gold).toBe(60);
    // Materials keep arriving, so houses can be built again within a few turns.
    for (let i = 0; i < 3; i++) s = endTurn(s, RULES, nienburg.goals);
    let houses = 0;
    for (const [x, y] of [
      [10, 11],
      [10, 13],
      [9, 12],
      [11, 12],
    ] as const) {
      const r = placeBuilding(s, BUILDINGS, BUILDINGS.house!, x, y);
      if (r.ok) {
        s = r.state;
        houses++;
      }
    }
    expect(houses).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 4; i++) s = endTurn(s, RULES, nienburg.goals);
    expect(population(s)).toBeGreaterThan(0);
    expect(s.lastReport!.taxes).toBeGreaterThan(0);
    expect(s.lastReport!.subsidy).toBe(false);
  });
});

describe('bot layouts', () => {
  it('are valid: every planned building has its own free spot inside the walls', () => {
    for (const def of CITIES) {
      for (const spec of PLANS[def.id]!) {
        const plan = planTown(def, spec, RULES);
        let s: GameState = {
          ...newGame(def, 1, RULES.balance),
          gold: 1e7,
          materials: 1e7,
          buildPoints: 1e7,
          peakPop: 1e6,
        };
        for (const o of plan) {
          const r = placeBuilding(s, BUILDINGS, BUILDINGS[o.def]!, o.x, o.y, o.rot);
          // Where a cramped town has no room for a town hall, what depends on it stays
          // locked; the bot simply never builds it.
          const fine = r.ok || r.reason === 'locked';
          expect(fine, `${def.id} / ${spec.name}: ${o.def} at ${o.x},${o.y}`).toBe(true);
          if (r.ok) s = r.state;
        }
        const houses = plan.filter((o) => o.def === 'house').length;
        expect(houses).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('differ: the two plans of a city build in different places', () => {
    for (const def of CITIES.filter((c) => PLANS[c.id]!.length > 1)) {
      const [a, b] = PLANS[def.id]!.map((spec) => planTown(def, spec, RULES));
      const spots = new Set(a!.filter((o) => o.def === 'house').map((o) => `${o.x},${o.y}`));
      const shared = b!.filter((o) => o.def === 'house' && spots.has(`${o.x},${o.y}`)).length;
      expect(shared).toBeLessThan(spots.size / 2);
    }
  });
});

describe('pace of the game, played by the bot', () => {
  const nienburgRuns = [...runs('nienburg', 0), ...runs('nienburg', 1)];
  const westRuns = runs('carcassonne', 0);
  const northRuns = runs('carcassonne', 1);

  it('never needs the sovereign’s help and never runs out of things to do', () => {
    for (const r of [...nienburgRuns, ...westRuns, ...northRuns]) {
      const label = `${r.city} / ${r.plan}`;
      expect(r.subsidies, label).toBe(0);
      expect(r.minGold, label).toBeGreaterThanOrEqual(0);
      expect(r.unbuilt, label).toBe(0);
      expect(r.population, label).toBeGreaterThan(300);
    }
  });

  it('reaches Nienburg’s first star in the first few years and the third within a generation', () => {
    for (const r of nienburgRuns) {
      const label = `${r.plan}: ${r.stars.join(' / ')}`;
      expect(r.stars[0], label).toBeGreaterThanOrEqual(10);
      expect(r.stars[0], label).toBeLessThanOrEqual(35);
      expect(r.stars[1], label).not.toBeNull();
      expect(r.stars[2], label).toBeGreaterThanOrEqual(45);
      expect(r.stars[2], label).toBeLessThanOrEqual(130);
    }
  });

  it('takes longer in Carcassonne, the harder town', () => {
    for (const r of [...westRuns, ...northRuns]) {
      const label = `${r.plan}: ${r.stars.join(' / ')}`;
      expect(r.stars[0], label).toBeGreaterThanOrEqual(20);
      expect(r.stars[0], label).toBeLessThanOrEqual(60);
      expect(r.stars[2], label).toBeGreaterThanOrEqual(60);
      expect(r.stars[2], label).toBeLessThanOrEqual(150);
    }
    // The western layout has room for the twenty burgher houses of the second star.
    for (const r of westRuns) expect(r.stars[1], r.plan).not.toBeNull();
    const mean = (rs: BotResult[]) => rs.reduce((sum, r) => sum + r.stars[0]!, 0) / rs.length;
    expect(mean(westRuns)).toBeGreaterThan(mean(nienburgRuns));
  });

  it('does not depend much on luck', () => {
    for (const group of [runs('nienburg', 0), westRuns]) {
      const third = group.map((r) => r.stars[2]!);
      expect(Math.max(...third) - Math.min(...third)).toBeLessThanOrEqual(40);
    }
  });
});
