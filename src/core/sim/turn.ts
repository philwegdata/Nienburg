import { lockOf } from '../actions';
import { goalProgress } from '../goals';
import { indexOf } from '../grid';
import { rngStep } from '../rng';
import {
  GOODS,
  type Building,
  type GameState,
  type Goal,
  type Hint,
  type HouseData,
  type HintKind,
  type Need,
  type Rules,
  type TurnReport,
} from '../types';
import { analyze, houseCapacity, missingNeeds, type IdleReason } from './analyze';
import { rollEvent } from './events';

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
  order: 'noOrder',
  health: 'noHealth',
  fun: 'noFun',
  education: 'noEducation',
  goods1: 'noGoods',
  goods2: 'noGoods',
  appeal1: 'noAppeal',
  appeal2: 'noAppeal',
};

const IDLE_HINT: Partial<Record<IdleReason, HintKind>> = {
  noAccess: 'noAccess',
  needsPlaza: 'needsPlaza',
  needsWater: 'needsWater',
  noGate: 'noGate',
  unstaffed: 'unstaffed',
  damaged: 'damaged',
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

/** Joins neighbouring single-plot houses of the same upper level into one larger house. */
function mergeHouses(
  state: GameState,
  buildings: Record<number, Building>,
  rules: Rules,
): { buildings: Record<number, Building>; occupancy: number[]; merged: number } {
  const occupancy = state.occupancy.slice();
  const result = { ...buildings };
  let merged = 0;
  const eligible = (b: Building | undefined): b is Building & { house: HouseData } =>
    !!b?.house &&
    b.w === 1 &&
    b.h === 1 &&
    !b.damaged &&
    b.house.lacking === 0 &&
    b.house.level >= rules.balance.mergeLevel;

  for (const a of Object.values(buildings).sort((p, q) => p.id - q.id)) {
    const first = result[a.id];
    if (!eligible(first)) continue;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const x = first.x + dx;
      const y = first.y + dy;
      if (x >= state.width || y >= state.height) continue;
      const second = result[occupancy[indexOf(state.width, x, y)]!];
      if (!eligible(second) || second.house.level !== first.house.level) continue;
      result[first.id] = {
        ...first,
        w: 1 + dx,
        h: 1 + dy,
        house: { ...first.house, pop: first.house.pop + second.house.pop },
      };
      delete result[second.id];
      occupancy[indexOf(state.width, x, y)] = first.id;
      merged++;
      break;
    }
  }
  return { buildings: result, occupancy, merged };
}

/**
 * Plays one season and returns the new state with its report.
 * Order: deliveries and production → construction → consumption → housing → merging → fire →
 * taxes and upkeep → unlocks and goals.
 */
