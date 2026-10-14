import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { lineScore, recordLine, teamAbbreviation } from '../lineScore';
import { GameSimulationState, ScheduledGame } from '../../types/game';

function playGame(): GameSimulationState {
  const [home, away] = generateDistrictTeams();
  const state: GameSimulationState = {
    gameId: 'y2026_w9_h_a',
    homeTeam: home,
    awayTeam: away,
    homeScore: 0,
    awayScore: 0,
    weather: 'CLEAR',
    temperatureFahrenheit: 65,
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
  for (let snaps = 0; !state.isGameOver && snaps < 600; snaps++) simulateSnap(state);
  return state;
}

describe('Box score line score', () => {
  it('adds up, quarter by quarter, to the final score of a whole game', () => {
    for (let i = 0; i < 20; i++) {
      const game = playGame();
      expect(game.isGameOver).toBe(true);
      const line = lineScore(game);
      expect(line.periods.slice(0, 4)).toEqual(['1', '2', '3', '4']);
      expect(line.periods.length).toBe(game.overtime ? 5 : 4);
      expect(line.away.reduce((s, p) => s + p, 0)).toBe(game.awayScore);
      expect(line.home.reduce((s, p) => s + p, 0)).toBe(game.homeScore);
      [...line.away, ...line.home].forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
      // Every play records the score after it
      expect(game.eventLog.every((e) => e.homeScoreAfter !== undefined && e.snapQuarter !== undefined)).toBe(true);
    }
  });

  it('credits a score to the quarter the ball was snapped in', () => {
    const game = playGame();
    game.eventLog = [
      { ...game.eventLog[0], snapQuarter: 1, quarter: 2, homeScoreAfter: 3, awayScoreAfter: 0 }, // a field goal as the first quarter ends
      { ...game.eventLog[0], snapQuarter: 3, quarter: 3, homeScoreAfter: 3, awayScoreAfter: 7 }
    ];
    game.homeScore = 3;
    game.awayScore = 7;
    game.overtime = undefined;
    expect(lineScore(game)).toEqual({ periods: ['1', '2', '3', '4'], home: [3, 0, 0, 0], away: [0, 0, 7, 0] });
  });

  it('labels schools by their initials', () => {
    expect(teamAbbreviation('Catholic-Baton Rouge')).toBe('CBR');
    expect(teamAbbreviation('Scotlandville')).toBe('SCOT');
    expect(teamAbbreviation('St. Thomas Aquinas')).toBe('STA');
  });

  it('shows each team’s record after the game like the Hub: overall, then the district record', () => {
    const game = playGame();
    game.homeScore = 15;
    game.awayScore = 14;
    const { homeTeam: home, awayTeam: away } = game;
    Object.assign(home.record, { wins: 1, losses: 3, districtWins: 0, districtLosses: 1 });
    Object.assign(away.record, { wins: 4, losses: 0, districtWins: 0, districtLosses: 0 });
    const done = (gameId: string, h: string, a: string, hs: number, as: number): ScheduledGame => ({ gameId, week: 1, homeTeamId: h, awayTeamId: a, isDistrictGame: false, homeScore: hs, awayScore: as });
    const schedule: ScheduledGame[] = [
      done('g1', home.id, 'x', 28, 7),
      { gameId: game.gameId, week: 12, homeTeamId: home.id, awayTeamId: away.id, isDistrictGame: true }
    ];
    // This district game isn't on the books yet: it counts once, in both records
    expect(recordLine(home, 'home', game, schedule)).toBe('2-3 (1-1)');
    expect(recordLine(away, 'away', game, schedule)).toBe('4-1 (0-1)');
    // Once it's recorded, the team's own record already has it
    const recorded = schedule.map((g) => (g.gameId === game.gameId ? { ...g, homeScore: 15, awayScore: 14 } : g));
    Object.assign(home.record, { wins: 2, losses: 3, districtWins: 1, districtLosses: 1 });
    expect(recordLine(home, 'home', game, recorded)).toBe('2-3 (1-1)');
    // A non-district game moves only the overall record; playoff games move neither
    const nonDistrict = schedule.map((g) => (g.gameId === game.gameId ? { ...g, isDistrictGame: false } : g));
    Object.assign(home.record, { wins: 1, losses: 3, districtWins: 0, districtLosses: 1 });
    expect(recordLine(home, 'home', game, nonDistrict)).toBe('2-3 (0-1)');
    expect(recordLine(home, 'home', { ...game, gameId: 'po_m1' }, schedule)).toBe('1-3 (0-1)');
  });
});
