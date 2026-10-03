import { ScheduledGame, Team } from '../types/game';
import { simulateMacroMatch } from './macroSim';

// Season calendar: Pre Season (weeks 1-4, feeder signing day in week 2), Training Camp (5-7, depth chart set
// in week 7), non-district games (8-10), the district round robin (11-17), one week per playoff round (six
// for Texas 6A), the banquet week (post season) and four off-season weeks (feeder program events)
export const PRESEASON_WEEKS = 4;
export const FEEDER_SIGNING_WEEK = 2; // the last week prospects can be won over; they pick a school as it ends
export const FIRST_TRAINING_CAMP_WEEK = 5;
export const LAST_TRAINING_CAMP_WEEK = 7; // depth chart selection closes camp
export const FIRST_NON_DISTRICT_WEEK = 8;
export const FIRST_DISTRICT_WEEK = 11;
export const LAST_REGULAR_SEASON_WEEK = 17;
export const OFF_SEASON_WEEKS = 4;
const DISTRICT_POINT_DIFFERENTIAL_CAP = 17;

export type SeasonPhase = 'SPRING_EVALUATION' | 'SUMMER_CAMP' | 'NON_DISTRICT' | 'DISTRICT_PLAY' | 'STATE_PLAYOFFS' | 'POST_SEASON' | 'OFF_SEASON';

/** What each part of the calendar is called on screen. */
export const SEASON_PHASE_LABELS: Record<SeasonPhase, string> = {
  SPRING_EVALUATION: 'Pre Season',
  SUMMER_CAMP: 'Training Camp',
  NON_DISTRICT: 'Regular Season Non District',
  DISTRICT_PLAY: 'Regular Season District',
  STATE_PLAYOFFS: 'Playoffs',
  POST_SEASON: 'Post Season',
  OFF_SEASON: 'Off Season'
};

