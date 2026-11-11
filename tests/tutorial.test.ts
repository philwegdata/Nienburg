import { describe, expect, it } from 'vitest';
import { placeBuilding, population } from '../src/core/actions';
import { newGame } from '../src/core/city';
import { analyze } from '../src/core/sim/analyze';
import { endTurn } from '../src/core/sim/turn';
import { TUTORIAL_STEPS, tutorialProgress } from '../src/core/tutorial';
import type { GameState } from '../src/core/types';
import { BUILDINGS, type BuildingId } from '../src/data/buildings';
import { nienburg } from '../src/data/cities/nienburg';
import { strings } from '../src/data/i18n';
import { RULES } from '../src/data/rules';

const stepAt = (from: number, state: GameState) =>
  tutorialProgress(from, state, analyze(state, RULES), RULES);
const idAt = (index: number) => TUTORIAL_STEPS[index]?.id;

/** A player who does exactly what each tutorial card says, with the real starting budget. */
class Pupil {
  state: GameState = newGame(nienburg, 99, RULES.balance);
  step = 0;

  private sync(): void {
    this.step = stepAt(this.step, this.state);
  }

  /** Builds as soon as the town can afford it, ending turns while it cannot. */
  build(id: BuildingId, x: number, y: number): void {
    for (let waited = 0; waited < 40; waited++) {
      const result = placeBuilding(this.state, BUILDINGS, BUILDINGS[id]!, x, y);
      if (result.ok) {
        this.state = result.state;
        this.sync();
        return;
      }
      expect(['noGold', 'noMaterials', 'noBuildPoints', 'locked']).toContain(result.reason);
      this.endTurn();
    }
    throw new Error(`could never build ${id}`);
  }

  row(id: BuildingId, x0: number, x1: number, y: number): void {
    for (let x = x0; x <= x1; x++) this.build(id, x, y);
  }

  endTurn(): void {
    this.state = endTurn(this.state, RULES, nienburg.goals);
    this.sync();
  }

  readOn(): void {
    expect(TUTORIAL_STEPS[this.step]?.done).toBeUndefined();
    this.step++;
    this.sync();
  }
}

describe('tutorial', () => {
  it('has a title and an explanation for every step in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      for (const step of TUTORIAL_STEPS) {
        const [title, body] = t.tutorial[step.id];
        expect(title?.length ?? 0).toBeGreaterThan(3);
        expect(body?.length ?? 0).toBeGreaterThan(40);
      }
      expect(Object.keys(t.tutorial).sort()).toEqual(TUTORIAL_STEPS.map((s) => s.id).sort());
    }
  });

  it('waits on the welcome card and then on each lesson in turn', () => {
    const fresh = newGame(nienburg, 1, RULES.balance);
    expect(idAt(stepAt(0, fresh))).toBe('welcome');
    expect(idAt(stepAt(1, fresh))).toBe('street');
  });

  it('leads a newcomer, card by card, to the first star', () => {
    const p = new Pupil();
    expect(idAt(p.step)).toBe('welcome');
    p.readOn();

    expect(idAt(p.step)).toBe('street');
    p.row('street', 7, 10, 12); // from the harbour gate at (6, 12)
    expect(idAt(p.step)).toBe('street');
    p.row('street', 11, 16, 12);

    expect(idAt(p.step)).toBe('houses');
    p.row('house', 8, 10, 11);
    expect(idAt(p.step)).toBe('houses');
    p.row('house', 11, 12, 11);

    expect(idAt(p.step)).toBe('endTurn');
    p.endTurn();

    expect(idAt(p.step)).toBe('water');
    p.build('well', 10, 13);

    expect(idAt(p.step)).toBe('market');
    p.build('stall', 14, 13);
    // A stall away from any plaza does not count.
    expect(idAt(p.step)).toBe('market');
    p.build('plaza', 13, 13);

    expect(idAt(p.step)).toBe('grow');
    for (let i = 0; i < 6 && idAt(p.step) === 'grow'; i++) p.endTurn();

    expect(idAt(p.step)).toBe('faith');
    p.row('tree', 8, 12, 10);
    p.build('chapel', 12, 13);
    expect(idAt(p.step)).toBe('faith');
    p.build('firewatch', 15, 13);

    expect(idAt(p.step)).toBe('goal');
    // "Keep building": more of the same along the street, as the last card suggests.
    p.row('street', 17, 27, 12);
    p.row('house', 13, 26, 11);
    p.row('tree', 13, 26, 10);
    p.build('well', 17, 13);
    p.build('well', 23, 13);
    p.build('plaza', 21, 13);
    p.build('stall', 22, 13);
    for (let i = 0; i < 30 && !p.state.stars[0]; i++) p.endTurn();

    expect(p.state.stars[0]).toBe(true);
    expect(population(p.state)).toBeGreaterThanOrEqual(150);
    expect(p.step).toBe(TUTORIAL_STEPS.length);
    expect(p.state.subsidies).toBe(0);
    // No rush: it takes a few years, not a lifetime.
    expect(p.state.turn).toBeLessThan(40);
  });

  it('skips lessons an existing town has already learnt', () => {
    const p = new Pupil();
    p.row('street', 7, 16, 12);
    p.row('house', 8, 12, 11);
    p.endTurn();
    // Starting over from the first card, only the welcome is left to read.
    expect(idAt(stepAt(0, p.state))).toBe('welcome');
    expect(idAt(stepAt(1, p.state))).toBe('water');
  });
});
