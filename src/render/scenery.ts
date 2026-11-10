import { inBounds, indexOf, NEIGHBOURS_4 } from '../core/grid';
import type { Terrain } from '../core/types';

/** How far the painted countryside reaches beyond the map, in tiles. */
export const MARGIN = 6;

export interface MapLike {
  width: number;
  height: number;
  terrain: Terrain[];
}

export type Scenery = 'meadow' | 'field' | 'forest' | 'road';

/** Stable pseudo-random number for a tile. */
export function tileHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Terrain at any position, including beyond the map: there the countryside continues, and a
 * river that touches the edge of the map keeps flowing.
 */
export function terrainAround(map: MapLike, x: number, y: number): Terrain {
  if (inBounds(map.width, map.height, x, y)) return map.terrain[indexOf(map.width, x, y)]!;
  const cx = Math.min(map.width - 1, Math.max(0, x));
  const cy = Math.min(map.height - 1, Math.max(0, y));
  return map.terrain[indexOf(map.width, cx, cy)] === 'water' ? 'water' : 'outside';
}

/** Smooth value noise in 0..1 with features about `cell` tiles wide. */
function noise(x: number, y: number, cell: number, salt: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const at = (ix: number, iy: number) => tileHash(ix + salt * 101, iy - salt * 57) / 4294967296;
  const sx = fx - x0;
  const sy = fy - y0;
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Tiles of the roads that lead from every gate straight out into the countryside. */
export function gateRoads(map: MapLike): Set<string> {
  const roads = new Set<string>();
  map.terrain.forEach((t, i) => {
    if (t !== 'gate') return;
    const gx = i % map.width;
    const gy = Math.floor(i / map.width);
    // The road leaves on the side opposite the town.
    const inward = NEIGHBOURS_4.find((n) => terrainAround(map, gx + n.x, gy + n.y) === 'buildable');
    if (!inward) return;
    let x = gx - inward.x;
    let y = gy - inward.y;
    while (x >= -MARGIN && y >= -MARGIN && x < map.width + MARGIN && y < map.height + MARGIN) {
      const terrain = terrainAround(map, x, y);
      if (terrain === 'water') break;
      if (terrain === 'outside') roads.add(key(x, y));
      x -= inward.x;
      y -= inward.y;
    }
  });
  return roads;
}

/** Whether anything built (walls, town) lies within `radius` tiles. */
function nearTown(map: MapLike, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const t = terrainAround(map, x + dx, y + dy);
      if (t !== 'outside' && t !== 'water') return true;
    }
  }
  return false;
}

export interface Countryside {
  /** What grows on an outside tile. */
  at(x: number, y: number): Scenery;
  /** Which way the furrows of the field patch at this tile run. */
  furrowsAlongX(x: number, y: number): boolean;
  /** Index of the field patch, to give neighbouring tiles of one field the same colour. */
  patch(x: number, y: number): number;
}

export function countryside(map: MapLike): Countryside {
  const roads = gateRoads(map);
  const salt = map.width * 31 + map.height;
  const patch = (x: number, y: number) =>
    tileHash(Math.floor((x + 100) / 4) + salt, Math.floor((y + 100) / 3) - salt);
  return {
    at(x, y) {
      if (roads.has(key(x, y))) return 'road';
      const n = noise(x + 100, y + 100, 5, salt);
      // Nothing is farmed right under the walls or between two wall rings.
      if (n > 0.6 && !nearTown(map, x, y, 1)) return 'field';
      // Woods keep their distance, so trees never stand in front of the walls.
      if (n < 0.3 && !nearTown(map, x, y, 2)) return 'forest';
      return 'meadow';
    },
    furrowsAlongX: (x, y) => (patch(x, y) & 1) === 0,
    patch,
  };
}
