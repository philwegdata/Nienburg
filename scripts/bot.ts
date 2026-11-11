/**
 * A simple automatic player for balancing. It lays out a town from a template and then builds
 * it in order, as fast as the treasury allows. It is not clever – which is the point: if this
 * bot gets through, so will a person who thinks.
 */
import { buildingAt, lockOf, placeBuilding, population, repair } from '../src/core/actions';
import { newGame, parseCity } from '../src/core/city';
import { indexOf, NEIGHBOURS_4 } from '../src/core/grid';
import { endTurn, forecast } from '../src/core/sim/turn';
import type { CityDef, GameState, HintKind, Rotation, Rules } from '../src/core/types';

export interface Order {
  def: string;
  x: number;
  y: number;
  rot: Rotation;
}

/**
 * Where the template goes. The main street runs east–west ('ew') or north–south ('ns') along
 * `line`, `half` tiles to either side of `cross`, where a side street with the large buildings
 * branches off.
 */
export interface PlanSpec {
  name: string;
  axis: 'ew' | 'ns';
  line: number;
  cross: number;
  half: number;
}

/** Large buildings for the far end of the side street, in the order they are wanted. */
const LATE = [
  'bakery',
  'hospital',
  'warehouse',
  'granary',
  'cathedral',
  'guildhall',
  'buildersyard',
];

