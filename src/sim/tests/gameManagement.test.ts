import { describe, it, expect } from 'vitest';
import { restingTeamId, simulateSnap } from '../matchEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState, Team } from '../../types/game';

function blowoutState(leader: Team, trailer: Team, quarter: 1 | 2 | 3 | 4, possession: Team): GameSimulationState {
  return {
    gameId: 'blowout',
    homeTeam: leader,
    awayTeam: trailer,
    homeScore: 42,
    awayScore: 7,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: quarter,
    clockSecondsRemaining: 600,
    possessionTeamId: possession.id,
    down: 1,
    distance: 10,
    yardLine: 40,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
}

const creditedPlayers = (state: GameSimulationState, team: Team) =>
  team.roster.filter((p) => state.playerGameStats?.[p.id]);

describe('Blowout game management', () => {
  it('sits the leading team’s starters in a second-half blowout', () => {
    const [leader, trailer] = generateDistrictTeams();
    for (let i = 0; i < 200; i++) {
      const state = blowoutState(leader, trailer, 3, leader);
      simulateSnap(state, 'INSIDE_RUN');
      creditedPlayers(state, leader).forEach((p) => expect(p.depthChartTier).not.toBe(1));
    }
  });

  it('sits the starters any time in the game, at the coach’s chosen lead', () => {
    const [leader, trailer] = generateDistrictTeams();
    for (let i = 0; i < 100; i++) {
      const state = { ...blowoutState(leader, trailer, 1, leader), homeScore: 28, awayScore: 0, secondStringLead: { [leader.id]: 28 } };
      simulateSnap(state, 'INSIDE_RUN');
      creditedPlayers(state, leader).forEach((p) => expect(p.depthChartTier).not.toBe(1));
    }
  });

  it('keeps starters in under the bench line, and always when the coach picks Never', () => {
    const [leader, trailer] = generateDistrictTeams();
    for (const setup of [
      { homeScore: 34, awayScore: 0 },
      { homeScore: 56, awayScore: 0, secondStringLead: { [leader.id]: null } },
      { homeScore: 40, awayScore: 0, secondStringLead: { [leader.id]: 42 }, isMercyRuleActive: true }
    ]) {
      let starterCredits = 0;
      for (let i = 0; i < 200; i++) {
        const state = { ...blowoutState(leader, trailer, 4, leader), ...setup };
        simulateSnap(state, 'INSIDE_RUN');
        starterCredits += creditedPlayers(state, leader).filter((p) => p.depthChartTier === 1).length;
      }
      expect(starterCredits).toBeGreaterThan(0);
    }
  });

  it('computer teams keep the rule: a 35-point lead, or the mercy-rule margin under the running clock', () => {
    const [leader, trailer] = generateDistrictTeams();
    const state = (homeScore: number, mercy: boolean, st: string) =>
      ({ ...blowoutState({ ...leader, state: st }, trailer, 3, leader), homeScore, awayScore: 0, isMercyRuleActive: mercy });
    expect(restingTeamId(state(35, false, 'Texas'))).toBe(leader.id);
    expect(restingTeamId(state(34, false, 'Texas'))).toBeNull();
    expect(restingTeamId(state(30, true, 'Georgia'))).toBe(leader.id); // GHSA: a 30-point running clock
    expect(restingTeamId(state(29, true, 'Georgia'))).toBeNull(); // the lead fell under it: starters back
    expect(restingTeamId({ ...state(30, true, 'Georgia'), secondStringLead: { [leader.id]: 35 } })).toBeNull(); // the coach's 35 holds
  });

  it('says when the backups go in and when the starters come back', () => {
    const [leader, trailer] = generateDistrictTeams();
    const state: GameSimulationState = { ...blowoutState(leader, trailer, 2, leader), homeScore: 28, awayScore: 0, secondStringLead: { [leader.id]: 28 } };
    // The lead is already 28: the next snap is played by the backups, so a score that drops it under 28 brings the starters back
    let sawIn = false;
    let sawBack = false;
    for (let i = 0; i < 4000 && !(sawIn && sawBack); i++) {
      const s: GameSimulationState = { ...state, homeScore: i % 2 ? 27 : 28, eventLog: [], possessionTeamId: i % 2 ? leader.id : trailer.id, yardLine: 95, down: 1, distance: 5 };
      const { event } = simulateSnap(s, i % 2 ? 'INSIDE_RUN' : 'SHORT_PASS');
      if (event.substitution?.in) {
        sawIn = true;
        expect(event.substitution).toEqual({ teamId: leader.id, in: true, lead: s.homeScore - s.awayScore });
      }
      if (event.substitution && !event.substitution.in) {
        sawBack = true;
        expect(event.substitution.lead).toBeLessThan(28);
      }
    }
    expect(sawIn && sawBack).toBe(true);
  });

  it('runs the clock with a big second-half lead', () => {
    const [leader, trailer] = generateDistrictTeams();
    let passes = 0;
    for (let i = 0; i < 1000; i++) {
      const concept = simulateSnap({ ...blowoutState(leader, trailer, 4, leader), homeScore: 28, awayScore: 0 }).event.playConcept;
      if (concept === 'SHORT_PASS' || concept === 'DEEP_PASS') passes++;
    }
    expect(passes / 1000).toBeLessThan(0.25);
  });
});
