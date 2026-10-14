import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { GameSimulationState, HalftimeTalk, Team } from '../../types/game';

/** Second halves between equal teams: team A's points for and against, flags, 20+ yard plays and turnovers per game. */
function secondHalves(talk: HalftimeTalk | undefined, games: number, pool: Team[]) {
  const totals = { pf: 0, pa: 0, flags: 0, big: 0 };
  for (let i = 0; i < games; i++) {
    const base = pool[i % pool.length];
    const clone = (id: string): Team => ({ ...JSON.parse(JSON.stringify(base)), id, name: id });
    const [a, b] = [clone('A'), clone('B')];
    const [home, away] = i % 2 === 0 ? [a, b] : [b, a];
    const s: GameSimulationState = { gameId: `g${i}`, homeTeam: home, awayTeam: away, homeScore: 0, awayScore: 0, weather: 'CLEAR', temperatureFahrenheit: 65, windSpeedMph: 5, teamMomentum: 0, currentQuarter: 1, clockSecondsRemaining: 720, possessionTeamId: home.id, down: 1, distance: 10, yardLine: 25, isMercyRuleActive: false, isGameOver: false, eventLog: [] };
    while (!s.isGameOver && s.currentQuarter !== 3) simulateSnap(s);
    const scoreA = () => (home === a ? s.homeScore : s.awayScore);
    const scoreB = () => (home === a ? s.awayScore : s.homeScore);
    const [halfA, halfB, log] = [scoreA(), scoreB(), s.eventLog.length];
    if (talk) s.halftimeTalks = { A: talk };
    while (!s.isGameOver) simulateSnap(s);
    totals.pf += scoreA() - halfA;
    totals.pa += scoreB() - halfB;
    s.eventLog.slice(log).forEach((e) => {
      if (e.penalty?.teamId === 'A') totals.flags++;
      if ((e.snapTeamId ?? e.possessionTeamId) === 'A' && e.yardsGained >= 20) totals.big++;
    });
  }
  return { pf: totals.pf / games, pa: totals.pa / games, flags: totals.flags / games, big: totals.big / games };
}

describe('Halftime talks', () => {
  // Statistical: each talk moves what it promises by about 3 to 5 points (src/sim/halftime.ts has the measured
  // values); the ranges are wide so chance alone doesn't fail it, but rerun before treating a miss as a regression
  it('each talk helps and costs what it says, by a few points over a second half', () => {
    const pool = Array.from({ length: 12 }, () => generateDistrictTeams()[0]);
    const games = 900;
    const none = secondHalves(undefined, games, pool);
    const fire = secondHalves('FIRE_UP', games, pool);
    const offense = secondHalves('OFFENSE', games, pool);
    const defense = secondHalves('DEFENSE', games, pool);
    const big = secondHalves('BIG_PLAY', games, pool);
    const margin = (r: typeof none) => r.pf - r.pa - (none.pf - none.pa);

    // Fire them up: ahead on the scoreboard, with clearly more flags
    expect(margin(fire)).toBeGreaterThan(1);
    expect(margin(fire)).toBeLessThan(5.5);
    expect(fire.flags).toBeGreaterThan(none.flags * 1.5);
    // Offense and Defense mirror each other: points for and against move together, about 3 to 5 each way
    expect(offense.pf - none.pf).toBeGreaterThan(2.5);
    expect(offense.pa - none.pa).toBeGreaterThan(2.5);
    expect(none.pf - defense.pf).toBeGreaterThan(2);
    expect(none.pa - defense.pa).toBeGreaterThan(2);
    [offense, defense].forEach((r) => expect(Math.abs(margin(r))).toBeLessThan(2));
    // Big play: about twice the big plays, more points both ways, close to even
    expect(big.big).toBeGreaterThan(none.big * 1.7);
    expect(big.pf - none.pf).toBeGreaterThan(1.5);
    expect(Math.abs(margin(big))).toBeLessThan(3);
  }, 300000);
});
