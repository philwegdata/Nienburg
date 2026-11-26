import { write } from './chronicle';
import { rngStep } from './rng';
import { GOODS, type GameState, type Rules, type TradeOrder } from './types';

/** Whether a trading house stands and is finished: orders go through the merchants. */
export function hasTradingHouse(state: GameState, rules: Rules): boolean {
  return Object.values(state.buildings).some(
    (b) => rules.buildings[b.def]?.trade && !b.construction,
  );
}

/**
 * Perhaps another town sends an order. Uses its own draw from the town's random state, so the
 * rest of the game plays out the same with or without orders.
 */
export function rollOrder(state: GameState, rules: Rules, basePrice: number): TradeOrder | null {
  const cfg = rules.balance.orders;
  if (state.turn <= cfg.quietTurns || !hasTradingHouse(state, rules)) return null;
  let seed = (state.rng ^ 0x27d4eb2d) | 0;
  const draw = (): number => {
    const r = rngStep(seed);
    seed = r.next;
    return r.value;
  };
  if (draw() >= cfg.chance) return null;
  const partners = cfg.partners.filter((id) => id !== state.cityId);
  if (partners.length === 0) return null;
  const from = partners[Math.floor(draw() * partners.length)]!;
  const good = GOODS[Math.floor(draw() * GOODS.length)]!;
  const year = Math.floor(state.turn / 4);
  const amount = Math.min(cfg.max, cfg.base + cfg.perYear * year);
  return {
    from,
    good,
    amount,
    delivered: 0,
    gold: Math.round(amount * Math.max(1, basePrice) * cfg.premium),
    luxury: Math.round(amount * cfg.luxuryShare),
  };
}

export type DeliverError = 'noOrder' | 'noTradingHouse' | 'noGoods';
export type DeliverResult =
  { ok: true; state: GameState; done: boolean } | { ok: false; reason: DeliverError };

/**
 * Sends what the town has of the ordered good, up to what is still owed. When the order is
 * complete the reward arrives at once.
 */
export function deliverOrder(state: GameState, rules: Rules): DeliverResult {
  const order = state.order;
  if (!order) return { ok: false, reason: 'noOrder' };
  if (!hasTradingHouse(state, rules)) return { ok: false, reason: 'noTradingHouse' };
  const sent = Math.min(state.goods[order.good], order.amount - order.delivered);
  if (sent <= 0) return { ok: false, reason: 'noGoods' };
  const goods = { ...state.goods, [order.good]: state.goods[order.good] - sent };
  const delivered = order.delivered + sent;
  if (delivered < order.amount) {
    return { ok: true, done: false, state: { ...state, goods, order: { ...order, delivered } } };
  }
  const told = write(state, [{ turn: state.turn, kind: 'order', from: order.from }]);
  return {
    ok: true,
    done: true,
    state: {
      ...told,
      goods,
      order: null,
      ordersDone: (state.ordersDone ?? 0) + 1,
      gold: state.gold + order.gold,
      luxury: (state.luxury ?? 0) + order.luxury,
    },
  };
}
