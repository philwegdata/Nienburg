import type { Building, GameState, Hint, HintKind, Need, Rules, TurnReport } from '../types';
import { analyze, missingNeeds } from './analyze';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export function seasonOf(turn: number): Season {
  return SEASONS[turn % 4]!;
}

export function yearOf(turn: number): number {
  return Math.floor(turn / 4) + 1;
}

const NEED_HINT: Record<Need, HintKind> = {
  road: 'noRoad',
  water: 'noWater',
  food: 'noFood',
  faith: 'noFaith',
  fire: 'noFire',
};

class HintList {
  private readonly byKind = new Map<HintKind, Hint>();

  add(kind: HintKind, at: { x: number; y: number }): void {
    const known = this.byKind.get(kind);
    if (known) known.count++;
    else this.byKind.set(kind, { kind, count: 1, x: at.x, y: at.y });
  }

  list(): Hint[] {
    return [...this.byKind.values()];
  }
}

/**
 * Plays one season and returns the new state with its report.
 * Order: deliveries → coverage → consumption → housing → migration → taxes and upkeep.
 */
export function endTurn(state: GameState, rules: Rules): GameState {
  const { balance, housing } = rules;
  const season = state.turn % 4;
  const analysis = analyze(state, rules);
  const hints = new HintList();
  const maxLevel = housing.length;

  // 1. Deliveries through the gates, limited by storage.
  const foodArriving = Math.round(analysis.foodDelivery * balance.seasonFoodDelivery[season]!);
  const foodDelivered = Math.max(0, Math.min(foodArriving, analysis.foodCap - state.food));
  const materialsArriving = analysis.materialsDelivery;
  const materialsDelivered = Math.max(
    0,
    Math.min(materialsArriving, analysis.materialsCap - state.materials),
  );
  let food = state.food + foodDelivered;
  const materials = state.materials + materialsDelivered;
  const centre = { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) };

  // 2. + 3. Everyone eats; if the stores run dry, nobody counts as fed this season.
  const demand = Math.ceil(
    analysis.population * balance.foodPerHead * balance.seasonFoodDemand[season]!,
  );
  const hungry = demand > food;
  const foodEaten = hungry ? food : demand;
  food -= foodEaten;
  if (hungry) hints.add('hungry', centre);

  for (const [id, reason] of analysis.idle) {
    const b = state.buildings[id];
    if (b) hints.add(reason, b);
  }

  // 4. + 5. Houses rise or decline, then people move in.
  const buildings: Record<number, Building> = {};
  let upgraded = 0;
  let downgraded = 0;
  let popAfter = 0;
  let taxes = 0;
  let upkeep = 0;
  for (const b of Object.values(state.buildings)) {
    upkeep += rules.buildings[b.def]?.upkeep ?? 0;
    if (!b.house) {
      buildings[b.id] = b;
      continue;
    }
    let { level, pop, lacking } = b.house;
    const hasRoad = analysis.access.has(b.id);
    const missingNow = missingNeeds(rules, analysis, b.id, level, hungry);
    if (missingNow.length > 0) {
      lacking++;
      if (lacking >= balance.graceTurns && level > 1) {
        level--;
        lacking = 0;
        downgraded++;
      }
    } else {
      lacking = 0;
      // Only a full house outgrows itself.
      const full = pop >= housing[level - 1]!.capacity;
      if (
        full &&
        level < maxLevel &&
        missingNeeds(rules, analysis, b.id, level + 1, hungry).length === 0
      ) {
        level++;
        upgraded++;
      }
    }

    const capacity = housing[level - 1]!.capacity;
    if (!hasRoad) pop = 0;
    else if (pop < capacity) pop += Math.ceil((capacity - pop) / 2);
    else pop = capacity;

    // Tell the player what stands between this house and the next level.
    const wanted = missingNeeds(rules, analysis, b.id, Math.min(level + 1, maxLevel), hungry);
    for (const need of wanted) {
      // A general food shortage is already reported once.
      if (need === 'food' && hungry) continue;
      // Without a path nothing else matters yet.
      if (!hasRoad && need !== 'road') continue;
      hints.add(NEED_HINT[need], b);
    }

    popAfter += pop;
    taxes += pop * housing[level - 1]!.taxPerHead;
    buildings[b.id] = { ...b, house: { level, pop, lacking } };
  }

  // 6. Taxes and upkeep. An empty treasury is topped up by the sovereign.
  taxes = Math.floor(taxes);
  let gold = state.gold + taxes - upkeep;
  const subsidy = gold < 0;
  if (subsidy) gold = 0;

  const report: TurnReport = {
    turn: state.turn,
    taxes,
    upkeep,
    subsidy,
    foodDelivered,
    foodWasted: foodArriving - foodDelivered,
    foodEaten,
    hungry,
    materialsDelivered,
    materialsWasted: materialsArriving - materialsDelivered,
    popBefore: analysis.population,
    popAfter,
    upgraded,
    downgraded,
    hints: hints.list(),
  };

  return {
    ...state,
    buildings,
    turn: state.turn + 1,
    gold,
    food,
    materials,
    buildPoints: balance.buildPointsPerTurn,
    subsidies: state.subsidies + (subsidy ? 1 : 0),
    lastReport: report,
  };
}

/** What ending the turn right now would report. */
export function forecast(state: GameState, rules: Rules): TurnReport {
  return endTurn(state, rules).lastReport!;
}
