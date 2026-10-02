import { describe, it, expect } from 'vitest';
import { simulateSnap } from '../matchEngine';
import { alertForPlay, PlayAlertKind } from '../playAlerts';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState } from '../../types/game';

function freshGame(): GameSimulationState {
  const [home, away] = generateDistrictTeams();
  return {
    gameId: 'alert_test',
    homeTeam: home,
    awayTeam: away,
    homeScore: 0,
    awayScore: 0,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: 1,
    clockSecondsRemaining: 720,
    possessionTeamId: home.id,
    down: 1,
    distance: 10,
    yardLine: 25,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
}

describe('Game alerts', () => {
  it('flag first downs, touchdowns and turnovers for the right team across real games', () => {
    const seen = new Map<PlayAlertKind, number>();
    for (let g = 0; g < 6; g++) {
      const state = freshGame();
      for (let snap = 0; snap < 400 && !state.isGameOver; snap++) {
        const before = { possession: state.possessionTeamId, home: state.homeScore, away: state.awayScore, down: state.down, distance: state.distance };
        const { event } = simulateSnap(state);
        const alert = alertForPlay(
          event,
          { possessionTeamId: before.possession, homeScore: before.home, awayScore: before.away, down: before.down, distance: before.distance },
          state
        );
        // Every play the engine calls a first down gets the banner (unless it scored)
        if (/FIRST DOWN/i.test(event.textCommentary) && !event.isScore) expect(alert?.kind).toBe('FIRST_DOWN');
        if (!alert) continue;
        seen.set(alert.kind, (seen.get(alert.kind) ?? 0) + 1);
        const other = before.possession === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
        if (alert.kind === 'FIRST_DOWN') {
          expect(alert.team.id).toBe(before.possession);
          expect(state.down).toBe(1);
        }
        if (alert.kind === 'INTERCEPTION') expect(alert.team.id).toBe(other);
        if (alert.kind === 'FUMBLE') expect(alert.team.id).toBe(event.turnoverType === 'MUFFED_PUNT' ? before.possession : other);
        if (alert.kind === 'TOUCHDOWN') {
          // The team credited with the touchdown is the one whose score went up
          const homeScored = state.homeScore > before.home;
          expect(alert.team.id).toBe(homeScored ? state.homeTeam.id : state.awayTeam.id);
        }
      }
    }
    expect(seen.get('FIRST_DOWN') ?? 0).toBeGreaterThan(20);
    expect(seen.get('TOUCHDOWN') ?? 0).toBeGreaterThan(3);
    expect((seen.get('INTERCEPTION') ?? 0) + (seen.get('FUMBLE') ?? 0)).toBeGreaterThan(0);
  });
});
