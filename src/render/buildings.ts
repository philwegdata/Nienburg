/**
 * How every building looks. Each one is put together from a few volumes (walls with a roof)
 * and small props, drawn back to front, in the colours of the season and the region.
 */
import type { Building, Point } from '../core/types';
import {
  diamond,
  drawTree,
  flagpole,
  line,
  onLeft,
  onRight,
  poly,
  rect,
  roof as hipRoof,
  shadow,
  tiers,
  v,
  vary,
  type Emitter,
  type G,
  type Rect,
} from './draw';
import { mix, shade, type BoxColors, type RoofColors, type RoofKey, type WallKey } from './palette';
import { tileHash } from './scenery';

const OUTLINE = 'rgba(46, 32, 22, 0.4)';
const FRAME = '#4f3b2c';
const DOOR = '#5d4029';

type Tex = 'plain' | 'stone' | 'plank' | 'brick' | 'wattle';
type FaceFn = (t: number, z: number) => Point;

/** A filled shape with a thin dark outline: the basic stroke of the drawing style. */
function face(g: G, pts: Point[], fill: string): void {
  g.ctx.lineWidth = 0.55;
  poly(g, pts, fill, OUTLINE);
}

const leftOf =
  (r: Rect): FaceFn =>
  (t, z) =>
    onLeft(r, t, z);
const rightOf =
  (r: Rect): FaceFn =>
  (t, z) =>
    onRight(r, t, z);
const lengths = (r: Rect): [number, number] => [r.x1 - r.x0, r.y1 - r.y0];

function grow(r: Rect, by: number): Rect {
  return { x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by };
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Marks that hint at what a wall is made of. */
function texture(
  g: G,
  at: FaceFn,
  length: number,
  z0: number,
  z1: number,
  tex: Tex,
  seed: number,
): void {
  if (tex === 'plain') return;
  const { ctx } = g;
  ctx.beginPath();
  if (tex === 'stone') {
    let n = seed;
    for (let z = z0 + 3.2; z < z1 - 1; z += 3.6) {
      for (let i = 0; i < Math.max(1, Math.round(length * 2.4)); i++) {
        n = (n * 1103515245 + 12345) >>> 0;
        const t = ((n >>> 8) % 80) / 100 + 0.04;
        line(g, at(t, z), at(Math.min(1, t + 0.13 / Math.max(length, 0.3)), z));
      }
    }
  } else if (tex === 'brick') {
    for (let z = z0 + 2.4; z < z1 - 0.5; z += 2.4) line(g, at(0, z), at(1, z));
  } else if (tex === 'plank') {
    const step = 0.13 / Math.max(length, 0.2);
    for (let t = step; t < 1; t += step) line(g, at(t, z0), at(t, z1));
  } else {
    const step = 0.2 / Math.max(length, 0.2);
    for (let t = 0; t < 1; t += step) line(g, at(t, z0), at(Math.min(1, t + step), z1));
  }
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(40, 28, 18, 0.17)';
  ctx.stroke();
}

/** The two visible walls of a volume. */
function walls(
  g: G,
  r: Rect,
  z0: number,
  z1: number,
  c: BoxColors,
  tex: Tex = 'plain',
  seed = 1,
): void {
  const L = leftOf(r);
  const R = rightOf(r);
  const [lx, ly] = lengths(r);
  face(g, [L(0, z1), L(1, z1), L(1, z0), L(0, z0)], c.left);
  face(g, [R(0, z1), R(1, z1), R(1, z0), R(0, z0)], c.right);
  texture(g, L, lx, z0, z1, tex, seed);
  texture(g, R, ly, z0, z1, tex, seed * 7 + 3);
  if (z0 === 0) {
    // A darker foot where the wall meets the ground.
    poly(g, [L(0, 1.6), L(1, 1.6), L(1, 0), L(0, 0)], 'rgba(30, 20, 12, 0.16)');
    poly(g, [R(0, 1.6), R(1, 1.6), R(1, 0), R(0, 0)], 'rgba(30, 20, 12, 0.16)');
  }
}

/** A flat top, for towers and parapets. */
function lid(g: G, r: Rect, z: number, fill: string): void {
  face(g, [v(r.x0, r.y0, z), v(r.x1, r.y0, z), v(r.x1, r.y1, z), v(r.x0, r.y1, z)], fill);
}

/** The shadow a roof throws on the top of the walls. */
function eaveShade(g: G, r: Rect, z: number): void {
  const L = leftOf(r);
  const R = rightOf(r);
  poly(g, [L(0, z), L(1, z), L(1, z - 2.4), L(0, z - 2.4)], 'rgba(30, 20, 10, 0.2)');
  poly(g, [R(0, z), R(1, z), R(1, z - 2.4), R(0, z - 2.4)], 'rgba(30, 20, 10, 0.2)');
}

interface WindowOpts {
  /** Height of the pane in world pixels and half its width in tiles. */
  h?: number;
  w?: number;
  /** Windows per tile of wall. */
  per?: number;
  arched?: boolean;
  shutters?: string;
  left?: boolean;
  right?: boolean;
  /** Leave out the window nearest this position on the left wall (where the door is). */
  skipLeftAt?: number;
}

function windowAt(g: G, at: FaceFn, length: number, t: number, z: number, o: WindowOpts): void {
  const { pal } = g;
  const h = o.h ?? 3.8;
  const w = (o.w ?? 0.065) / length;
  const pad = 0.014 / length;
  const frame = [
    at(t - w - pad, z - 0.5),
    at(t + w + pad, z - 0.5),
    at(t + w + pad, z + h + 0.6),
    at(t - w - pad, z + h + 0.6),
  ];
  if (o.shutters) {
    const s = w * 0.9;
    poly(g, [at(t - w - s, z), at(t - w, z), at(t - w, z + h), at(t - w - s, z + h)], o.shutters);
    poly(g, [at(t + w, z), at(t + w + s, z), at(t + w + s, z + h), at(t + w, z + h)], o.shutters);
  }
  if (o.arched) {
    poly(
      g,
      [
        frame[0]!,
        frame[1]!,
        at(t + w + pad, z + h * 0.72),
        at(t, z + h + 1.6),
        at(t - w - pad, z + h * 0.72),
      ],
      FRAME,
    );
    poly(
      g,
      [
        at(t - w, z),
        at(t + w, z),
        at(t + w, z + h * 0.7),
        at(t, z + h + 0.7),
        at(t - w, z + h * 0.7),
      ],
      pal.window,
    );
  } else {
    poly(g, frame, FRAME);
    poly(g, [at(t - w, z), at(t + w, z), at(t + w, z + h), at(t - w, z + h)], pal.window);
  }
  // A glazing bar.
  g.ctx.beginPath();
  line(g, at(t, z), at(t, z + h));
  g.ctx.lineWidth = 0.4;
  g.ctx.strokeStyle = 'rgba(40, 28, 18, 0.55)';
  g.ctx.stroke();
}

/** A row of windows at height z on the visible walls. */
function windows(g: G, r: Rect, z: number, o: WindowOpts = {}): void {
  const [lx, ly] = lengths(r);
  const sides: [FaceFn, number, boolean][] = [
    [leftOf(r), lx, o.left ?? true],
    [rightOf(r), ly, o.right ?? true],
  ];
  sides.forEach(([at, length, wanted], side) => {
    if (!wanted) return;
    const count = Math.max(1, Math.round(length * (o.per ?? 2.2)));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      if (side === 0 && o.skipLeftAt !== undefined && Math.abs(t - o.skipLeftAt) < 0.5 / count)
        continue;
      windowAt(g, at, length, t, z, o);
    }
  });
}

function door(
  g: G,
  at: FaceFn,
  length: number,
  t: number,
  o: { w?: number; h?: number; arched?: boolean; color?: string } = {},
): void {
  const w = (o.w ?? 0.085) / length;
  const h = o.h ?? 6.5;
  const pad = 0.018 / length;
  const top = o.arched
    ? [at(t + w + pad, h * 0.72), at(t, h + 2.2), at(t - w - pad, h * 0.72)]
    : [at(t + w + pad, h + 0.8), at(t - w - pad, h + 0.8)];
  poly(g, [at(t - w - pad, 0), at(t + w + pad, 0), ...top], FRAME);
  const inner = o.arched
    ? [at(t + w, h * 0.7), at(t, h + 1.2), at(t - w, h * 0.7)]
    : [at(t + w, h), at(t - w, h)];
  poly(g, [at(t - w, 0), at(t + w, 0), ...inner], o.color ?? DOOR);
}

/** A dark arched opening: arcades, gateways, forge mouths. */
function arch(
  g: G,
  at: FaceFn,
  length: number,
  t: number,
  w: number,
  h: number,
  fill = 'rgba(38, 26, 18, 0.82)',
): void {
  const half = w / length;
  poly(
    g,
    [
      at(t - half, 0),
      at(t + half, 0),
      at(t + half, h * 0.62),
      at(t + half * 0.6, h * 0.92),
      at(t, h),
      at(t - half * 0.6, h * 0.92),
      at(t - half, h * 0.62),
    ],
    fill,
  );
}

