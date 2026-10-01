import { describe, it, expect } from 'vitest';
import { evaluateLeverageTrigger } from '../matchEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState } from '../../types/game';

describe('Leverage moment prompts', () => {
  const [userTeam, aiTeam] = generateDistrictTeams();

  const fourthAndShort = (possessionTeamId: string): GameSimulationState => ({
    gameId: 'lev_test',
    homeTeam: userTeam,
    awayTeam: aiTeam,
    homeScore: 14,
    awayScore: 10,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: 2,
    clockSecondsRemaining: 300,
    possessionTeamId,
    down: 4,
    distance: 2,
    yardLine: 60,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  });

  it('prompts the user on their own 4th down', () => {
    expect(evaluateLeverageTrigger(fourthAndShort(userTeam.id), userTeam.id)).toBe('FOURTH_DOWN');
  });

  it('does not prompt the user when the AI team has the ball', () => {
    expect(evaluateLeverageTrigger(fourthAndShort(aiTeam.id), userTeam.id)).toBeNull();
  });

  it('does not offer the point-after decision for an AI touchdown', () => {
    const state = { ...fourthAndShort(aiTeam.id), down: 1 as const, distance: 3, yardLine: 97 };
    state.eventLog = [{
      playId: 'td', quarter: 2, clockTimeRemainingSeconds: 290, down: 1, distance: 3, yardLine: 97,
      possessionTeamId: aiTeam.id, playConcept: 'SHORT_PASS', yardsGained: 12, isTurnover: false,
      isScore: true, scoreType: 'TOUCHDOWN', textCommentary: 'TOUCHDOWN!', isLeverageMoment: false
    }];
    expect(evaluateLeverageTrigger(state, userTeam.id)).toBeNull();
    expect(evaluateLeverageTrigger({ ...state, possessionTeamId: userTeam.id }, userTeam.id)).toBe('PAT_DECISION');
  });
});