export function endTurn(state: GameState, rules: Rules, goals: readonly Goal[] = []): GameState {
  const { balance, housing } = rules;
  const season = state.turn % 4;
  const analysis = analyze(state, rules);
  const hints = new HintList();
  const maxLevel = housing.length;
  const centre = { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) };

  // 1. Deliveries through the gates and what the town makes itself, limited by storage.
  const foodArriving =
    Math.round(analysis.foodDelivery * balance.seasonFoodDelivery[season]!) + analysis.foodYield;
  const foodDelivered = Math.max(0, Math.min(foodArriving, analysis.foodCap - state.food));
  const materialsArriving = analysis.materialsDelivery;
  const materialsDelivered = Math.max(
    0,
    Math.min(materialsArriving, analysis.materialsCap - state.materials),
  );
  let food = state.food + foodDelivered;
  let materials = state.materials + materialsDelivered;
  let gold = state.gold;

  // Craft goods: whatever does not fit into storage is sold through the gates.
  let tradeIncome = analysis.goldYield;
  const goods = { ...state.goods };
  for (const g of GOODS) {
    goods[g] += analysis.production[g];
    const surplus = Math.max(0, goods[g] - balance.goodsCap);
    goods[g] -= surplus;
    tradeIncome += surplus * balance.goodsPrice;
  }
  const available = GOODS.filter((g) => goods[g] > 0 && goods[g] >= analysis.goodsDemand);
  for (const g of available) goods[g] -= analysis.goodsDemand;
  const goodsTypes = available.length;

  // Merchants sell what the houses will not need for a while, fullest store first.
  const reserve = analysis.goodsDemand * balance.goodsReserveTurns;
  let goodsSold = 0;
  while (goodsSold < analysis.tradeCapacity) {
    const best = GOODS.reduce((a, b) => (goods[b] > goods[a] ? b : a));
    if (goods[best] <= reserve) break;
    goods[best]--;
    goodsSold++;
  }
  tradeIncome += goodsSold * analysis.tradePrice;

  // 2. Long building projects advance if the town can pay this season's share.
  const buildings: Record<number, Building> = {};
  const completed: string[] = [];
  let constructionCost = 0;
  const sites = Object.values(state.buildings)
    .filter((b) => b.construction)
    .sort((a, b) => a.id - b.id);
  for (const b of sites) {
    const cost = rules.buildings[b.def]?.construction;
    if (!cost || gold < cost.gold || materials < cost.materials) {
      hints.add('stalled', b);
      continue;
    }
    gold -= cost.gold;
    materials -= cost.materials;
    constructionCost += cost.gold;
    const next: Building = { ...b, construction: b.construction! - 1 };
    if (next.construction === 0) {
      delete next.construction;
      completed.push(b.def);
    }
    buildings[b.id] = next;
  }

  // 3. Everyone eats; if the stores run dry, nobody counts as fed this season.
  const harsh = state.event?.kind === 'harshWinter' ? balance.events.harshWinterDemand : 1;
  const demand = Math.ceil(
    analysis.population * balance.foodPerHead * balance.seasonFoodDemand[season]! * harsh,
  );
  const hungry = demand > food;
  const foodEaten = hungry ? food : demand;
  food -= foodEaten;
  if (hungry) hints.add('hungry', centre);
  const ctx = { hungry, goodsTypes, festive: state.event?.kind === 'jugglers' };

  for (const id of analysis.dryCanals) {
    const b = state.buildings[id];
    if (b) hints.add('dryCanal', b);
  }
  for (const [id, reason] of analysis.idle) {
    const b = state.buildings[id];
    const kind = IDLE_HINT[reason];
    if (b && kind) hints.add(kind, b);
  }

  // 4. + 5. Houses rise or decline, then people move in.
  let upgraded = 0;
  let downgraded = 0;
  let upkeep = 0;
  for (const b of Object.values(state.buildings)) {
    if (!b.construction) upkeep += rules.buildings[b.def]?.upkeep ?? 0;
    if (!b.house) {
      buildings[b.id] ??= b;
      continue;
    }
    let { level, pop, lacking } = b.house;
    const hasRoad = analysis.access.has(b.id);
    const missingNow = missingNeeds(rules, analysis, b.id, level, ctx);
    if (missingNow.length > 0) {
      lacking++;
      if (lacking >= balance.graceTurns && level > 1) {
        level--;
        lacking = 0;
        downgraded++;
      }
    } else {
      lacking = 0;
      // Only a full, undamaged house outgrows itself.
      const full = pop >= houseCapacity(rules, b, level);
      if (
        full &&
        !b.damaged &&
        level < maxLevel &&
        missingNeeds(rules, analysis, b.id, level + 1, ctx).length === 0
      ) {
        level++;
        upgraded++;
      }
    }

    const capacity = houseCapacity(rules, b, level);
    if (!hasRoad) pop = 0;
    else if (pop < capacity) pop += Math.ceil((capacity - pop) / 2);
    else pop = capacity;

    // Tell the player what stands between this house and the next level.
    if (b.damaged) hints.add('damaged', b);
    const wanted = missingNeeds(rules, analysis, b.id, Math.min(level + 1, maxLevel), ctx);
    const kinds = new Set<HintKind>();
    for (const need of wanted) {
      // A general food shortage is already reported once.
      if (need === 'food' && hungry) continue;
      // Without a path nothing else matters yet.
      if (!hasRoad && need !== 'road') continue;
      kinds.add(NEED_HINT[need]);
    }
    for (const kind of kinds) hints.add(kind, b);

    buildings[b.id] = { ...b, house: { level, pop, lacking } };
  }

  // Neighbouring houses of the upper levels grow together.
  const joined = mergeHouses(state, buildings, rules);

  // A fire may blacken one building that no fire watch covers. Nothing is ever destroyed.
  let rng = state.rng;
  let fire: TurnReport['fire'] = null;
  if (state.turn >= balance.fire.quietTurns) {
    const atRisk = Object.values(joined.buildings)
      .filter((b) => !b.damaged && !b.construction && !analysis.covered.fire.has(b.id))
      .map((b) => ({ b, risk: rules.buildings[b.def]?.fireRisk ?? 0 }))
      .filter((r) => r.risk > 0 && (!r.b.house || r.b.house.pop > 0))
      .sort((p, q) => p.b.id - q.b.id);
    const totalRisk = atRisk.reduce((sum, r) => sum + r.risk, 0);
    const chance = Math.min(
      balance.fire.maxChance,
      totalRisk * balance.fire.perRisk * (season === 1 ? balance.fire.summerFactor : 1),
    );
    const roll = rngStep(rng);
    rng = roll.next;
    if (roll.value < chance) {
      const pick = rngStep(rng);
      rng = pick.next;
      let at = pick.value * totalRisk;
      const victim = atRisk.find((r) => (at -= r.risk) < 0) ?? atRisk[atRisk.length - 1]!;
      joined.buildings[victim.b.id] = { ...victim.b, damaged: true };
      fire = { def: victim.b.def, x: victim.b.x, y: victim.b.y };
    }
  }

  // 6. Taxes, trade and upkeep. An empty treasury is topped up by the sovereign.
  let popAfter = 0;
  let taxes = 0;
  for (const b of Object.values(joined.buildings)) {
    if (!b.house) continue;
    popAfter += b.house.pop;
    taxes += b.house.pop * housing[b.house.level - 1]!.taxPerHead;
  }
  taxes = Math.floor(taxes * analysis.taxFactor);
  gold += taxes + tradeIncome - upkeep;
  const subsidy = gold < 0;
  if (subsidy) gold = 0;

  const settled: GameState = {
    ...state,
    buildings: joined.buildings,
    occupancy: joined.occupancy,
    rng,
    turn: state.turn + 1,
    gold,
    food,
    materials,
    goods,
    peakPop: Math.max(state.peakPop, popAfter),
    buildPoints: analysis.buildPoints,
    subsidies: state.subsidies + (subsidy ? 1 : 0),
  };

  // Now and then something happens: a windfall at once, or a change for the coming season.
  const happening = rollEvent(settled, analysis, rules);
  const next: GameState = {
    ...settled,
    rng: happening.rng,
    gold: settled.gold + happening.gold,
    food: Math.min(Math.max(analysis.foodCap, settled.food), settled.food + happening.food),
    event: happening.active,
  };

  // 7. New buildings to choose from, and goals reached.
  const unlocked = Object.values(rules.buildings)
    .filter((def) => {
      const before = lockOf(state, def);
      return before !== null && before.kind !== 'unique' && lockOf(next, def) === null;
    })
    .map((def) => def.id);
  const stars: [boolean, boolean, boolean] = [...state.stars];
  const newStars: number[] = [];
  goals.forEach((goal, i) => {
    if (i < 3 && !stars[i] && goalProgress(next, goal).done) {
      stars[i] = true;
      newStars.push(i);
    }
  });

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
    merged: joined.merged,
    tradeIncome,
    goodsSold,
    constructionCost,
    goodsTypes,
    event: happening.news,
    fire,
    completed,
    unlocked,
    newStars,
    hints: hints.list(),
  };

  return { ...next, stars, lastReport: report };
}

/** What ending the turn right now would report. */
export function forecast(state: GameState, rules: Rules, goals: readonly Goal[] = []): TurnReport {
  return endTurn(state, rules, goals).lastReport!;
}
