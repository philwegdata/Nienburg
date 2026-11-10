import { describe, expect, it } from 'vitest';
import { floodFill, footprint, lineTiles, rectTiles } from '../src/core/grid';

describe('footprint', () => {
  it('lists all tiles of a rectangle', () => {
    expect(footprint(2, 3, 2, 1)).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(footprint(0, 0, 2, 3)).toHaveLength(6);
  });
});

describe('lineTiles', () => {
  it('returns a single tile for a click', () => {
    expect(lineTiles({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
  });

  it('draws straight lines in both directions', () => {
    expect(lineTiles({ x: 1, y: 0 }, { x: 3, y: 0 }).map((p) => p.x)).toEqual([1, 2, 3]);
    expect(lineTiles({ x: 0, y: 3 }, { x: 0, y: 1 }).map((p) => p.y)).toEqual([3, 2, 1]);
  });

  it('draws an L along the longer axis first, without duplicates', () => {
    const tiles = lineTiles({ x: 0, y: 0 }, { x: 3, y: -2 });
    expect(tiles).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: -1 },
      { x: 3, y: -2 },
    ]);
    expect(lineTiles({ x: 0, y: 0 }, { x: 1, y: 4 })[1]).toEqual({ x: 0, y: 1 });
  });
});

describe('rectTiles', () => {
  it('is independent of corner order', () => {
    const a = rectTiles({ x: 3, y: 1 }, { x: 1, y: 2 });
    const b = rectTiles({ x: 1, y: 2 }, { x: 3, y: 1 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
  });
});

describe('floodFill', () => {
  it('spreads over passable tiles only and stays in bounds', () => {
    // 4×2 grid, column 2 is blocked.
    const reached = floodFill(4, 2, [{ x: 0, y: 0 }], (x) => x !== 2);
    expect([...reached].sort((a, b) => a - b)).toEqual([0, 1, 4, 5]);
  });

  it('includes start tiles even if they are not passable', () => {
    const reached = floodFill(3, 1, [{ x: 0, y: 0 }], (x) => x === 1);
    expect(reached.has(0)).toBe(true);
    expect(reached.has(1)).toBe(true);
    expect(reached.has(2)).toBe(false);
  });
});
