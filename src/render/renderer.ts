import { indexOf } from '../core/grid';
import type { Building, GameState, Point, Terrain } from '../core/types';
import { gridToWorld, type Camera } from './iso';

export interface PreviewTile extends Point {
  ok: boolean;
}

export interface Overlay {
  /** Ids of buildings to mark as needing attention. */
  warnings: Set<number>;
  /** Tiles a pending build or demolition would touch. */
  preview: PreviewTile[];
  /** Tile under the pointer or selected in the info panel. */
  highlight: Point | null;
  /** Translucent colours laid over tiles (by tile index), for coverage and appeal views. */
  shade: Map<number, string>;
}

type Ctx = CanvasRenderingContext2D;

interface BoxColors {
  top: string;
  left: string;
  right: string;
}

interface RoofColors {
  back: string;
  left: string;
  right: string;
}

const WALLS = {
  stone: { top: '#b9b1a0', left: '#8d8676', right: '#a39c8b' },
  paleStone: { top: '#e4e0d4', left: '#b7b2a4', right: '#d3cfc1' },
  darkStone: { top: '#a39b8c', left: '#746d60', right: '#8b8476' },
  plaster: { top: '#e8dcc0', left: '#c9b993', right: '#e0d2b0' },
  clay: { top: '#dcc7a0', left: '#b9a37c', right: '#d0ba92' },
  wattle: { top: '#bfa27a', left: '#9c8160', right: '#b3966f' },
  wood: { top: '#b89a70', left: '#8c7250', right: '#a78860' },
  darkWood: { top: '#8a6f52', left: '#63503b', right: '#7a6248' },
  brick: { top: '#c9b1a4', left: '#93786c', right: '#b0958a' },
  ochre: { top: '#e3cf9a', left: '#bda46c', right: '#d6bf84' },
} satisfies Record<string, BoxColors>;

const ROOFS = {
  tile: { back: '#8a4630', left: '#a4573b', right: '#b96a4a' },
  darkTile: { back: '#6d3526', left: '#84412f', right: '#99523c' },
  slate: { back: '#4f5a63', left: '#5f6c76', right: '#73818c' },
  thatch: { back: '#8f7a45', left: '#a8904f', right: '#bda55f' },
  shingle: { back: '#5d4a38', left: '#6f5944', right: '#836b53' },
  awning: { back: '#b8a24a', left: '#d2b955', right: '#e3cc6a' },
  red: { back: '#7c2f24', left: '#96392c', right: '#b04a3a' },
  green: { back: '#49653a', left: '#587a45', right: '#6a8f54' },
  blue: { back: '#3f5f7a', left: '#4c7191', right: '#5d86a8' },
} satisfies Record<string, RoofColors>;

/** Simple building shapes: a box with a hipped roof, optionally with a tower. */
interface Style {
  wall: keyof typeof WALLS;
  roof: keyof typeof ROOFS;
  /** Wall height, roof rise and footprint inset in tiles. */
  h: number;
  rise: number;
  inset?: number;
  /** A slim tower rising from the middle to this height. */
  tower?: number;
}

const STYLES: Record<string, Style> = {
  stall: { wall: 'wood', roof: 'awning', h: 6, rise: 5, inset: 0.2 },
  granary: { wall: 'paleStone', roof: 'shingle', h: 20, rise: 16, inset: 0.14 },
  bakery: { wall: 'plaster', roof: 'darkTile', h: 10, rise: 9, inset: 0.12, tower: 22 },
  markethall: { wall: 'ochre', roof: 'tile', h: 14, rise: 14, inset: 0.08 },
  chapel: { wall: 'paleStone', roof: 'slate', h: 16, rise: 14, inset: 0.1, tower: 38 },
  church: { wall: 'paleStone', roof: 'slate', h: 24, rise: 18, inset: 0.1, tower: 62 },
  cathedral: { wall: 'paleStone', roof: 'slate', h: 40, rise: 26, inset: 0.08, tower: 110 },
  firewatch: { wall: 'brick', roof: 'red', h: 10, rise: 6, inset: 0.18, tower: 30 },
  nightwatch: { wall: 'darkStone', roof: 'blue', h: 10, rise: 6, inset: 0.18, tower: 28 },
  bathhouse: { wall: 'paleStone', roof: 'blue', h: 11, rise: 10, inset: 0.1 },
  hospital: { wall: 'plaster', roof: 'green', h: 16, rise: 12, inset: 0.1 },
  tavern: { wall: 'plaster', roof: 'shingle', h: 11, rise: 10, inset: 0.1 },
  school: { wall: 'ochre', roof: 'slate', h: 14, rise: 11, inset: 0.12 },
  weaver: { wall: 'plaster', roof: 'thatch', h: 10, rise: 11, inset: 0.12 },
  smithy: { wall: 'darkStone', roof: 'shingle', h: 10, rise: 9, inset: 0.12, tower: 24 },
  brewery: { wall: 'brick', roof: 'darkTile', h: 12, rise: 10, inset: 0.12, tower: 26 },
  tannery: { wall: 'darkWood', roof: 'thatch', h: 8, rise: 8, inset: 0.14 },
  guildhall: { wall: 'ochre', roof: 'darkTile', h: 20, rise: 14, inset: 0.1 },
  townhall: { wall: 'ochre', roof: 'tile', h: 22, rise: 16, inset: 0.1, tower: 58 },
  warehouse: { wall: 'wood', roof: 'shingle', h: 12, rise: 12, inset: 0.1 },
  buildersyard: { wall: 'darkWood', roof: 'shingle', h: 8, rise: 8, inset: 0.16 },
};