/** Half-timbering between z0 and z1: sills, posts and corner braces. */
function timber(g: G, r: Rect, z0: number, z1: number, storey: number): void {
  const { ctx, pal } = g;
  ctx.beginPath();
  const [lx, ly] = lengths(r);
  const sides: [FaceFn, number][] = [
    [leftOf(r), lx],
    [rightOf(r), ly],
  ];
  for (const [at, length] of sides) {
    for (let z = z0; z <= z1 + 0.1; z += storey)
      line(g, at(0, Math.min(z, z1)), at(1, Math.min(z, z1)));
    const posts = Math.max(2, Math.round(length * 2.6));
    for (let i = 0; i <= posts; i++) line(g, at(i / posts, z0), at(i / posts, z1));
    for (let z = z0; z < z1 - 0.1; z += storey) {
      const top = Math.min(z + storey, z1);
      line(g, at(0, top), at(1 / posts, z));
      line(g, at(1, top), at(1 - 1 / posts, z));
    }
  }
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = pal.timber;
  ctx.stroke();
}

interface GableOpts {
  alongX?: boolean;
  /** How far the roof sticks out beyond the walls, in tiles. */
  over?: number;
  /** Colours of the triangular end wall. */
  end: BoxColors;
  timbered?: boolean;
  /** The end wall rises above the roof in steps. */
  stepped?: boolean;
  /** A little window under the ridge. */
  attic?: boolean;
}

interface RoofInfo {
  /** Both ends of the ridge, back first. */
  ridge: [Point, Point];
  /** A point on the visible slope: t along the ridge, s from eave (0) up to the ridge (1). */
  onSlope: (t: number, s: number) => Point;
  alongX: boolean;
}

/** A saddle roof with its visible gable end. */
function gable(g: G, r: Rect, z: number, rise: number, c: RoofColors, o: GableOpts): RoofInfo {
  const { ctx, pal } = g;
  const [lx, ly] = lengths(r);
  const alongX = o.alongX ?? lx >= ly;
  const ov = o.over ?? 0.07;
  const half = (alongX ? ly : lx) / 2;
  const drop = (rise * ov) / half;
  const zr = z + rise;
  let e0: Point, e1: Point, r0: Point, r1: Point, back: Point[], end: FaceFn, endLength: number;
  if (alongX) {
    const ym = (r.y0 + r.y1) / 2;
    end = rightOf(r);
    endLength = ly;
    back = [
      v(r.x0 - ov, r.y0 - ov, z - drop),
      v(r.x1 + ov, r.y0 - ov, z - drop),
      v(r.x1 + ov, ym, zr),
      v(r.x0 - ov, ym, zr),
    ];
    e0 = v(r.x0 - ov, r.y1 + ov, z - drop);
    e1 = v(r.x1 + ov, r.y1 + ov, z - drop);
    r0 = v(r.x0 - ov, ym, zr);
    r1 = v(r.x1 + ov, ym, zr);
  } else {
    const xm = (r.x0 + r.x1) / 2;
    end = leftOf(r);
    endLength = lx;
    back = [
      v(r.x0 - ov, r.y0 - ov, z - drop),
      v(r.x0 - ov, r.y1 + ov, z - drop),
      v(xm, r.y1 + ov, zr),
      v(xm, r.y0 - ov, zr),
    ];
    e0 = v(r.x1 + ov, r.y0 - ov, z - drop);
    e1 = v(r.x1 + ov, r.y1 + ov, z - drop);
    r0 = v(xm, r.y0 - ov, zr);
    r1 = v(xm, r.y1 + ov, zr);
  }
  // The end wall under the roof.
  const wallColor = alongX ? o.end.right : o.end.left;
  face(g, [end(0, z), end(1, z), end(0.5, zr)], wallColor);
  if (o.timbered) {
    ctx.beginPath();
    line(g, end(0, z), end(1, z));
    line(g, end(0.5, z), end(0.5, zr));
    line(g, end(0.25, z), end(0.5, z + rise * 0.5));
    line(g, end(0.75, z), end(0.5, z + rise * 0.5));
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = pal.timber;
    ctx.stroke();
  }
  if (o.attic) windowAt(g, end, endLength, 0.5, z + rise * 0.22, { h: 3, w: 0.05 });

  face(g, back, c.back);
  const slope = alongX ? c.left : c.right;
  face(g, [e0, e1, r1, r0], slope);
  // Courses of tiles or thatch.
  ctx.beginPath();
  const rows = Math.max(2, Math.round((half * 16 + rise) / 4.2));
  for (let i = 1; i < rows; i++) line(g, lerp(e0, r0, i / rows), lerp(e1, r1, i / rows));
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(30, 18, 10, 0.2)';
  ctx.stroke();
  // The thickness of the roof along the eave, and a light ridge.
  poly(g, [e0, e1, { x: e1.x, y: e1.y + 1.5 }, { x: e0.x, y: e0.y + 1.5 }], shade(slope, -0.32));
  ctx.beginPath();
  line(g, r0, r1);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.stroke();

  if (o.stepped) {
    // A stepped end wall standing proud of the roof.
    const steps = 4;
    const pts: Point[] = [end(-0.04, z - 1)];
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * 0.5 - 0.04;
      const t1 = ((i + 1) / steps) * 0.5 - 0.04;
      const top = z + (rise * (i + 1)) / steps + 2.5;
      pts.push(end(t0, top), end(t1, top));
    }
    for (let i = steps - 1; i >= 0; i--) {
      const t0 = 1 - (i / steps) * 0.5 + 0.04;
      const t1 = 1 - ((i + 1) / steps) * 0.5 + 0.04;
      const top = z + (rise * (i + 1)) / steps + 2.5;
      pts.push(end(t1, top), end(t0, top));
    }
    pts.push(end(1.04, z - 1));
    face(g, pts, wallColor);
    windowAt(g, end, endLength, 0.5, z + rise * 0.3, { h: 3.4, w: 0.05, arched: true });
  }
  const backEnd = alongX ? r0 : r0;
  const frontEnd = alongX ? r1 : r1;
  return {
    ridge: [backEnd, frontEnd],
    onSlope: (t, s) => lerp(lerp(e0, e1, t), lerp(r0, r1, t), s),
    alongX,
  };
}

/** A pointed roof on a square plan: towers, turrets, pavilions. */
function spire(g: G, r: Rect, z: number, rise: number, c: RoofColors): Point {
  const apex = v((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, z + rise);
  face(g, [v(r.x0, r.y1, z), v(r.x1, r.y1, z), apex], c.left);
  face(g, [v(r.x1, r.y1, z), v(r.x1, r.y0, z), apex], c.right);
  return apex;
}

/** A chimney standing on the roof at a screen position; it smokes if someone is home. */
function stack(
  g: G,
  at: Point,
  height: number,
  into: Emitter[] | null,
  smoking: boolean,
  seed: number,
): void {
  const { ctx, pal } = g;
  const brick = pal.walls.brick;
  ctx.fillStyle = brick.left;
  ctx.fillRect(at.x - 2, at.y - height, 2, height + 2);
  ctx.fillStyle = brick.right;
  ctx.fillRect(at.x, at.y - height, 2, height + 2);
  ctx.fillStyle = shade(brick.left, -0.3);
  ctx.fillRect(at.x - 2.6, at.y - height - 1.2, 5.2, 1.4);
  if (smoking) into?.push({ kind: 'smoke', x: at.x, y: at.y - height - 2, seed });
}

/** A small dormer window on the visible roof slope. */
function dormer(g: G, at: Point, c: RoofColors, wall: string): void {
  const { ctx, pal } = g;
  ctx.fillStyle = wall;
  ctx.fillRect(at.x - 2.6, at.y - 5, 5.2, 5);
  ctx.fillStyle = pal.window;
  ctx.fillRect(at.x - 1.5, at.y - 4, 3, 3);
  poly(
    g,
    [
      { x: at.x - 3.6, y: at.y - 4.6 },
      { x: at.x + 3.6, y: at.y - 4.6 },
      { x: at.x, y: at.y - 8.6 },
    ],
    c.right,
    OUTLINE,
  );
}

function barrel(g: G, gx: number, gy: number): void {
  const { ctx } = g;
  const p = v(gx, gy);
  ctx.fillStyle = '#7a5a3c';
  ctx.fillRect(p.x - 2.6, p.y - 5.5, 5.2, 5.5);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 5.5, 2.6, 1.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#9a7650';
  ctx.fill();
  ctx.fillStyle = 'rgba(30, 20, 12, 0.5)';
  ctx.fillRect(p.x - 2.6, p.y - 3.6, 5.2, 0.7);
}

function crate(g: G, gx: number, gy: number, color = '#a58254'): void {
  const r = rect(gx - 0.07, gy - 0.07, 0.14, 0.14);
  walls(g, r, 0, 3.6, { top: color, left: shade(color, -0.25), right: shade(color, -0.1) });
  lid(g, r, 3.6, shade(color, 0.12));
}

/** A sign hanging from a bracket at a point on a wall. */
function sign(g: G, at: Point, color: string): void {
  const { ctx, pal } = g;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x + 5, at.y + 1.5);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(at.x + 2, at.y + 1.6, 4.4, 4);
  ctx.strokeRect(at.x + 2, at.y + 1.6, 4.4, 4);
}

