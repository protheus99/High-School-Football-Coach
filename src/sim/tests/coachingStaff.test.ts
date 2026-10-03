import { describe, it, expect } from 'vitest';
import { COACH_ROLES, eliteStaff, HiredCoach, staffBonuses, staffGameDayEdge } from '../coachingStaff';
import { buildStateWorld } from '../league';
import { simulateMacroMatch } from '../macroSim';

describe('Coaching staff', () => {
  it('has the 17 roles, every effect valid', () => {
    expect(COACH_ROLES).toHaveLength(17);
    expect(COACH_ROLES.some((r) => r.role === 'SAFETIES')).toBe(true);
    COACH_ROLES.forEach((r) => r.effects.forEach((e) => expect(e.kind === 'GAME_DAY' ? (e.gameDayEdge ?? 0) > 0 : true).toBe(true)));
  });

  it('caps the game-day edge at +2.0, with diminishing returns past +1.0', () => {
    expect(staffGameDayEdge([])).toBe(0);
    expect(staffGameDayEdge(eliteStaff())).toBeGreaterThan(1.99);
    expect(staffGameDayEdge(eliteStaff())).toBeLessThanOrEqual(2);
    const oc: HiredCoach = { role: 'OFFENSIVE_COORDINATOR', name: 'OC', rating: 99, effectIds: ['play_caller'] };
    expect(staffGameDayEdge([oc])).toBeCloseTo(0.4, 5);
    expect(staffGameDayEdge([{ ...oc, rating: 50 }])).toBe(0); // rating 50 adds nothing
    expect(staffGameDayEdge([{ ...oc, rating: 74.5 }])).toBeCloseTo(0.2, 5); // half strength
  });

  it('the best staff helps but never guarantees a win against an equal team', () => {
    const [a, b] = buildStateWorld('Alabama', undefined, true).teams;
    a.lightRating = 70;
    b.lightRating = 70;
    a.gameDayEdge = staffGameDayEdge(eliteStaff());
    let wins = 0;
    const games = 3000;
    for (let i = 0; i < games; i++) {
      const home = i % 2 === 0;
      const box = home ? simulateMacroMatch('g', 9, a, b) : simulateMacroMatch('g', 9, b, a);
      if (home ? box.homeScore > box.awayScore : box.awayScore > box.homeScore) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.6);
    expect(wins / games).toBeLessThan(0.8); // about 73%: still loses about a quarter of the time
  });

  it('a full staff roughly doubles weekly Coach Points and speeds development', () => {
    const bonus = staffBonuses(eliteStaff());
    expect(bonus.coachPointMultiplier).toBeCloseTo(1.3, 5);
    expect(bonus.weeklyCoachPoints).toBe(17 * 5);
    expect(bonus.developmentByPosition.QB).toBeCloseTo(1, 5);
    expect(bonus.injuryReduction).toBeCloseTo(0.2, 5);
  });
});
