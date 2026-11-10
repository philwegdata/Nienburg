import { indexOf } from '../core/grid';
import type { Building, GameState, Point, Terrain } from '../core/types';
import { gridToWorld, type Camera } from './iso';

export interface PreviewTile extends Point {
  ok: boolean;
}

export interface Overlay {
  /** Tiles a pending build or demolition would touch. */
  preview: PreviewTile[];
  /** Tile under the pointer or selected in the info panel. */
  highlight: Point | null;
}

type Ctx = CanvasRenderingContext2D;

const COLORS = {
  meadow: ['#b3c48f', '#afc18a', '#b7c894'],
  water: ['#7fa9c4', '#86afc9'],
  ground: ['#d9c9a3', '#d5c49c'],
  rock: '#9a958b',
  wall: { top: '#b9b1a0', left: '#8d8676', right: '#a39c8b' },
  tower: { top: '#c4bcab', left: '#857e6f', right: '#9b9483' },
  gate: { top: '#b9b1a0', left: '#8d8676', right: '#a39c8b' },
  alley: '#b89f76',
  street: '#a7a096',
  plaza: '#cfc8b8',
  houseWall: { top: '#e8dcc0', left: '#c9b993', right: '#e0d2b0' },
  houseRoof: { back: '#8a4630', left: '#a4573b', right: '#b96a4a' },
  chapelWall: { top: '#e4e0d4', left: '#b7b2a4', right: '#d3cfc1' },
  chapelRoof: { back: '#4f5a63', left: '#5f6c76', right: '#73818c' },
  well: { top: '#6f9db8', left: '#8d8676', right: '#a39c8b' },
  ok: 'rgba(96, 160, 72, 0.55)',
  bad: 'rgba(196, 72, 56, 0.55)',
  highlight: '#fff8e0',
  ink: '#3b2a20',
};

/** Cheap stable per-tile variation so large flat areas do not look like plastic. */
function tileHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function pick<T>(list: readonly T[], x: number, y: number): T {
  return list[tileHash(x, y) % list.length]!;
}

function poly(ctx: Ctx, pts: Point[], fill: string, stroke?: string): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Grid vertex lifted by `z` world pixels. */
function v(gx: number, gy: number, z = 0): Point {
  const p = gridToWorld(gx, gy);
  return { x: p.x, y: p.y - z };
}

function diamond(gx: number, gy: number, w = 1, h = 1, inset = 0, z = 0): Point[] {
  return [
    v(gx + inset, gy + inset, z),
    v(gx + w - inset, gy + inset, z),
    v(gx + w - inset, gy + h - inset, z),
    v(gx + inset, gy + h - inset, z),
  ];
}

interface BoxColors {
  top: string;
  left: string;
  right: string;
}

/** An upright box on a w×h footprint, from height z0 to z1. */
function box(
  ctx: Ctx,
  gx: number,
  gy: number,
  w: number,
  h: number,
  z0: number,
  z1: number,
  c: BoxColors,
  inset = 0,
): void {
  const x0 = gx + inset;
  const y0 = gy + inset;
  const x1 = gx + w - inset;
  const y1 = gy + h - inset;
  poly(ctx, [v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)], c.left);
  poly(ctx, [v(x1, y1, z1), v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0)], c.right);
  poly(ctx, [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], c.top);
}

/** A hipped roof whose ridge runs along the longer side of the footprint. */
function roof(
  ctx: Ctx,
  gx: number,
  gy: number,
  w: number,
  h: number,
  z: number,
  rise: number,
  c: { back: string; left: string; right: string },
  inset = 0,
): void {
  const x0 = gx + inset;
  const y0 = gy + inset;
  const x1 = gx + w - inset;
  const y1 = gy + h - inset;
  const half = Math.min(x1 - x0, y1 - y0) / 2;
  const alongX = x1 - x0 >= y1 - y0;
  const r1 = alongX ? v(x0 + half, y0 + half, z + rise) : v(x0 + half, y0 + half, z + rise);
  const r2 = alongX ? v(x1 - half, y0 + half, z + rise) : v(x0 + half, y1 - half, z + rise);
  const top = v(x0, y0, z);
  const right = v(x1, y0, z);
  const bottom = v(x1, y1, z);
  const left = v(x0, y1, z);
  if (alongX) {
    poly(ctx, [top, right, r2, r1], c.back);
    poly(ctx, [top, left, r1], c.back);
    poly(ctx, [bottom, right, r2], c.right);
    poly(ctx, [left, bottom, r2, r1], c.left);
  } else {
    poly(ctx, [top, right, r1], c.back);
    poly(ctx, [top, left, r2, r1], c.back);
    poly(ctx, [left, bottom, r2], c.left);
    poly(ctx, [bottom, right, r1, r2], c.right);
  }
}

