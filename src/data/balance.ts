import type { Balance } from '../core/types';

export const BALANCE: Balance = {
  start: { gold: 500, food: 30, materials: 60 },
  buildPointsPerTurn: 20,
  demolishRefund: 0.5,
  repairShare: 0.3,
  canalReach: 2,
  land: { base: 80, step: 12 },
  raw: {
    cap: 60,
    price: 1,
    // spring, summer, autumn, winter
    season: { grain: [0.5, 1, 2, 0], wool: [1.5, 1, 1, 0.5], wood: [1, 1, 1, 1] },
  },
  loan: { step: 100, base: 300, perHead: 2, interest: 0.03, installment: 0.1 },
  workerShare: 0.4,
  foodPerHead: 0.08,
  goodsPerHead: 0.008,
  goodsReserveTurns: 3,
  goodsCap: 40,
  goodsPrice: 2,
  mergeLevel: 4,
  mergeBonus: 0.25,
  gateDelivery: { food: 15, materials: 5 },
  baseStorage: { food: 60, materials: 80 },
  graceTurns: 2,
  // spring, summer, autumn, winter
  seasonFoodDelivery: [1, 1, 1.5, 0.6],
  seasonFoodDemand: [1, 1, 1, 1.25],
  slowPaths: ['alley'],
  plazaPath: 'plaza',
  appeal: { pleasant: 1, fine: 5, stack: 2, boxedIn: -2 },
  events: {
    chance: 0.3,
    quietTurns: 6,
    fairBase: 10,
    fairPerHead: 0.25,
    pilgrimGold: 20,
    harvestFood: 30,
    harshWinterDemand: 1.4,
  },
  fire: { perRisk: 0.01, maxChance: 0.4, summerFactor: 2, quietTurns: 8 },
};