/** Plaster in one of a handful of soft tints, so a street is not all one colour. */
function tinted(c: BoxColors, seed: number): BoxColors {
  const tints = ['#fff4d6', '#f2d9a8', '#e9c9b0', '#d9dccb', '#f4e8c8', '#e6d2c4'];
  const tint = tints[seed % tints.length]!;
  const amount = 0.34;
  return {
    top: mix(c.top, tint, amount),
    left: mix(c.left, tint, amount * 0.7),
    right: mix(c.right, tint, amount),
  };
}

interface HallOpts {
  wall: WallKey | BoxColors;
  /** Height of the (upper) walls in world pixels. */
  h: number;
  tex?: Tex;
  /** A ground floor in another material. */
  base?: { wall: WallKey; h: number; tex?: Tex };
  /** How far the upper floors overhang the ground floor, in tiles. */
  jetty?: number;
  timber?: boolean;
  roof: RoofKey | RoofColors;
  rise: number;
  hip?: boolean;
  alongX?: boolean;
  over?: number;
  stepped?: boolean;
  attic?: boolean;
  /** Heights of the window rows. */
  rows?: number[];
  win?: WindowOpts;
  /** Where the door sits along the left wall (0..1), or null for none. */
  door?: number | null;
  doorArched?: boolean;
  /** Where along the ridge the chimney stands (0..1). */
  chimney?: number | null;
  smoke?: boolean;
  seed: number;
}

/** A complete simple building: walls, openings and a roof. Most buildings start from this. */
function hall(g: G, r: Rect, into: Emitter[] | null, o: HallOpts): RoofInfo & { top: number } {
  const { pal } = g;
  const upper = typeof o.wall === 'string' ? pal.walls[o.wall] : o.wall;
  const roofColors = typeof o.roof === 'string' ? vary(pal.roofs[o.roof], o.seed) : o.roof;
  const zBase = o.base?.h ?? 0;
  const top = zBase + o.h;
  const body = o.base && o.jetty ? grow(r, o.jetty) : r;
  if (o.base) walls(g, r, 0, zBase, pal.walls[o.base.wall], o.base.tex ?? 'stone', o.seed);
  if (o.base && o.jetty) {
    // The underside of the overhang.
    poly(
      g,
      [
        onLeft(body, 0, zBase),
        onLeft(body, 1, zBase),
        onLeft(r, 1, zBase - 1.2),
        onLeft(r, 0, zBase - 1.2),
      ],
      'rgba(30, 20, 12, 0.35)',
    );
  }
  walls(g, body, zBase, top, upper, o.tex ?? 'plain', o.seed);
  if (o.timber) timber(g, body, zBase, top, 7);
  const doorAt = o.door === undefined ? 0.5 : o.door;
  for (const z of o.rows ?? []) {
    const onGround = z < 7;
    const where = z < zBase ? r : body;
    windows(g, where, z, {
      ...o.win,
      ...(onGround && doorAt !== null ? { skipLeftAt: doorAt } : {}),
    });
  }
  if (doorAt !== null) door(g, leftOf(r), r.x1 - r.x0, doorAt, { arched: o.doorArched ?? false });
  eaveShade(g, body, top);
  let info: RoofInfo;
  if (o.hip) {
    const [a, b] = hipRoof(g, grow(body, o.over ?? 0.06), top, o.rise, roofColors, o.alongX) as [
      Point,
      Point,
    ];
    info = { ridge: [a, b], onSlope: (t) => lerp(a, b, t), alongX: o.alongX ?? true };
  } else {
    info = gable(g, body, top, o.rise, roofColors, {
      ...(o.alongX === undefined ? {} : { alongX: o.alongX }),
      ...(o.over === undefined ? {} : { over: o.over }),
      end: upper,
      timbered: o.timber ?? false,
      stepped: o.stepped ?? false,
      attic: o.attic ?? false,
    });
  }
  if (o.chimney !== null && o.chimney !== undefined) {
    const at = lerp(info.ridge[0], info.ridge[1], o.chimney);
    stack(g, { x: at.x, y: at.y + 2.5 }, 8, into, o.smoke ?? true, o.seed);
  }
  return { ...info, top };
}

/** Local coordinates for a building: u runs along its longer side, v across. */
function along(b: Building) {
  const alongX = b.w >= b.h;
  return {
    alongX,
    U: alongX ? b.w : b.h,
    V: alongX ? b.h : b.w,
    R(u0: number, v0: number, u1: number, v1: number): Rect {
      return alongX
        ? { x0: b.x + u0, y0: b.y + v0, x1: b.x + u1, y1: b.y + v1 }
        : { x0: b.x + v0, y0: b.y + u0, x1: b.x + v1, y1: b.y + u1 };
    },
    /** A grid position from local coordinates. */
    at(u: number, w: number): [number, number] {
      return alongX ? [b.x + u, b.y + w] : [b.x + w, b.y + u];
    },
  };
}

/** Parts of a building, painted back to front. */
class Parts {
  private readonly list: { depth: number; draw: () => void }[] = [];

  add(r: Rect, draw: () => void): void {
    this.list.push({ depth: r.x1 + r.y1, draw });
  }

  paint(): void {
    this.list.sort((a, b) => a.depth - b.depth);
    for (const p of this.list) p.draw();
  }
}

/** What stands on top of a tower of faith: a spire, a dome, a pagoda or a plain roof. */
function crown(g: G, r: Rect, z: number, height: number): void {
  const { ctx, pal } = g;
  const size = r.x1 - r.x0;
  if (pal.faith === 'dome') {
    const c = v((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, z);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, size * 24, size * 28, 0, Math.PI, 0);
    ctx.fillStyle = pal.roofs.green.right;
    ctx.fill();
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = pal.ink;
    ctx.fillRect(c.x - 0.6, c.y - size * 28 - 6, 1.2, 6);
  } else if (pal.faith === 'pagoda') {
    tiers(g, r.x0, r.y0, z - 3, 2, 0, size);
  } else if (pal.faith === 'plain') {
    spire(g, grow(r, 0.05), z, height * 0.35, pal.roofs.thatch);
  } else {
    const apex = spire(g, grow(r, 0.03), z, height, pal.roofs.slate);
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(apex.x, apex.y - 7);
    ctx.moveTo(apex.x - 2.2, apex.y - 4.6);
    ctx.lineTo(apex.x + 2.2, apex.y - 4.6);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
  }
}

/** Little merlons around the top of a tower. */
function merlons(g: G, r: Rect, z: number, c: BoxColors): void {
  const s = (r.x1 - r.x0) * 0.26;
  for (const [x, y] of [
    [r.x0, r.y0],
    [r.x1 - s, r.y0],
    [r.x0, r.y1 - s],
    [r.x1 - s, r.y1 - s],
  ] as const) {
    const m = rect(x, y, s, s);
    walls(g, m, z, z + 4, c);
    lid(g, m, z + 4, c.top);
  }
}

// ---------- houses ----------

