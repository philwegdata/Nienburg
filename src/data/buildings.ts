import type { BuildingDef } from '../core/types';

type Size = [w: number, h: number];
/** gold, materials, build points, upkeep, workers */
type Numbers = [
  cost: number,
  materials: number,
  buildPoints: number,
  upkeep: number,
  workers: number,
];

function def(
  id: string,
  category: BuildingDef['category'],
  [w, h]: Size,
  [cost, materials, buildPoints, upkeep, workers]: Numbers,
  extra: Partial<BuildingDef> = {},
): BuildingDef {
  return {
    id,
    category,
    size: { w, h },
    drag: 'none',
    cost,
    materials,
    buildPoints,
    upkeep,
    workers,
    ...extra,
  };
}

const list: BuildingDef[] = [
  // Paths
  def('alley', 'path', [1, 1], [1, 0, 1, 0, 0], { drag: 'line' }),
  def('street', 'path', [1, 1], [3, 1, 1, 0, 0], { drag: 'line' }),
  def('plaza', 'path', [1, 1], [3, 1, 1, 0, 0], { drag: 'rect', appeal: { value: 1, radius: 1 } }),

  def('house', 'housing', [1, 1], [15, 3, 2, 0, 0], { drag: 'line', fireRisk: 1 }),

  // Water
  def('well', 'water', [1, 1], [20, 4, 3, 1, 0], { services: [{ kind: 'water', range: 6 }] }),
  def('cistern', 'water', [2, 2], [70, 15, 6, 3, 1], {
    services: [{ kind: 'water', range: 14 }],
    unlockPop: 60,
  }),

  // Food
  def('stall', 'food', [1, 1], [30, 5, 3, 3, 2], {
    services: [{ kind: 'food', range: 10 }],
    needsPlaza: true,
  }),
  def('granary', 'food', [2, 2], [60, 15, 8, 5, 2], {
    storage: { food: 100 },
    delivery: { food: 15 },
    unlockPop: 20,
  }),
  def('bakery', 'food', [1, 2], [50, 10, 5, 3, 3], {
    yields: { food: 12 },
    fireRisk: 3,
    unlockPop: 60,
  }),
  def('markethall', 'food', [3, 2], [220, 40, 12, 8, 6], {
    services: [
      { kind: 'food', range: 18 },
      { kind: 'goods', range: 18 },
    ],
    unlockPop: 150,
  }),

  // Faith
  def('chapel', 'faith', [1, 2], [80, 20, 8, 5, 1], {
    services: [{ kind: 'faith', range: 12 }],
    appeal: { value: 1, radius: 3 },
    unlockPop: 20,
  }),
  def('church', 'faith', [2, 3], [220, 60, 16, 12, 3], {
    services: [{ kind: 'faith', range: 22 }],
    appeal: { value: 2, radius: 4 },
    unlockPop: 260,
  }),
  def('cathedral', 'faith', [4, 5], [300, 60, 20, 25, 8], {
    services: [{ kind: 'faith', range: 999 }],
    appeal: { value: 4, radius: 6 },
    unique: true,
    unlockPop: 400,
    requires: 'townhall',
    construction: { turns: 12, gold: 60, materials: 25 },
  }),

  // Safety
  def('firewatch', 'safety', [1, 1], [40, 8, 4, 4, 3], {
    services: [{ kind: 'fire', range: 12 }],
    unlockPop: 20,
  }),
  def('nightwatch', 'safety', [1, 1], [45, 8, 4, 4, 2], {
    services: [{ kind: 'order', range: 12 }],
    unlockPop: 60,
  }),

  // Health
  def('bathhouse', 'health', [2, 2], [150, 25, 8, 6, 3], {
    services: [{ kind: 'health', range: 12 }],
    needsWater: true,
    unlockPop: 150,
  }),
  def('hospital', 'health', [2, 3], [260, 50, 14, 12, 6], {
    services: [{ kind: 'health', range: 22 }],
    unlockPop: 260,
    requires: 'townhall',
  }),

  // Culture
  def('tavern', 'culture', [1, 2], [60, 12, 5, 3, 2], {
    services: [{ kind: 'fun', range: 12 }],
    appeal: { value: -1, radius: 1 },
    fireRisk: 2,
    unlockPop: 60,
  }),
  def('school', 'culture', [2, 2], [180, 30, 10, 8, 3], {
    services: [{ kind: 'education', range: 14 }],
    unlockPop: 260,
    requires: 'townhall',
  }),

  // Craft
  def('weaver', 'craft', [2, 2], [90, 20, 8, 4, 5], {
    produces: { good: 'cloth', amount: 4 },
    unlockPop: 150,
  }),
  def('smithy', 'craft', [2, 2], [100, 25, 8, 4, 5], {
    produces: { good: 'tools', amount: 4 },
    appeal: { value: -2, radius: 2 },
    fireRisk: 3,
    unlockPop: 150,
  }),
  def('brewery', 'craft', [2, 2], [90, 20, 8, 4, 4], {
    produces: { good: 'beer', amount: 4 },
    appeal: { value: -1, radius: 2 },
    fireRisk: 2,
    unlockPop: 150,
  }),
  def('tannery', 'craft', [2, 2], [80, 15, 8, 2, 5], {
    yields: { gold: 25 },
    appeal: { value: -4, radius: 4 },
    unlockPop: 260,
  }),
  def('manufactory', 'craft', [3, 2], [260, 50, 14, 8, 8], {
    produces: { good: 'cloth', amount: 9 },
    appeal: { value: -1, radius: 2 },
    fireRisk: 2,
    unlockPop: 260,
  }),
  def('kontor', 'craft', [2, 2], [140, 25, 8, 4, 3], {
    trade: { capacity: 8, price: 5 },
    unlockPop: 150,
  }),
  def('guildhall', 'craft', [2, 3], [180, 45, 14, 8, 2], {
    guildBoost: 0.5,
    appeal: { value: 1, radius: 2 },
    unlockPop: 260,
    requires: 'townhall',
  }),

  // Administration
  def('townhall', 'admin', [3, 3], [320, 60, 18, 10, 4], {
    unique: true,
    taxBonus: 0.2,
    appeal: { value: 2, radius: 3 },
    unlockPop: 60,
  }),
  def('warehouse', 'admin', [2, 2], [60, 15, 8, 5, 3], {
    storage: { materials: 120 },
    delivery: { materials: 6 },
    appeal: { value: -1, radius: 1 },
    unlockPop: 20,
  }),
  def('buildersyard', 'admin', [2, 2], [120, 20, 8, 5, 4], {
    buildPointsBonus: 10,
    unlockPop: 150,
  }),

  // Green
  def('tree', 'green', [1, 1], [5, 0, 1, 0, 0], {
    drag: 'line',
    appeal: { value: 1, radius: 1 },
  }),
  def('garden', 'green', [1, 1], [12, 1, 1, 1, 0], {
    drag: 'line',
    appeal: { value: 2, radius: 2 },
    unlockPop: 20,
  }),
  def('fountain', 'green', [1, 1], [40, 8, 3, 2, 0], {
    appeal: { value: 3, radius: 3 },
    unlockPop: 150,
  }),
];

export type BuildingId =
  | 'alley'
  | 'street'
  | 'plaza'
  | 'house'
  | 'well'
  | 'cistern'
  | 'stall'
  | 'granary'
  | 'bakery'
  | 'markethall'
  | 'chapel'
  | 'church'
  | 'cathedral'
  | 'firewatch'
  | 'nightwatch'
  | 'bathhouse'
  | 'hospital'
  | 'tavern'
  | 'school'
  | 'weaver'
  | 'smithy'
  | 'brewery'
  | 'tannery'
  | 'manufactory'
  | 'kontor'
  | 'guildhall'
  | 'townhall'
  | 'warehouse'
  | 'buildersyard'
  | 'tree'
  | 'garden'
  | 'fountain';

export const BUILDINGS: Readonly<Record<string, BuildingDef>> = Object.fromEntries(
  list.map((d) => [d.id, d]),
);

/** Order of the build menu. */
export const BUILD_MENU: readonly BuildingId[] = list.map((d) => d.id as BuildingId);
