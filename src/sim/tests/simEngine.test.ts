import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { teamStarterRating } from '../macroSim';
import { GameSimulationState } from '../../types/game';

const SCRIMMAGE_CONCEPTS = ['INSIDE_RUN', 'OUTSIDE_RUN', 'SHORT_PASS', 'DEEP_PASS'];

/**
 * Headless 1,000-Game Statistical Verification Test
 * Run using node/vitest to verify NFHS target calibration curves.
 * Each game uses a freshly generated district and a random pairing; the
 * favorite is the team with the stronger first string.
 */
export function runStatisticalCalibrationTest(iterations = 1000): {
  averageTotalYards: number;
  averagePointsPerGame: number;
  turnoverAverage: number;
  underdogWinRate: number;
  playsPerTeam: number;
  completionRate: number;
  tieRate: number;
} {
  let totalYardsAccum = 0;
  let totalPointsAccum = 0;
  let totalTurnoversAccum = 0;
  let scrimmagePlaysAccum = 0;
  let passAttempts = 0;
  let passCompletions = 0;
  let underdogWins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    const teams = generateDistrictTeams();
    const [a, b] = [teams[i % teams.length], teams[(i + 1 + (i % 3)) % teams.length]];
    const favorite = teamStarterRating(a) >= teamStarterRating(b) ? a : b;
    const underdog = favorite === a ? b : a;
    const homeIsFavorite = i % 2 === 0;
    const homeTeam = homeIsFavorite ? favorite : underdog;
    const awayTeam = homeIsFavorite ? underdog : favorite;

    const gameState: GameSimulationState = {
      gameId: `test_gm_${i}`,
      homeTeam,
      awayTeam,
      homeScore: 0,
      awayScore: 0,
      weather: 'CLEAR',
      temperatureFahrenheit: 70,
      windSpeedMph: 5,
      teamMomentum: 0,
      currentQuarter: 1,
      clockSecondsRemaining: 720,
      possessionTeamId: awayTeam.id,
      down: 1,
      distance: 10,
      yardLine: 25,
      isMercyRuleActive: false,
      isGameOver: false,
      eventLog: []
    };

    while (!gameState.isGameOver) {
      simulateSnap(gameState);
    }

    const scrimmage = gameState.eventLog.filter((e) => SCRIMMAGE_CONCEPTS.includes(e.playConcept));
    const passes = scrimmage.filter((e) => e.playConcept === 'SHORT_PASS' || e.playConcept === 'DEEP_PASS');

    totalYardsAccum += scrimmage.reduce((sum, e) => sum + e.yardsGained, 0);
    totalPointsAccum += gameState.homeScore + gameState.awayScore;
    totalTurnoversAccum += gameState.eventLog.filter(
      (e) => e.turnoverType === 'INTERCEPTION' || e.turnoverType === 'FUMBLE'
    ).length;
    scrimmagePlaysAccum += scrimmage.length;
    passAttempts += passes.filter((e) => !e.textCommentary.startsWith('SACKED')).length;
    passCompletions += passes.filter((e) => e.textCommentary.includes(' complete to ')).length;

    const underdogScore = underdog === homeTeam ? gameState.homeScore : gameState.awayScore;
    const favoriteScore = underdog === homeTeam ? gameState.awayScore : gameState.homeScore;
    if (underdogScore > favoriteScore) underdogWins += 1;
    if (underdogScore === favoriteScore) ties += 1;
  }

  const results = {
    averageTotalYards: Math.round(totalYardsAccum / iterations),
    averagePointsPerGame: Math.round((totalPointsAccum / iterations) / 2),
    turnoverAverage: Number((totalTurnoversAccum / iterations).toFixed(2)),
    underdogWinRate: Number(((underdogWins / iterations) * 100).toFixed(1)),
    playsPerTeam: Math.round(scrimmagePlaysAccum / iterations / 2),
    completionRate: Number(((passCompletions / (passAttempts || 1)) * 100).toFixed(1)),
    tieRate: Number(((ties / iterations) * 100).toFixed(1))
  };

  console.log('--- NFHS SIMULATION CALIBRATION REPORT ---');
  console.log(`Total Games Simulated: ${iterations}`);
  console.log(`Avg Total Yards per Game: ${results.averageTotalYards} (Target: 550-700 combined)`);
  console.log(`Avg Team Points: ${results.averagePointsPerGame} (Target: 21-35 per team)`);
  console.log(`Avg Turnovers: ${results.turnoverAverage} (Target: 3.0-4.5 combined)`);
  console.log(`Underdog Upset Frequency: ${results.underdogWinRate}% (Target: 18-28%)`);
  console.log(`Scrimmage Plays per Team: ${results.playsPerTeam} (Target: 52-62)`);
  console.log(`Completion Rate: ${results.completionRate}% (Target: 50-55%)`);
  console.log(`Final Score Tied: ${results.tieRate}% (Target: 0 with overtime)`);

  return results;
}

describe('NFHS simulation calibration', () => {
  it('stays within the target statistical ranges', () => {
    const results = runStatisticalCalibrationTest(1000);
    expect(results.averageTotalYards).toBeGreaterThanOrEqual(550);
    expect(results.averageTotalYards).toBeLessThanOrEqual(700);
    expect(results.averagePointsPerGame).toBeGreaterThanOrEqual(21);
    expect(results.averagePointsPerGame).toBeLessThanOrEqual(35);
    expect(results.turnoverAverage).toBeGreaterThanOrEqual(3.0);
    expect(results.turnoverAverage).toBeLessThanOrEqual(4.5);
    expect(results.underdogWinRate).toBeGreaterThanOrEqual(18);
    expect(results.underdogWinRate).toBeLessThanOrEqual(28);
    expect(results.playsPerTeam).toBeGreaterThanOrEqual(52);
    expect(results.playsPerTeam).toBeLessThanOrEqual(62);
    expect(results.completionRate).toBeGreaterThanOrEqual(50);
    expect(results.completionRate).toBeLessThanOrEqual(55);
    expect(results.tieRate).toBe(0); // regulation ties are decided in overtime
  }, 120000);
});