function drawHouse(g: G, b: Building, into: Emitter[] | null): void {
  const { ctx, pal } = g;
  const { x, y, w, h } = b;
  const level = b.house?.level ?? 1;
  const pop = b.house?.pop ?? 0;
  if (pop === 0 && level === 1) {
    // An empty plot: a staked-out patch of ground with a fence.
    ctx.lineWidth = 1;
    poly(g, diamond(x, y, w, h, 0.16), 'rgba(255, 255, 255, 0.14)', 'rgba(59, 42, 32, 0.3)');
    ctx.beginPath();
    for (const [px, py] of [
      [0.16, 0.16],
      [0.84, 0.16],
      [0.84, 0.84],
      [0.16, 0.84],
    ] as const) {
      const foot = v(x + px * w, y + py * h);
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(foot.x, foot.y - 4);
    }
    ctx.strokeStyle = pal.trunk;
    ctx.stroke();
    return;
  }
  const seed = tileHash(x * 31 + 7, y * 17 + 3);
  // Single plots turn their ridge this way or that; merged houses follow their long side.
  const alongX = w === h ? (seed & 4) === 0 : w > h;
  const smoke = pop > 0;
  const chimneyAt = 0.25 + ((seed >> 6) % 3) * 0.25;
  const shutters = ['#6f8660', '#7a5a48', '#5f7386', '#8a4f43'][(seed >> 9) % 4]!;
  shadow(g, b, [14, 18, 28, 36, 42][Math.min(level, 5) - 1]!);

  if (level === 1) {
    const r = rect(x, y, w, h, 0.2);
    hall(g, r, into, {
      wall: 'wattle',
      tex: 'wattle',
      h: 5.5,
      roof: 'thatch',
      rise: 10,
      hip: true,
      over: 0.1,
      alongX,
      rows: [],
      door: 0.5,
      chimney: null,
      seed,
    });
    // A woodpile by the door.
    const [px, py] = [x + 0.86 * w, y + 0.9 * h];
    crate(g, px, py, '#8a6a48');
  } else if (level === 2) {
    const r = rect(x, y, w, h, 0.16);
    hall(g, r, into, {
      wall: tinted(pal.walls.clay, seed),
      h: 8.5,
      roof: 'shingle',
      rise: 9.5,
      alongX,
      rows: [3.2],
      win: { h: 3.2 },
      door: 0.5,
      chimney: chimneyAt,
      smoke,
      seed,
    });
  } else if (level === 3) {
    const r = rect(x, y, w, h, 0.13);
    hall(g, r, into, {
      base: { wall: 'paleStone', h: 7 },
      jetty: 0.035,
      wall: tinted(pal.walls.plaster, seed),
      timber: true,
      h: 7.5,
      roof: 'tile',
      rise: 11.5,
      alongX,
      attic: true,
      rows: [2.8, 9.4],
      win: { shutters },
      door: 0.5,
      chimney: chimneyAt,
      smoke,
      seed,
    });
  } else if (level === 4) {
    const r = rect(x, y, w, h, 0.11);
    const info = hall(g, r, into, {
      base: { wall: 'paleStone', h: 8 },
      jetty: 0.04,
      wall: tinted(pal.walls.plaster, seed),
      timber: true,
      h: 14,
      roof: 'darkTile',
      rise: 13,
      alongX,
      attic: true,
      rows: [3, 10.4, 17.4],
      win: { shutters },
      door: 0.5,
      doorArched: true,
      chimney: chimneyAt,
      smoke,
      seed,
    });
    dormer(
      g,
      info.onSlope(chimneyAt > 0.5 ? 0.3 : 0.7, 0.42),
      vary(pal.roofs.darkTile, seed),
      pal.walls.plaster.right,
    );
  } else {
    const r = rect(x, y, w, h, 0.09);
    const wall = tinted(pal.walls.ochre, seed + 2);
    const info = hall(g, r, into, {
      wall,
      tex: 'plain',
      h: 27,
      roof: 'slate',
      rise: 13,
      alongX,
      stepped: true,
      rows: [4, 12, 20],
      win: { arched: true, h: 4.6 },
      door: 0.5,
      doorArched: true,
      chimney: chimneyAt,
      smoke,
      seed,
    });
    // String courses between the storeys, and an oriel on the long side.
    ctx.beginPath();
    for (const z of [9.8, 17.8]) {
      line(g, onLeft(r, 0, z), onLeft(r, 1, z));
      line(g, onRight(r, 0, z), onRight(r, 1, z));
    }
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(60, 44, 30, 0.45)';
    ctx.stroke();
    dormer(g, info.onSlope(0.3, 0.4), pal.roofs.slate, wall.right);
    dormer(g, info.onSlope(0.7, 0.4), pal.roofs.slate, wall.right);
  }
}

// ---------- everything else ----------

type Draw = (g: G, b: Building, into: Emitter[] | null, seed: number) => void;

const well: Draw = (g, b) => {
  const { ctx, pal } = g;
  const c = v(b.x + 0.5, b.y + 0.5);
  const stone = pal.walls.stone;
  // A round stone rim.
  ctx.fillStyle = stone.left;
  ctx.fillRect(c.x - 10, c.y - 5, 10, 5);
  ctx.fillStyle = stone.right;
  ctx.fillRect(c.x, c.y - 5, 10, 5);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 10, 5, 0, 0, Math.PI);
  ctx.fillStyle = stone.left;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 5, 10, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = stone.top;
  ctx.fill();
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 5, 6.5, 3.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = pal.basin;
  ctx.fill();
  // Posts, a windlass and a little roof.
  ctx.beginPath();
  for (const dx of [-8, 8]) {
    ctx.moveTo(c.x + dx, c.y - 5);
    ctx.lineTo(c.x + dx, c.y - 19);
  }
  ctx.moveTo(c.x - 8, c.y - 15);
  ctx.lineTo(c.x + 8, c.y - 15);
  ctx.moveTo(c.x, c.y - 15);
  ctx.lineTo(c.x, c.y - 8);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
  gable(g, rect(b.x, b.y, 1, 1, 0.27), 19, 6, pal.roofs.shingle, {
    end: pal.walls.wood,
    over: 0.05,
  });
};

const cistern: Draw = (g, b) => {
  const { ctx, pal } = g;
  const r = rect(b.x, b.y, b.w, b.h, 0.12);
  walls(g, r, 0, 6, pal.walls.stone, 'stone', 5);
  lid(g, r, 6, pal.walls.stone.top);
  poly(g, diamond(b.x, b.y, b.w, b.h, 0.26, 6), pal.basin, OUTLINE);
  ctx.beginPath();
  for (const [dx, dy] of [
    [0.75, 0.9],
    [1.15, 1.1],
  ] as const) {
    const p = v(b.x + dx, b.y + dy, 6);
    ctx.moveTo(p.x - 5, p.y);
    ctx.quadraticCurveTo(p.x, p.y - 2, p.x + 5, p.y);
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.stroke();
  for (const [px, py] of [
    [0.12, 0.12],
    [b.w - 0.3, 0.12],
    [0.12, b.h - 0.3],
    [b.w - 0.3, b.h - 0.3],
  ] as const) {
    const post = rect(b.x + px, b.y + py, 0.18, 0.18);
    walls(g, post, 6, 10, pal.walls.stone);
    lid(g, post, 10, pal.walls.stone.top);
  }
};

const fountain: Draw = (g, b) => {
  const { ctx, pal } = g;
  const c = v(b.x + 0.5, b.y + 0.5);
  const stone = pal.walls.paleStone;
  ctx.fillStyle = stone.left;
  ctx.fillRect(c.x - 13, c.y - 4, 13, 4);
  ctx.fillStyle = stone.right;
  ctx.fillRect(c.x, c.y - 4, 13, 4);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 13, 6.5, 0, 0, Math.PI);
  ctx.fillStyle = stone.left;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 4, 13, 6.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = stone.top;
  ctx.fill();
  ctx.lineWidth = 0.55;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 4, 10, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = pal.basin;
  ctx.fill();
  // The pillar with an upper bowl, and water falling from it.
  ctx.fillStyle = stone.left;
  ctx.fillRect(c.x - 1.6, c.y - 17, 1.6, 13);
  ctx.fillStyle = stone.right;
  ctx.fillRect(c.x, c.y - 17, 1.6, 13);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 17, 5.5, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = stone.top;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (const dx of [-4.5, 4.5]) {
    ctx.moveTo(c.x + dx, c.y - 17);
    ctx.quadraticCurveTo(c.x + dx * 1.5, c.y - 12, c.x + dx * 1.4, c.y - 5);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(220, 240, 250, 0.85)';
  ctx.stroke();
  ctx.fillStyle = pal.roofs.awning.right;
  ctx.fillRect(c.x - 0.8, c.y - 21, 1.6, 4);
};

const stall: Draw = (g, b) => {
  const { ctx, pal } = g;
  const r = rect(b.x, b.y, 1, 1, 0.2);
  shadow(g, b, 10);
  // A counter with wares under a striped awning on four posts.
  const counter = rect(b.x, b.y, 1, 1, 0.3);
  walls(g, counter, 0, 4.5, pal.walls.wood, 'plank', 3);
  lid(g, counter, 4.5, pal.walls.wood.top);
  ['#c46a5a', '#d9b44a', '#7da05a', '#c98a4a'].forEach((color, i) => {
    const p = v(b.x + 0.36 + (i % 2) * 0.24, b.y + 0.4 + Math.floor(i / 2) * 0.22, 4.5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  for (const [px, py] of [
    [r.x0, r.y1],
    [r.x1, r.y1],
    [r.x1, r.y0],
  ] as const) {
    line(g, v(px, py, 0), v(px, py, 11));
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
  const cloth = pal.roofs.awning;
  const info = gable(g, grow(r, 0.04), 11, 5, cloth, {
    end: { top: cloth.right, left: cloth.left, right: cloth.right },
    over: 0.04,
  });
  // Stripes down the awning.
  ctx.beginPath();
  for (const t of [0.2, 0.5, 0.8]) line(g, info.onSlope(t, 0), info.onSlope(t, 1));
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(176, 62, 44, 0.8)';
  ctx.stroke();
};

const granary: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 40);
  const a = along(b);
  const r = a.R(0.14, 0.2, a.U - 0.14, a.V - 0.2);
  const info = hall(g, r, null, {
    base: { wall: 'stone', h: 6 },
    wall: 'wood',
    tex: 'plank',
    h: 17,
    roof: 'shingle',
    rise: 17,
    alongX: a.alongX,
    rows: [10, 17],
    win: { h: 2.6, w: 0.04, per: 1.4 },
    door: 0.5,
    chimney: null,
    seed,
  });
  // A hoist beam under the ridge at the gable end.
  const tip = info.ridge[1];
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y + 4);
  ctx.lineTo(tip.x + (a.alongX ? 7 : -7), tip.y + 7.5);
  ctx.lineTo(tip.x + (a.alongX ? 7 : -7), tip.y + 20);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
  const [sx, sy] = a.at(a.U - 0.1, a.V - 0.12);
  crate(g, sx, sy, '#c9b07a');
};

const bakery: Draw = (g, b, into, seed) => {
  const { pal } = g;
  shadow(g, b, 22);
  const a = along(b);
  const r = a.R(0.12, 0.13, a.U - 0.12, a.V - 0.13);
  const info = hall(g, r, into, {
    base: { wall: 'paleStone', h: 5 },
    wall: tinted(pal.walls.plaster, seed),
    timber: true,
    h: 6.5,
    roof: 'darkTile',
    rise: 9.5,
    alongX: a.alongX,
    rows: [3],
    door: 0.3,
    chimney: null,
    seed,
  });
  // The oven's big chimney, and a loaf for a sign.
  const at = lerp(info.ridge[0], info.ridge[1], 0.25);
  stack(g, { x: at.x, y: at.y + 3 }, 12, into, !b.damaged, seed);
  sign(g, onLeft(r, 0.72, 9), '#d9a04a');
};

const markethall: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 34);
  const a = along(b);
  const r = a.R(0.1, 0.12, a.U - 0.1, a.V - 0.12);
  const [lx, ly] = lengths(r);
  // An open arcade below, a timbered floor above.
  walls(g, r, 0, 9, pal.walls.paleStone, 'stone', seed);
  for (let i = 0; i < Math.round(lx * 2); i++)
    arch(g, leftOf(r), lx, (i + 0.5) / Math.round(lx * 2), 0.17, 7.5);
  for (let i = 0; i < Math.round(ly * 2); i++)
    arch(g, rightOf(r), ly, (i + 0.5) / Math.round(ly * 2), 0.17, 7.5);
  const upper = grow(r, 0.04);
  walls(g, upper, 9, 16.5, tinted(pal.walls.plaster, seed));
  timber(g, upper, 9, 16.5, 7.5);
  windows(g, upper, 11.2, { h: 3.4 });
  eaveShade(g, upper, 16.5);
  const info = gable(g, upper, 16.5, 14, vary(pal.roofs.tile, seed), {
    alongX: a.alongX,
    end: pal.walls.plaster,
    timbered: true,
    attic: true,
  });
  // A ridge turret with a weathervane.
  const mid = lerp(info.ridge[0], info.ridge[1], 0.5);
  ctx.fillStyle = pal.walls.wood.left;
  ctx.fillRect(mid.x - 2.5, mid.y - 6, 2.5, 7);
  ctx.fillStyle = pal.walls.wood.right;
  ctx.fillRect(mid.x, mid.y - 6, 2.5, 7);
  poly(
    g,
    [
      { x: mid.x - 4, y: mid.y - 6 },
      { x: mid.x + 4, y: mid.y - 6 },
      { x: mid.x, y: mid.y - 14 },
    ],
    pal.roofs.slate.right,
    OUTLINE,
  );
  const [cx, cy] = a.at(a.U - 0.08, a.V - 0.04);
  barrel(g, cx, cy);
};

