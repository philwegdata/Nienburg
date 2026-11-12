import { floodFill, indexOf } from './grid';
import type { Balance, CityDef, GameState, Point, Terrain } from './types';

/** Characters allowed in a city map. */
export const CITY_LEGEND: Readonly<Record<string, Terrain>> = {
  ' ': 'outside',
  '~': 'water',
  '^': 'rock',
  '#': 'wall',
  T: 'tower',
  G: 'gate',
  C: 'landmark',
  '=': 'canal',
  '.': 'buildable',
};

export interface ParsedCity {
  width: number;
  height: number;
  terrain: Terrain[];
}

/** Turns the ASCII map into terrain. Throws on unknown characters or ragged rows. */
export function parseCity(def: CityDef): ParsedCity {
  const height = def.map.length;
  const width = def.map[0]?.length ?? 0;
  if (width === 0) throw new Error(`City "${def.id}" has an empty map`);
  const terrain: Terrain[] = [];
  def.map.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`City "${def.id}": row ${y} has length ${row.length}, expected ${width}`);
    }
    for (const ch of row) {
      const t = CITY_LEGEND[ch];
      if (!t) throw new Error(`City "${def.id}": unknown map character "${ch}" in row ${y}`);
      terrain.push(t);
    }
  });
  return { width, height, terrain };
}

/** Returns a list of problems; an empty list means the city is playable. */
export function validateCity(def: CityDef): string[] {
  let city: ParsedCity;
  try {
    city = parseCity(def);
  } catch (err) {
    return [(err as Error).message];
  }
  const problems: string[] = [];
  const { width, height, terrain } = city;

  const gates: Point[] = [];
  let buildable = 0;
  terrain.forEach((t, i) => {
    if (t === 'gate') gates.push({ x: i % width, y: Math.floor(i / width) });
    if (t === 'buildable') buildable++;
  });

  if (gates.length === 0) problems.push('needs at least one gate');

  const [min, max] = def.buildableRange;
  if (buildable < min || buildable > max) {
    problems.push(`has ${buildable} buildable tiles, expected ${min}–${max}`);
  }

  const reached = floodFill(
    width,
    height,
    gates,
    // Canals can be bridged, so land behind them still counts as reachable.
    (x, y) => {
      const t = terrain[indexOf(width, x, y)];
      return t === 'buildable' || t === 'canal';
    },
  );
  const unreachable = terrain.filter((t, i) => t === 'buildable' && !reached.has(i)).length;
  if (unreachable > 0)
    problems.push(`${unreachable} buildable tiles cannot be reached from a gate`);

  return problems;
}

export function newGame(def: CityDef, seed: number, balance: Balance, sandbox = false): GameState {
  const { width, height, terrain } = parseCity(def);
  return {
    ...(sandbox ? { sandbox: true } : {}),
    version: 4,
    cityId: def.id,
    width,
    height,
    terrain,
    occupancy: new Array<number>(width * height).fill(0),
    buildings: {},
    nextBuildingId: 1,
    rng: seed | 0,
    turn: 0,
    gold: balance.start.gold,
    food: balance.start.food,
    materials: balance.start.materials,
    goods: { cloth: 0, tools: 0, beer: 0 },
    peakPop: 0,
    stars: [false, false, false],
    buildPoints: balance.buildPointsPerTurn,
    landBought: 0,
    event: null,
    subsidies: 0,
    lastReport: null,
  };
}
