import { describe, expect, it } from 'vitest';
import { newGame, parseCity, validateCity } from '../src/core/city';
import type { CityDef } from '../src/core/types';
import { CITIES } from '../src/data/cities';

function city(map: string[], range: [number, number] = [1, 100]): CityDef {
  return {
    id: 'test',
    name: { de: 'Test', en: 'Test' },
    region: { de: '', en: '' },
    blurb: { de: '', en: '' },
    difficulty: 1,
    buildableRange: range,
    map,
  };
}

describe('parseCity', () => {
  it('maps characters to terrain in row-major order', () => {
    const parsed = parseCity(city(['#G#', '#.#', '~^ ']));
    expect(parsed.width).toBe(3);
    expect(parsed.height).toBe(3);
    expect(parsed.terrain).toEqual([
      'wall',
      'gate',
      'wall',
      'wall',
      'buildable',
      'wall',
      'water',
      'rock',
      'outside',
    ]);
  });

  it('rejects ragged rows and unknown characters', () => {
    expect(() => parseCity(city(['###', '##']))).toThrow(/row 1/);
    expect(() => parseCity(city(['#?#']))).toThrow(/unknown map character/);
    expect(() => parseCity(city([]))).toThrow(/empty/);
  });
});

describe('validateCity', () => {
  it('accepts a small valid town', () => {
    expect(validateCity(city(['#G#', '#.#', '###']))).toEqual([]);
  });

  it('requires a gate', () => {
    expect(validateCity(city(['###', '#.#', '###'])).join()).toMatch(/gate/);
  });

  it('reports buildable tiles cut off from every gate', () => {
    const problems = validateCity(city(['#G###', '#.#.#', '#####']));
    expect(problems.join()).toMatch(/1 buildable tiles cannot be reached/);
  });

  it('enforces the buildable tile range', () => {
    expect(validateCity(city(['#G#', '#.#', '###'], [5, 9])).join()).toMatch(/expected 5–9/);
  });

  it('reports parse errors instead of throwing', () => {
    expect(validateCity(city(['#x#']))).toHaveLength(1);
  });
});

describe('shipped cities', () => {
  it.each(CITIES.map((c) => [c.id, c] as const))('%s is valid', (_id, def) => {
    expect(validateCity(def)).toEqual([]);
  });

  it('have unique ids', () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
  });
});

describe('newGame', () => {
  it('starts with an empty town', () => {
    const state = newGame(city(['#G#', '#.#', '###']), 7);
    expect(state.occupancy).toEqual(new Array(9).fill(0));
    expect(state.buildings).toEqual({});
    expect(state.rng).toBe(7);
    // The state must survive a JSON round trip unchanged.
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
