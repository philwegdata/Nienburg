import { indexOf } from '../core/grid';
import type { Building, BuildingDef, GameState, Point, Terrain } from '../core/types';
import {
  diamond,
  drawBuilding,
  drawEmitter,
  drawFortification,
  drawGlint,
  drawGroundTile,
  drawPath,
  drawWarning,
  drawWoodland,
  poly,
  type Emitter,
  type G,
} from './draw';
import { screenToWorld, TILE_H, TILE_W, worldToGrid, type Camera } from './iso';
import { buildPalette, type Palette } from './palette';
import { countryside, MARGIN, terrainAround, type Countryside } from './scenery';

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

export interface Viewport {
  w: number;
  h: number;
  dpr: number;
}

/** Room above the topmost tile for tall buildings, in world pixels. */
const HEADROOM = 140;
/** Upper bound for the pixels of one cached layer. */
const MAX_LAYER_PIXELS = 6_000_000;

const PREVIEW = { ok: 'rgba(96, 160, 72, 0.55)', bad: 'rgba(196, 72, 56, 0.55)' };

/** Inclusive range of tiles to draw. */
interface Range {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A picture of part of the world, painted once and reused every frame. */
interface Layer {
  canvas: HTMLCanvasElement;
  /** World position and size the canvas covers. */
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

function wholeMap(state: GameState): Range {
  return {
    x0: -MARGIN,
    y0: -MARGIN,
    x1: state.width + MARGIN - 1,
    y1: state.height + MARGIN - 1,
  };
}

/**
 * Draws the town. The ground and the buildings are cached as two pictures while the camera is
 * far enough out for them to stay sharp; close up, only the visible tiles are drawn directly.
 */
export class Scene {
  private palette: Palette = buildPalette(0);
  private land: Countryside | null = null;
  private landFor: Terrain[] | null = null;
  private ground: { layer: Layer; terrain: Terrain[]; season: number } | null = null;
  private town: {
    layer: Layer;
    buildings: GameState['buildings'];
    terrain: Terrain[];
    season: number;
    emitters: Emitter[];
  } | null = null;
  private water: Point[] = [];

  constructor(private readonly isPath: (defId: string) => boolean) {}

  private countrysideOf(state: GameState): Countryside {
    if (!this.land || this.landFor !== state.terrain) {
      this.land = countryside(state);
      this.landFor = state.terrain;
      this.water = [];
      const all = wholeMap(state);
      for (let y = all.y0; y <= all.y1; y++) {
        for (let x = all.x0; x <= all.x1; x++) {
          if (terrainAround(state, x, y) === 'water') this.water.push({ x, y });
        }
      }
    }
    return this.land;
  }

