import { describe, expect, it } from 'vitest';
import { rngStep } from '../src/core/rng';

function draw(seed: number, count: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let i = 0; i < count; i++) {
    const step = rngStep(state);
    out.push(step.value);
    state = step.next;
  }
  return out;
}

describe('rngStep', () => {
  it('is deterministic for a given seed', () => {
    expect(draw(42, 20)).toEqual(draw(42, 20));
  });

  it('differs between seeds', () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  it('stays within [0, 1) and is roughly uniform', () => {
    const values = draw(7, 5000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
  });
});
