import { CITY_LEGEND, parseCity } from './city';
import type { CityDef, Terrain } from './types';

/** A plan drawn by the player. */
export interface CustomPlan {
  id: string;
  name: string;
  map: string[];
}

/** The character each kind of terrain is written with. */
export const TERRAIN_CHAR: Readonly<Record<Terrain, string>> = Object.fromEntries(
  Object.entries(CITY_LEGEND).map(([ch, t]) => [t, ch]),
) as Record<Terrain, string>;

export const PLAN_MIN = 10;
export const PLAN_MAX = 48;
/** Fewest building tiles a plan needs to be worth playing. */
export const PLAN_MIN_BUILDABLE = 20;

/** A walled square with a gate on the right, open country around it. */
export function blankPlan(width = 24, height = 20): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const ring = x === 2 || y === 2 || x === width - 3 || y === height - 3;
      if (edge) row += ' ';
      else if (ring) row += x === width - 3 && y === Math.floor(height / 2) ? 'G' : '#';
      else row += '.';
    }
    rows.push(row);
  }
  return rows;
}

/** A plan grown or cut to a new size; what was drawn stays where it was. */
export function resizePlan(map: readonly string[], width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    const old = map[y] ?? '';
    rows.push(old.padEnd(width, ' ').slice(0, width));
  }
  return rows;
}

/** Sets one tile of a plan. */
export function paintPlan(map: readonly string[], x: number, y: number, t: Terrain): string[] {
  return map.map((row, i) =>
    i === y ? row.slice(0, x) + TERRAIN_CHAR[t] + row.slice(x + 1) : row,
  );
}

export type PlanProblem = 'noGate' | 'tooSmall' | 'unreachable' | 'open';

/** What keeps a plan from being played; an empty list means it is fine. */
export function checkPlan(map: readonly string[]): PlanProblem[] {
  const { width, height, terrain } = parseCity({ map: [...map] } as CityDef);
  const problems: PlanProblem[] = [];
  const at = (x: number, y: number) => terrain[y * width + x]!;
  const gates: number[] = [];
  let buildable = 0;
  terrain.forEach((t, i) => {
    if (t === 'gate') gates.push(i);
    if (t === 'buildable') buildable++;
  });
  if (gates.length === 0) problems.push('noGate');
  if (buildable < PLAN_MIN_BUILDABLE) problems.push('tooSmall');

  // Every building tile must be reachable from a gate (canals can be bridged).
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const g of gates) {
    seen.add(g);
    queue.push(g);
  }
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      const t = at(nx, ny);
      if (seen.has(j) || (t !== 'buildable' && t !== 'canal')) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  if (terrain.some((t, i) => t === 'buildable' && !seen.has(i))) problems.push('unreachable');

  // The town needs a closed wall: building ground may not touch the edge of the map, nor open
  // country or water that reaches the edge. A pond inside the walls is fine.
  const open = new Set<number>();
  const edge: number[] = [];
  const passable = (t: Terrain) => t === 'outside' || t === 'water' || t === 'rock';
  for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) edge.push(y * width, y * width + width - 1);
  while (edge.length > 0) {
    const i = edge.pop()!;
    if (open.has(i) || !passable(terrain[i]!)) continue;
    open.add(i);
    const x = i % width;
    if (x > 0) edge.push(i - 1);
    if (x < width - 1) edge.push(i + 1);
    if (i >= width) edge.push(i - width);
    if (i < width * (height - 1)) edge.push(i + width);
  }
  const leaks = terrain.some((t, i) => {
    if (t !== 'buildable') return false;
    const x = i % width;
    const y = Math.floor(i / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true;
    return [i + 1, i - 1, i + width, i - width].some((n) => open.has(n));
  });
  if (leaks) problems.push('open');
  return problems;
}

/** A player's plan as a city: gentle goals that grow with its size. */
export function customCity(plan: CustomPlan): CityDef {
  const buildable = plan.map.join('').split('.').length - 1;
  const people = Math.max(40, Math.round(buildable / 20) * 10);
  return {
    id: plan.id,
    name: { de: plan.name, en: plan.name },
    region: { de: 'Eigener Grundriss', en: 'Own plan' },
    blurb: { de: 'Von dir selbst gezeichnet.', en: 'Drawn by yourself.' },
    location: { lat: 0, lon: 0 },
    difficulty: 2,
    buildableRange: [PLAN_MIN_BUILDABLE, 100000],
    goals: [
      { kind: 'population', value: people },
      { kind: 'houses', level: 3, count: Math.max(5, Math.round(buildable / 30)) },
      { kind: 'building', def: 'church' },
    ],
    map: [...plan.map],
  };
}
