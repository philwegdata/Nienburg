import { describe, expect, it } from 'vitest';
import { buildingAt, population } from '../src/core/actions';
import { deserialize } from '../src/core/save';
import { analyze, missingNeeds } from '../src/core/sim/analyze';
import { rollEvent } from '../src/core/sim/events';
import { endTurn } from '../src/core/sim/turn';
import type { EventKind, GameState, HouseData } from '../src/core/types';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const FIELD = [
  '#G########################',
  ...Array<string>(8).fill('#........................#'),
  '##########################',
];
const cfg = RULES.balance.events;

function setHouse(state: GameState, x: number, y: number, house: HouseData): GameState {
  const b = buildingAt(state, x, y)!;
  return { ...state, buildings: { ...state.buildings, [b.id]: { ...b, house } } };
}

/** A lived-in street with a plaza, a chapel and two wells: every event is possible here. */
function town(turn: number, seed = 1): GameState {
  let s = fillWith(richGame(FIELD), 'street', 1, 4, 24, 4);
  s = fillWith(s, 'house', 1, 3, 10, 3);
  for (let x = 1; x <= 10; x++) s = setHouse(s, x, 3, { level: 2, pop: 7, lacking: 0 });
  s = put(s, 'plaza', 12, 5);
  s = put(s, 'chapel', 14, 5);
  s = put(put(s, 'well', 2, 5), 'well', 8, 5);
  for (let x = 16; x <= 20; x++) s = put(s, 'firewatch', x, 5);
  return { ...s, turn, rng: seed };
}

/** Everything the event roll produces over many seeds, at the end of the given turn. */
function outcomes(turn: number, seeds = 400) {
  const seen = new Map<EventKind, ReturnType<typeof rollEvent>>();
  let none = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    // rollEvent sees the town after the turn, so its turn counter is one ahead.
    const s = town(turn + 1, seed * 7919);
    const result = rollEvent(s, analyze(s, RULES), RULES);
    if (result.news) seen.set(result.news.kind, result);
    else none++;
  }
  return { seen, none, seeds };
}

describe('events', () => {
  it('leave a young town alone', () => {
    for (let turn = 0; turn < cfg.quietTurns; turn++) {
      expect(outcomes(turn, 50).seen.size).toBe(0);
    }
  });

  it('happen in roughly the configured share of turns', () => {
    const { none, seeds } = outcomes(20);
    const share = 1 - none / seeds;
    expect(share).toBeGreaterThan(cfg.chance - 0.08);
    expect(share).toBeLessThan(cfg.chance + 0.08);
  });

  it('fit the season', () => {
    // Turn 20 is a spring: summer is coming, so a well may run dry, but no harvest or winter.
    const spring = outcomes(20).seen;
    expect([...spring.keys()].sort()).toEqual(['dryWell', 'fair', 'jugglers', 'pilgrims']);
    // Turn 22 is an autumn: the harvest is in and winter is coming.
    const autumn = outcomes(22).seen;
    expect([...autumn.keys()].sort()).toEqual([
      'fair',
      'goodHarvest',
      'harshWinter',
      'jugglers',
      'pilgrims',
    ]);
  });

  it('need what they are about', () => {
    // An empty field has no plaza, no chapel, no people, no wells.
    for (let seed = 1; seed <= 200; seed++) {
      const s = { ...richGame(FIELD), turn: 21, rng: seed * 31 };
      expect(rollEvent(s, analyze(s, RULES), RULES).news).toBeNull();
    }
  });

  it('bring windfalls at once', () => {
    const { seen } = outcomes(22);
    const fair = seen.get('fair')!;
    expect(fair.gold).toBe(cfg.fairBase + Math.floor(70 * cfg.fairPerHead));
    expect(fair.news).toMatchObject({ gold: fair.gold, at: { x: 12, y: 5 } });
    expect(fair.active).toBeNull();
    expect(seen.get('pilgrims')!.gold).toBe(cfg.pilgrimGold);
    expect(seen.get('goodHarvest')).toMatchObject({ food: cfg.harvestFood, gold: 0 });
  });

  it('are the same for the same seed', () => {
    const s = town(21, 12345);
    const a = analyze(s, RULES);
    expect(rollEvent(s, a, RULES)).toEqual(rollEvent(s, a, RULES));
  });
});

