import { describe, expect, it } from 'vitest';
import {
  fitCamera,
  gridToWorld,
  MAX_ZOOM,
  MIN_ZOOM,
  pickTile,
  TILE_H,
  TILE_W,
  worldToGrid,
  worldToScreen,
  zoomAt,
  type Camera,
} from '../src/render/iso';

const cam: Camera = { x: 137, y: -42, zoom: 1.7 };

describe('projection', () => {
  it('lays tiles out as 2:1 diamonds', () => {
    expect(gridToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToWorld(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(gridToWorld(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    expect(gridToWorld(1, 1)).toEqual({ x: 0, y: TILE_H });
  });

  it('round-trips grid → world → grid', () => {
    for (const [gx, gy] of [
      [0, 0],
      [3.25, 7.5],
      [-2, 11],
      [29, 24],
    ] as const) {
      const w = gridToWorld(gx, gy);
      const g = worldToGrid(w.x, w.y);
      expect(g.x).toBeCloseTo(gx, 10);
      expect(g.y).toBeCloseTo(gy, 10);
    }
  });

  it('picks the tile whose centre is under the pointer', () => {
    for (const [gx, gy] of [
      [0, 0],
      [5, 2],
      [12, 19],
    ] as const) {
      const w = gridToWorld(gx + 0.5, gy + 0.5);
      const s = worldToScreen(cam, w.x, w.y);
      expect(pickTile(cam, s.x, s.y)).toEqual({ x: gx, y: gy });
    }
  });

  it('picks neighbouring tiles just across a tile edge', () => {
    const centre = gridToWorld(4.5, 4.5);
    const s = worldToScreen({ x: 0, y: 0, zoom: 1 }, centre.x, centre.y);
    const unit: Camera = { x: 0, y: 0, zoom: 1 };
    // Straight up from the centre leaves through the top vertex into (3, 3).
    expect(pickTile(unit, s.x, s.y - TILE_H / 2 - 1)).toEqual({ x: 3, y: 3 });
    // Straight right leaves through the right vertex into (5, 3).
    expect(pickTile(unit, s.x + TILE_W / 2 + 1, s.y)).toEqual({ x: 5, y: 3 });
  });
});

describe('camera', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const before = pickTile(cam, 300, 200);
    const zoomed = zoomAt(cam, 300, 200, 1.5);
    expect(zoomed.zoom).toBeCloseTo(cam.zoom * 1.5);
    expect(pickTile(zoomed, 300, 200)).toEqual(before);
  });

  it('clamps the zoom level', () => {
    expect(zoomAt(cam, 0, 0, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, 0, 0, 0.0001).zoom).toBe(MIN_ZOOM);
  });

  it('fits a map into the viewport with its centre in the middle', () => {
    const fitted = fitCamera(30, 25, 800, 600);
    const centre = gridToWorld(15, 12.5);
    expect(worldToScreen(fitted, centre.x, centre.y)).toEqual({ x: 400, y: 300 });
    for (const [gx, gy] of [
      [0, 0],
      [30, 0],
      [30, 25],
      [0, 25],
    ] as const) {
      const w = gridToWorld(gx, gy);
      const s = worldToScreen(fitted, w.x, w.y);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(800);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(600);
    }
  });
});