export function getSeasonPhase(week: number, playoffRounds = 6): SeasonPhase {
  if (week <= PRESEASON_WEEKS) return 'SPRING_EVALUATION';
  if (week <= LAST_TRAINING_CAMP_WEEK) return 'SUMMER_CAMP';
  if (week < FIRST_DISTRICT_WEEK) return 'NON_DISTRICT';
  if (week <= LAST_REGULAR_SEASON_WEEK) return 'DISTRICT_PLAY';
  if (week <= LAST_REGULAR_SEASON_WEEK + playoffRounds) return 'STATE_PLAYOFFS';
  if (week === LAST_REGULAR_SEASON_WEEK + playoffRounds + 1) return 'POST_SEASON'; // the banquet and signing day
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
 * Builds the regular season for a whole league (region -> district -> teams): three non-district weeks
 * against other districts in the same region (rotating district pairings), then each district's round robin.
 */
export function generateSeasonSchedule(regions: Team[][][], year: number): ScheduledGame[] {
  const games: ScheduledGame[] = [];
  const addGame = (week: number, homeTeamId: string, awayTeamId: string, isDistrictGame: boolean) =>
    games.push({ gameId: `y${year}_w${week}_${homeTeamId}_${awayTeamId}`, week, homeTeamId, awayTeamId, isDistrictGame });

  for (const region of regions) {
    const districts = region.map((teams) => shuffle(teams.map((t) => t.id)));

    // Non-district: week k pairs district i with district i XOR (k + 1) (1-2/3-4, then 1-3/2-4, then 1-4/2-3)
    for (let k = 0; k < FIRST_DISTRICT_WEEK - FIRST_NON_DISTRICT_WEEK; k++) {
      const week = FIRST_NON_DISTRICT_WEEK + k;
      districts.forEach((a, i) => {
        const partner = districts.length === 2 ? 1 - i : i ^ (k + 1);
        if (partner <= i || partner >= districts.length) return; // each pairing once; odd districts get a bye
        const b = districts[partner];
        for (let t = 0; t < Math.min(a.length, b.length); t++) {
          const opponent = b[(t + k) % b.length];
          if ((t + k) % 2 === 0) addGame(week, a[t], opponent, false);
          else addGame(week, opponent, a[t], false);
        }
      });
    }

    // Uneven district sizes leave teams idle: pair them with other idle teams from different districts
    // (after all district pairings are booked, so an idle pairing never repeats a later regular game)
    const districtOf = new Map(districts.flatMap((ids, d) => ids.map((id) => [id, d] as const)));
    for (let week = FIRST_NON_DISTRICT_WEEK; week < FIRST_DISTRICT_WEEK; week++) {
      const booked = new Set(games.filter((g) => g.week === week).flatMap((g) => [g.homeTeamId, g.awayTeamId]));
      const met = new Set(games.filter((g) => !g.isDistrictGame).map((g) => [g.homeTeamId, g.awayTeamId].sort().join('|')));
      const idle = shuffle(districts.flat().filter((id) => !booked.has(id)));
      while (idle.length > 1) {
        const team = idle.shift()!;
        const index = idle.findIndex((other) => districtOf.get(other) !== districtOf.get(team) && !met.has([team, other].sort().join('|')));
        if (index < 0) continue;
        const [opponent] = idle.splice(index, 1);
        addGame(week, team, opponent, false);
      }
    }

    // District round robins; large districts play a partial round robin that fits the district weeks
    const districtWeeks = LAST_REGULAR_SEASON_WEEK - FIRST_DISTRICT_WEEK + 1;
    for (const ids of districts) {
      roundRobinRounds(ids).slice(0, districtWeeks).forEach((pairs, r) =>
        pairs.forEach(([homeTeamId, awayTeamId]) => addGame(FIRST_DISTRICT_WEEK + r, homeTeamId, awayTeamId, true))
      );
    }
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

/** Plays out a whole league's regular season in the background (dev tools and tests). */
export function simulateRegularSeason(regions: Team[][][], year: number): ScheduledGame[] {
  const teams = regions.flat(2);
  const schedule = generateSeasonSchedule(regions, year);
  for (const game of schedule) {
    const home = teams.find((t) => t.id === game.homeTeamId)!;
    const away = teams.find((t) => t.id === game.awayTeamId)!;
    const box = simulateMacroMatch(game.gameId, game.week, home, away);
    game.homeScore = box.homeScore;
    game.awayScore = box.awayScore;
    applyGameResult(home, away, box.homeScore, box.awayScore, game.isDistrictGame);
  }
  return schedule;
}

/**
 * State association forfeit (design spec 12.2): the team's most recent district win becomes a
 * 1-0 forfeit loss, reversing both teams' records and the head-to-head entry. Returns the game, if any.
 */
export function forfeitMostRecentDistrictWin(schedule: ScheduledGame[], teams: Team[], teamId: string): ScheduledGame | undefined {
  const won = (g: ScheduledGame) =>
    g.homeScore !== undefined && g.awayScore !== undefined &&
    (g.homeTeamId === teamId ? g.homeScore > g.awayScore : g.awayScore > g.homeScore);
  const game = schedule
    .filter((g) => g.isDistrictGame && !g.forfeitedByTeamId && (g.homeTeamId === teamId || g.awayTeamId === teamId) && won(g))
    .sort((a, b) => b.week - a.week)[0];
  if (!game) return undefined;

  const team = teams.find((t) => t.id === teamId);
  const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
  const opponent = teams.find((t) => t.id === opponentId);
  if (!team || !opponent) return undefined;

  const teamScore = game.homeTeamId === teamId ? game.homeScore! : game.awayScore!;
  const opponentScore = game.homeTeamId === teamId ? game.awayScore! : game.homeScore!;
  const oldCapped = Math.max(-DISTRICT_POINT_DIFFERENTIAL_CAP, Math.min(DISTRICT_POINT_DIFFERENTIAL_CAP, teamScore - opponentScore));

  team.record.wins -= 1;
  team.record.losses += 1;
  team.record.districtWins -= 1;
  team.record.districtLosses += 1;
  team.record.districtPointDifferential += -1 - oldCapped;
  opponent.record.wins += 1;
  opponent.record.losses -= 1;
  opponent.record.districtWins += 1;
  opponent.record.districtLosses -= 1;
  opponent.record.districtPointDifferential += 1 + oldCapped;
  team.record.headToHeadHistory[opponentId] = { opponentTeamId: opponentId, won: false, pointsFor: 0, pointsAgainst: 1, pointDifferentialCapped: -1 };
  opponent.record.headToHeadHistory[teamId] = { opponentTeamId: teamId, won: true, pointsFor: 1, pointsAgainst: 0, pointDifferentialCapped: 1 };

  game.forfeitedByTeamId = teamId;
  return game;
}
