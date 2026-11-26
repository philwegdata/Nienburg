import { newGame } from './city';
import type { Balance, CityDef, GameState, ScenarioDef } from './types';

/** The scenario as a city of its own: the base city's plan with the scenario's goals and rules. */
export function scenarioCity(def: ScenarioDef, base: CityDef): CityDef {
  return {
    ...base,
    id: `scenario-${def.id}`,
    name: def.name,
    blurb: def.blurb,
    goals: def.goals,
    modifiers: { ...base.modifiers, ...def.modifiers },
  };
}

export function newScenario(
  def: ScenarioDef,
  base: CityDef,
  seed: number,
  balance: Balance,
): GameState {
  return {
    ...newGame(scenarioCity(def, base), seed, balance),
    scenario: {
      id: def.id,
      banned: [...(def.banned ?? [])],
      ...(def.noLand ? { noLand: true } : {}),
    },
  };
}
