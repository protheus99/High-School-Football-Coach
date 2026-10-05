import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateMacroMatch, teamStarterRating } from '../macroSim';

/**
 * AI vs. AI macro-sim calibration: same NFHS benchmark targets as the play-by-play engine.
 */
export function runMacroCalibration(iterations = 2000) {
  let yards = 0;
  let points = 0;
  let turnovers = 0;
  let underdogWins = 0;

  for (let i = 0; i < iterations; i++) {
    const [a, b] = generateDistrictTeams();
    const favorite = teamStarterRating(a) >= teamStarterRating(b) ? a : b;
    const box = i % 2 === 0 ? simulateMacroMatch(`m_${i}`, 5, a, b) : simulateMacroMatch(`m_${i}`, 5, b, a);
    const favoriteIsHome = box.homeTeamId === favorite.id;
    const underdogScore = favoriteIsHome ? box.awayScore : box.homeScore;
    const favoriteScore = favoriteIsHome ? box.homeScore : box.awayScore;

    yards += box.teamTotals.homeTotalYards + box.teamTotals.awayTotalYards;
    points += box.homeScore + box.awayScore;
    turnovers += box.teamTotals.homeTurnovers + box.teamTotals.awayTurnovers;
    if (underdogScore > favoriteScore) underdogWins += 1;
  }

  const results = {
    averageTotalYards: Math.round(yards / iterations),
    averagePointsPerGame: Math.round(points / iterations / 2),
    turnoverAverage: Number((turnovers / iterations).toFixed(2)),
    underdogWinRate: Number(((underdogWins / iterations) * 100).toFixed(1))
  };
  console.log('--- MACRO-SIM CALIBRATION REPORT ---', JSON.stringify(results));
  return results;
}

describe('AI vs. AI macro-sim calibration', () => {
  it('stays within the target statistical ranges', () => {
    const results = runMacroCalibration();
    expect(results.averageTotalYards).toBeGreaterThanOrEqual(550);
    expect(results.averageTotalYards).toBeLessThanOrEqual(700);
    expect(results.averagePointsPerGame).toBeGreaterThanOrEqual(21);
    expect(results.averagePointsPerGame).toBeLessThanOrEqual(35);
    expect(results.turnoverAverage).toBeGreaterThanOrEqual(3.0);
    expect(results.turnoverAverage).toBeLessThanOrEqual(4.5);
    // Talent waves (golden and thin classes) spread teams further apart: favorites win a bit more often
    expect(results.underdogWinRate).toBeGreaterThanOrEqual(13); // ~17% on average, 14-19% run to run
    expect(results.underdogWinRate).toBeLessThanOrEqual(28);
  });
});
