import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_TURNS,
  challengeOver,
  challengeScore,
  dailyCity,
  dailySeed,
  dayNumber,
  newChallenge,
} from '../src/core/daily';
import { endTurn } from '../src/core/sim/turn';
import { CITIES } from '../src/data/cities';
import { RULES } from '../src/data/rules';

describe('daily challenge', () => {
  it('picks the next city every day, the same for everyone', () => {
    const a = dailyCity(CITIES, '2026-11-26');
    const b = dailyCity(CITIES, '2026-11-27');
    expect(a.id).not.toBe(b.id);
    expect(dailyCity(CITIES, '2026-11-26').id).toBe(a.id);
    expect(dayNumber('1970-01-02')).toBe(1);
  });

  it('uses the same luck for every attempt of a day', () => {
    expect(dailySeed('2026-11-26')).toBe(dailySeed('2026-11-26'));
    expect(dailySeed('2026-11-26')).not.toBe(dailySeed('2026-11-27'));
    const base = dailyCity(CITIES, '2026-11-26');
    const x = newChallenge(base, '2026-11-26', RULES.balance);
    const y = newChallenge(base, '2026-11-26', RULES.balance);
    expect(x).toEqual(y);
    expect(x.cityId).toBe('daily');
    expect(x.challenge).toEqual({ date: '2026-11-26', turns: CHALLENGE_TURNS });
  });

  it('ends after its last turn', () => {
    const base = dailyCity(CITIES, '2026-11-26');
    let s = newChallenge(base, '2026-11-26', RULES.balance);
    for (let i = 0; i < CHALLENGE_TURNS; i++) {
      expect(challengeOver(s)).toBe(false);
      s = endTurn(s, RULES);
    }
    expect(challengeOver(s)).toBe(true);
    expect(endTurn(s, RULES)).toBe(s);
    expect(challengeScore(s)).toBe(0);
  });
});
