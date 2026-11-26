import type { ChronicleEntry, GameState, TurnReport } from './types';

/** The chronicle keeps this many entries; the oldest give way, except the founding. */
export const CHRONICLE_LIMIT = 300;

/** Population marks worth a line in the chronicle. */
export const POPULATION_MARKS: readonly number[] = [50, 100, 250, 500, 750, 1000, 1500, 2000];

/** Events of the turn report worth a line; quieter ones are left out. */
const NOTED_EVENTS = new Set(['fair', 'pilgrims', 'goodHarvest', 'jugglers']);

/** Adds entries to the chronicle, keeping it to its limit. */
export function write(state: GameState, entries: ChronicleEntry[]): GameState {
  if (entries.length === 0) return state;
  let chronicle = [...(state.chronicle ?? []), ...entries];
  if (chronicle.length > CHRONICLE_LIMIT) {
    const [first, ...rest] = chronicle;
    chronicle = [first!, ...rest.slice(rest.length - (CHRONICLE_LIMIT - 1))];
  }
  return { ...state, chronicle };
}

function highestLevel(state: GameState): number {
  let top = 0;
  for (const b of Object.values(state.buildings)) top = Math.max(top, b.house?.level ?? 0);
  return top;
}

/**
 * What a finished turn adds to the chronicle: comparing the town before and after, and reading
 * the turn's report. Entries carry the turn that has just ended.
 */
export function turnEntries(
  before: GameState,
  after: GameState,
  report: TurnReport,
  greatBuildings: (def: string) => boolean,
): ChronicleEntry[] {
  const turn = report.turn;
  const entries: ChronicleEntry[] = [];
  const known = before.chronicle ?? [];
  for (const def of report.completed) {
    if (greatBuildings(def)) entries.push({ turn, kind: 'completed', def });
  }
  const level = highestLevel(after);
  const seenLevel = Math.max(
    1,
    ...known.map((e) => (e.kind === 'level' ? e.n : 0)),
    highestLevel(before),
  );
  if (level > seenLevel) entries.push({ turn, kind: 'level', n: level });
  for (const mark of POPULATION_MARKS) {
    if (before.peakPop < mark && after.peakPop >= mark) {
      entries.push({ turn, kind: 'population', n: mark });
    }
  }
  if (report.festival) entries.push({ turn, kind: 'festival', festival: report.festival });
  if (report.wishGranted) entries.push({ turn, kind: 'wish', name: report.wishGranted.name });
  if (report.fire) entries.push({ turn, kind: 'fire', def: report.fire.def });
  if (report.event && NOTED_EVENTS.has(report.event.kind)) {
    entries.push({ turn, kind: 'event', event: report.event.kind });
  }
  for (const n of report.newStars) entries.push({ turn, kind: 'star', n });
  return entries;
}
