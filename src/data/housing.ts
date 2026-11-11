import type { HousingLevel } from '../core/types';

/** Housing levels from hut to patrician house. Needs are cumulative. */
export const HOUSING: readonly HousingLevel[] = [
  { level: 1, capacity: 4, needs: ['road'], taxPerHead: 0.2 },
  { level: 2, capacity: 7, needs: ['road', 'water', 'food'], taxPerHead: 0.24 },
  {
    level: 3,
    capacity: 11,
    needs: ['road', 'water', 'food', 'faith', 'fire', 'appeal1'],
    taxPerHead: 0.27,
  },
  {
    level: 4,
    capacity: 16,
    needs: ['road', 'water', 'food', 'faith', 'fire', 'appeal1', 'fun', 'health', 'goods1'],
    taxPerHead: 0.27,
  },
  {
    level: 5,
    capacity: 22,
    needs: [
      'road',
      'water',
      'food',
      'faith',
      'fire',
      'fun',
      'health',
      'education',
      'order',
      'goods1',
      'goods2',
      'appeal1',
      'appeal2',
    ],
    taxPerHead: 0.28,
  },
];
