import { describe, it, expect } from 'vitest';
import { adjustedMargin, computeRatings, GameResult, preseasonWeight } from '../computerRankings';
import { buildStateWorld } from '../league';

describe('Computer rankings', () => {
  it('margins have diminishing returns past a clear win', () => {
    expect(adjustedMargin(7)).toBe(7);
    expect(adjustedMargin(14)).toBe(14);
    expect(adjustedMargin(28)).toBe(21);
    expect(adjustedMargin(56)).toBe(21); // no running up the score
    expect(adjustedMargin(-35)).toBe(-21);
  });

  it('the preseason rating fades out by the end of the regular season', () => {
    expect(preseasonWeight(8)).toBeGreaterThan(preseasonWeight(12));
    expect(preseasonWeight(18)).toBe(0);
    expect(preseasonWeight(23)).toBe(0);
  });

  it('strength of schedule: beating strong teams rates higher than the same margins against weak ones', () => {
    const teams = buildStateWorld('Alabama', undefined, true).teams.slice(0, 6);
    const [a, b, strong, weak, mid1, mid2] = teams.map((t) => t.id);
    const results: GameResult[] = [
      // strong beats everyone, weak loses to everyone
      { homeId: strong, awayId: mid1, homeScore: 35, awayScore: 14 },
      { homeId: strong, awayId: mid2, homeScore: 35, awayScore: 14 },
      { homeId: mid1, awayId: weak, homeScore: 35, awayScore: 14 },
      { homeId: mid2, awayId: weak, homeScore: 35, awayScore: 14 },
      // A and B both win by 14: A against the strong team, B against the weak one
      { homeId: a, awayId: strong, homeScore: 28, awayScore: 14 },
      { homeId: b, awayId: weak, homeScore: 28, awayScore: 14 }
    ];
    const ratings = computeRatings(teams, results, 20); // no preseason weight
    expect(ratings.get(a)!.rating).toBeGreaterThan(ratings.get(b)!.rating);
    expect(ratings.get(a)!.schedule).toBeGreaterThan(ratings.get(b)!.schedule);
    expect(ratings.get(a)!.qualityWins).toBe(1);
  });
});
