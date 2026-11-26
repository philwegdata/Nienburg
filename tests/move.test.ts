import { describe, expect, it } from 'vitest';
import { buildingAt, moveBuilding, moveCost } from '../src/core/actions';
import { newPuzzle } from '../src/core/puzzle';
import { BUILDINGS } from '../src/data/buildings';
import { PUZZLES } from '../src/data/puzzles';
import { RULES } from '../src/data/rules';
import { fillWith, put, richGame } from './helpers';

const MAP = ['##########', '#........#', '#........G', '#........#', '#........#', '##########'];
const share = RULES.balance.moveShare;

function town() {
  let s = fillWith(richGame(MAP), 'street', 1, 2, 8, 2);
  s = put(s, 'house', 1, 1);
  const b = buildingAt(s, 1, 1)!;
  s.buildings[b.id] = { ...b, house: { level: 3, pop: 9, lacking: 0, storeys: 1 } };
  return put(s, 'chapel', 4, 3);
}

describe('moving buildings', () => {
  it('keeps the building whole, with its id and its people', () => {
    const s = town();
    const before = buildingAt(s, 1, 1)!;
    const r = moveBuilding(s, BUILDINGS, share, before.id, 6, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(buildingAt(r.state, 1, 1)).toBeUndefined();
    expect(buildingAt(r.state, 6, 1)).toEqual({ ...before, x: 6, y: 1 });
    expect(r.state.gold).toBe(s.gold - moveCost(BUILDINGS.house!, share));
  });

  it('turns larger buildings and fits them where they go', () => {
    const s = town();
    const chapel = buildingAt(s, 4, 3)!;
    // Lying flat, the chapel fits in the bottom rows.
    const r = moveBuilding(s, BUILDINGS, share, chapel.id, 6, 4, 1);
    expect(r.ok && buildingAt(r.state, 7, 4)?.id).toBe(chapel.id);
    expect(r.ok && buildingAt(r.state, 4, 3)).toBeUndefined();
    // It may overlap its own old place.
    expect(moveBuilding(s, BUILDINGS, share, chapel.id, 4, 2 + 1).ok).toBe(true);
    // But not other buildings or the wall.
    expect(moveBuilding(s, BUILDINGS, share, chapel.id, 1, 1).ok).toBe(false);
    expect(moveBuilding(s, BUILDINGS, share, chapel.id, 9, 3).ok).toBe(false);
  });

  it('leaves paths and canals to be built anew', () => {
    const s = town();
    const street = buildingAt(s, 3, 2)!;
    expect(moveBuilding(s, BUILDINGS, share, street.id, 3, 4)).toEqual({
      ok: false,
      reason: 'notMovable',
    });
    expect(moveBuilding(s, BUILDINGS, share, 9999, 3, 4)).toEqual({ ok: false, reason: 'nothing' });
  });

  it('needs the gold, but is free in sandboxes and puzzles', () => {
    const s = { ...town(), gold: 0 };
    const id = buildingAt(s, 1, 1)!.id;
    expect(moveBuilding(s, BUILDINGS, share, id, 6, 1)).toEqual({ ok: false, reason: 'noGold' });
    expect(moveBuilding({ ...s, sandbox: true }, BUILDINGS, share, id, 6, 1).ok).toBe(true);
    let p = newPuzzle(PUZZLES[0]!, RULES.balance);
    p = put(p, 'well', 1, 1);
    const well = buildingAt(p, 1, 1)!;
    const r = moveBuilding({ ...p, gold: 0 }, BUILDINGS, share, well.id, 3, 1);
    expect(r.ok).toBe(true);
  });
});
