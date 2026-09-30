import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateSnap } from '../matchEngine';
import { GameSimulationState } from '../../types/game';

/**
 * Headless 1,000-Game Statistical Verification Test
 * Run using node/vitest to verify NFHS target calibration curves.
 */
export function runStatisticalCalibrationTest(iterations = 1000): {
  averageTotalYards: number;
  averagePointsPerGame: number;
  turnoverAverage: number;
  underdogWinRate: number;
} {
  const teams = generateDistrictTeams();
  const favorite = teams[0]; // High prestige team
  const underdog = teams[teams.length - 1]; // Lower prestige team

  let totalYardsAccum = 0;
  let totalPointsAccum = 0;
  let totalTurnoversAccum = 0;
  let underdogWins = 0;

  for (let i = 0; i < iterations; i++) {
    const gameState: GameSimulationState = {
      gameId: `test_gm_${i}`,
      homeTeam: favorite,
      awayTeam: underdog,
      homeScore: 0,
      awayScore: 0,
      weather: 'CLEAR',
      temperatureFahrenheit: 70,
      windSpeedMph: 5,
      teamMomentum: 0,
      currentQuarter: 1,
      clockSecondsRemaining: 720,
      possessionTeamId: favorite.id,
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

    const gameYards = gameState.eventLog.reduce((sum, e) => sum + (e.yardsGained > 0 ? e.yardsGained : 0), 0);
    const gameTurnovers = gameState.eventLog.filter((e) => e.isTurnover).length;

    totalYardsAccum += gameYards;
    totalPointsAccum += gameState.homeScore + gameState.awayScore;
    totalTurnoversAccum += gameTurnovers;

    if (gameState.awayScore > gameState.homeScore) {
      underdogWins += 1;
    }
  }

  const results = {
    averageTotalYards: Math.round(totalYardsAccum / iterations),
    averagePointsPerGame: Math.round((totalPointsAccum / iterations) / 2),
    turnoverAverage: Number((totalTurnoversAccum / iterations).toFixed(2)),
    underdogWinRate: Number(((underdogWins / iterations) * 100).toFixed(1))
  };

  console.log('--- NFHS SIMULATION CALIBRATION REPORT ---');
  console.log(`Total Games Simulated: ${iterations}`);
  console.log(`Avg Total Yards per Game: ${results.averageTotalYards} (Target: 550-700 combined)`);
  console.log(`Avg Team Points: ${results.averagePointsPerGame} (Target: 21-35 per team)`);
  console.log(`Avg Turnovers: ${results.turnoverAverage} (Target: 3.0-4.5 combined)`);
  console.log(`Underdog Upset Frequency: ${results.underdogWinRate}% (Target: 18-28%)`);

  return results;
}
