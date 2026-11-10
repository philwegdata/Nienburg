import type { Balance } from '../core/types';

export const BALANCE: Balance = {
  start: { gold: 500, food: 30, materials: 60 },
  buildPointsPerTurn: 20,
  demolishRefund: 0.5,
  workerShare: 0.4,
  foodPerHead: 0.08,
  gateDelivery: { food: 15, materials: 5 },
  baseStorage: { food: 60, materials: 80 },
  graceTurns: 2,
  // spring, summer, autumn, winter
  seasonFoodDelivery: [1, 1, 1.5, 0.6],
  seasonFoodDemand: [1, 1, 1, 1.25],
  slowPaths: ['alley'],
  plazaPath: 'plaza',
};