  private newLayer(state: GameState): { layer: Layer; g: G } {
    // Tiles from one corner of the painted area to the opposite one.
    const span = state.width + state.height + 4 * MARGIN;
    const x = (-(state.height + 2 * MARGIN) * TILE_W) / 2;
    const y = -MARGIN * TILE_H - HEADROOM;
    const w = (span * TILE_W) / 2;
    const h = (span * TILE_H) / 2 + HEADROOM + 8;
    const scale = Math.min(2, Math.sqrt(MAX_LAYER_PIXELS / (w * h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
    ctx.lineJoin = 'round';
    return { layer: { canvas, x, y, w, h, scale }, g: { ctx, pal: this.palette } };
  }

  private paintGround(g: G, state: GameState, range: Range): void {
    const land = this.countrysideOf(state);
    const woods: Point[] = [];
    for (let y = range.y0; y <= range.y1; y++) {
      for (let x = range.x0; x <= range.x1; x++) {
        const terrain = terrainAround(state, x, y);
        drawGroundTile(g, terrain, x, y, land);
        if (terrain === 'outside' && land.at(x, y) === 'forest') woods.push({ x, y });
      }
    }
    woods.sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const t of woods) drawWoodland(g, t.x, t.y);
  }

  private paintTown(g: G, state: GameState, range: Range): Emitter[] {
    const emitters: Emitter[] = [];
    const inRange = (b: Building) =>
      b.x <= range.x1 && b.y <= range.y1 && b.x + b.w > range.x0 && b.y + b.h > range.y0;
    const buildings = Object.values(state.buildings).filter(inRange);
    for (const b of buildings) if (this.isPath(b.def)) drawPath(g, b);

    // Everything with height is painted back to front.
    const raised: { depth: number; draw: () => void }[] = [];
    const x0 = Math.max(0, range.x0);
    const y0 = Math.max(0, range.y0);
    const x1 = Math.min(state.width - 1, range.x1);
    const y1 = Math.min(state.height - 1, range.y1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = state.terrain[indexOf(state.width, x, y)]!;
        if (t === 'wall' || t === 'tower' || t === 'gate' || t === 'landmark') {
          raised.push({ depth: x + y, draw: () => drawFortification(g, t, x, y, emitters) });
        }
      }
    }
    for (const b of buildings) {
      if (this.isPath(b.def)) continue;
      raised.push({
        depth: b.x + b.w - 1 + b.y + b.h - 1,
        draw: () => drawBuilding(g, b, emitters),
      });
    }
    raised.sort((a, b) => a.depth - b.depth);
    for (const r of raised) r.draw();
    return emitters;
  }

  /** Tiles that can be seen, with some slack below for tall buildings. */
  private visibleRange(state: GameState, cam: Camera, view: Viewport): Range {
    const corners = [
      screenToWorld(cam, 0, 0),
      screenToWorld(cam, view.w, 0),
      screenToWorld(cam, 0, view.h),
      screenToWorld(cam, view.w, view.h),
    ].map((p) => worldToGrid(p.x, p.y));
    const all = wholeMap(state);
    return {
      x0: Math.max(all.x0, Math.floor(Math.min(...corners.map((c) => c.x))) - 1),
      y0: Math.max(all.y0, Math.floor(Math.min(...corners.map((c) => c.y))) - 1),
      x1: Math.min(all.x1, Math.ceil(Math.max(...corners.map((c) => c.x))) + 5),
      y1: Math.min(all.y1, Math.ceil(Math.max(...corners.map((c) => c.y))) + 5),
    };
  }

  /**
   * Paints one frame. `time` is in seconds and drives smoke, flags and glints;
   * pass 0 for a still picture.
   */
  render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    cam: Camera,
    view: Viewport,
    overlay: Overlay,
    time: number,
  ): void {
    const season = state.turn % 4;
    if (this.palette.season !== season) this.palette = buildPalette(season);
    const g: G = { ctx, pal: this.palette };

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = this.palette.meadow[0]!;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.setTransform(
      view.dpr * cam.zoom,
      0,
      0,
      view.dpr * cam.zoom,
      view.dpr * cam.x,
      view.dpr * cam.y,
    );
    ctx.lineJoin = 'round';

    // Cached pictures are used as long as they hold enough pixels for the current zoom.
    const probe = this.ground?.layer.scale ?? 1.2;
    const cached = cam.zoom * view.dpr <= probe * 1.25;
    let emitters: Emitter[];
    this.countrysideOf(state);
    if (cached) {
      if (!this.ground || this.ground.terrain !== state.terrain || this.ground.season !== season) {
        const fresh = this.newLayer(state);
        this.paintGround(fresh.g, state, wholeMap(state));
        this.ground = { layer: fresh.layer, terrain: state.terrain, season };
      }
      if (
        !this.town ||
        this.town.buildings !== state.buildings ||
        this.town.terrain !== state.terrain ||
        this.town.season !== season
      ) {
        const fresh = this.newLayer(state);
        const found = this.paintTown(fresh.g, state, wholeMap(state));
        this.town = {
          layer: fresh.layer,
          buildings: state.buildings,
          terrain: state.terrain,
          season,
          emitters: found,
        };
      }
      const a = this.ground.layer;
      ctx.drawImage(a.canvas, a.x, a.y, a.w, a.h);
      if (time > 0) for (const t of this.water) drawGlint(g, t.x, t.y, time);
      const b = this.town.layer;
      ctx.drawImage(b.canvas, b.x, b.y, b.w, b.h);
      emitters = this.town.emitters;
    } else {
      const range = this.visibleRange(state, cam, view);
      this.paintGround(g, state, range);
      if (time > 0) {
        for (const t of this.water) {
          if (t.x >= range.x0 && t.x <= range.x1 && t.y >= range.y0 && t.y <= range.y1) {
            drawGlint(g, t.x, t.y, time);
          }
        }
      }
      emitters = this.paintTown(g, state, range);
    }
    for (const e of emitters) drawEmitter(g, e, time);

    for (const [i, color] of overlay.shade) {
      poly(g, diamond(i % state.width, Math.floor(i / state.width)), color);
    }
    for (const b of Object.values(state.buildings)) {
      if (overlay.warnings.has(b.id)) drawWarning(g, b);
    }
    for (const p of overlay.preview) {
      poly(g, diamond(p.x, p.y), p.ok ? PREVIEW.ok : PREVIEW.bad);
    }
    if (overlay.highlight) {
      const d = diamond(overlay.highlight.x, overlay.highlight.y);
      ctx.lineWidth = 2 / cam.zoom;
      ctx.beginPath();
      d.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = '#fff8e0';
      ctx.stroke();
    }
  }
}

/** A small picture of a building for the build menu. */
export function buildingIcon(def: BuildingDef, width = 40, height = 30): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.className = 'icon';
  const ctx = canvas.getContext('2d')!;
  const { w, h } = def.size;
  const b: Building = { id: 1, def: def.id, x: 0, y: 0, w, h, rot: 0 };
  if (def.category === 'housing') b.house = { level: 3, pop: 1, lacking: 0 };
  const flat = def.category === 'path';
  // Rough size of the picture in world pixels.
  const tall = flat ? 0 : def.id === 'cathedral' ? 150 : 26 + 14 * Math.max(w, h);
  const worldW = ((w + h) * TILE_W) / 2;
  const worldH = ((w + h) * TILE_H) / 2 + tall;
  const scale = Math.min((width - 2) / worldW, (height - 2) / worldH) * dpr;
  const left = (-h * TILE_W) / 2;
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    (canvas.width - worldW * scale) / 2 - left * scale,
    (canvas.height - worldH * scale) / 2 + tall * scale,
  );
  ctx.lineJoin = 'round';
  const g: G = { ctx, pal: buildPalette(0) };
  if (flat) drawPath(g, b);
  else drawBuilding(g, b, null);
  return canvas;
}
