import { ScheduledGame, Team } from '../types/game';
import { simulateMacroMatch } from './macroSim';
import { bracketRoundForWeek, currentRound, findUserNode, PlayoffBracketState } from './playoffEngine';
import { LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { randomInt } from './math/variance';
import type { LightLeague } from './nationalWorld';
import { rulesForState } from './stateRules';

// ---------------------------------------------------------------------------
// Run-ahead: while the coach works through a week, every game that doesn't involve his team (the rest of his
// league and every other state) is simulated in the background. Advance Week then uses those results instead
// of simulating again, and the live match shows them as if they were being played at the same time: each
// result carries a scoring timeline, and the score shown is the one at the live game's clock. Nothing here
// depends on the coach's decisions, so playing ahead changes no outcome. Records are applied at Advance Week.
// ---------------------------------------------------------------------------

export type GameQuarter = 1 | 2 | 3 | 4 | 'OT';

export interface ScoringPlay {
  quarter: GameQuarter;
  clock: number; // seconds left in the quarter
  side: 'HOME' | 'AWAY';
  points: number;
}

export interface PrecomputedGame {
  key: string;
  state: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  timeline: ScoringPlay[];
  label?: string; // playoff round
}

export interface WeekResults {
  week: number;
  games: Record<string, PrecomputedGame>;
}

/** The key a game is stored under: its state and its schedule id (playoff games: playoffKey). */
export const gameKey = (state: string, id: string) => `${state}|${id}`;
/** A playoff game's id: its division and matchup (Texas's two divisions reuse first-round matchup ids). */
export const playoffKey = (divisionIndex: number, matchupId: string) => `po_${divisionIndex}_${matchupId}`;

/**
 * One way a final score could have been put together: touchdowns (7, or 6/8 with a missed kick or a two-point
 * try), field goals and the odd safety.
 */
export function scoringPlays(score: number): number[] {
  if (score <= 0) return [];
  for (let fieldGoals = 0; fieldGoals <= 6; fieldGoals++) {
    const rest = score - 3 * fieldGoals;
    if (rest < 0) break;
    if (rest % 7 === 0) return [...Array(rest / 7).fill(7), ...Array(fieldGoals).fill(3)];
    // one touchdown with a missed kick (6), a two-point try (8) or a safety (2)
    for (const odd of [6, 8, 2]) {
      if (rest >= odd && (rest - odd) % 7 === 0) return [...Array((rest - odd) / 7).fill(7), odd, ...Array(fieldGoals).fill(3)];
    }
  }
  return Array(Math.floor(score / 2)).fill(2).concat(score % 2 ? [1] : []); // never reached for football scores
}

const QUARTER_ORDER: Record<GameQuarter, number> = { 1: 1, 2: 2, 3: 3, 4: 4, OT: 5 };
/** Game time as one number: later in the game is bigger. */
const gameTime = (quarter: GameQuarter, clock: number) => QUARTER_ORDER[quarter] * 1000 - clock;

/** A believable order of scoring for a final score: scores spread across the four quarters. */
export function scoreTimeline(homeScore: number, awayScore: number, overtime = false): ScoringPlay[] {
  const plays: ScoringPlay[] = [
    ...scoringPlays(homeScore).map((points) => ({ side: 'HOME' as const, points })),
    ...scoringPlays(awayScore).map((points) => ({ side: 'AWAY' as const, points }))
  ].map((p) => ({ ...p, quarter: randomInt(1, 4) as GameQuarter, clock: randomInt(10, 710) }));
  // An overtime game: the winner's last score comes in overtime
  if (overtime && homeScore !== awayScore) {
    const winner = homeScore > awayScore ? 'HOME' : 'AWAY';
    const last = plays.filter((p) => p.side === winner).sort((a, b) => b.points - a.points)[0];
    if (last) Object.assign(last, { quarter: 'OT', clock: 0 });
  }
  return plays.sort((a, b) => gameTime(a.quarter, a.clock) - gameTime(b.quarter, b.clock));
}

/** The score of a run-ahead game at a moment of the live game (the final once the live game is over). */
export function scoreAt(game: PrecomputedGame, quarter: GameQuarter, clock: number, liveIsOver: boolean): { home: number; away: number; status: string } {
  if (liveIsOver) return { home: game.homeScore, away: game.awayScore, status: game.timeline.some((p) => p.quarter === 'OT') ? 'Final/OT' : 'Final' };
  const now = gameTime(quarter, clock);
  const played = game.timeline.filter((p) => gameTime(p.quarter, p.clock) <= now);
  const total = (side: 'HOME' | 'AWAY') => played.filter((p) => p.side === side).reduce((s, p) => s + p.points, 0);
  return { home: total('HOME'), away: total('AWAY'), status: quarter === 'OT' ? 'OT' : `Q${quarter}` };
}

function precomputed(key: string, state: string, home: Team, away: Team, week: number, label?: string): PrecomputedGame {
  const box = simulateMacroMatch(key, week, home, away);
  return {
    key,
    state,
    homeId: home.id,
    awayId: away.id,
    homeName: home.name,
    awayName: away.name,
    homeScore: box.homeScore,
    awayScore: box.awayScore,
    timeline: scoreTimeline(box.homeScore, box.awayScore, !!box.overtimePeriods),
    ...(label && { label })
  };
}

/** This week's playoff games in a bracket (all but the coach's own), simulated ahead. */
function bracketGames(bracket: PlayoffBracketState | null, state: string, week: number, skipTeamId?: string): PrecomputedGame[] {
  if (!bracket?.isPlayoffsActive || bracketRoundForWeek(bracket, week) < 0) return [];
  const label = rulesForState(state).playoffs.roundLabels[currentRound(bracket)];
  const mine = skipTeamId ? findUserNode(bracket, skipTeamId)?.node : undefined;
  return bracket.divisions.flatMap((d, divisionIndex) =>
    (d.rounds[bracket.currentRoundIndex] ?? [])
      .filter((n) => !n.isBye && !n.winnerTeamId && n !== mine)
      .map((n) => precomputed(gameKey(state, playoffKey(divisionIndex, n.matchupId)), state, n.team1, n.team2, week, label))
  );
}

/** This week's regular-season games in a schedule (all but the coach's own), simulated ahead. */
function scheduleGames(schedule: ScheduledGame[], teams: Team[], state: string, week: number, skipTeamId?: string): PrecomputedGame[] {
  if (week > LAST_REGULAR_SEASON_WEEK) return [];
  const byId = new Map(teams.map((t) => [t.id, t]));
  return schedule
    .filter((g) => g.week === week && g.homeScore === undefined && g.homeTeamId !== skipTeamId && g.awayTeamId !== skipTeamId)
    .flatMap((g) => {
      const home = byId.get(g.homeTeamId);
      const away = byId.get(g.awayTeamId);
      return home && away ? [precomputed(gameKey(state, g.gameId), state, home, away, week)] : [];
    });
}

/** Every game this week except the coach's: his league and every other state. */
export function runAheadWeek(game: {
  currentWeek: number;
  league: { state?: string } | null;
  seasonSchedule: ScheduledGame[];
  leagueTeams: Team[];
  userTeamId: string;
  playoffBracket: PlayoffBracketState | null;
  nationalLeagues: LightLeague[];
}): WeekResults {
  const week = game.currentWeek;
  const userState = game.league?.state ?? 'Texas';
  const results = [
    ...scheduleGames(game.seasonSchedule, game.leagueTeams, userState, week, game.userTeamId),
    ...bracketGames(game.playoffBracket, userState, week, game.userTeamId),
    ...game.nationalLeagues.flatMap((l) => [...scheduleGames(l.schedule, l.teams, l.state, week), ...bracketGames(l.bracket, l.state, week)])
  ];
  return { week, games: Object.fromEntries(results.map((r) => [r.key, r])) };
}

/** Writes this week's run-ahead playoff results into a bracket's current round (the round's other games are simulated as usual). */
export function applyRunAheadRound(bracket: PlayoffBracketState, state: string, results: WeekResults | null, week: number): void {
  if (!results || results.week !== week) return;
  bracket.divisions.forEach((d, divisionIndex) =>
    (d.rounds[bracket.currentRoundIndex] ?? []).forEach((n) => {
      const r = results.games[gameKey(state, playoffKey(divisionIndex, n.matchupId))];
      if (!r || n.winnerTeamId || r.homeId !== n.team1.id || r.awayId !== n.team2.id) return;
      n.team1Score = r.homeScore;
      n.team2Score = r.awayScore;
      n.winnerTeamId = r.homeScore > r.awayScore ? n.team1.id : n.team2.id;
    })
  );
}
