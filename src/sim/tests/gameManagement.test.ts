import { describe, it, expect } from 'vitest';
import { simulateSnap } from '../matchEngine';
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

  it('keeps starters in during the first half', () => {
    const [leader, trailer] = generateDistrictTeams();
    let starterCredits = 0;
    for (let i = 0; i < 200; i++) {
      const state = blowoutState(leader, trailer, 2, leader);
      simulateSnap(state, 'INSIDE_RUN');
      starterCredits += creditedPlayers(state, leader).filter((p) => p.depthChartTier === 1).length;
    }
    expect(starterCredits).toBeGreaterThan(0);
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