/** A place of faith: a nave with a tower at the back, larger with every step. */
function sanctuary(
  g: G,
  b: Building,
  o: {
    wallH: number;
    rise: number;
    tower: number;
    spire: number;
    aisles: boolean;
    transept: boolean;
    twin: boolean;
  },
): void {
  const { ctx, pal } = g;
  const a = along(b);
  const stone = pal.walls.paleStone;
  const slate = pal.roofs.slate;
  const parts = new Parts();
  const margin = 0.1;
  const naveHalf = o.aisles ? a.V * 0.19 : a.V / 2 - margin - 0.02;
  const mid = a.V / 2;
  const nave = a.R(margin + (o.twin ? 0 : 0.25), mid - naveHalf, a.U - margin, mid + naveHalf);
  shadow(g, b, o.wallH + o.rise);

  if (o.aisles) {
    for (const [v0, v1] of [
      [margin, mid - naveHalf],
      [mid + naveHalf, a.V - margin],
    ] as const) {
      const aisle = a.R(margin + 0.3, v0, a.U - margin - 0.1, v1);
      parts.add(aisle, () => {
        walls(g, aisle, 0, o.wallH * 0.5, stone, 'stone', 11);
        windows(g, aisle, o.wallH * 0.14, { arched: true, h: 5, per: 1.4 });
        lid(g, aisle, o.wallH * 0.5, slate.left);
      });
    }
  }
  parts.add(nave, () => {
    walls(g, nave, 0, o.wallH, stone, 'stone', 7);
    windows(g, nave, o.aisles ? o.wallH * 0.62 : o.wallH * 0.3, {
      arched: true,
      h: o.aisles ? 5 : 6.5,
      per: 1.5,
    });
    eaveShade(g, nave, o.wallH);
    const end = a.alongX ? rightOf(nave) : leftOf(nave);
    const endLength = a.alongX ? nave.y1 - nave.y0 : nave.x1 - nave.x0;
    gable(g, nave, o.wallH, o.rise, slate, { alongX: a.alongX, end: stone, over: 0.04 });
    // The west front: a tall doorway and a round window above it.
    door(g, end, endLength, 0.5, {
      arched: true,
      h: Math.min(10, o.wallH * 0.5),
      w: Math.min(0.13, endLength * 0.16),
    });
    const rose = end(0.5, o.wallH * 0.82);
    ctx.beginPath();
    ctx.arc(rose.x, rose.y, Math.min(4.2, endLength * 3.4), 0, Math.PI * 2);
    ctx.fillStyle = FRAME;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rose.x, rose.y, Math.min(3, endLength * 2.4), 0, Math.PI * 2);
    ctx.fillStyle = pal.window;
    ctx.fill();
  });
  if (o.transept) {
    const cross = a.R(a.U * 0.36, margin, a.U * 0.6, a.V - margin);
    parts.add(cross, () => {
      walls(g, cross, 0, o.wallH, stone, 'stone', 5);
      windows(g, cross, o.wallH * 0.4, { arched: true, h: 8, per: 0.9 });
      gable(g, cross, o.wallH, o.rise, slate, { alongX: !a.alongX, end: stone, over: 0.04 });
      // A slender spire over the crossing.
      const c = a.R(a.U * 0.48 - 0.12, mid - 0.12, a.U * 0.48 + 0.12, mid + 0.12);
      spire(g, c, o.wallH + o.rise - 2, 26, slate);
    });
  }
  const size = Math.min(0.9, a.V * (o.twin ? 0.24 : 0.42));
  const towers: Rect[] = o.twin
    ? [
        a.R(a.U - margin - size, margin, a.U - margin, margin + size),
        a.R(a.U - margin - size, a.V - margin - size, a.U - margin, a.V - margin),
      ]
    : [a.R(margin, mid - size / 2, margin + size, mid + size / 2)];
  for (const tower of towers) {
    parts.add(tower, () => {
      walls(g, tower, 0, o.tower, stone, 'stone', 9);
      windows(g, tower, o.tower - 11, { arched: true, h: 6, per: 1.2 / Math.max(0.4, size) });
      windows(g, tower, o.tower * 0.45, { h: 3, w: 0.03, per: 1.2 / Math.max(0.4, size) });
      crown(g, tower, o.tower, o.spire);
    });
  }
  parts.paint();
}

const chapel: Draw = (g, b) =>
  sanctuary(g, b, {
    wallH: 13,
    rise: 12,
    tower: 27,
    spire: 20,
    aisles: false,
    transept: false,
    twin: false,
  });
const church: Draw = (g, b) =>
  sanctuary(g, b, {
    wallH: 22,
    rise: 17,
    tower: 48,
    spire: 34,
    aisles: true,
    transept: false,
    twin: false,
  });
const cathedral: Draw = (g, b) =>
  sanctuary(g, b, {
    wallH: 36,
    rise: 24,
    tower: 74,
    spire: 44,
    aisles: true,
    transept: true,
    twin: true,
  });

const firewatch: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 30);
  const base = rect(b.x, b.y, 1, 1, 0.22);
  walls(g, base, 0, 15, pal.walls.brick, 'brick', seed);
  door(g, leftOf(base), 0.56, 0.5, { arched: true, color: pal.roofs.red.left });
  windows(g, base, 9, { h: 3, per: 2 });
  // A timber lookout that juts out over the base.
  const top = rect(b.x, b.y, 1, 1, 0.16);
  walls(g, top, 15, 22, pal.walls.wood, 'plank', seed);
  windows(g, top, 17, { h: 3.6, per: 2.4 });
  hipRoof(g, grow(top, 0.06), 22, 9, pal.roofs.red);
  // The fire bell and a water barrel.
  const bell = v(b.x + 0.5, b.y + 0.5, 34);
  ctx.fillStyle = '#c9a23a';
  ctx.beginPath();
  ctx.arc(bell.x, bell.y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  barrel(g, b.x + 0.88, b.y + 0.9);
};

