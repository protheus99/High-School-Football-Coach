import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { simulateMacroMatch } from '../macroSim';
import { enforcedYards, simulateTeamPenalties } from '../penalties';
import { GameSimulationState, Team } from '../../types/game';

function playGame(home: Team, away: Team): GameSimulationState {
  const g: GameSimulationState = {
    gameId: 'pen',
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
    possessionTeamId: away.id,
    down: 1,
    distance: 10,
    yardLine: 25,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
  while (!g.isGameOver) simulateSnap(g);
  return g;
}

describe('Penalties', () => {
  it('flags about 5-7 times per team per game in live games, around 50 yards', () => {
    let flags = 0;
    let yards = 0;
    const games = 150;
    for (let i = 0; i < games; i++) {
      const teams = generateDistrictTeams();
      const g = playGame(teams[0], teams[1]);
      const pens = g.eventLog.filter((e) => e.penalty);
      flags += pens.length;
      yards += pens.reduce((s, e) => s + e.penalty!.yards, 0);
      pens.forEach((e) => {
        expect(e.textCommentary.startsWith('FLAG!')).toBe(true);
        expect(e.yardsGained).toBe(0);
        expect([g.homeTeam.id, g.awayTeam.id]).toContain(e.penalty!.teamId);
      });
    }
    expect(flags / games / 2).toBeGreaterThan(5);
    expect(flags / games / 2).toBeLessThan(7.5);
    expect(yards / games / 2).toBeGreaterThan(38);
    expect(yards / games / 2).toBeLessThan(65);
  }, 60000);

  it('flags undisciplined teams more often', () => {
    const team = generateDistrictTeams()[0];
    const set = (discipline: number, iq: number, morale: number) => {
      team.roster.forEach((p) => {
        p.attributes.discipline = discipline;
        p.attributes.footballIQ = iq;
      });
      team.programMeters.lockerRoomDiscipline = morale;
      let n = 0;
      for (let i = 0; i < 400; i++) n += simulateTeamPenalties(team, false).count;
      return n / 400;
    };
    const sloppy = set(50, 50, 60);
    const sharp = set(90, 90, 90);
    expect(sloppy).toBeGreaterThan(sharp * 2);
  });

  it('walks off half the distance near the goal line and never scores on a penalty', () => {
    expect(enforcedYards(15, 60)).toBe(15);
    expect(enforcedYards(15, 8)).toBe(4);
    expect(enforcedYards(5, 1)).toBe(0);
  });

  it('records flags on simulated games', () => {
    const teams = generateDistrictTeams();
    const box = simulateMacroMatch('g', 1, teams[0], teams[1]);
    expect(box.teamTotals.homePenalties).toBeGreaterThanOrEqual(0);
    expect(box.teamTotals.awayPenaltyYards).toBeGreaterThanOrEqual(0);
  });
});
