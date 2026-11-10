import { describe, expect, it } from 'vitest';
import { deserialize, SAVE_VERSION, serialize } from '../src/core/save';
import { endTurn } from '../src/core/sim/turn';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = ['#G######', '#......#', '#......#', '########'];

function played() {
  let state = fillWith(richGame(MAP), 'street', 1, 2, 6, 2);
  state = fillWith(state, 'house', 1, 1, 5, 1);
  state = put(state, 'well', 6, 1);
  for (let i = 0; i < 3; i++) state = endTurn(state, RULES);
  return state;
}

describe('save', () => {
  it('round-trips a game in progress, including the last report', () => {
    const state = played();
    const restored = deserialize(serialize(state), ['test']);
    expect(restored).toEqual(state);
    // The restored game continues exactly like the original.
    expect(endTurn(restored!, RULES)).toEqual(endTurn(state, RULES));
  });

  it('writes the current save version', () => {
    expect(JSON.parse(serialize(played())).saveVersion).toBe(SAVE_VERSION);
  });

  it('rejects garbage, foreign data and saves from a newer build', () => {
    const good = serialize(played());
    expect(deserialize('not json', ['test'])).toBeNull();
    expect(deserialize('null', ['test'])).toBeNull();
    expect(deserialize('{"state":{}}', ['test'])).toBeNull();
    expect(deserialize('{"saveVersion":1,"state":{"cityId":"test"}}', ['test'])).toBeNull();
    const future = JSON.stringify({ ...JSON.parse(good), saveVersion: SAVE_VERSION + 1 });
    expect(deserialize(future, ['test'])).toBeNull();
  });

  it('rejects saves for cities that no longer exist', () => {
    expect(deserialize(serialize(played()), ['elsewhere'])).toBeNull();
  });

  it('rejects saves whose map arrays do not match their size', () => {
    const file = JSON.parse(serialize(played()));
    file.state.occupancy.pop();
    expect(deserialize(JSON.stringify(file), ['test'])).toBeNull();
  });
});