const nightwatch: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 30);
  const r = rect(b.x, b.y, 1, 1, 0.25);
  const stone = pal.walls.darkStone;
  walls(g, r, 0, 27, stone, 'stone', seed);
  door(g, leftOf(r), 0.5, 0.5, { arched: true });
  windows(g, r, 12, { h: 3.4, w: 0.035, per: 2 });
  // A lit lantern room under the battlements.
  windows(g, r, 20, { h: 4, per: 3 });
  const glow = onLeft(r, 0.5, 22);
  ctx.fillStyle = 'rgba(246, 213, 124, 0.9)';
  ctx.fillRect(glow.x - 2, glow.y - 2, 4, 4);
  lid(g, r, 27, stone.top);
  merlons(g, r, 27, stone);
  spire(g, rect(b.x, b.y, 1, 1, 0.34), 28, 9, pal.roofs.blue);
};

const bathhouse: Draw = (g, b, into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 22);
  const r = rect(b.x, b.y, b.w, b.h, 0.1);
  const stone = pal.walls.paleStone;
  const [lx, ly] = lengths(r);
  walls(g, r, 0, 12, stone, 'stone', seed);
  arch(g, leftOf(r), lx, 0.5, 0.13, 8.5);
  for (const t of [0.18, 0.82]) windowAt(g, leftOf(r), lx, t, 6, { arched: true, h: 3.4 });
  for (const t of [0.2, 0.5, 0.8]) windowAt(g, rightOf(r), ly, t, 6, { arched: true, h: 3.4 });
  // A flat roof behind a low parapet…
  lid(g, r, 12, shade(stone.top, -0.1));
  const parapet = grow(r, -0.07);
  lid(g, parapet, 12, shade(stone.top, -0.2));
  // …with a dome on a drum over the hot room, small ones at the corners, and steam.
  const dome = (gx: number, gy: number, rx: number, lift: number) => {
    const c = v(gx, gy, 12);
    ctx.fillStyle = stone.left;
    ctx.fillRect(c.x - rx, c.y - lift, rx, lift);
    ctx.fillStyle = stone.right;
    ctx.fillRect(c.x, c.y - lift, rx, lift);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, rx / 2, 0, 0, Math.PI);
    ctx.fillStyle = stone.left;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - lift, rx, rx * 0.95, 0, Math.PI, 0);
    ctx.ellipse(c.x, c.y - lift, rx, rx / 2, 0, 0, Math.PI);
    ctx.fillStyle = pal.roofs.blue.right;
    ctx.fill();
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(c.x - rx * 0.35, c.y - lift - rx * 0.5, rx * 0.3, rx * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();
    return c;
  };
  dome(b.x + 0.42, b.y + 0.42, 5, 2);
  const c = dome(b.x + b.w / 2, b.y + b.h / 2, 13, 4);
  dome(b.x + b.w - 0.42, b.y + b.h - 0.42, 5, 2);
  if (!b.damaged) {
    into?.push({ kind: 'smoke', x: c.x - 11, y: c.y - 8, seed });
    into?.push({ kind: 'smoke', x: c.x + 12, y: c.y - 6, seed: seed + 37 });
  }
};

const hospital: Draw = (g, b, into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 30);
  const a = along(b);
  const parts = new Parts();
  // The long ward, with a walk of arches along the front.
  const ward = a.R(0.1, 0.12, a.U - 0.1, a.V * 0.62);
  const walk = a.R(0.25, a.V * 0.62, a.U - 0.25, a.V - 0.14);
  parts.add(ward, () => {
    const info = hall(g, ward, into, {
      wall: tinted(pal.walls.plaster, seed),
      h: 15,
      roof: 'green',
      rise: 12,
      alongX: a.alongX,
      rows: [4, 10],
      win: { arched: true },
      door: null,
      chimney: 0.7,
      smoke: !b.damaged,
      seed,
    });
    const mid = lerp(info.ridge[0], info.ridge[1], 0.3);
    ctx.fillStyle = pal.walls.paleStone.right;
    ctx.fillRect(mid.x - 2, mid.y - 7, 4, 8);
    poly(
      g,
      [
        { x: mid.x - 3.4, y: mid.y - 7 },
        { x: mid.x + 3.4, y: mid.y - 7 },
        { x: mid.x, y: mid.y - 14 },
      ],
      pal.roofs.green.right,
      OUTLINE,
    );
  });
  parts.add(walk, () => {
    const stone = pal.walls.paleStone;
    walls(g, walk, 0, 8, stone);
    const [lx, ly] = lengths(walk);
    const side = a.alongX ? leftOf(walk) : rightOf(walk);
    const length = a.alongX ? lx : ly;
    const n = Math.max(2, Math.round(length * 2));
    for (let i = 0; i < n; i++) arch(g, side, length, (i + 0.5) / n, 0.16, 6.6);
    lid(g, walk, 8, pal.roofs.green.left);
  });
  parts.paint();
};

const tavern: Draw = (g, b, into, seed) => {
  const { pal } = g;
  shadow(g, b, 26);
  const a = along(b);
  const r = a.R(0.11, 0.12, a.U - 0.11, a.V - 0.12);
  hall(g, r, into, {
    base: { wall: 'stone', h: 6.5 },
    jetty: 0.04,
    wall: tinted(pal.walls.plaster, seed + 1),
    timber: true,
    h: 7.5,
    roof: 'shingle',
    rise: 11,
    alongX: a.alongX,
    attic: true,
    rows: [2.6, 9],
    win: { shutters: '#8a4f43' },
    door: 0.35,
    chimney: 0.7,
    smoke: !b.damaged,
    seed,
  });
  // The sign, and barrels by the door.
  sign(g, onLeft(r, 0.08, 11), '#c9a23a');
  const [bx, by] = a.at(a.U - 0.1, a.V - 0.06);
  barrel(g, bx, by);
  barrel(g, bx - 0.14, by + 0.02);
};

const school: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 28);
  const r = rect(b.x, b.y, b.w, b.h, 0.14);
  const info = hall(g, r, null, {
    wall: tinted(pal.walls.ochre, seed),
    h: 15,
    roof: 'slate',
    rise: 11,
    rows: [4, 10.5],
    win: { arched: true, h: 4.2 },
    door: 0.5,
    doorArched: true,
    chimney: null,
    seed,
  });
  // A bell turret on the ridge.
  const mid = lerp(info.ridge[0], info.ridge[1], 0.5);
  ctx.fillStyle = pal.walls.ochre.left;
  ctx.fillRect(mid.x - 2.4, mid.y - 7, 2.4, 8);
  ctx.fillStyle = pal.walls.ochre.right;
  ctx.fillRect(mid.x, mid.y - 7, 2.4, 8);
  ctx.fillStyle = pal.ink;
  ctx.fillRect(mid.x - 1, mid.y - 5.5, 2, 3);
  poly(
    g,
    [
      { x: mid.x - 3.8, y: mid.y - 7 },
      { x: mid.x + 3.8, y: mid.y - 7 },
      { x: mid.x, y: mid.y - 14 },
    ],
    pal.roofs.slate.right,
    OUTLINE,
  );
};

const weaver: Draw = (g, b, into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 24);
  const a = along(b);
  const r = a.R(0.12, 0.14, a.U - 0.55, a.V - 0.14);
  hall(g, r, into, {
    base: { wall: 'paleStone', h: 5 },
    wall: tinted(pal.walls.plaster, seed),
    timber: true,
    h: 7,
    roof: 'thatch',
    rise: 12,
    alongX: !a.alongX,
    rows: [3.4],
    door: 0.5,
    chimney: 0.4,
    smoke: !b.damaged,
    seed,
  });
  // Lengths of dyed cloth drying on a rack.
  const [x0, y0] = a.at(a.U - 0.4, 0.25);
  const [x1, y1] = a.at(a.U - 0.4, a.V - 0.25);
  const p0 = v(x0, y0, 12);
  const p1 = v(x1, y1, 12);
  ctx.beginPath();
  for (const [px, py] of [
    [x0, y0],
    [x1, y1],
  ] as const) {
    line(g, v(px, py), v(px, py, 12));
  }
  line(g, p0, p1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
  ['#9a79b8', '#c46a5a', '#d9b44a', '#5f86a8'].forEach((color, i) => {
    const s0 = lerp(p0, p1, 0.08 + i * 0.22);
    const s1 = lerp(p0, p1, 0.26 + i * 0.22);
    poly(g, [s0, s1, { x: s1.x, y: s1.y + 9 }, { x: s0.x, y: s0.y + 9 }], color, OUTLINE);
  });
};

