import { describe, it, expect } from 'vitest';
import { COACH_ROLES, COACH_WEEKLY_CP, coachGrade, coachLevel, effectSlots, eliteStaff, HiredCoach, staffBonuses, staffGameDayEdge, staffGrade } from '../coachingStaff';
import { contactGain } from '../feederEngine';
import { buildStateWorld } from '../league';
import { simulateMacroMatch } from '../macroSim';
import { simulateSnap } from '../matchEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState, Team } from '../../types/game';

describe('Coaching staff', () => {
  it('has the 17 roles, every effect valid', () => {
    expect(COACH_ROLES).toHaveLength(17);
    expect(COACH_ROLES.some((r) => r.role === 'SAFETIES')).toBe(true);
    COACH_ROLES.forEach((r) => r.effects.forEach((e) => expect(e.kind === 'GAME_DAY' ? (e.gameDayEdge ?? 0) > 0 : true).toBe(true)));
  });

  it('levels by grade (D 1 to S 5), effects by grade (a plus grade adds one), game day stops at level 2', () => {
    expect([55, 63, 73, 83, 93].map(coachLevel)).toEqual([1, 2, 3, 4, 5]);
    expect([55, 58, 63, 68, 73, 78, 83, 88, 93, 98].map(effectSlots)).toEqual([1, 2, 1, 2, 2, 3, 2, 3, 3, 4]);
    expect(staffGameDayEdge([])).toBe(0);
    const oc: HiredCoach = { role: 'OFFENSIVE_COORDINATOR', name: 'OC', rating: 99, effectIds: ['play_caller'] };
    const free: HiredCoach = { ...oc, rating: 68 }; // C+, level 2
    expect(staffGameDayEdge([free])).toBeCloseTo(0.4 * 0.16, 5);
    expect(staffGameDayEdge([oc])).toBeCloseTo(staffGameDayEdge([free]), 5); // an S+ adds no more game-day power per effect
    expect(staffGameDayEdge([{ ...oc, rating: 55 }])).toBeCloseTo(0.4 * 0.08, 5); // level 1: half
    expect(staffGameDayEdge(eliteStaff())).toBeLessThan(1);
  });

  it('the best staff helps but never guarantees a win against an equal team', () => {
    const [a, b] = buildStateWorld('Alabama', undefined, true).teams;
    a.lightRating = 70;
    b.lightRating = 70;
    // Truly equal teams: the same players and morale, so both draw the same flags (penalty habits differ by roster)
    b.roster = a.roster;
    b.programMeters = { ...a.programMeters };
    a.gameDayEdge = staffGameDayEdge(eliteStaff());
    let wins = 0;
    const games = 3000;
    for (let i = 0; i < games; i++) {
      const home = i % 2 === 0;
      const box = home ? simulateMacroMatch('g', 9, a, b) : simulateMacroMatch('g', 9, b, a);
      if (home ? box.homeScore > box.awayScore : box.awayScore > box.homeScore) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.52);
    expect(wins / games).toBeLessThan(0.7); // a game-day edge only: development is where paying shows
  });

  it('a full staff adds Coach Points every week and speeds development', () => {
    const bonus = staffBonuses(eliteStaff());
    expect(bonus.coachPointMultiplier).toBeCloseTo(1.3, 5);
    expect(bonus.weeklyCoachPoints).toBe(17 * COACH_WEEKLY_CP + 15); // and the Fundraiser
    expect(bonus.developmentByPosition.QB).toBeCloseTo(0.05, 5); // S: +0.01 a level in the off season
    expect(bonus.practiceByPosition.QB).toBeCloseTo(5 / 12, 5); // and a practice boost by level
    expect(bonus.injuryReduction).toBeCloseTo(0.2, 5);
    expect(bonus.feederInterestByPosition.QB).toBeGreaterThan(0.19); // the QB recruiter (and the JV offense recruiter)
    expect(bonus.programDiscount).toBeGreaterThan(0);
    expect(bonus.recovery).toBeCloseTo(2, 5);
  });

  it('live games feel the same edge as simulated ones (+2: about 71% against an equal team)', () => {
    const [base] = generateDistrictTeams();
    const clone = (id: string): Team => ({ ...JSON.parse(JSON.stringify(base)), id, name: id });
    let wins = 0;
    const games = 400;
    for (let i = 0; i < games; i++) {
      const a = clone('A');
      const b = clone('B');
      a.gameDayEdge = 2;
      const [home, away] = i % 2 === 0 ? [a, b] : [b, a];
      const state: GameSimulationState = { gameId: `g${i}`, homeTeam: home, awayTeam: away, homeScore: 0, awayScore: 0, weather: 'CLEAR', temperatureFahrenheit: 65, windSpeedMph: 5, teamMomentum: 0, currentQuarter: 1, clockSecondsRemaining: 720, possessionTeamId: home.id, down: 1, distance: 10, yardLine: 25, isMercyRuleActive: false, isGameOver: false, eventLog: [] };
      while (!state.isGameOver) simulateSnap(state);
      if ((home === a ? state.homeScore - state.awayScore : state.awayScore - state.homeScore) > 0) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.6);
    expect(wins / games).toBeLessThan(0.82);
  }, 120000);

  it('grades coaches S+ down to D by rating', () => {
    const cases: [number, string][] = [[100, 'S+'], [96, 'S+'], [95, 'S'], [91, 'S'], [90, 'A+'], [86, 'A+'], [85, 'A'], [81, 'A'], [80, 'B+'], [76, 'B+'], [75, 'B'], [71, 'B'], [70, 'C+'], [66, 'C+'], [65, 'C'], [61, 'C'], [60, 'D+'], [56, 'D+'], [55, 'D'], [40, 'D']];
    cases.forEach(([rating, grade]) => expect(coachGrade(rating)).toBe(grade));
    expect(staffGrade([])).toBeNull();
    expect(staffGrade(eliteStaff())).toBe('S+');
  });

  it('the Director of Football Operations and the JV head coach have real effects', () => {
    const dfo: HiredCoach = { role: 'FOOTBALL_OPERATIONS', name: 'D', rating: 99, effectIds: ['booster_liaison', 'compliance_officer'] };
    const jv: HiredCoach = { role: 'JV_HEAD_COACH', name: 'J', rating: 99, effectIds: ['feeder_pipeline'] };
    const bonus = staffBonuses([dfo, jv]);
    expect(bonus.boosterDrift).toBeCloseTo(1, 5);
    expect(bonus.complianceDrift).toBeCloseTo(1, 5);
    expect(bonus.feederInterest).toBeCloseTo(0.2, 5);
    const prospect = { scope: undefined, source: 'FEEDER_MIDDLE_SCHOOL', interestScore: 30 } as unknown as Parameters<typeof contactGain>[0];
    expect(contactGain(prospect, 'WINE_AND_DINE', bonus.feederInterest)).toBeGreaterThan(contactGain(prospect, 'WINE_AND_DINE'));
  });
});
