/**
 * Outlines for paths and canals. The game's grid is square, but what lies on it is drawn with
 * its corners cut off: a lone tile is an octagon, a street bends through a chamfered corner,
 * and a crossing opens out into an eight-sided little square.
 */

/** Which neighbours a tile joins up with. */
export interface Joins {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export interface OutlineStyle {
  /** Gap between the shape and the tile edge on sides that join nothing (0..0.5). */
  margin: number;
  /** How much is cut off an outer corner. */
  chamfer: number;
  /** How much is filled in at an inner corner, where two arms meet; at most `margin`. */
  fillet: number;
}

type Pt = [x: number, y: number];

/** Turns a point of the north-west corner into the same point of another corner. */
const TURN: ((p: Pt) => Pt)[] = [
  ([x, y]) => [x, y],
  ([x, y]) => [1 - y, x],
  ([x, y]) => [1 - x, 1 - y],
  ([x, y]) => [y, 1 - x],
];

/**
 * The outline of one tile's worth of path, clockwise from the north-west, in tile units
 * (0..1 across the tile).
 */
export function tileOutline(joins: Joins, style: OutlineStyle): Pt[] {
  const { margin: m, chamfer: c } = style;
  const f = Math.min(style.fillet, m);
  // For each corner: the side reached first when going round clockwise, then the next one.
  const corners: [boolean, boolean][] = [
    [joins.w, joins.n],
    [joins.n, joins.e],
    [joins.e, joins.s],
    [joins.s, joins.w],
  ];
  const outline: Pt[] = [];
  corners.forEach(([prev, next], i) => {
    let pts: Pt[];
    if (prev && next) {
      // Two arms meet: an inner corner, softened by a small diagonal.
      pts =
        m === 0
          ? [[0, 0]]
          : [
              [0, m],
              [m - f, m],
              [m, m - f],
              [m, 0],
            ];
    } else if (prev) {
      pts = [[0, m]];
    } else if (next) {
      pts = [[m, 0]];
    } else {
      // Nothing joins here: the corner is cut off.
      pts = [
        [m, m + c],
        [m + c, m],
      ];
    }
    for (const p of pts) outline.push(TURN[i]!(p));
  });
  return outline;
}

export const PATH_STYLE: Record<string, OutlineStyle> = {
  alley: { margin: 0.2, chamfer: 0.18, fillet: 0.12 },
  street: { margin: 0.05, chamfer: 0.26, fillet: 0.05 },
  plaza: { margin: 0, chamfer: 0.3, fillet: 0 },
  bridge: { margin: 0.1, chamfer: 0, fillet: 0 },
  canal: { margin: 0.14, chamfer: 0.2, fillet: 0.1 },
};