describe('events in play', () => {
  /** Plays on from `turn` until the wanted event comes up; returns the state right after. */
  function until(kind: EventKind, turn: number): GameState {
    for (let seed = 1; seed < 500; seed++) {
      const after = endTurn(town(turn, seed * 104729), RULES);
      if (after.lastReport?.event?.kind === kind) return after;
    }
    throw new Error(`no ${kind} found`);
  }

  it('add a fair’s takings to the treasury and report them', () => {
    const before = town(20, 1);
    const after = until('fair', 20);
    const r = after.lastReport!;
    expect(after.gold).toBe(before.gold + r.taxes + r.tradeIncome - r.upkeep + r.event!.gold!);
    expect(after.event).toBeNull();
  });

  it('never fill the stores beyond their limit with a good harvest', () => {
    const after = until('goodHarvest', 22);
    expect(after.food).toBeLessThanOrEqual(analyze(after, RULES).foodCap);
    expect(after.lastReport!.event!.food).toBe(cfg.harvestFood);
  });

  it('make people eat more in a harsh winter, for that winter only', () => {
    const winter = until('harshWinter', 22);
    expect(winter.event).toEqual({ kind: 'harshWinter' });
    expect(winter.turn % 4).toBe(3);
    const mild = endTurn({ ...winter, event: null }, RULES).lastReport!.foodEaten;
    const harsh = endTurn(winter, RULES).lastReport!.foodEaten;
    expect(harsh).toBe(Math.ceil(population(winter) * 0.08 * 1.25 * cfg.harshWinterDemand));
    expect(harsh).toBeGreaterThan(mild);
    // The event lasts one turn: afterwards it is gone or replaced, never still "harsh winter".
    expect(endTurn(winter, RULES).event?.kind).not.toBe('harshWinter');
  });

  it('dry up one well for a season while the other keeps working', () => {
    const summer = until('dryWell', 20);
    const dry = summer.event!.building!;
    expect(summer.buildings[dry]?.def).toBe('well');
    const a = analyze(summer, RULES);
    expect(a.idle.get(dry)).toBe('dry');
    expect(a.covered.water.size).toBeGreaterThan(0);
    expect(summer.lastReport!.event!.at).toEqual({
      x: summer.buildings[dry]!.x,
      y: summer.buildings[dry]!.y,
    });
    // Nothing is lost: with the event over, the well works again.
    expect(analyze({ ...summer, event: null }, RULES).idle.has(dry)).toBe(false);
  });

  it('let jugglers entertain everyone for a season', () => {
    const festive = until('jugglers', 20);
    expect(festive.event).toEqual({ kind: 'jugglers' });
    const a = analyze(festive, RULES);
    const house = buildingAt(festive, 1, 3)!.id;
    const plain = { hungry: false, goodsTypes: 0 };
    expect(missingNeeds(RULES, a, house, 4, plain)).toContain('fun');
    expect(missingNeeds(RULES, a, house, 4, { ...plain, festive: true })).not.toContain('fun');
  });

  it('keep whole games reproducible', () => {
    const play = (seed: number) => {
      let s = town(0, seed);
      const log: string[] = [];
      for (let i = 0; i < 60; i++) {
        s = endTurn(s, RULES);
        if (s.lastReport?.event) log.push(`${i}:${s.lastReport.event.kind}`);
      }
      return log.join(' ');
    };
    expect(play(3)).toBe(play(3));
    expect(play(3)).not.toBe(play(4));
    expect(play(3).split(' ').length).toBeGreaterThan(5);
  });
});

describe('saves from before events existed', () => {
  it('are upgraded on load', () => {
    const state = endTurn(town(3), RULES);
    const old: Record<string, unknown> = { ...state, version: 2 };
    delete old.event;
    const restored = deserialize(JSON.stringify({ saveVersion: 2, state: old }), ['test']);
    expect(restored).toMatchObject({ version: 4, event: null, landBought: 0 });
    expect(endTurn(restored!, RULES).turn).toBe(5);
  });
});