export function planTown(city: CityDef, spec: PlanSpec, rules: Rules): Order[] {
  const map = parseCity(city);
  const taken = new Set<number>();
  const paths = new Set<number>();
  const orders: Order[] = [];
  const toXY = (u: number, v: number) => (spec.axis === 'ew' ? { x: u, y: v } : { x: v, y: u });
  const free = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height &&
    map.terrain[indexOf(map.width, x, y)] === 'buildable' &&
    !taken.has(indexOf(map.width, x, y));

  /** Reserves a spot of `lu` tiles along the main street and `lv` across; false if it is not free. */
  const add = (def: string, u: number, v: number, lu = 1, lv = 1): boolean => {
    const size = rules.buildings[def]!.size;
    const { x, y } = toXY(u, v);
    const w = spec.axis === 'ew' ? lu : lv;
    const h = spec.axis === 'ew' ? lv : lu;
    const rot: Rotation = size.w === w && size.h === h ? 0 : 1;
    if (rot === 1 && (size.w !== h || size.h !== w)) throw new Error(`${def} cannot be ${w}×${h}`);
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) if (!free(x + dx, y + dy)) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        taken.add(indexOf(map.width, x + dx, y + dy));
        if (rules.buildings[def]!.category === 'path')
          paths.add(indexOf(map.width, x + dx, y + dy));
      }
    }
    orders.push({ def, x, y, rot });
    return true;
  };

  const { line: L, cross: C, half } = spec;

  // The main street, built outwards from the crossing.
  add('street', C, L);
  for (let d = 1; d <= half; d++) {
    add('street', C - d, L);
    add('street', C + d, L);
  }

  // A link to the nearest gate, so that granaries and warehouses can be supplied.
  const gateLink = (): void => {
    const prev = new Map<number, number>();
    const queue = [...paths];
    for (const i of queue) prev.set(i, -1);
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      const atGate = NEIGHBOURS_4.some(
        (n) => map.terrain[indexOf(map.width, x + n.x, y + n.y)] === 'gate',
      );
      if (atGate) {
        for (let at = i; prev.get(at) !== -1; at = prev.get(at)!) {
          const tile =
            spec.axis === 'ew'
              ? [at % map.width, Math.floor(at / map.width)]
              : [Math.floor(at / map.width), at % map.width];
          add('street', tile[0]!, tile[1]!);
        }
        return;
      }
      for (const n of NEIGHBOURS_4) {
        const j = indexOf(map.width, x + n.x, y + n.y);
        if (free(x + n.x, y + n.y) && !prev.has(j)) {
          prev.set(j, i);
          queue.push(j);
        }
      }
    }
  };
  gateLink();

  // Small services sit in the house rows, where they are closest to everyone.
  const north: Record<number, string> = {
    [-1]: 'plaza',
    [-2]: 'stall',
    1: 'well',
    2: 'firewatch',
    [-6]: 'well',
  };
  const south: Record<number, [string, number]> = {
    [-2]: ['chapel', 2],
    1: ['nightwatch', 1],
    2: ['tavern', 2],
    6: ['well', 1],
    // A long street needs a second fire watch and tavern towards its far end.
    [-9]: ['firewatch', 1],
    [-11]: ['tavern', 2],
  };
  add('well', C + 1, L - 1);
  add('plaza', C - 1, L - 1);
  add('stall', C - 2, L - 1);

  const houses = (side: -1 | 1, from: number, to: number): void => {
    for (let d = from; d <= to; d++) {
      for (const u of d === 0 ? [] : [C - d, C + d]) {
        const du = u - C;
        if (side === -1 && north[du]) continue;
        if (side === 1 && (south[du] || south[du - 1]?.[1] === 2)) continue;
        // No house where the street could not be laid.
        const road = toXY(u, L);
        if (!paths.has(indexOf(map.width, road.x, road.y))) continue;
        if (add('house', u, L + side)) add('tree', u, L + 2 * side);
      }
    }
  };

  houses(-1, 3, 5);
  add('chapel', C - 2, L + 1, 2, 1);
  add('firewatch', C + 2, L - 1);
  add('well', C - 6, L - 1);
  houses(-1, 6, half);
  houses(1, 3, 5);
  add('well', C + 6, L + 1);

  // The side street and its large buildings, stacked outwards on both sides of it.
  const cursor = { n: L - 4, s: L + 4 };
  const spineTo = { n: L, s: L };
  const spine = (to: number): void => {
    while (spineTo.n > to && to < L) add('street', C, --spineTo.n);
    while (spineTo.s < to && to > L) add('street', C, ++spineTo.s);
  };
  const stacks: { side: 'n' | 's'; left: boolean; at: number }[] = [
    { side: 'n', left: false, at: cursor.n },
    { side: 's', left: true, at: cursor.s },
    { side: 'n', left: true, at: cursor.n },
    { side: 's', left: false, at: cursor.s },
  ];
  const large = (def: string): boolean => {
    const size = rules.buildings[def]!.size;
    // The shorter side lies along the side street, so that more buildings fit next to it.
    const lv = Math.min(size.w, size.h);
    const lu = Math.max(size.w, size.h);
    for (const stack of stacks) {
      const u = stack.left ? C - lu : C + 1;
      const v = stack.side === 'n' ? stack.at - lv + 1 : stack.at;
      const far = stack.side === 'n' ? v : v + lv - 1;
      // The side street must reach the building before it is built.
      spine(far);
      if (add(def, u, v, lu, lv)) {
        stack.at = stack.side === 'n' ? v - 1 : v + lv;
        // Take turns, so that all four corners of the crossing fill up evenly.
        stacks.push(...stacks.splice(stacks.indexOf(stack), 1));
        return true;
      }
    }
    return false;
  };

  // The bath house needs a well within reach, so it gets the spot nearest the crossing;
  // it is only built later, once it is available.
  // The school does not reach far either. Both are only built later, once available.
  const reservedAt = orders.length;
  large('bathhouse');
  large('school');
  const reserved = orders.splice(reservedAt);
  const bath = reserved.filter((o) => o.def !== 'school');
  const school = reserved.filter((o) => o.def === 'school');
  large('granary');
  add('nightwatch', C + 1, L + 1);
  add('tavern', C + 2, L + 1, 2, 1);
  large('townhall');
  if (half >= 9) add('firewatch', C - 9, L + 1);
  if (half >= 11) add('tavern', C - 11, L + 1, 2, 1);
  houses(1, 6, half);
  large('markethall');
  orders.push(...bath);
  large('weaver');
  large('brewery');
  for (const side of [-1, 1] as const) {
    for (const du of [-6, -2, 2, 6]) add('fountain', C + du, L + 3 * side);
  }
  orders.push(...school);
  for (const def of LATE) {
    if (def === 'cathedral' && !city.goals.some((g) => g.kind === 'building' && g.def === def))
      continue;
    large(def);
  }
  return orders;
}

export interface BotResult {
  city: string;
  plan: string;
  turns: number;
  /** Turn in which each star was earned, or null. */
  stars: [number | null, number | null, number | null];
  population: number;
  peakPopulation: number;
  /** Houses per level, counting merged houses once per plot. */
  levels: number[];
  gold: number;
  minGold: number;
  subsidies: number;
  fires: number;
  events: number;
  /** Orders that could never be carried out. */
  unbuilt: number;
  /** Turns in which the bot wanted to build but could afford nothing. */
  waiting: number;
  /** How often each hint came up, most frequent first. */
  hints: [HintKind, number][];
  /** What the town still lacked in the last turn. */
  lastHints: string[];
  /** Gold at the end of every tenth turn. */
  goldCurve: number[];
}

