import type { Point } from './types';

export function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function indexOf(width: number, x: number, y: number): number {
  return y * width + x;
}

export const NEIGHBOURS_4: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** All tiles of a w×h footprint anchored at its top-left tile. */
export function footprint(x: number, y: number, w: number, h: number): Point[] {
  const tiles: Point[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) tiles.push({ x: x + dx, y: y + dy });
  }
  return tiles;
}

/**
 * Tiles of an L-shaped path from `from` to `to`: first along the longer axis, then the shorter one.
 * Includes both ends, without duplicates.
 */
export function lineTiles(from: Point, to: Point): Point[] {
  const tiles: Point[] = [];
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const xFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  let { x, y } = from;
  tiles.push({ x, y });
  const walkX = () => {
    while (x !== to.x) tiles.push({ x: (x += dx), y });
  };
  const walkY = () => {
    while (y !== to.y) tiles.push({ x, y: (y += dy) });
  };
  if (xFirst) {
    walkX();
    walkY();
  } else {
    walkY();
    walkX();
  }
  return tiles;
}

/** All tiles of the rectangle spanned by two corners (inclusive). */
export function rectTiles(a: Point, b: Point): Point[] {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return footprint(x0, y0, Math.abs(a.x - b.x) + 1, Math.abs(a.y - b.y) + 1);
}

/** Indices reachable from `starts` via 4-neighbour steps over tiles accepted by `passable`. */
export function floodFill(
  width: number,
  height: number,
  starts: Point[],
  passable: (x: number, y: number) => boolean,
): Set<number> {
  const seen = new Set<number>();
  const queue: Point[] = [];
  for (const s of starts) {
    if (!inBounds(width, height, s.x, s.y)) continue;
    seen.add(indexOf(width, s.x, s.y));
    queue.push(s);
  }
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    for (const d of NEIGHBOURS_4) {
      const x = cur.x + d.x;
      const y = cur.y + d.y;
      if (!inBounds(width, height, x, y)) continue;
      const i = indexOf(width, x, y);
      if (seen.has(i) || !passable(x, y)) continue;
      seen.add(i);
      queue.push({ x, y });
    }
  }
  return seen;
}