const smithy: Draw = (g, b, into, seed) => {
  const { ctx } = g;
  shadow(g, b, 24);
  const r = rect(b.x, b.y, b.w, b.h, 0.13);
  const [lx] = lengths(r);
  const info = hall(g, r, into, {
    wall: 'darkStone',
    tex: 'stone',
    h: 10,
    roof: 'shingle',
    rise: 10,
    rows: [],
    door: null,
    chimney: null,
    seed,
  });
  // The open forge, glowing.
  arch(g, leftOf(r), lx, 0.36, 0.3, 8.5);
  const fire = onLeft(r, 0.36, 2);
  const glow = ctx.createRadialGradient(fire.x, fire.y, 0, fire.x, fire.y, 8);
  glow.addColorStop(0, 'rgba(255, 190, 80, 0.95)');
  glow.addColorStop(1, 'rgba(230, 90, 30, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(fire.x - 8, fire.y - 8, 16, 12);
  windowAt(g, leftOf(r), lx, 0.82, 4, { h: 3.2 });
  const at = lerp(info.ridge[0], info.ridge[1], 0.3);
  stack(g, { x: at.x, y: at.y + 3 }, 13, into, !b.damaged, seed);
  // An anvil on its block.
  const anvil = v(b.x + b.w - 0.25, b.y + b.h - 0.02);
  ctx.fillStyle = '#6b5038';
  ctx.fillRect(anvil.x - 2, anvil.y - 3, 4, 3);
  ctx.fillStyle = '#3d3a3a';
  ctx.fillRect(anvil.x - 3.4, anvil.y - 5, 6.8, 2);
};

const brewery: Draw = (g, b, into, seed) => {
  shadow(g, b, 28);
  const a = along(b);
  const r = a.R(0.12, 0.12, a.U - 0.12, a.V - 0.3);
  const info = hall(g, r, into, {
    wall: 'brick',
    tex: 'brick',
    h: 13,
    roof: 'darkTile',
    rise: 11,
    alongX: a.alongX,
    rows: [4, 9.5],
    win: { arched: true, h: 3.2 },
    door: 0.5,
    doorArched: true,
    chimney: null,
    seed,
  });
  const at = lerp(info.ridge[0], info.ridge[1], 0.22);
  stack(g, { x: at.x, y: at.y + 3 }, 15, into, !b.damaged, seed);
  // Barrels waiting for the carter.
  for (const u of [0.35, 0.55, 0.75, 1.3, 1.5]) {
    const [bx, by] = a.at(u * (a.U / 2), a.V - 0.12);
    barrel(g, bx, by);
  }
};

const tannery: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 14);
  const a = along(b);
  const shed = a.R(0.12, 0.12, a.U * 0.52, a.V - 0.14);
  hall(g, shed, null, {
    wall: 'darkWood',
    tex: 'plank',
    h: 7.5,
    roof: 'thatch',
    rise: 9,
    alongX: !a.alongX,
    rows: [],
    door: 0.5,
    chimney: null,
    seed,
  });
  // Vats of dye and lime, and hides stretched on frames.
  ['#8a5a2c', '#b9853a', '#7a3f2c', '#c9b99a'].forEach((color, i) => {
    const [vx, vy] = a.at(a.U * 0.66 + (i % 2) * 0.42, 0.42 + Math.floor(i / 2) * 0.6);
    const p = v(vx, vy);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 2, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.walls.wood.left;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 3.4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  });
  const [fx, fy] = a.at(a.U * 0.62, a.V - 0.2);
  const [tx, ty] = a.at(a.U - 0.18, a.V - 0.2);
  const f0 = v(fx, fy, 9);
  const f1 = v(tx, ty, 9);
  ctx.beginPath();
  line(g, v(fx, fy), f0);
  line(g, v(tx, ty), f1);
  line(g, f0, f1);
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
  for (const t of [0.1, 0.55]) {
    const s0 = lerp(f0, f1, t);
    const s1 = lerp(f0, f1, t + 0.34);
    poly(g, [s0, s1, { x: s1.x, y: s1.y + 7 }, { x: s0.x, y: s0.y + 7 }], '#d2b48a', OUTLINE);
  }
};

const manufactory: Draw = (g, b, into, seed) => {
  const { pal } = g;
  shadow(g, b, 30);
  const a = along(b);
  const r = a.R(0.09, 0.12, a.U - 0.09, a.V - 0.12);
  const info = hall(g, r, into, {
    wall: 'brick',
    tex: 'brick',
    h: 15,
    roof: 'shingle',
    rise: 12,
    alongX: a.alongX,
    rows: [3.6, 9.6],
    win: { arched: true, h: 3.6, per: 2.6 },
    door: 0.5,
    doorArched: true,
    chimney: null,
    seed,
  });
  // Dormers to light the looms, and a tall chimney.
  for (const t of [0.2, 0.5, 0.8])
    dormer(g, info.onSlope(t, 0.4), vary(pal.roofs.shingle, seed), pal.walls.brick.right);
  const at = lerp(info.ridge[0], info.ridge[1], 0.1);
  stack(g, { x: at.x, y: at.y + 3 }, 16, into, !b.damaged, seed);
  const [cx, cy] = a.at(a.U - 0.07, a.V - 0.05);
  crate(g, cx, cy, '#9a79b8');
  crate(g, cx - 0.17, cy, '#c9b07a');
};

const kontor: Draw = (g, b, into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 38);
  const a = along(b);
  const r = a.R(0.14, 0.14, a.U - 0.14, a.V - 0.2);
  const info = hall(g, r, into, {
    base: { wall: 'paleStone', h: 9 },
    wall: tinted(pal.walls.plaster, seed + 3),
    h: 15,
    roof: 'darkTile',
    rise: 14,
    alongX: a.alongX,
    stepped: true,
    rows: [3.4, 11.5, 18.5],
    win: { arched: true, h: 4 },
    door: 0.5,
    doorArched: true,
    chimney: null,
    seed,
  });
  // A hoist for the bales, and the merchants' flag.
  const tip = info.ridge[1];
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y + 5);
  ctx.lineTo(tip.x + (a.alongX ? 8 : -8), tip.y + 9);
  ctx.lineTo(tip.x + (a.alongX ? 8 : -8), tip.y + 26);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
  flagpole(g, lerp(info.ridge[0], info.ridge[1], 0.3), into, seed);
  const [cx, cy] = a.at(a.U - 0.12, a.V - 0.06);
  crate(g, cx, cy);
  crate(g, cx - 0.18, cy, '#c9b07a');
  barrel(g, cx - 0.36, cy);
};

const guildhall: Draw = (g, b, into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 38);
  const a = along(b);
  const r = a.R(0.1, 0.12, a.U - 0.1, a.V - 0.12);
  const [lx, ly] = lengths(r);
  walls(g, r, 0, 9, pal.walls.paleStone, 'stone', seed);
  for (let i = 0; i < Math.round(lx * 2); i++)
    arch(g, leftOf(r), lx, (i + 0.5) / Math.round(lx * 2), 0.16, 7.4);
  for (let i = 0; i < Math.round(ly * 2); i++)
    arch(g, rightOf(r), ly, (i + 0.5) / Math.round(ly * 2), 0.16, 7.4);
  const upper = grow(r, 0.04);
  const wall = tinted(pal.walls.ochre, seed);
  walls(g, upper, 9, 20, wall);
  timber(g, upper, 9, 20, 5.5);
  windows(g, upper, 12.5, { arched: true, h: 4.6 });
  eaveShade(g, upper, 20);
  const info = gable(g, upper, 20, 15, vary(pal.roofs.darkTile, seed), {
    alongX: a.alongX,
    end: wall,
    stepped: true,
  });
  // Guild banners on the front, and a flag on the ridge.
  ['#b4382c', '#c9a23a', '#3f6f8a'].forEach((color, i) => {
    const at = a.alongX ? onLeft(upper, 0.2 + i * 0.3, 19) : onRight(upper, 0.2 + i * 0.3, 19);
    ctx.fillStyle = color;
    ctx.fillRect(at.x - 1.6, at.y, 3.2, 7);
  });
  flagpole(g, lerp(info.ridge[0], info.ridge[1], 0.5), into, seed);
};

const towerhouse: Draw = (g, b, _into, seed) => {
  const { pal } = g;
  shadow(g, b, 60);
  const r = rect(b.x, b.y, 1, 1, 0.24);
  const stone = pal.walls.paleStone;
  walls(g, r, 0, 62, stone, 'stone', seed);
  door(g, leftOf(r), 0.52, 0.5, { arched: true, h: 7 });
  for (const z of [14, 28, 42]) windows(g, r, z, { h: 4, w: 0.03, per: 2 });
  windows(g, r, 53, { arched: true, h: 4.6, per: 2 });
  lid(g, r, 62, stone.top);
  merlons(g, r, 62, stone);
};

