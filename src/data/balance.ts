import type { Balance } from '../core/types';
import { WISH_MORE, WISH_NAMES, WISH_NEAR } from './wishes';

/** Towns that may send orders; every city of the game. */
const ORDER_PARTNERS = [
  'nienburg',
  'carcassonne',
  'dubrovnik',
  'montsaintmichel',
  'bruges',
  'sangimignano',
  'fes',
  'pingyao',
  'bhaktapur',
  'cusco',
];

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
  storey: {
    max: 2,
    minLevel: 2,
    gold: 40,
    materials: 12,
    buildPoints: 4,
    capacity: 0.4,
    fireRisk: 1,
    shade: -1,
  },
  wishes: {
    chance: 0.5,
    quietTurns: 3,
    radius: 3,
    reward: 30,
    perLevel: 15,
    names: WISH_NAMES.length,
    near: WISH_NEAR,
    more: WISH_MORE,
  },
  market: {
    // spring, summer, autumn, winter
    season: {
      cloth: [1, 0.75, 1.05, 1.3],
      tools: [1.2, 1, 0.9, 0.9],
      beer: [0.85, 1.35, 1.05, 0.8],
    },
    drift: 0.15,
  },
  orders: {
    chance: 0.35,
    quietTurns: 8,
    partners: ORDER_PARTNERS,
    base: 10,
    perYear: 2,
    max: 40,
    premium: 1.6,
    luxuryShare: 0.5,
  },
  luxury: { perHead: 0.01, taxBonus: 0.3 },
  taxRates: [
    { tax: 0.75, growth: 0.75 },
    { tax: 1, growth: 0.5 },
    { tax: 1.3, growth: 0.25 },
  ],
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
