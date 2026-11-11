import { rngStep } from '../rng';
import type { ActiveEvent, EventKind, EventNews, GameState, Rules } from '../types';
import type { Analysis } from './analyze';

export interface EventOutcome {
  news: EventNews | null;
  /** Takes effect during the next turn. */
  active: ActiveEvent | null;
  gold: number;
  food: number;
  rng: number;
}

/**
 * Decides whether something happens as a turn ends. `next` is the town after everything else
 * of the turn has been settled; `analysis` describes it before the turn was played.
 * At most one event per turn, and none in a town's first years.
 */
export function rollEvent(next: GameState, analysis: Analysis, rules: Rules): EventOutcome {
  const cfg = rules.balance.events;
  const nothing: EventOutcome = { news: null, active: null, gold: 0, food: 0, rng: next.rng };
  // `next.turn` is already the turn that is about to begin.
  if (next.turn <= cfg.quietTurns) return nothing;

  const all = Object.values(next.buildings).sort((a, b) => a.id - b.id);
  const running = (id: number) => !analysis.idle.has(id);
  const pop = all.reduce((sum, b) => sum + (b.house?.pop ?? 0), 0);
  const plaza = all.find((b) => b.def === rules.balance.plazaPath);
  const shrines = all.filter(
    (b) => rules.buildings[b.def]?.category === 'faith' && !b.construction && running(b.id),
  );
  const wells = all.filter((b) => b.def === 'well' && !b.damaged);
  const endedSeason = (next.turn - 1) % 4;
  const comingSeason = next.turn % 4;

  const possible: EventKind[] = [];
  if (plaza && pop >= 20) possible.push('fair');
  if (shrines.length > 0) possible.push('pilgrims');
  if (endedSeason === 2) possible.push('goodHarvest');
  if (pop >= 30) possible.push('jugglers');
  if (comingSeason === 3) possible.push('harshWinter');
  // Only where a second well can take over.
  if (comingSeason === 1 && wells.length >= 2) possible.push('dryWell');

  const roll = rngStep(next.rng);
  if (possible.length === 0 || roll.value >= cfg.chance) return { ...nothing, rng: roll.next };
  const choice = rngStep(roll.next);
  let rng = choice.next;
  const kind = possible[Math.floor(choice.value * possible.length)]!;
  const outcome: EventOutcome = { news: { kind }, active: null, gold: 0, food: 0, rng };

  if (kind === 'fair') {
    outcome.gold = cfg.fairBase + Math.floor(pop * cfg.fairPerHead);
    outcome.news = { kind, gold: outcome.gold, at: { x: plaza!.x, y: plaza!.y } };
  } else if (kind === 'pilgrims') {
    outcome.gold = shrines.length * cfg.pilgrimGold;
    const first = shrines[0]!;
    outcome.news = { kind, gold: outcome.gold, at: { x: first.x, y: first.y } };
  } else if (kind === 'goodHarvest') {
    outcome.food = cfg.harvestFood;
    outcome.news = { kind, food: outcome.food };
  } else if (kind === 'dryWell') {
    const pick = rngStep(rng);
    rng = pick.next;
    const well = wells[Math.floor(pick.value * wells.length)]!;
    outcome.active = { kind, building: well.id };
    outcome.news = { kind, at: { x: well.x, y: well.y } };
    outcome.rng = rng;
  } else {
    outcome.active = { kind };
  }
  return outcome;
}
