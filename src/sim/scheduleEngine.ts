import { ScheduledGame, Team } from '../types/game';
import { simulateMacroMatch } from './macroSim';

// 20-week calendar (design spec 4): weeks 1-4 spring/summer, 5-7 non-district,
// 8-14 district round robin, 15-18 state playoffs, 19-20 off-season
export const FIRST_NON_DISTRICT_WEEK = 5;
export const FIRST_DISTRICT_WEEK = 8;
export const LAST_REGULAR_SEASON_WEEK = 14;
const DISTRICT_POINT_DIFFERENTIAL_CAP = 17;

export type SeasonPhase = 'SPRING_EVALUATION' | 'SUMMER_CAMP' | 'NON_DISTRICT' | 'DISTRICT_PLAY' | 'STATE_PLAYOFFS' | 'OFF_SEASON';

export function getSeasonPhase(week: number): SeasonPhase {
  if (week <= 2) return 'SPRING_EVALUATION';
  if (week < FIRST_NON_DISTRICT_WEEK) return 'SUMMER_CAMP';
  if (week < FIRST_DISTRICT_WEEK) return 'NON_DISTRICT';
  if (week <= LAST_REGULAR_SEASON_WEEK) return 'DISTRICT_PLAY';
  if (week <= 18) return 'STATE_PLAYOFFS';
  return 'OFF_SEASON';
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Circle-method round robin: every team plays every other team once (n - 1 rounds for even n). */
export function roundRobinRounds(teamIds: string[]): [string, string][][] {
  const ids = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, 'BYE'];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < ids.length - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const a = ids[i];
      const b = ids[ids.length - 1 - i];
      if (a !== 'BYE' && b !== 'BYE') {
        // Fixed team alternates by round; other slots alternate by position (3-4 home games each for 8 teams)
        const firstIsHome = i === 0 ? r % 2 === 0 : i % 2 === 1;
        pairs.push(firstIsHome ? [a, b] : [b, a]);
      }
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()!); // rotate everyone except the first team
  }
  return rounds;
}

/**
 * Builds the regular season: three non-district weeks against the neighboring district,
 * then a full district round robin for both districts.
 */
export function generateSeasonSchedule(districtTeams: Team[], neighborTeams: Team[], year: number): ScheduledGame[] {
  const games: ScheduledGame[] = [];
  const district = shuffle(districtTeams.map((t) => t.id));
  const neighbor = shuffle(neighborTeams.map((t) => t.id));

  for (let k = 0; k < FIRST_DISTRICT_WEEK - FIRST_NON_DISTRICT_WEEK; k++) {
    const week = FIRST_NON_DISTRICT_WEEK + k;
    district.forEach((teamId, i) => {
      if (i >= neighbor.length) return; // larger custom districts: extra teams have a bye
      const opponentId = neighbor[(i + k) % neighbor.length];
      const isHome = (i + k) % 2 === 0;
      games.push({
        gameId: `y${year}_w${week}_${teamId}_${opponentId}`,
        week,
        homeTeamId: isHome ? teamId : opponentId,
        awayTeamId: isHome ? opponentId : teamId,
        isDistrictGame: false
      });
    });
  }

  for (const ids of [district, neighbor]) {
    roundRobinRounds(ids).forEach((pairs, r) => {
      const week = FIRST_DISTRICT_WEEK + r;
      pairs.forEach(([homeTeamId, awayTeamId]) =>
        games.push({ gameId: `y${year}_w${week}_${homeTeamId}_${awayTeamId}`, week, homeTeamId, awayTeamId, isDistrictGame: true })
      );
    });
  }

  return games;
}

export function getTeamGameForWeek(schedule: ScheduledGame[], week: number, teamId: string): ScheduledGame | undefined {
  return schedule.find((g) => g.week === week && (g.homeTeamId === teamId || g.awayTeamId === teamId));
}

/** Records a final score on both teams: overall record and, for district games, the standings fields. */
export function applyGameResult(home: Team, away: Team, homeScore: number, awayScore: number, isDistrictGame: boolean): void {
  const margin = homeScore - awayScore;
  const capped = Math.max(-DISTRICT_POINT_DIFFERENTIAL_CAP, Math.min(DISTRICT_POINT_DIFFERENTIAL_CAP, margin));

  const apply = (team: Team, opponent: Team, pointsFor: number, pointsAgainst: number, cappedMargin: number) => {
    const won = pointsFor > pointsAgainst;
    team.record.wins += won ? 1 : 0;
    team.record.losses += won ? 0 : 1;
    team.record.pointsFor += pointsFor;
    team.record.pointsAgainst += pointsAgainst;

    if (isDistrictGame) {
      team.record.districtWins += won ? 1 : 0;
      team.record.districtLosses += won ? 0 : 1;
      team.record.districtPointDifferential += cappedMargin;
      team.record.headToHeadHistory[opponent.id] = {
        opponentTeamId: opponent.id,
        won,
        pointsFor,
        pointsAgainst,
        pointDifferentialCapped: cappedMargin
      };
    }
  };

  apply(home, away, homeScore, awayScore, capped);
  apply(away, home, awayScore, homeScore, -capped);
}

/**
 * Plays out a full regular season between two districts in the background
 * (used for the playoff-only districts so their seeds come from real records).
 */
export function simulateRegularSeason(districtA: Team[], districtB: Team[], year: number): void {
  const teams = [...districtA, ...districtB];
  for (const game of generateSeasonSchedule(districtA, districtB, year)) {
    const home = teams.find((t) => t.id === game.homeTeamId)!;
    const away = teams.find((t) => t.id === game.awayTeamId)!;
    const box = simulateMacroMatch(game.gameId, game.week, home, away);
    applyGameResult(home, away, box.homeScore, box.awayScore, game.isDistrictGame);
  }
}