const HOUSES: Style[] = [
  { wall: 'wattle', roof: 'thatch', h: 6, rise: 8, inset: 0.2 },
  { wall: 'clay', roof: 'shingle', h: 9, rise: 9, inset: 0.15 },
  { wall: 'plaster', roof: 'tile', h: 16, rise: 11, inset: 0.11 },
  { wall: 'plaster', roof: 'darkTile', h: 23, rise: 12, inset: 0.09 },
  { wall: 'ochre', roof: 'slate', h: 30, rise: 13, inset: 0.07 },
];

const COLORS = {
  meadow: ['#b3c48f', '#afc18a', '#b7c894'],
  water: ['#7fa9c4', '#86afc9'],
  ground: ['#d9c9a3', '#d5c49c'],
  rock: '#9a958b',
  alley: '#b89f76',
  street: '#a7a096',
  plaza: '#cfc8b8',
  basin: '#6f9db8',
  leaf: ['#5f8a4a', '#6c9954', '#56803f'],
  trunk: '#6b5038',
  bed: '#86a862',
  flowers: ['#d9b44a', '#c46a5a', '#e6e0c8'],
  plot: 'rgba(59, 42, 32, 0.25)',
  soot: 'rgba(30, 24, 20, 0.5)',
  scaffold: 'rgba(120, 92, 60, 0.9)',
  warn: '#e0a526',
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
  c: RoofColors,
  inset = 0,
): void {
  const x0 = gx + inset;
  const y0 = gy + inset;
  const x1 = gx + w - inset;
  const y1 = gy + h - inset;
  const half = Math.min(x1 - x0, y1 - y0) / 2;
  const alongX = x1 - x0 >= y1 - y0;
  const r1 = v(x0 + half, y0 + half, z + rise);
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

function drawStyled(ctx: Ctx, b: Building, s: Style): void {
  const { x, y, w, h } = b;
  const inset = s.inset ?? 0.1;
  box(ctx, x, y, w, h, 0, s.h, WALLS[s.wall], inset);
  roof(ctx, x, y, w, h, s.h, s.rise, ROOFS[s.roof], inset - 0.05);
  if (s.tower) {
    // The tower stands at the back end of the ridge so it does not hide the roof.
    const size = Math.min(0.5, Math.min(w, h) * 0.34);
    const tx = x + (w >= h ? inset + 0.05 : w / 2 - size / 2);
    const ty = y + (w >= h ? h / 2 - size / 2 : inset + 0.05);
    box(ctx, tx, ty, size, size, s.h, s.tower, WALLS[s.wall]);
    roof(ctx, tx, ty, size, size, s.tower, size * 30, ROOFS[s.roof], -0.03);
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
    poly(ctx, diamond(x, y, 1, 1, 0.25), 'rgba(255,255,255,0.10)');
  } else {
    ctx.lineWidth = 0.6;
    poly(ctx, diamond(x, y), COLORS.plaza);
    poly(ctx, diamond(x, y, 1, 1, 0.12), 'rgba(255,255,255,0.18)', 'rgba(59,42,32,0.12)');
  }
}

function drawFortification(ctx: Ctx, t: Terrain, x: number, y: number): void {
  if (t === 'wall') {
    box(ctx, x, y, 1, 1, 0, 18, WALLS.stone);
  } else if (t === 'tower') {
    box(ctx, x, y, 1, 1, 0, 34, WALLS.stone);
    roof(ctx, x, y, 1, 1, 34, 16, ROOFS.tile, -0.06);
  } else if (t === 'gate') {
    box(ctx, x, y, 1, 1, 0, 26, WALLS.stone);
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
  } else if (t === 'landmark') {
    // Castle keep: neighbouring tiles form one block, with turrets on a regular pattern.
    box(ctx, x, y, 1, 1, 0, 40, WALLS.darkStone);
    if ((x + y) % 3 === 0) {
      box(ctx, x, y, 1, 1, 40, 56, WALLS.stone, 0.18);
      roof(ctx, x, y, 1, 1, 56, 16, ROOFS.slate, 0.12);
    }
  }
}

function drawHouse(ctx: Ctx, b: Building): void {
  const { x, y, w, h } = b;
  const level = b.house?.level ?? 1;
  if ((b.house?.pop ?? 0) === 0 && level === 1) {
    // An empty plot: just a staked-out patch of ground.
    ctx.lineWidth = 1;
    poly(ctx, diamond(x, y, w, h, 0.16), 'rgba(255,255,255,0.12)', COLORS.plot);
    return;
  }
  const s = HOUSES[Math.min(level, HOUSES.length) - 1]!;
  const inset = s.inset ?? 0.1;
  box(ctx, x, y, w, h, 0, s.h, WALLS[s.wall], inset);
  if (level >= 3) {
    // Timber frame: one beam per storey on both visible walls.
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(59,42,32,0.55)';
    ctx.beginPath();
    for (let z = 8; z <= s.h; z += 7.5) {
      const a = v(x + inset, y + h - inset, z);
      const m = v(x + w - inset, y + h - inset, z);
      const c = v(x + w - inset, y + inset, z);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(m.x, m.y);
      ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
  }
  roof(ctx, x, y, w, h, s.h, s.rise, ROOFS[s.roof], inset - 0.05);
}

function drawBuilding(ctx: Ctx, b: Building): void {
  const { x, y, w, h } = b;
  if (b.construction) {
    // A building site: foundations and scaffolding poles.
    box(ctx, x, y, w, h, 0, 6, WALLS.paleStone, 0.1);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = COLORS.scaffold;
    ctx.beginPath();
    for (const [px, py] of [
      [x + 0.15, y + h - 0.15],
      [x + w - 0.15, y + h - 0.15],
      [x + w - 0.15, y + 0.15],
      [x + w / 2, y + h - 0.15],
      [x + w - 0.15, y + h / 2],
    ] as const) {
      const foot = v(px, py, 0);
      const tip = v(px, py, 30);
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(tip.x, tip.y);
    }
    const a = v(x + 0.15, y + h - 0.15, 22);
    const m = v(x + w - 0.15, y + h - 0.15, 22);
    const c = v(x + w - 0.15, y + 0.15, 22);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(m.x, m.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    return;
  }
  if (b.def === 'house') {
    drawHouse(ctx, b);
  } else if (b.def === 'well' || b.def === 'cistern' || b.def === 'fountain') {
    const inset = b.def === 'well' ? 0.3 : b.def === 'fountain' ? 0.22 : 0.16;
    box(ctx, x, y, w, h, 0, 5, { ...WALLS.stone, top: COLORS.basin }, inset);
    if (b.def === 'fountain') box(ctx, x, y, 1, 1, 5, 14, WALLS.paleStone, 0.43);
  } else if (b.def === 'tree') {
    const base = v(x + 0.5, y + 0.5);
    ctx.fillStyle = COLORS.trunk;
    ctx.fillRect(base.x - 1.5, base.y - 10, 3, 10);
    ctx.fillStyle = pick(COLORS.leaf, x, y);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - 17, 10, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.def === 'garden') {
    poly(ctx, diamond(x, y, 1, 1, 0.1), COLORS.bed);
    for (let i = 0; i < 5; i++) {
      const hsh = tileHash(x * 7 + i, y * 13 + i);
      const p = v(x + 0.25 + ((hsh % 50) / 100) * 1, y + 0.25 + (((hsh >> 8) % 50) / 100) * 1);
      ctx.fillStyle = COLORS.flowers[i % COLORS.flowers.length]!;
      ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
    }
  } else {
    const style = STYLES[b.def];
    if (style) drawStyled(ctx, b, style);
    else box(ctx, x, y, w, h, 0, 10, WALLS.stone, 0.1);
  }
  if (b.damaged) poly(ctx, diamond(x, y, w, h, 0.05, 2), COLORS.soot);
}

/** A small floating marker above buildings that need attention. */
function drawWarning(ctx: Ctx, b: Building): void {
  const p = v(b.x + b.w / 2, b.y + b.h / 2, 36);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.warn;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = COLORS.ink;
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.font = 'bold 8px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', p.x, p.y + 0.5);
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
      if (t === 'wall' || t === 'tower' || t === 'gate' || t === 'landmark') {
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

  for (const [i, color] of overlay.shade) {
    poly(ctx, diamond(i % state.width, Math.floor(i / state.width)), color);
  }
  for (const b of buildings) if (overlay.warnings.has(b.id)) drawWarning(ctx, b);

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
