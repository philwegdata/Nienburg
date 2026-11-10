import type { Point } from '../core/types';

/** Size of one ground tile in world pixels (2:1 isometric diamond). */
export const TILE_W = 64;
export const TILE_H = 32;

export interface Camera {
  /** Screen position of the world origin, in CSS pixels. */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

/**
 * World position of a grid vertex. Tile (gx, gy) is the diamond whose top vertex is
 * gridToWorld(gx, gy); fractional coordinates address points inside tiles.
 */
export function gridToWorld(gx: number, gy: number): Point {
  return { x: ((gx - gy) * TILE_W) / 2, y: ((gx + gy) * TILE_H) / 2 };
}

/** Inverse of gridToWorld (fractional grid coordinates). */
export function worldToGrid(wx: number, wy: number): Point {
  const a = wx / (TILE_W / 2);
  const b = wy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function worldToScreen(cam: Camera, wx: number, wy: number): Point {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
}

export function screenToWorld(cam: Camera, sx: number, sy: number): Point {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

/** The tile under a screen position (may lie outside the map). */
export function pickTile(cam: Camera, sx: number, sy: number): Point {
  const w = screenToWorld(cam, sx, sy);
  const g = worldToGrid(w.x, w.y);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

/** Zooms by `factor`, keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
  const w = screenToWorld(cam, sx, sy);
  return { zoom, x: sx - w.x * zoom, y: sy - w.y * zoom };
}

/** Camera that shows a whole width×height map centred in the viewport. */
export function fitCamera(
  mapW: number,
  mapH: number,
  viewW: number,
  viewH: number,
  margin = 24,
): Camera {
  const worldW = ((mapW + mapH) * TILE_W) / 2;
  const worldH = ((mapW + mapH) * TILE_H) / 2;
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min((viewW - margin * 2) / worldW, (viewH - margin * 2) / worldH)),
  );
  const centre = gridToWorld(mapW / 2, mapH / 2);
  return { zoom, x: viewW / 2 - centre.x * zoom, y: viewH / 2 - centre.y * zoom };
}