const townhall: Draw = (g, b, into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 44);
  const a = along(b);
  const parts = new Parts();
  const wall = tinted(pal.walls.ochre, seed + 1);
  const main = a.R(0.1, 0.5, a.U - 0.1, a.V - 0.14);
  const tower = a.R(0.14, 0.12, 1.0, 0.98);
  parts.add(tower, () => {
    walls(g, tower, 0, 46, wall, 'plain', seed);
    windows(g, tower, 36, { arched: true, h: 5, per: 1.6 });
    // The town clock.
    const face0 = onLeft(tower, 0.5, 27);
    ctx.beginPath();
    ctx.arc(face0.x, face0.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f3ead2';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(face0.x, face0.y);
    ctx.lineTo(face0.x, face0.y - 2.8);
    ctx.moveTo(face0.x, face0.y);
    ctx.lineTo(face0.x + 2, face0.y + 0.8);
    ctx.stroke();
    const apex = spire(g, grow(tower, 0.05), 46, 20, pal.roofs.tile);
    flagpole(g, apex, into, seed);
  });
  parts.add(main, () => {
    const [lx, ly] = lengths(main);
    walls(g, main, 0, 9, pal.walls.paleStone, 'stone', seed);
    for (let i = 0; i < Math.round(lx * 2); i++)
      arch(g, leftOf(main), lx, (i + 0.5) / Math.round(lx * 2), 0.17, 7.4);
    for (let i = 0; i < Math.round(ly * 2); i++)
      arch(g, rightOf(main), ly, (i + 0.5) / Math.round(ly * 2), 0.17, 7.4);
    walls(g, main, 9, 21, wall);
    windows(g, main, 12.5, { arched: true, h: 5 });
    eaveShade(g, main, 21);
    const info = gable(g, main, 21, 15, vary(pal.roofs.tile, seed), {
      alongX: a.alongX,
      end: wall,
      stepped: true,
    });
    for (const t of [0.25, 0.5, 0.75]) dormer(g, info.onSlope(t, 0.42), pal.roofs.tile, wall.right);
  });
  parts.paint();
};

const warehouse: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 26);
  const a = along(b);
  const r = a.R(0.11, 0.13, a.U - 0.11, a.V - 0.24);
  const info = hall(g, r, null, {
    base: { wall: 'stone', h: 4 },
    wall: 'wood',
    tex: 'plank',
    h: 9,
    roof: 'shingle',
    rise: 13,
    alongX: a.alongX,
    rows: [8],
    win: { h: 2.6, w: 0.04, per: 1.2 },
    door: null,
    chimney: null,
    seed,
  });
  // Wide double doors and a hoist.
  const [lx] = lengths(r);
  door(g, leftOf(r), lx, 0.5, { w: 0.2, h: 8.5, color: '#6b4a30' });
  const tip = info.ridge[1];
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y + 4);
  ctx.lineTo(tip.x + (a.alongX ? 7 : -7), tip.y + 7.5);
  ctx.lineTo(tip.x + (a.alongX ? 7 : -7), tip.y + 18);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
  const [cx, cy] = a.at(a.U - 0.1, a.V - 0.08);
  crate(g, cx, cy);
  crate(g, cx - 0.17, cy, '#8a6a48');
  barrel(g, cx - 0.36, cy);
  barrel(g, cx - 0.5, cy);
};

const buildersyard: Draw = (g, b, _into, seed) => {
  const { ctx, pal } = g;
  shadow(g, b, 12);
  const a = along(b);
  // A fenced yard.
  const yard = rect(b.x, b.y, b.w, b.h, 0.08);
  ctx.beginPath();
  for (const z of [3, 6]) {
    line(g, onLeft(yard, 0, z), onLeft(yard, 1, z));
    line(g, onRight(yard, 0, z), onRight(yard, 1, z));
  }
  for (let i = 0; i <= 6; i++) {
    line(g, onLeft(yard, i / 6, 0), onLeft(yard, i / 6, 7));
    line(g, onRight(yard, i / 6, 0), onRight(yard, i / 6, 7));
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
  const shed = a.R(0.14, 0.14, a.U * 0.5, a.V * 0.55);
  hall(g, shed, null, {
    wall: 'darkWood',
    tex: 'plank',
    h: 7,
    roof: 'shingle',
    rise: 8,
    rows: [],
    door: 0.5,
    chimney: null,
    seed,
  });
  // Stacked timber, dressed stone, and a crane.
  for (let i = 0; i < 3; i++) {
    const [tx, ty] = a.at(a.U * 0.62, a.V * 0.2 + i * 0.12);
    const beam = rect(tx, ty, a.alongX ? 0.7 : 0.1, a.alongX ? 0.1 : 0.7);
    walls(g, beam, i * 0.5, 3 + i * 0.5, pal.walls.wood);
    lid(g, beam, 3 + i * 0.5, pal.walls.wood.top);
  }
  for (const [u, w] of [
    [a.U * 0.3, a.V * 0.72],
    [a.U * 0.46, a.V * 0.78],
  ] as const) {
    const [sx, sy] = a.at(u, w);
    const block = rect(sx, sy, 0.2, 0.16);
    walls(g, block, 0, 4, pal.walls.paleStone);
    lid(g, block, 4, pal.walls.paleStone.top);
  }
  const [kx, ky] = a.at(a.U * 0.78, a.V * 0.72);
  const foot = v(kx, ky);
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(foot.x, foot.y - 26);
  ctx.lineTo(foot.x - 14, foot.y - 20);
  ctx.moveTo(foot.x, foot.y - 14);
  ctx.lineTo(foot.x - 7, foot.y - 23);
  ctx.moveTo(foot.x - 14, foot.y - 20);
  ctx.lineTo(foot.x - 14, foot.y - 8);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
  ctx.fillStyle = pal.walls.paleStone.right;
  ctx.fillRect(foot.x - 16.5, foot.y - 8, 5, 4);
};

const garden: Draw = (g, b) => {
  const { ctx, pal } = g;
  const { x, y } = b;
  // A low hedge around beds of herbs and flowers.
  const hedge = shade(pal.bed, -0.22);
  poly(g, diamond(x, y, 1, 1, 0.08), hedge, OUTLINE);
  poly(g, diamond(x, y, 1, 1, 0.08, 2.4), shade(pal.bed, -0.08));
  poly(g, diamond(x, y, 1, 1, 0.17, 0.4), pal.bed);
  ctx.beginPath();
  line(g, v(x + 0.5, y + 0.17), v(x + 0.5, y + 0.83));
  line(g, v(x + 0.17, y + 0.5), v(x + 0.83, y + 0.5));
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = pal.road;
  ctx.stroke();
  if (!pal.bloom) return;
  for (let i = 0; i < 10; i++) {
    const s = tileHash(x * 7 + i, y * 13 + i * 3);
    const p = v(x + 0.22 + (s % 56) / 100, y + 0.22 + ((s >>> 8) % 56) / 100);
    ctx.fillStyle = pal.flowers[i % pal.flowers.length]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 0.6, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** A building site: foundations and scaffolding. */
function drawSite(g: G, b: Building): void {
  const { ctx, pal } = g;
  const body = rect(b.x, b.y, b.w, b.h, 0.1);
  walls(g, body, 0, 7, pal.walls.paleStone, 'stone', 3);
  lid(g, body, 7, pal.walls.paleStone.top);
  ctx.beginPath();
  for (const t of [0, 0.34, 0.67, 1]) {
    line(g, onLeft(body, t, 0), onLeft(body, t, 34));
    line(g, onRight(body, t, 0), onRight(body, t, 34));
  }
  for (const z of [14, 26]) {
    line(g, onLeft(body, 0, z), onLeft(body, 1, z));
    line(g, onRight(body, 0, z), onRight(body, 1, z));
  }
  line(g, onLeft(body, 0, 14), onLeft(body, 0.34, 26));
  line(g, onRight(body, 0.67, 14), onRight(body, 1, 26));
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.trunk;
  ctx.stroke();
}

const DRAW: Record<string, Draw> = {
  well,
  cistern,
  fountain,
  stall,
  granary,
  bakery,
  markethall,
  chapel,
  church,
  cathedral,
  firewatch,
  nightwatch,
  bathhouse,
  hospital,
  tavern,
  school,
  weaver,
  smithy,
  brewery,
  tannery,
  manufactory,
  kontor,
  guildhall,
  towerhouse,
  townhall,
  warehouse,
  buildersyard,
  garden,
  tree: (g, b) => drawTree(g, b.x + 0.5, b.y + 0.5, 1.15),
};

export function drawBuilding(g: G, b: Building, into: Emitter[] | null): void {
  const { x, y, w, h } = b;
  if (b.construction) drawSite(g, b);
  else if (b.def === 'house') drawHouse(g, b, into);
  else {
    const seed = tileHash(x * 31 + 7, y * 17 + 3);
    const draw = DRAW[b.def];
    if (draw) draw(g, b, into, seed);
    else {
      const body = rect(x, y, w, h, 0.1);
      walls(g, body, 0, 10, g.pal.walls.stone);
      lid(g, body, 10, g.pal.walls.stone.top);
    }
  }
  if (b.damaged) poly(g, diamond(x, y, w, h, 0.05, 2), 'rgba(30, 24, 20, 0.5)');
}
