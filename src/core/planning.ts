import {
  buildingAt,
  canPlace,
  demolish,
  placeBuilding,
  rotatedSize,
  type PlaceError,
} from './actions';
import { footprint, lineTiles, rectTiles } from './grid';
import type { BuildingDef, GameState, Point, Rotation } from './types';

export interface PlanTile extends Point {
  ok: boolean;
}

export interface BuildPlan {
  /** Every tile the gesture touches, flagged with whether something will be built there. */
  tiles: PlanTile[];
  /** Top-left tiles where a building will actually be placed. */
  anchors: Point[];
  /** Set when the town ran out of gold, materials or build points part-way. */
  shortOf: PlaceError | null;
  /** The state after carrying out the plan. */
  result: GameState;
}

type Defs = Readonly<Record<string, BuildingDef>>;

/**
 * What a click (from === to) or drag with a building tool would do, including what the town
 * can still afford. Tools without drag support always place a single building at `to`.
 */
export function planBuild(
  state: GameState,
  defs: Defs,
  def: BuildingDef,
  from: Point,
  to: Point,
  rot: Rotation,
): BuildPlan {
  const candidates =
    def.drag === 'line' ? lineTiles(from, to) : def.drag === 'rect' ? rectTiles(from, to) : [to];
  const { w, h } = rotatedSize(def, rot);
  const plan: BuildPlan = { tiles: [], anchors: [], shortOf: null, result: state };
  for (const c of candidates) {
    // Dragging a path across an identical path is fine; there is simply nothing to do.
    const fit = canPlace(plan.result, defs, def, c.x, c.y, rot);
    if (!fit.ok && fit.reason === 'same') continue;
    const placed = placeBuilding(plan.result, defs, def, c.x, c.y, rot);
    for (const t of footprint(c.x, c.y, w, h)) plan.tiles.push({ ...t, ok: placed.ok });
    if (placed.ok) {
      plan.result = placed.state;
      plan.anchors.push(c);
    } else if (fit.ok && !plan.shortOf && placed.reason !== 'locked') {
      plan.shortOf = placed.reason;
    }
  }
  return plan;
}

/** All tiles of buildings touched by the rectangle from `from` to `to`. */
export function planDemolish(state: GameState, from: Point, to: Point): Point[] {
  const ids = new Set<number>();
  const tiles: Point[] = [];
  for (const t of rectTiles(from, to)) {
    const b = buildingAt(state, t.x, t.y);
    if (!b || ids.has(b.id)) continue;
    ids.add(b.id);
    tiles.push(...footprint(b.x, b.y, b.w, b.h));
  }
  return tiles;
}

export function commitDemolish(
  state: GameState,
  defs: Defs,
  refundShare: number,
  tiles: Point[],
): GameState {
  let next = state;
  for (const t of tiles) next = demolish(next, defs, refundShare, t.x, t.y);
  return next;
}
