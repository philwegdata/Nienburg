import type { BuildingDef } from '../core/types';

const base = { upkeep: 0, workers: 0 } as const;
const one = { w: 1, h: 1 } as const;
const two = { w: 2, h: 2 } as const;

const list: BuildingDef[] = [
  {
    ...base,
    id: 'alley',
    category: 'path',
    size: one,
    drag: 'line',
    cost: 1,
    materials: 0,
    buildPoints: 1,
  },
  {
    ...base,
    id: 'street',
    category: 'path',
    size: one,
    drag: 'line',
    cost: 3,
    materials: 1,
    buildPoints: 1,
  },
  {
    ...base,
    id: 'plaza',
    category: 'path',
    size: one,
    drag: 'rect',
    cost: 3,
    materials: 1,
    buildPoints: 1,
  },
  {
    ...base,
    id: 'house',
    category: 'housing',
    size: one,
    drag: 'line',
    cost: 10,
    materials: 2,
    buildPoints: 2,
  },
  {
    id: 'well',
    category: 'water',
    size: one,
    drag: 'none',
    cost: 20,
    materials: 4,
    buildPoints: 3,
    upkeep: 2,
    workers: 0,
    service: { kind: 'water', range: 6 },
  },
  {
    id: 'stall',
    category: 'food',
    size: one,
    drag: 'none',
    cost: 30,
    materials: 5,
    buildPoints: 3,
    upkeep: 4,
    workers: 2,
    service: { kind: 'food', range: 10 },
    needsPlaza: true,
  },
  {
    id: 'granary',
    category: 'food',
    size: two,
    drag: 'none',
    cost: 60,
    materials: 15,
    buildPoints: 8,
    upkeep: 5,
    workers: 2,
    storage: { food: 100 },
    delivery: { food: 15 },
  },
  {
    id: 'chapel',
    category: 'faith',
    size: { w: 1, h: 2 },
    drag: 'none',
    cost: 80,
    materials: 20,
    buildPoints: 8,
    upkeep: 8,
    workers: 1,
    service: { kind: 'faith', range: 12 },
  },
  {
    id: 'firewatch',
    category: 'safety',
    size: one,
    drag: 'none',
    cost: 40,
    materials: 8,
    buildPoints: 4,
    upkeep: 6,
    workers: 3,
    service: { kind: 'fire', range: 12 },
  },
  {
    id: 'warehouse',
    category: 'admin',
    size: two,
    drag: 'none',
    cost: 60,
    materials: 15,
    buildPoints: 8,
    upkeep: 5,
    workers: 3,
    storage: { materials: 120 },
    delivery: { materials: 6 },
  },
];

export type BuildingId =
  | 'alley'
  | 'street'
  | 'plaza'
  | 'house'
  | 'well'
  | 'stall'
  | 'granary'
  | 'chapel'
  | 'firewatch'
  | 'warehouse';

export const BUILDINGS: Readonly<Record<string, BuildingDef>> = Object.fromEntries(
  list.map((def) => [def.id, def]),
);

/** Order of the build menu. */
export const BUILD_MENU: readonly BuildingId[] = [
  'alley',
  'street',
  'plaza',
  'house',
  'well',
  'stall',
  'granary',
  'chapel',
  'firewatch',
  'warehouse',
];
