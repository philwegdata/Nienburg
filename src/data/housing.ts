import type { HousingLevel } from '../core/types';

/** Housing levels from hut to half-timbered house. Needs are cumulative. */
export const HOUSING: readonly HousingLevel[] = [
  { level: 1, capacity: 4, needs: ['road'], taxPerHead: 0.15 },
  { level: 2, capacity: 7, needs: ['road', 'water', 'food'], taxPerHead: 0.25 },
  { level: 3, capacity: 11, needs: ['road', 'water', 'food', 'faith', 'fire'], taxPerHead: 0.4 },
];