export function runBot(
  city: CityDef,
  spec: PlanSpec,
  rules: Rules,
  turns: number,
  seed = 1,
): BotResult {
  const plan = planTown(city, spec, rules);
  const done = new Array<boolean>(plan.length).fill(false);
  let state: GameState = newGame(city, seed, rules.balance);
  const stars: BotResult['stars'] = [null, null, null];
  const hints = new Map<HintKind, number>();
  const goldCurve: number[] = [];
  let minGold = state.gold;
  let fires = 0;
  let events = 0;
  let waiting = 0;
  let peak = 0;

  for (let turn = 0; turn < turns; turn++) {
    for (const b of Object.values(state.buildings)) {
      if (!b.damaged) continue;
      const fixed = repair(state, rules.buildings, rules.balance.repairShare, b.x, b.y);
      if (fixed.ok) state = fixed.state;
    }

    const outlook = forecast(state, rules, city.goals);
    let income = outlook.taxes + outlook.tradeIncome - outlook.upkeep - outlook.constructionCost;
    let built = 0;
    let wanted = false;
    for (let i = 0; i < plan.length; i++) {
      if (done[i]) continue;
      const order = plan[i]!;
      const def = rules.buildings[order.def]!;
      if (lockOf(state, def)) continue;
      wanted = true;
      // Keep a cushion, and do not take on upkeep the town cannot carry for a good while.
      const cushion = 40 + (income - def.upkeep < 0 ? (def.upkeep - income) * 12 : 0);
      if (state.gold - def.cost < cushion) {
        // Cannot carry more upkeep yet: look further down the list for houses and the like,
        // which cost nothing to keep and bring in taxes.
        if (def.upkeep > 0 && income - def.upkeep < 0) continue;
        break;
      }
      const result = placeBuilding(state, rules.buildings, def, order.x, order.y, order.rot);
      if (!result.ok) {
        if (result.reason === 'occupied' || result.reason === 'notBuildable') {
          // A house plot may have merged over this spot; nothing to do about it.
          done[i] = true;
          continue;
        }
        break;
      }
      state = result.state;
      income -= def.upkeep;
      done[i] = true;
      built++;
    }
    if (wanted && built === 0) waiting++;

    state = endTurn(state, rules, city.goals);
    const report = state.lastReport!;
    for (const i of report.newStars) stars[i] = state.turn;
    for (const h of report.hints) hints.set(h.kind, (hints.get(h.kind) ?? 0) + 1);
    if (report.fire) fires++;
    if (report.event) events++;
    minGold = Math.min(minGold, state.gold);
    peak = Math.max(peak, report.popAfter);
    if (state.turn % 10 === 0) goldCurve.push(state.gold);
  }

  const levels = rules.housing.map(() => 0);
  for (const b of Object.values(state.buildings)) {
    if (b.house) levels[b.house.level - 1]! += b.w * b.h;
  }
  const planned = plan.filter((o, i) => !done[i] || !buildingAt(state, o.x, o.y)).length;
  return {
    city: city.id,
    plan: spec.name,
    turns,
    stars,
    population: population(state),
    peakPopulation: peak,
    levels,
    gold: state.gold,
    minGold,
    subsidies: state.subsidies,
    fires,
    events,
    unbuilt: planned,
    waiting,
    hints: [...hints.entries()].sort((a, b) => b[1] - a[1]),
    lastHints: (state.lastReport?.hints ?? []).map((h) => `${h.kind} ${h.count}`),
    goldCurve,
  };
}

/** The layouts the balance is checked against: two quite different ones per city. */
export const PLANS: Record<string, PlanSpec[]> = {
  nienburg: [
    { name: 'Hauptstraße von Tor zu Tor', axis: 'ew', line: 12, cross: 17, half: 8 },
    { name: 'Hauptstraße quer zum Fluss', axis: 'ns', line: 16, cross: 12, half: 7 },
  ],
  carcassonne: [
    { name: 'Hauptstraße am Westtor', axis: 'ew', line: 27, cross: 14, half: 8 },
    { name: 'Hauptstraße im Norden', axis: 'ew', line: 13, cross: 14, half: 8 },
  ],
};
