import { buildingAt } from '../actions';
import { inBounds, indexOf, NEIGHBOURS_4 } from '../grid';
import type { Building, GameState, Point, Rules } from '../types';

/** Tiles that share an edge with the building's footprint (may lie outside the map). */
export function borderTiles(b: Building): Point[] {
  const tiles: Point[] = [];
  for (let dx = 0; dx < b.w; dx++) {
    tiles.push({ x: b.x + dx, y: b.y - 1 }, { x: b.x + dx, y: b.y + b.h });
  }
  for (let dy = 0; dy < b.h; dy++) {
    tiles.push({ x: b.x - 1, y: b.y + dy }, { x: b.x + b.w, y: b.y + dy });
  }
  return tiles;
}

/** Id of the path kind at (x, y), or null if there is no path. */
export function pathAt(state: GameState, rules: Rules, x: number, y: number): string | null {
  const b = buildingAt(state, x, y);
  return b && rules.buildings[b.def]?.category === 'path' ? b.def : null;
}

/** Path tiles next to a building. */
export function adjacentPaths(state: GameState, rules: Rules, b: Building): Point[] {
  return borderTiles(b).filter((t) => pathAt(state, rules, t.x, t.y) !== null);
}

/**
 * Walking distance over the path network from `sources` (path tiles, entered at their own
 * cost), up to `range`. Slow paths such as alleys cost two steps per tile, others one.
 * Returns tile index → distance for every path tile within range.
 */
export function pathDistances(
  state: GameState,
  rules: Rules,
  sources: Point[],
  range: number,
): Map<number, number> {
  const stepCost = (x: number, y: number): number | null => {
    const kind = pathAt(state, rules, x, y);
    if (kind === null) return null;
    return rules.balance.slowPaths.includes(kind) ? 2 : 1;
  };

  const dist = new Map<number, number>();
  const open: { x: number; y: number; d: number }[] = [];
  const visit = (x: number, y: number, from: number) => {
    if (!inBounds(state.width, state.height, x, y)) return;
    const cost = stepCost(x, y);
    if (cost === null) return;
    const d = from + cost;
    if (d > range) return;
    const i = indexOf(state.width, x, y);
    const known = dist.get(i);
    if (known !== undefined && known <= d) return;
    dist.set(i, d);
    open.push({ x, y, d });
  };

  for (const s of sources) visit(s.x, s.y, 0);
  while (open.length > 0) {
    // The network is tiny, so picking the minimum by scanning is fast enough.
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.d < open[best]!.d) best = i;
    const cur = open.splice(best, 1)[0]!;
    if (dist.get(indexOf(state.width, cur.x, cur.y)) !== cur.d) continue;
    for (const n of NEIGHBOURS_4) visit(cur.x + n.x, cur.y + n.y, cur.d);
  }
  return dist;
}

/** Ids of all buildings that touch at least one of the given path tiles. */
export function buildingsAlong(
  state: GameState,
  rules: Rules,
  reached: Map<number, number>,
): Set<number> {
  const ids = new Set<number>();
  for (const b of Object.values(state.buildings)) {
    if (rules.buildings[b.def]?.category === 'path') continue;
    for (const t of borderTiles(b)) {
      if (!inBounds(state.width, state.height, t.x, t.y)) continue;
      if (reached.has(indexOf(state.width, t.x, t.y))) {
        ids.add(b.id);
        break;
      }
    }
  }
  return ids;
}
