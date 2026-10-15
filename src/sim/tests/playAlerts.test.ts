import { describe, it, expect } from 'vitest';
import { simulateSnap } from '../matchEngine';
import { alertForPlay, alertsForPlay, PlayAlertKind } from '../playAlerts';
import { PlayEvent } from '../../types/game';
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
        if (alert.kind === 'FUMBLE' && !event.isTry && !/FUMBLES the kickoff return/i.test(event.textCommentary))
          expect(alert.team.id).toBe(event.turnoverType === 'MUFFED_PUNT' ? before.possession : other);
        if (alert.kind === 'PUNT') expect(alert.team.id).toBe(other); // the receiving team
        if (alert.kind === 'TOUCHDOWN') {
          // The team credited with the touchdown is the one whose score went up
          const homeScored = state.homeScore > before.home;
          expect(alert.team.id).toBe(homeScored ? state.homeTeam.id : state.awayTeam.id);
        }
      }
    }
    expect(seen.get('FIRST_DOWN') ?? 0).toBeGreaterThan(20);
    expect(seen.get('TOUCHDOWN') ?? 0).toBeGreaterThan(3);
    expect(seen.get('PUNT') ?? 0).toBeGreaterThan(5);
    expect((seen.get('INTERCEPTION') ?? 0) + (seen.get('FUMBLE') ?? 0)).toBeGreaterThan(0);
  });

  it('every play records the down and distance at the snap for the play-by-play', () => {
    const state = freshGame();
    for (let snap = 0; snap < 400 && !state.isGameOver; snap++) {
      const before = { down: state.down, distance: state.distance, yardLine: state.yardLine };
      const { event } = simulateSnap(state);
      expect(event.snapDown).toBe(before.down);
      expect(event.snapDistance).toBe(before.distance);
      expect(event.snapYardLine).toBe(before.yardLine);
    }
  });

  it('a muffed punt on the last play of the half, then a fumbled halftime kickoff: one banner for each recovery', () => {
    // Caught in a 3,000-game run: the punting team gets its muff back, then the other team recovers the kickoff
    const state = freshGame();
    state.homeTeam.name = 'Westlake';
    state.awayTeam.name = 'Lake Travis';
    const before = { possessionTeamId: state.awayTeam.id, homeScore: 3, awayScore: 10, down: 4, distance: 3 };
    Object.assign(state, { homeScore: 3, awayScore: 10, currentQuarter: 3, possessionTeamId: state.homeTeam.id });
    const event: PlayEvent = {
      playId: 'p1',
      quarter: 3,
      clockTimeRemainingSeconds: 720,
      down: 1,
      distance: 10,
      yardLine: 40,
      possessionTeamId: state.homeTeam.id,
      playConcept: 'PUNT',
      yardsGained: 0,
      isTurnover: true,
      turnoverType: 'MUFFED_PUNT',
      isScore: false,
      isLeverageMoment: false,
      textCommentary: 'P #Lewis punts 41 yds... MUFFED by #Edwards! Lake Travis recovers! HALFTIME. #Pruett FUMBLES the kickoff return! Westlake recovers!'
    };
    const alerts = alertsForPlay(event, before, state);
    expect(alerts.map((a) => `${a.kind} ${a.team.name}`)).toEqual(['FUMBLE Lake Travis', 'FUMBLE Westlake']);
    expect(new Set(alerts.map((a) => a.id)).size).toBe(2);

    // A fumble from scrimmage on the last play of the half keeps its banner when the kickoff is fumbled too
    const scrimmage = alertsForPlay(
      {
        ...event,
        playConcept: 'INSIDE_RUN',
        turnoverType: 'FUMBLE',
        textCommentary: 'FUMBLE! RB #Ruiz coughs up the football! Recovered by LB #Ochoa. HALFTIME. #Pruett FUMBLES the kickoff return! Lake Travis recovers!'
      },
      before,
      state
    );
    expect(scrimmage.map((a) => `${a.kind} ${a.team.name}`)).toEqual(['FUMBLE Westlake', 'FUMBLE Lake Travis']);
  });

  it('records a muffed punt as a recovery by the punting team', () => {
    let muffs = 0;
    for (let g = 0; g < 40 && muffs === 0; g++) {
      const state = freshGame();
      for (let snap = 0; snap < 400 && !state.isGameOver; snap++) {
        const before = { possessionTeamId: state.possessionTeamId, homeScore: state.homeScore, awayScore: state.awayScore, down: state.down, distance: state.distance };
        const { event } = simulateSnap(state);
        if (!/MUFFED/.test(event.textCommentary)) continue;
        muffs++;
        expect(event.turnoverType).toBe('MUFFED_PUNT');
        expect(alertsForPlay(event, before, state)[0]).toMatchObject({ kind: 'FUMBLE', team: { id: before.possessionTeamId } });
      }
    }
    expect(muffs).toBeGreaterThan(0);
  });
});