function drawGround(ctx: Ctx, state: GameState): void {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const t = state.terrain[indexOf(state.width, x, y)]!;
      let fill: string;
      if (t === 'water') fill = pick(COLORS.water, x, y);
      else if (t === 'outside') fill = pick(COLORS.meadow, x, y);
      else if (t === 'rock') fill = COLORS.rock;
      else fill = pick(COLORS.ground, x, y);
      // Slight overdraw hides hairline seams between neighbouring diamonds.
      poly(ctx, diamond(x, y, 1, 1, -0.02), fill);
    }
  }
}

function drawPath(ctx: Ctx, b: Building): void {
  const { x, y } = b;
  if (b.def === 'alley') {
    poly(ctx, diamond(x, y, 1, 1, 0.08), COLORS.alley);
  } else if (b.def === 'street') {
    poly(ctx, diamond(x, y), COLORS.street);
    ctx.lineWidth = 0.6;
    poly(ctx, diamond(x, y, 1, 1, 0.25), 'rgba(255,255,255,0.10)');
  } else {
    poly(ctx, diamond(x, y), COLORS.plaza);
    ctx.lineWidth = 0.6;
    poly(ctx, diamond(x, y, 1, 1, 0.12), 'rgba(255,255,255,0.18)', 'rgba(59,42,32,0.12)');
  }
}

function drawFortification(ctx: Ctx, t: Terrain, x: number, y: number): void {
  if (t === 'wall') {
    box(ctx, x, y, 1, 1, 0, 18, COLORS.wall);
  } else if (t === 'tower') {
    box(ctx, x, y, 1, 1, 0, 34, COLORS.tower);
    roof(ctx, x, y, 1, 1, 34, 16, COLORS.houseRoof, -0.06);
  } else if (t === 'gate') {
    box(ctx, x, y, 1, 1, 0, 26, COLORS.gate);
    // Dark archways on both visible faces.
    poly(
      ctx,
      [v(x + 0.3, y + 1), v(x + 0.7, y + 1), v(x + 0.7, y + 1, 14), v(x + 0.3, y + 1, 14)],
      COLORS.ink,
    );
    poly(
      ctx,
      [v(x + 1, y + 0.3), v(x + 1, y + 0.7), v(x + 1, y + 0.7, 14), v(x + 1, y + 0.3, 14)],
      COLORS.ink,
    );
  }
}

function drawBuilding(ctx: Ctx, b: Building): void {
  const { x, y, w, h } = b;
  if (b.def === 'house') {
    box(ctx, x, y, w, h, 0, 9, COLORS.houseWall, 0.14);
    roof(ctx, x, y, w, h, 9, 9, COLORS.houseRoof, 0.08);
  } else if (b.def === 'well') {
    box(ctx, x, y, 1, 1, 0, 5, COLORS.well, 0.3);
  } else if (b.def === 'chapel') {
    box(ctx, x, y, w, h, 0, 16, COLORS.chapelWall, 0.1);
    roof(ctx, x, y, w, h, 16, 14, COLORS.chapelRoof, 0.05);
    // A little bell turret on the ridge.
    const cx = x + w / 2 - 0.12;
    const cy = y + h / 2 - 0.12;
    box(ctx, cx, cy, 0.24, 0.24, 28, 38, COLORS.chapelWall);
    roof(ctx, cx, cy, 0.24, 0.24, 38, 8, COLORS.chapelRoof, -0.03);
  }
}

interface Raised {
  depth: number;
  draw: () => void;
}

export function render(
  ctx: Ctx,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
  dpr: number,
  overlay: Overlay,
  isPath: (defId: string) => boolean,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.meadow[0]!;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
  ctx.lineJoin = 'round';

  drawGround(ctx, state);

  const buildings = Object.values(state.buildings);
  for (const b of buildings) if (isPath(b.def)) drawPath(ctx, b);

  // Everything with height is painted back to front.
  const raised: Raised[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const t = state.terrain[indexOf(state.width, x, y)]!;
      if (t === 'wall' || t === 'tower' || t === 'gate') {
        raised.push({ depth: x + y, draw: () => drawFortification(ctx, t, x, y) });
      }
    }
  }
  for (const b of buildings) {
    if (isPath(b.def)) continue;
    raised.push({ depth: b.x + b.w - 1 + b.y + b.h - 1, draw: () => drawBuilding(ctx, b) });
  }
  raised.sort((a, b) => a.depth - b.depth);
  for (const r of raised) r.draw();

  for (const p of overlay.preview) {
    poly(ctx, diamond(p.x, p.y), p.ok ? COLORS.ok : COLORS.bad);
  }
  if (overlay.highlight) {
    const d = diamond(overlay.highlight.x, overlay.highlight.y);
    ctx.lineWidth = 2 / cam.zoom;
    ctx.beginPath();
    d.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = COLORS.highlight;
    ctx.stroke();
  }
}
