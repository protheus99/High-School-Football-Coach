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

  it('the roster rating fades to one game by the end of the regular season', () => {
    expect(preseasonWeight(8)).toBeGreaterThan(preseasonWeight(12));
    expect(preseasonWeight(18)).toBe(1);
    expect(preseasonWeight(23)).toBe(1);
  });

  it('strength of schedule: beating strong teams rates higher than the same margins against weak ones', () => {
    const teams = buildStateWorld('Alabama', undefined, true).teams.slice(0, 6);
    teams.forEach((t, i) => (teams[i] = { ...t, lightRating: 70, gameDayEdge: 0, fridayEdge: 0 })); // equal rosters: only results differ
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
    const ratings = computeRatings(teams, results, 20); // the roster rating counts one game
    expect(ratings.get(a)!.rating).toBeGreaterThan(ratings.get(b)!.rating);
    expect(ratings.get(a)!.schedule).toBeGreaterThan(ratings.get(b)!.schedule);
    expect(ratings.get(a)!.qualityWins).toBe(1);
  });

  it('a win never lowers a rating and a loss never raises it (a blowout over a weak team costs nothing)', () => {
    const teams = buildStateWorld('Alabama', undefined, true).teams.slice(0, 6);
    const [x, y, strong, weak, mid1, mid2] = teams.map((t) => t.id);
    const base: GameResult[] = [
      { homeId: strong, awayId: mid1, homeScore: 35, awayScore: 14 },
      { homeId: strong, awayId: mid2, homeScore: 35, awayScore: 14 },
      { homeId: mid1, awayId: weak, homeScore: 35, awayScore: 14 },
      { homeId: mid2, awayId: weak, homeScore: 35, awayScore: 14 },
      { homeId: x, awayId: strong, homeScore: 28, awayScore: 14 },
      { homeId: y, awayId: mid1, homeScore: 28, awayScore: 0 }
    ];
    const before = computeRatings(teams, base, 20);
    const after = computeRatings(teams, [...base, { homeId: x, awayId: weak, homeScore: 56, awayScore: 0 }, { homeId: y, awayId: strong, homeScore: 13, awayScore: 14 }], 20);
    expect(after.get(x)!.rating).toBeGreaterThanOrEqual(before.get(x)!.rating - 0.01);
    expect(after.get(y)!.rating).toBeLessThanOrEqual(before.get(y)!.rating + 0.01);
  });
});
