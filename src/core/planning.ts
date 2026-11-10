import { buildingAt, canPlace, demolish, placeBuilding, rotatedSize } from './actions';
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
}

type Defs = Readonly<Record<string, BuildingDef>>;

/**
 * What a click (from === to) or drag with a building tool would do.
 * Tools without drag support always place a single building at `to`.
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
  const plan: BuildPlan = { tiles: [], anchors: [] };
  for (const c of candidates) {
    const check = canPlace(state, defs, def, c.x, c.y, rot);
    // Dragging a path across an identical path is fine; there is simply nothing to do.
    if (!check.ok && check.reason === 'same') continue;
    for (const t of footprint(c.x, c.y, w, h)) plan.tiles.push({ ...t, ok: check.ok });
    if (check.ok) plan.anchors.push(c);
  }
  return plan;
}

export function commitBuild(
  state: GameState,
  defs: Defs,
  def: BuildingDef,
  plan: BuildPlan,
  rot: Rotation,
): GameState {
  let next = state;
  for (const a of plan.anchors) {
    const result = placeBuilding(next, defs, def, a.x, a.y, rot);
    if (result.ok) next = result.state;
  }
  return next;
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

export function commitDemolish(state: GameState, tiles: Point[]): GameState {
  let next = state;
  for (const t of tiles) next = demolish(next, t.x, t.y);
  return next;
}
