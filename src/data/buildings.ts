import type { BuildingDef } from '../core/types';

const list: BuildingDef[] = [
  { id: 'alley', category: 'path', size: { w: 1, h: 1 }, drag: 'line', cost: 1 },
  { id: 'street', category: 'path', size: { w: 1, h: 1 }, drag: 'line', cost: 3 },
  { id: 'plaza', category: 'path', size: { w: 1, h: 1 }, drag: 'rect', cost: 4 },
  { id: 'house', category: 'housing', size: { w: 1, h: 1 }, drag: 'line', cost: 5 },
  { id: 'well', category: 'water', size: { w: 1, h: 1 }, drag: 'none', cost: 15 },
  { id: 'chapel', category: 'faith', size: { w: 1, h: 2 }, drag: 'none', cost: 60 },
];

export type BuildingId = 'alley' | 'street' | 'plaza' | 'house' | 'well' | 'chapel';

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
  'chapel',
];
