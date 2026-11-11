import type { Building, Point, Terrain } from '../core/types';
import { gridToWorld } from './iso';
import { shade, type BoxColors, type Palette, type RoofColors } from './palette';
import { tileHash, type Countryside } from './scenery';

/** Canvas plus the colours of the season. */
export interface G {
  ctx: CanvasRenderingContext2D;
  pal: Palette;
}

/** Things that move: collected while the town is drawn, animated every frame. */
export interface Emitter extends Point {
  kind: 'smoke' | 'flag';
  /** Phase offset so they do not all move in step. */
  seed: number;
}

export function poly(g: G, pts: Point[], fill: string, stroke?: string): void {
  const { ctx } = g;
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

export function line(g: G, a: Point, b: Point): void {
  g.ctx.moveTo(a.x, a.y);
  g.ctx.lineTo(b.x, b.y);
}

/** Grid vertex lifted by `z` world pixels. */
export function v(gx: number, gy: number, z = 0): Point {
  const p = gridToWorld(gx, gy);
  return { x: p.x, y: p.y - z };
}

export function diamond(gx: number, gy: number, w = 1, h = 1, inset = 0, z = 0): Point[] {
  return [
    v(gx + inset, gy + inset, z),
    v(gx + w - inset, gy + inset, z),
    v(gx + w - inset, gy + h - inset, z),
    v(gx + inset, gy + h - inset, z),
  ];
}

export function pick<T>(list: readonly T[], x: number, y: number): T {
  return list[tileHash(x, y) % list.length]!;
}

/** An axis-aligned footprint in grid coordinates. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function rect(x: number, y: number, w: number, h: number, inset = 0): Rect {
  return { x0: x + inset, y0: y + inset, x1: x + w - inset, y1: y + h - inset };
}

/** Point on the left-hand visible wall (t runs along x), at height z. */
export const onLeft = (r: Rect, t: number, z: number) => v(r.x0 + t * (r.x1 - r.x0), r.y1, z);
/** Point on the right-hand visible wall (t runs from the front corner backwards), at height z. */
export const onRight = (r: Rect, t: number, z: number) => v(r.x1, r.y1 - t * (r.y1 - r.y0), z);

export function box(g: G, r: Rect, z0: number, z1: number, c: BoxColors, outline?: string): void {
  g.ctx.lineWidth = 0.5;
  poly(
    g,
    [onLeft(r, 0, z1), onLeft(r, 1, z1), onLeft(r, 1, z0), onLeft(r, 0, z0)],
    c.left,
    outline,
  );
  poly(
    g,
    [onRight(r, 0, z1), onRight(r, 1, z1), onRight(r, 1, z0), onRight(r, 0, z0)],
    c.right,
    outline,
  );
  poly(
    g,
    [v(r.x0, r.y0, z1), v(r.x1, r.y0, z1), v(r.x1, r.y1, z1), v(r.x0, r.y1, z1)],
    c.top,
    outline,
  );
}

/** A hipped roof; the ridge runs along the longer side unless `alongX` says otherwise. */
export function roof(
  g: G,
  r: Rect,
  z: number,
  rise: number,
  c: RoofColors,
  alongX?: boolean,
): Point[] {
  const dx = r.x1 - r.x0;
  const dy = r.y1 - r.y0;
  const half = Math.min(dx, dy) / 2;
  const along = alongX ?? dx >= dy;
  // A square footprint has a short ridge so that both orientations look different.
  const stub = dx === dy ? half * 0.45 : 0;
  const r1 = along
    ? v(r.x0 + half - stub, r.y0 + half, z + rise)
    : v(r.x0 + half, r.y0 + half - stub, z + rise);
  const r2 = along
    ? v(r.x1 - half + stub, r.y0 + half, z + rise)
    : v(r.x0 + half, r.y1 - half + stub, z + rise);
  const top = v(r.x0, r.y0, z);
  const right = v(r.x1, r.y0, z);
  const bottom = v(r.x1, r.y1, z);
  const left = v(r.x0, r.y1, z);
  if (along) {
    poly(g, [top, right, r2, r1], c.back);
    poly(g, [top, left, r1], c.back);
    poly(g, [bottom, right, r2], c.right);
    poly(g, [left, bottom, r2, r1], c.left);
  } else {
    poly(g, [top, right, r1], c.back);
    poly(g, [top, left, r2, r1], c.back);
    poly(g, [left, bottom, r2], c.left);
    poly(g, [bottom, right, r1, r2], c.right);
  }
  // A lighter ridge and eaves give the roof an edge.
  g.ctx.beginPath();
  line(g, r1, r2);
  line(g, left, bottom);
  line(g, bottom, right);
  g.ctx.lineWidth = 0.7;
  g.ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  g.ctx.stroke();
  return [r1, r2];
}

export function chimney(
  g: G,
  at: Point,
  into: Emitter[] | null,
  smoking: boolean,
  seed: number,
): void {
  const { ctx, pal } = g;
  ctx.fillStyle = pal.walls.brick.left;
  ctx.fillRect(at.x - 1.6, at.y - 7, 1.6, 9);
  ctx.fillStyle = pal.walls.brick.right;
  ctx.fillRect(at.x, at.y - 7, 1.6, 9);
  if (smoking) into?.push({ kind: 'smoke', x: at.x, y: at.y - 8, seed });
}

/** A soft shadow on the ground towards the lower right. */
export function shadow(
  g: G,
  b: { x: number; y: number; w: number; h: number },
  height: number,
): void {
  // Kept short and soft: in a dense town long shadows would swallow the streets.
  const reach = Math.min(0.4, height / 80);
  const inset = 0.1;
  b = { x: b.x + inset, y: b.y + inset, w: b.w - 2 * inset, h: b.h - 2 * inset };
  // The outline of the footprint pushed towards the lower right.
  poly(
    g,
    [
      v(b.x + b.w, b.y),
      v(b.x + b.w + reach, b.y + reach * 0.35),
      v(b.x + b.w + reach, b.y + b.h + reach * 0.35),
      v(b.x + reach, b.y + b.h + reach * 0.35),
      v(b.x, b.y + b.h),
      v(b.x + b.w, b.y + b.h),
    ],
    g.pal.shadow,
  );
}

export function vary(c: RoofColors, seed: number): RoofColors {
  const amount = ((seed % 5) - 2) * 0.035;
  return {
    back: shade(c.back, amount),
    left: shade(c.left, amount),
    right: shade(c.right, amount),
  };
}

// ---------- ground ----------

export function drawGroundTile(
  g: G,
  terrain: Terrain,
  x: number,
  y: number,
  land: Countryside,
): void {
  const { ctx, pal } = g;
  // Slight overdraw hides hairline seams between neighbouring diamonds.
  const tile = diamond(x, y, 1, 1, -0.02);
  if (terrain === 'water') {
    poly(g, tile, pick(pal.water, x, y));
    if (tileHash(x * 3, y * 5) % 3 === 0) {
      const a = v(x + 0.3, y + 0.55);
      ctx.beginPath();
      ctx.moveTo(a.x - 5, a.y);
      ctx.quadraticCurveTo(a.x, a.y - 2, a.x + 5, a.y);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.stroke();
    }
    return;
  }
  if (terrain === 'canal') {
    // Canal water between stone quays.
    poly(g, tile, pal.walls.stone.left);
    poly(g, diamond(x, y, 1, 1, 0.06), pick(pal.water, x, y));
    return;
  }
  if (terrain === 'rock') {
    poly(g, tile, pal.walls.darkStone.left);
    return;
  }
  if (terrain !== 'outside') {
    poly(g, tile, pick(pal.ground, x, y));
    return;
  }
  const scenery = land.at(x, y);
  if (scenery === 'road') {
    poly(g, tile, pick(pal.meadow, x, y));
    poly(g, diamond(x, y, 1, 1, 0.12), pal.road);
  } else if (scenery === 'field') {
    poly(g, tile, pal.fields[land.patch(x, y) % pal.fields.length]!);
    ctx.beginPath();
    const alongX = land.furrowsAlongX(x, y);
    for (const t of [0.2, 0.5, 0.8]) {
      if (alongX) line(g, v(x, y + t), v(x + 1, y + t));
      else line(g, v(x + t, y), v(x + t, y + 1));
    }
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = pal.furrow;
    ctx.stroke();
  } else {
    poly(g, tile, pick(pal.meadow, x, y));
  }
}

export function drawTree(g: G, gx: number, gy: number, size = 1): void {
  const { ctx, pal } = g;
  const seed = tileHash(Math.round(gx * 7), Math.round(gy * 11));
  const base = v(gx, gy);
  const tall = (15 + (seed % 5)) * size;
  ctx.fillStyle = pal.shadow;
  ctx.beginPath();
  ctx.ellipse(base.x + 4 * size, base.y + 1, 8 * size, 3.5 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.trunk;
  ctx.fillRect(base.x - 1.3 * size, base.y - tall * 0.55, 2.6 * size, tall * 0.55);
  if (pal.bare) {
    // Bare branches with a little snow.
    ctx.beginPath();
    const top = base.y - tall * 0.55;
    for (const [dx, dy] of [
      [-6, -8],
      [6, -9],
      [-3, -13],
      [3, -14],
      [0, -15],
    ] as const) {
      ctx.moveTo(base.x, top + 2);
      ctx.lineTo(base.x + dx * size, top + dy * size);
    }
    ctx.lineWidth = 1 * size;
    ctx.strokeStyle = pal.trunk;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(base.x, top - 9 * size, 6 * size, 2 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const leaf = pal.leaf[seed % pal.leaf.length]!;
  const cy = base.y - tall;
  ctx.fillStyle = shade(leaf, -0.12);
  ctx.beginPath();
  ctx.ellipse(base.x + 1.5 * size, cy + 3 * size, 9.5 * size, 10 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.ellipse(base.x - 1 * size, cy, 8.5 * size, 9 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(30, 50, 20, 0.35)';
  ctx.stroke();
  ctx.fillStyle = shade(leaf, 0.16);
  ctx.beginPath();
  ctx.ellipse(base.x - 3 * size, cy - 3 * size, 4 * size, 3.6 * size, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** One or two trees for a woodland tile. */
export function drawWoodland(g: G, x: number, y: number): void {
  const seed = tileHash(x * 13 + 5, y * 29 + 1);
  drawTree(g, x + 0.3 + (seed % 20) / 100, y + 0.35 + ((seed >> 5) % 20) / 100, 1.05);
  if (seed % 3 !== 0) drawTree(g, x + 0.72, y + 0.74, 0.9);
}

export function drawPath(g: G, b: Building): void {
  const { ctx, pal } = g;
  const { x, y } = b;
  if (b.def === 'alley') {
    poly(g, diamond(x, y, 1, 1, 0.07), pal.alley);
    const s = tileHash(x, y);
    ctx.fillStyle = pal.cobble;
    for (let i = 0; i < 3; i++) {
      const p = v(
        x + 0.25 + ((s >> (i * 4)) % 50) / 100,
        y + 0.25 + ((s >> (i * 4 + 2)) % 50) / 100,
      );
      ctx.fillRect(p.x, p.y, 2.2, 1.1);
    }
  } else if (b.def === 'street') {
    poly(g, diamond(x, y), pal.street);
    ctx.beginPath();
    for (const t of [0.25, 0.5, 0.75]) {
      line(g, v(x + t, y), v(x + t, y + 1));
      line(g, v(x, y + t), v(x + 1, y + t));
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = pal.cobble;
    ctx.stroke();
  } else if (b.def === 'bridge') {
    // A plank deck on two beams, a little above the water.
    box(g, rect(x, y, 1, 1, 0.04), 2, 4, pal.walls.wood);
    ctx.beginPath();
    for (const t of [0.25, 0.5, 0.75]) line(g, v(x + t, y + 0.04, 4), v(x + t, y + 0.96, 4));
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = pal.cobble;
    ctx.stroke();
  } else {
    ctx.lineWidth = 0.6;
    poly(g, diamond(x, y), pal.plaza, pal.plazaLine);
    poly(g, diamond(x, y, 1, 1, 0.3), 'rgba(255, 255, 255, 0.16)', pal.plazaLine);
  }
}

// ---------- fortifications ----------

/** Merlons on the four corners of a tile; neighbouring tiles join up into battlements. */
export function battlements(g: G, x: number, y: number, z: number, c: BoxColors, inset = 0): void {
  const s = 0.27;
  const lo = inset;
  const hi = 1 - inset - s;
  for (const [dx, dy] of [
    [lo, lo],
    [hi, lo],
    [lo, hi],
    [hi, hi],
  ] as const) {
    box(g, rect(x + dx, y + dy, s, s), z, z + 5, c, 'rgba(46, 32, 22, 0.28)');
  }
}

export function flagpole(g: G, at: Point, into: Emitter[] | null, seed: number): void {
  const { ctx, pal } = g;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(at.x, at.y - 14);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
  into?.push({ kind: 'flag', x: at.x, y: at.y - 14, seed });
}

export function drawFortification(
  g: G,
  t: Terrain,
  x: number,
  y: number,
  into: Emitter[] | null,
): void {
  const { ctx, pal } = g;
  const stone = pal.walls.stone;
  const tile = rect(x, y, 1, 1);
  const courses = (height: number) => {
    ctx.beginPath();
    for (let z = 6; z < height; z += 6) {
      line(g, onLeft(tile, 0, z), onLeft(tile, 1, z));
      line(g, onRight(tile, 0, z), onRight(tile, 1, z));
    }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.14)';
    ctx.stroke();
  };
  if (t === 'wall') {
    box(g, tile, 0, 18, stone);
    courses(18);
    battlements(g, x, y, 18, stone);
  } else if (t === 'tower') {
    box(g, tile, 0, 36, stone);
    courses(36);
    poly(
      g,
      [
        onLeft(tile, 0.42, 20),
        onLeft(tile, 0.58, 20),
        onLeft(tile, 0.58, 27),
        onLeft(tile, 0.42, 27),
      ],
      pal.door,
    );
    poly(
      g,
      [
        onRight(tile, 0.42, 20),
        onRight(tile, 0.58, 20),
        onRight(tile, 0.58, 27),
        onRight(tile, 0.42, 27),
      ],
      pal.door,
    );
    battlements(g, x, y, 36, stone);
    roof(g, rect(x, y, 1, 1, 0.14), 38, 20, pal.roofs.tile);
  } else if (t === 'gate') {
    box(g, tile, 0, 30, stone);
    courses(30);
    for (const at of [
      (u: number, z: number) => onLeft(tile, u, z),
      (u: number, z: number) => onRight(tile, u, z),
    ]) {
      const a = at(0.26, 0);
      const b = at(0.26, 12);
      const top = at(0.5, 18);
      const c = at(0.74, 12);
      const d = at(0.74, 0);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.quadraticCurveTo(top.x, top.y - 2, c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = pal.door;
      ctx.fill();
    }
    battlements(g, x, y, 30, stone);
    flagpole(g, v(x + 0.5, y + 0.5, 35), into, tileHash(x, y));
  } else if (t === 'rock') {
    // A band of rock: rough blocks of uneven height.
    const seed = tileHash(x * 3 + 1, y * 7 + 2);
    const rock = pal.walls.darkStone;
    box(g, rect(x, y, 1, 1, 0.02), 0, 9 + (seed % 5), rock);
    box(g, rect(x + 0.15 + (seed % 3) * 0.1, y + 0.2, 0.5, 0.5), 9, 14 + (seed % 4), {
      top: shade(rock.top, 0.08),
      left: rock.left,
      right: rock.right,
    });
  } else if (t === 'landmark' && pal.landmark === 'abbey') {
    // The abbey: pale walls, steep slate roofs, and a spire now and then.
    box(g, tile, 0, 46, pal.walls.paleStone);
    courses(46);
    poly(
      g,
      [onLeft(tile, 0.4, 22), onLeft(tile, 0.6, 22), onLeft(tile, 0.6, 34), onLeft(tile, 0.4, 34)],
      pal.window,
    );
    roof(g, rect(x, y, 1, 1, -0.02), 46, 22, pal.roofs.slate);
    if ((x + y * 2) % 4 === 0) {
      box(g, rect(x, y, 1, 1, 0.3), 46, 78, pal.walls.paleStone);
      roof(g, rect(x, y, 1, 1, 0.26), 78, 30, pal.roofs.slate);
    }
  } else if (t === 'landmark' && pal.landmark === 'temple') {
    // A temple on a stepped plinth, with tiered roofs.
    box(g, tile, 0, 5, pal.walls.stone);
    box(g, rect(x, y, 1, 1, 0.1), 5, 9, pal.walls.stone);
    tiers(g, x, y, 9, (x * 2 + y) % 3 === 0 ? 3 : 2, 0.16);
  } else if (t === 'landmark') {
    const dark = pal.walls.darkStone;
    box(g, tile, 0, 42, dark);
    courses(42);
    if ((x * 2 + y) % 3 === 0) {
      poly(
        g,
        [
          onLeft(tile, 0.4, 24),
          onLeft(tile, 0.6, 24),
          onLeft(tile, 0.6, 32),
          onLeft(tile, 0.4, 32),
        ],
        pal.window,
      );
    }
    battlements(g, x, y, 42, dark);
    if ((x + y) % 3 === 0) {
      box(g, rect(x, y, 1, 1, 0.2), 42, 58, stone);
      roof(g, rect(x, y, 1, 1, 0.12), 58, 20, pal.roofs.slate);
      if ((x + y) % 6 === 0) flagpole(g, v(x + 0.5, y + 0.5, 78), into, tileHash(x, y));
    }
  }
}

/** Stacked roofs that get smaller towards the top, as on a pagoda. */
export function tiers(
  g: G,
  x: number,
  y: number,
  z: number,
  count: number,
  inset: number,
  size = 1,
): void {
  const { pal } = g;
  let at = z;
  for (let i = 0; i < count; i++) {
    const grow = inset + i * 0.11 * size;
    box(g, rect(x, y, size, size, grow + 0.08 * size), at, at + 7, pal.walls.brick);
    roof(g, rect(x, y, size, size, grow - 0.06 * size), at + 7, 6, pal.roofs.darkTile);
    at += 11;
  }
}

/** A small floating marker above buildings that need attention. */
export function drawWarning(g: G, b: Building): void {
  const { ctx, pal } = g;
  const p = v(b.x + b.w / 2, b.y + b.h / 2, 40);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#e0a526';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = pal.ink;
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  ctx.font = 'bold 8px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', p.x, p.y + 0.5);
}

// ---------- things that move ----------

/** Smoke and flags. `time` is in seconds; pass 0 for a still picture. */
export function drawEmitter(g: G, e: Emitter, time: number): void {
  const { ctx, pal } = g;
  const offset = (e.seed % 100) / 100;
  if (e.kind === 'smoke') {
    for (let i = 0; i < 3; i++) {
      const phase = (time * 0.22 + offset + i / 3) % 1;
      const drift = Math.sin((phase + offset) * 5) * 2.5 + phase * 5;
      ctx.beginPath();
      ctx.arc(e.x + drift, e.y - phase * 20, 1.6 + phase * 3.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${pal.smoke}, ${((1 - phase) * 0.42).toFixed(3)})`;
      ctx.fill();
    }
  } else {
    const wave = Math.sin(time * 3.2 + offset * 6) * 1.6;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(e.x + 4.5, e.y - 1 + wave, e.x + 9, e.y + 2.5 + wave * 0.6);
    ctx.lineTo(e.x, e.y + 5);
    ctx.closePath();
    ctx.fillStyle = pal.flag;
    ctx.fill();
  }
}

/** A glint on the water that comes and goes. */
export function drawGlint(g: G, x: number, y: number, time: number): void {
  const seed = tileHash(x * 5 + 1, y * 3 + 2);
  if (seed % 4 !== 0) return;
  const strength = Math.sin(time * 1.3 + (seed % 628) / 100);
  if (strength <= 0.2) return;
  const p = v(x + 0.5, y + 0.5);
  const { ctx } = g;
  ctx.beginPath();
  ctx.moveTo(p.x - 4, p.y);
  ctx.lineTo(p.x + 4, p.y);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = `rgba(255, 255, 255, ${(strength * 0.55).toFixed(3)})`;
  ctx.stroke();
}
