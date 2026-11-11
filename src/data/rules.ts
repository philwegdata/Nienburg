import type { BuildingDef, CityDef, Rules } from '../core/types';
import { BALANCE } from './balance';
import { BUILDINGS } from './buildings';
import { HOUSING } from './housing';

/** The rules as written, before any town's peculiarities. */
export const RULES: Rules = { buildings: BUILDINGS, housing: HOUSING, balance: BALANCE };

/**
 * The rules for one town: the general ones, bent by what makes that town special
 * (busier or quieter gates, better prices, a famous trade, revered old buildings).
 */
export function rulesFor(city: CityDef): Rules {
  const m = city.modifiers;
  if (!m) return RULES;
  const gate = m.gate ?? 1;
  const buildings: Record<string, BuildingDef> = { ...BUILDINGS };
  for (const [id, factor] of Object.entries(m.yields ?? {})) {
    const def = buildings[id];
    if (!def?.yields) continue;
    const scaled: NonNullable<BuildingDef['yields']> = {};
    if (def.yields.gold !== undefined) scaled.gold = Math.round(def.yields.gold * factor);
    if (def.yields.food !== undefined) scaled.food = Math.round(def.yields.food * factor);
    buildings[id] = { ...def, yields: scaled };
  }
  if (m.tradePrice) {
    for (const def of Object.values(buildings)) {
      if (!def.trade) continue;
      buildings[def.id] = {
        ...def,
        trade: { ...def.trade, price: Math.round(def.trade.price * m.tradePrice) },
      };
    }
  }
  const rules: Rules = {
    buildings,
    housing: HOUSING,
    balance: {
      ...BALANCE,
      gateDelivery: {
        food: Math.round(BALANCE.gateDelivery.food * gate),
        materials: Math.round(BALANCE.gateDelivery.materials * gate),
      },
    },
  };
  if (m.landmarkAppeal) rules.balance.landmarkAppeal = m.landmarkAppeal;
  return rules;
}
