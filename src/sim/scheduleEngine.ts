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
// Every state shares one calendar and plays its title game in the same week (week 23). Texas's six playoff
// rounds start in week 18; a five-round state starts a week later and has an open week 18.
export const MAX_PLAYOFF_ROUNDS = 6;
export const STATE_FINAL_WEEK = LAST_REGULAR_SEASON_WEEK + MAX_PLAYOFF_ROUNDS;
export const firstPlayoffWeek = (rounds: number) => STATE_FINAL_WEEK - rounds + 1;
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

export function getSeasonPhase(week: number): SeasonPhase {
  if (week <= PRESEASON_WEEKS) return 'SPRING_EVALUATION';
  if (week <= LAST_TRAINING_CAMP_WEEK) return 'SUMMER_CAMP';
  if (week < FIRST_DISTRICT_WEEK) return 'NON_DISTRICT';
  if (week <= LAST_REGULAR_SEASON_WEEK) return 'DISTRICT_PLAY';
  if (week <= STATE_FINAL_WEEK) return 'STATE_PLAYOFFS'; // including a five-round state's open week
  if (week === STATE_FINAL_WEEK + 1) return 'POST_SEASON'; // the banquet and signing day
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

    // Non-district: week k pairs district i with district i XOR (k + 1) (1-2/3-4, then 1-3/2-4, then 1-4/2-3).
    // Other district counts (5 conferences, say) leave these weeks open for the fill-in games below.
    const powerOfTwo = (districts.length & (districts.length - 1)) === 0;
    for (let k = 0; powerOfTwo && k < FIRST_DISTRICT_WEEK - FIRST_NON_DISTRICT_WEEK; k++) {
      const week = FIRST_NON_DISTRICT_WEEK + k;
      districts.forEach((a, i) => {
        const partner = districts.length === 2 ? 1 - i : i ^ (k + 1);
        if (partner <= i || partner >= districts.length) return; // each pairing once; odd districts get a bye
        const b = districts[partner];
        // Rotate each side by its district and the week, so the teams a size mismatch leaves idle (and the idle
        // teams of odd-sized districts in district weeks) aren't the same index pairs that already met here
        for (let t = 0; t < Math.min(a.length, b.length); t++) {
          const team = a[(t + i + k) % a.length];
          const opponent = b[(t + 2 * partner + k) % b.length];
          if ((t + k) % 2 === 0) addGame(week, team, opponent, false);
          else addGame(week, opponent, team, false);
        }
      });
    }

    // District round robins; large districts play a partial round robin that fits the district weeks. A small
    // district (fewer rounds than weeks) sits out some weeks: the first one sits out the last weeks, and later
    // ones sit out the weeks where the most other teams are idle, so the fill-in games below can pair them up.
    const districtWeeks = LAST_REGULAR_SEASON_WEEK - FIRST_DISTRICT_WEEK + 1;
    const idleCount = Array.from({ length: districtWeeks }, () => 0);
    const plans = districts.map((ids) => ({ ids, rounds: roundRobinRounds(ids).slice(0, districtWeeks) }));
    plans.forEach((p) => p.ids.length % 2 === 1 && idleCount.forEach((_, w) => idleCount[w]++)); // odd districts: one idle a week
    [...plans]
      .sort((a, b) => a.rounds.length - b.rounds.length)
      .forEach(({ ids, rounds }, order) => {
        const skips = districtWeeks - rounds.length;
        const weeks = Array.from({ length: districtWeeks }, (_, w) => w);
        const skipWeeks = new Set(
          order === 0 ? weeks.slice(districtWeeks - skips) : [...weeks].sort((a, b) => idleCount[b] - idleCount[a] || b - a).slice(0, skips)
        );
        skipWeeks.forEach((w) => (idleCount[w] += ids.length));
        const playWeeks = weeks.filter((w) => !skipWeeks.has(w));
        rounds.forEach((pairs, r) =>
          pairs.forEach(([homeTeamId, awayTeamId]) => addGame(FIRST_DISTRICT_WEEK + playWeeks[r], homeTeamId, awayTeamId, true))
        );
      });

    // Uneven or small districts leave teams idle (in non-district weeks, and in district weeks when a district
    // has fewer than 8 teams): pair idle teams that haven't met so everyone gets as close to ten games as possible,
    // preferring opponents from another district. This runs after every other game is booked, so a fill-in game
    // never repeats a regular one; a few random tries are made and the one that books the most games is kept.
    const districtOf = new Map(districts.flatMap((ids, d) => ids.map((id) => [id, d] as const)));
    const regionIds = new Set(districts.flat());
    const regionGames = games.filter((g) => regionIds.has(g.homeTeamId));
    let best: [number, string, string][] = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      const added: [number, string, string][] = [];
      const met = new Set(regionGames.map((g) => [g.homeTeamId, g.awayTeamId].sort().join('|')));
      // Tightest weeks first (fewest idle teams), so wide-open weeks don't use up the pairings they need
      const bookedIn = (week: number) => new Set(regionGames.filter((g) => g.week === week).flatMap((g) => [g.homeTeamId, g.awayTeamId]));
      const weeks = Array.from({ length: LAST_REGULAR_SEASON_WEEK - FIRST_NON_DISTRICT_WEEK + 1 }, (_, w) => FIRST_NON_DISTRICT_WEEK + w);
      for (const week of weeks.sort((a, b) => bookedIn(b).size - bookedIn(a).size)) {
        const booked = bookedIn(week);
        const idle = shuffle(districts.flat().filter((id) => !booked.has(id)));
        const options = (team: string) => idle.filter((other) => other !== team && !met.has([team, other].sort().join('|')));
        // Hardest to place first: the idle team with the fewest possible opponents, against its least-wanted option
        while (idle.length > 1) {
          const team = idle.reduce((a, b) => (options(b).length < options(a).length ? b : a));
          idle.splice(idle.indexOf(team), 1);
          const candidates = options(team);
          if (candidates.length === 0) continue;
          const otherDistrict = candidates.filter((other) => districtOf.get(other) !== districtOf.get(team));
          // A district-mate not yet met (a big district's partial round robin) only in a district week, as a district game
          const pool = otherDistrict.length > 0 || week < FIRST_DISTRICT_WEEK ? otherDistrict : candidates;
          if (pool.length === 0) continue;
          const opponent = pool.reduce((a, b) => (options(b).length < options(a).length ? b : a));
          idle.splice(idle.indexOf(opponent), 1);
          met.add([team, opponent].sort().join('|'));
          added.push([week, team, opponent]);
        }
      }
      if (added.length > best.length) best = added;
    }
    best.forEach(([week, team, opponent]) => addGame(week, team, opponent, districtOf.get(team) === districtOf.get(opponent)));
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
