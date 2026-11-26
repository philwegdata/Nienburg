import { describe, expect, it } from 'vitest';
import { CHRONICLE_LIMIT, turnEntries, write } from '../src/core/chronicle';
import { holdFestival } from '../src/core/actions';
import { deserialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import type { ChronicleEntry, GameState, TurnReport } from '../src/core/types';
import { BUILDINGS } from '../src/data/buildings';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = ['##########', '#........#', '#........G', '#........#', '##########'];

function town(): GameState {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 7, 2);
  s = put(s, 'plaza', 8, 2);
  return fillWith(s, 'house', 1, 1, 8, 1);
}
const report = (over: Partial<TurnReport>): TurnReport =>
  ({ ...endTurn(town(), RULES).lastReport!, ...over }) as TurnReport;

describe('the chronicle', () => {
  it('begins with the founding', () => {
    expect(town().chronicle).toEqual([{ turn: 0, kind: 'founded' }]);
  });

  it('notes festivals, stars, great buildings and quiet ones left out', () => {
    const s = { ...town(), peakPop: 0 };
    const after = { ...s, peakPop: 120 };
    const entries = turnEntries(
      s,
      after,
      report({
        turn: 5,
        festival: 'harvest',
        newStars: [0],
        completed: ['cathedral', 'well'],
        event: { kind: 'harshWinter' },
      }),
      (def) => def === 'cathedral',
    );
    expect(entries).toEqual(
      expect.arrayContaining<ChronicleEntry>([
        { turn: 5, kind: 'festival', festival: 'harvest' },
        { turn: 5, kind: 'star', n: 0 },
        { turn: 5, kind: 'completed', def: 'cathedral' },
        { turn: 5, kind: 'population', n: 50 },
        { turn: 5, kind: 'population', n: 100 },
      ]),
    );
    expect(entries.some((e) => e.kind === 'completed' && e.def === 'well')).toBe(false);
    expect(entries.some((e) => e.kind === 'event')).toBe(false);
  });

  it('notes the first house of a new level only once', () => {
    const s = town();
    const raise = (state: GameState, level: number) => {
      const buildings = { ...state.buildings };
      for (const b of Object.values(buildings)) {
        if (b.house) buildings[b.id] = { ...b, house: { ...b.house, level } };
      }
      return { ...state, buildings };
    };
    const first = turnEntries(s, raise(s, 3), report({}), () => false);
    expect(first).toContainEqual(expect.objectContaining({ kind: 'level', n: 3 }));
    const known = write(raise(s, 3), first);
    expect(turnEntries(known, raise(s, 3), report({}), () => false)).toEqual([]);
  });

  it('is written as turns end', () => {
    const r = holdFestival(town(), BUILDINGS, RULES.balance.festivals.cost, 'plaza');
    if (!r.ok) throw new Error(r.reason);
    const next = endTurn(r.state, RULES);
    expect(next.chronicle).toContainEqual({ turn: 0, kind: 'festival', festival: 'mayday' });
  });

  it('keeps to its limit but never forgets the founding', () => {
    let s = town();
    const many: ChronicleEntry[] = Array.from({ length: CHRONICLE_LIMIT + 20 }, (_, i) => ({
      turn: i,
      kind: 'population',
      n: i,
    }));
    s = write(s, many);
    expect(s.chronicle).toHaveLength(CHRONICLE_LIMIT);
    expect(s.chronicle[0]).toEqual({ turn: 0, kind: 'founded' });
    expect(s.chronicle[s.chronicle.length - 1]).toEqual(many[many.length - 1]);
  });

  it('starts old saves with the founding', () => {
    const old: Record<string, unknown> = { ...town(), version: 12 };
    delete old.chronicle;
    const back = deserialize(JSON.stringify({ saveVersion: 12, state: old }), ['test']);
    expect(back?.chronicle).toEqual([{ turn: 0, kind: 'founded' }]);
  });

  it('has texts in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      expect(strings(lang).chronicle.founded).toContain('{city}');
    }
  });
});
