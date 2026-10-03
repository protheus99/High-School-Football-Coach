import { ScheduledGame, Team } from '../types/game';
import { teamStarterRating } from './macroSim';
import type { PlayoffBracketState } from './playoffEngine';
import { FIRST_NON_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';

// ---------------------------------------------------------------------------
// Computer rankings, modeled on how MaxPreps describes its football rankings: every game in the country is one
// connected network (the out-of-state week links the states), each team's rating is the average of its
// opponents' ratings plus its scoring margin in each game, margins have diminishing returns past a clear win,
// playoff games count like any other, enrollment and reputation don't count at all, and a preseason rating
// (from the team's strength) fades out completely by the end of the regular season. The whole list is solved
// again from every result each week, so early wins gain value as opponents prove good.
// ---------------------------------------------------------------------------

export interface GameResult {
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
}

/** Full credit for a margin up to two scores, half credit up to four, nothing beyond (no running up the score). */
export function adjustedMargin(margin: number): number {
  const m = Math.abs(margin);
  return Math.sign(margin) * (Math.min(m, 14) + 0.5 * Math.min(Math.max(m - 14, 0), 14));
}

const POINTS_PER_RATING = 3.5; // adjusted margin a team rating point is worth (measured in the game engine)
const PRESEASON_GAMES = 3; // the preseason rating counts as this many games at the start of the season

/** How much the preseason rating still counts in a week: 3 games' worth at the opener, nothing after week 17. */
export function preseasonWeight(week: number): number {
  const span = LAST_REGULAR_SEASON_WEEK - FIRST_NON_DISTRICT_WEEK + 1;
  return PRESEASON_GAMES * Math.max(0, Math.min(1, (LAST_REGULAR_SEASON_WEEK - week + 1) / span));
}

/** Every played game this season, once each: league and light schedules, out-of-state games and every playoff game. */
export function collectResults(source: {
  seasonSchedule: ScheduledGame[];
  nationalLeagues: { schedule: ScheduledGame[]; bracket: PlayoffBracketState | null }[];
  interstateGames?: ScheduledGame[];
  playoffBracket: PlayoffBracketState | null;
}): GameResult[] {
  const seen = new Set<string>();
  const results: GameResult[] = [];
  [source.seasonSchedule, ...source.nationalLeagues.map((l) => l.schedule), source.interstateGames ?? []].flat().forEach((g) => {
    if (g.homeScore === undefined || g.awayScore === undefined || seen.has(g.gameId)) return;
    seen.add(g.gameId);
    results.push({ homeId: g.homeTeamId, awayId: g.awayTeamId, homeScore: g.homeScore, awayScore: g.awayScore });
  });
  [source.playoffBracket, ...source.nationalLeagues.map((l) => l.bracket)].forEach((bracket) =>
    bracket?.divisions.forEach((d) =>
      d.rounds.flat().forEach((n) => {
        if (n.isBye || n.team1Score === undefined || n.team2Score === undefined) return;
        results.push({ homeId: n.team1.id, awayId: n.team2.id, homeScore: n.team1Score, awayScore: n.team2Score });
      })
    )
  );
  return results;
}

export interface TeamRating {
  rating: number; // points better than an average team (adjusted margin)
  schedule: number; // average rating of the opponents faced
  wins: number;
  losses: number;
  qualityWins: number; // wins over teams rated in the top quarter
}

/**
 * Solves every team's rating: rating = (preseason x weight + sum over games of (opponent rating + adjusted
 * margin)) / (weight + games). Repeated until it settles; the average stays at the preseason average.
 */
export function computeRatings(teams: Team[], results: GameResult[], week: number): Map<string, TeamRating> {
  const strength = new Map(teams.map((t) => [t.id, teamStarterRating(t)]));
  const meanStrength = teams.reduce((s, t) => s + strength.get(t.id)!, 0) / Math.max(1, teams.length);
  const prior = new Map(teams.map((t) => [t.id, (strength.get(t.id)! - meanStrength) * POINTS_PER_RATING]));
  const weight = preseasonWeight(week);
  const games = new Map<string, { opp: string; margin: number; won: boolean }[]>(teams.map((t) => [t.id, []]));
  results.forEach((r) => {
    if (!games.has(r.homeId) || !games.has(r.awayId)) return;
    const margin = adjustedMargin(r.homeScore - r.awayScore);
    games.get(r.homeId)!.push({ opp: r.awayId, margin, won: r.homeScore > r.awayScore });
    games.get(r.awayId)!.push({ opp: r.homeId, margin: -margin, won: r.awayScore > r.homeScore });
  });

  let rating = new Map(prior);
  for (let iteration = 0; iteration < 200; iteration++) {
    const next = new Map<string, number>();
    teams.forEach((t) => {
      const played = games.get(t.id)!;
      const sum = played.reduce((s, g) => s + rating.get(g.opp)! + g.margin, 0);
      const denominator = weight + played.length;
      next.set(t.id, denominator > 0 ? (weight * prior.get(t.id)! + sum) / denominator : prior.get(t.id)!);
    });
    // Without a preseason weight the ratings are only defined up to a constant: keep the average at zero
    const mean = [...next.values()].reduce((s, v) => s + v, 0) / Math.max(1, next.size);
    let change = 0;
    next.forEach((v, id) => {
      const centered = 0.5 * (rating.get(id)! + (v - mean)); // damped, so alternating networks settle
      change = Math.max(change, Math.abs(centered - rating.get(id)!));
      next.set(id, centered);
    });
    rating = next;
    if (change < 0.001) break;
  }

  const sorted = [...rating.values()].sort((a, b) => a - b);
  const topQuarter = sorted[Math.floor(sorted.length * 0.75)] ?? Infinity;
  return new Map(
    teams.map((t) => {
      const played = games.get(t.id)!;
      return [
        t.id,
        {
          rating: rating.get(t.id)!,
          schedule: played.length ? played.reduce((s, g) => s + rating.get(g.opp)!, 0) / played.length : 0,
          wins: played.filter((g) => g.won).length,
          losses: played.filter((g) => !g.won).length,
          qualityWins: played.filter((g) => g.won && rating.get(g.opp)! >= topQuarter).length
        }
      ];
    })
  );
}
