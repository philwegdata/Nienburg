/**
 * Seedable pseudo-random generator (mulberry32).
 * The whole RNG state is a single number so it can live inside GameState.
 */
export interface RngStep {
  /** Uniform value in [0, 1). */
  value: number;
  /** State to store for the next draw. */
  next: number;
}

export function rngStep(state: number): RngStep {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}
