import { GameSimulationState, ScheduledGame, StateAndNationalPolls, Team, WeatherType } from '../types/game';
import { isRivalryGame } from '../data/rivalries';
import { HiredCoach } from './coachingStaff';
import { currentRound, PlayoffBracketState, PlayoffRound } from './playoffEngine';
import { FIRST_NON_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { fullRecord } from './seasonRecord';
import { ATTACK_FAMILIES, Talk, TalkPhase, TalkSituation, TALKS } from './talks';
import { getUserMatchup } from './userMatchup';

// ---------------------------------------------------------------------------
// Which speeches the coach is offered: the game is read (the season before kickoff, the first half at halftime),
// every speech scores how well it fits, and the best fits from different families are shown, the best one first.
// ---------------------------------------------------------------------------

/** The last regular-season week of the season's first half: Homecoming is the last home game up to it. */
export const MIDSEASON_WEEK = FIRST_NON_DISTRICT_WEEK + Math.floor((LAST_REGULAR_SEASON_WEEK - FIRST_NON_DISTRICT_WEEK + 1) / 2) - 1;
const RANKED = 10; // a state rank this high counts as ranked
const RECENT_PENALTY = 0.6; // a speech shown last game fits a little worse, so the same ones don't keep coming back
const JITTER = 0.25; // breaks near-ties, tied to the game so a reopened screen shows the same speeches

/** What the picker needs from the season (the game store has all of it). */
export interface SeasonView {
  userTeamId: string;
  currentYear: number;
  currentWeek: number;
  seasonSchedule: ScheduledGame[];
  interstateGames?: ScheduledGame[];
  leagueTeams: Team[];
  playoffBracket: PlayoffBracketState | null;
  polls: StateAndNationalPolls | null;
  coachingStaff: HiredCoach[];
  nationalLeagues?: { teams: Team[] }[];
}

/** The speeches a screen remembers between games: last game's offer and each speech's last line. */
export interface RecentTalks {
  PRE: string[];
  HALF: string[];
  lines: Record<string, number>;
}

export const NO_RECENT_TALKS: RecentTalks = { PRE: [], HALF: [], lines: {} };

/** A speech on offer and the line it's said with. */
export interface TalkOption {
  talk: Talk;
  line: number;
  score: number;
}

/** Homecoming (the last home game before midseason) and Senior Night (the last home game of the regular season). */
export function specialNights(games: ScheduledGame[], userTeamId: string, gameId: string): { homecoming: boolean; seniorNight: boolean } {
  const home = games
    .filter((g) => g.homeTeamId === userTeamId && g.week >= FIRST_NON_DISTRICT_WEEK && g.week <= LAST_REGULAR_SEASON_WEEK)
    .sort((a, b) => a.week - b.week);
  const senior = home[home.length - 1]?.gameId;
  const beforeMidseason = home.filter((g) => g.week <= MIDSEASON_WEEK);
  const homecoming = beforeMidseason[beforeMidseason.length - 1]?.gameId;
  return { homecoming: homecoming === gameId && homecoming !== senior, seniorNight: senior === gameId };
}

/** "⚔️ Rivalry game · 🎓 Senior Night": a regular-season game's special nights, or null on a regular Friday. */
export function specialNightLabel(n: { rivalry: boolean; seniorNight: boolean; homecoming: boolean }): string | null {
  const parts = [n.rivalry && '⚔️ Rivalry game', n.seniorNight && '🎓 Senior Night', n.homecoming && '👑 Homecoming'].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** What makes this game bigger than a regular Friday, and the banner the Strategy Room shows for it. */
export interface GameStakes {
  gameId: string;
  home: boolean;
  opponent: Team;
  playoffRound: PlayoffRound | null;
  homecoming: boolean;
  seniorNight: boolean;
  rivalry: boolean;
  banner: string | null; // "🏆 Texas Regional Final", "⚔️ Rivalry game · 🎓 Senior Night"
}

/** This week's game as the speeches see it; undefined when there is no game to play. */
export function gameStakes(season: SeasonView): GameStakes | undefined {
  const matchup = getUserMatchup(season);
  if (!matchup) return undefined;
  const home = matchup.home.id === season.userTeamId;
  const us = home ? matchup.home : matchup.away;
  const opponent = home ? matchup.away : matchup.home;
  const games = [...season.seasonSchedule, ...(season.interstateGames ?? [])];
  const nights = matchup.isPlayoff ? { homecoming: false, seniorNight: false } : specialNights(games, season.userTeamId, matchup.gameId);
  const rivalry = isRivalryGame(us, opponent);
  const playoffRound = matchup.isPlayoff && season.playoffBracket ? currentRound(season.playoffBracket) : null;
  const banner = matchup.isPlayoff ? `🏆 ${us.state ?? 'Texas'} ${matchup.label}` : specialNightLabel({ ...nights, rivalry });
  return { gameId: matchup.gameId, home, opponent, playoffRound, ...nights, rivalry, banner };
}

const rankOf = (polls: StateAndNationalPolls | null, id: string): number | null => {
  const rank = polls?.teamRanks?.[id]?.state;
  return rank !== undefined && rank <= RANKED ? rank : null;
};

/** How much the coach's team is favored, -1 to 1: by ranks when one side is ranked, else by records. */
function favoredBy(season: SeasonView, us: Team, them: Team, ourRank: number | null, theirRank: number | null): number {
  if (ourRank !== null && theirRank !== null) return Math.max(-0.5, Math.min(0.5, (theirRank - ourRank) / 10));
  if (ourRank !== null) return 0.3;
  if (theirRank !== null) return -0.3;
  const share = (t: Team) => {
    const r = fullRecord(t, season.playoffBracket);
    return r.wins + r.losses >= 2 ? r.wins / (r.wins + r.losses) : null;
  };
  const [a, b] = [share(us), share(them)];
  return a === null || b === null ? 0 : a - b;
}

/** The coach's regular-season results so far, oldest first: true for a win. */
function results(season: SeasonView): { won: boolean; margin: number }[] {
  return [...season.seasonSchedule, ...(season.interstateGames ?? [])]
    .filter((g) => (g.homeTeamId === season.userTeamId || g.awayTeamId === season.userTeamId) && g.homeScore !== undefined && g.awayScore !== undefined)
    .sort((a, b) => a.week - b.week)
    .map((g) => {
      const margin = (g.homeTeamId === season.userTeamId ? 1 : -1) * (g.homeScore! - g.awayScore!);
      return { won: margin > 0, margin };
    });
}

const streak = (rs: { won: boolean }[], won: boolean) => {
  let n = 0;
  for (let i = rs.length - 1; i >= 0 && rs[i].won === won; i--) n++;
  return n;
};

/** The situation before kickoff (the halftime reading fills in the first half on top of it). */
export function pregameSituation(season: SeasonView, stakes: GameStakes, weather: WeatherType = 'CLEAR'): TalkSituation {
  const find = (id: string) => season.leagueTeams.find((t) => t.id === id);
  const us = find(season.userTeamId);
  const them = find(stakes.opponent.id) ?? stakes.opponent;
  const ourRank = rankOf(season.polls, season.userTeamId);
  const theirRank = rankOf(season.polls, them.id);
  const rs = results(season);
  const last = rs[rs.length - 1];
  return {
    phase: 'PRE',
    home: stakes.home,
    margin: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    runFor: 0,
    runAgainst: 0,
    turnovers: 0,
    takeaways: 0,
    flags: 0,
    carries: 0,
    yardsPerCarry: 0,
    redZoneStalls: 0,
    theirRedZoneStalls: 0,
    shortYardageFails: 0,
    bigKickPlay: false,
    weather,
    playoffRound: stakes.playoffRound,
    ourRank,
    theirRank,
    favored: us ? favoredBy(season, us, them, ourRank, theirRank) : 0,
    homecoming: stakes.homecoming,
    seniorNight: stakes.seniorNight,
    rivalry: stakes.rivalry,
    lowMorale: (us?.programMeters.lockerRoomDiscipline ?? 100) < 60,
    seasonOpener: !stakes.playoffRound && rs.length === 0,
    lostLastWeek: !!last && !last.won && !stakes.playoffRound,
    bigWinLastWeek: !!last && last.margin >= 28,
    winStreak: streak(rs, true),
    lossStreak: stakes.playoffRound ? 0 : streak(rs, false),
    starterOut: !!us?.roster.some((p) => p.depthChartTier === 1 && p.condition.injuryStatus !== 'HEALTHY'),
    theyAreChampions: !!them.lastSeason?.stateChampion && them.lastSeason.year === season.currentYear - 1
  };
}

const RUNS = new Set(['INSIDE_RUN', 'OUTSIDE_RUN']);
const SCRIMMAGE = new Set(['INSIDE_RUN', 'OUTSIDE_RUN', 'SHORT_PASS', 'DEEP_PASS']);

/** The first half as the halftime speeches see it, on top of the pre-game situation. */
export function halftimeSituation(base: TalkSituation, state: GameSimulationState, teamId: string): TalkSituation {
  const home = state.homeTeam.id === teamId;
  const ours = (home ? state.homeScore : state.awayScore) ?? 0;
  const theirs = (home ? state.awayScore : state.homeScore) ?? 0;
  const log = state.eventLog;

  // Unanswered points to end the half: walk back through the scoring plays
  let runFor = 0;
  let runAgainst = 0;
  let prev = { home: 0, away: 0 };
  const scores: { team: 'US' | 'THEM'; points: number }[] = [];
  for (const e of log) {
    const now = { home: e.homeScoreAfter ?? prev.home, away: e.awayScoreAfter ?? prev.away };
    const dh = now.home - prev.home;
    const da = now.away - prev.away;
    if (dh > 0) scores.push({ team: home ? 'US' : 'THEM', points: dh });
    if (da > 0) scores.push({ team: home ? 'THEM' : 'US', points: da });
    prev = now;
  }
  const lastTeam = scores[scores.length - 1]?.team;
  for (let i = scores.length - 1; i >= 0 && scores[i].team === lastTeam; i--) {
    if (lastTeam === 'US') runFor += scores[i].points;
    else runAgainst += scores[i].points;
  }

  // Giveaways: interceptions and fumbles by the snapping team, a muffed punt by the receiving team, a fumbled
  // kickoff by whoever didn't end up with the ball
  let turnovers = 0;
  let takeaways = 0;
  let flags = 0;
  let carries = 0;
  let rushYards = 0;
  let shortYardageFails = 0;
  let bigKickPlay = false;
  for (const e of log) {
    const snapper = e.snapTeamId ?? e.possessionTeamId;
    let loser: string | undefined;
    if (e.turnoverType === 'INTERCEPTION' || e.turnoverType === 'FUMBLE') loser = snapper;
    else if (e.turnoverType === 'MUFFED_PUNT') loser = snapper === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
    else if (e.turnoverType === 'KICKOFF_FUMBLE') loser = e.possessionTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
    if (loser === teamId) turnovers++;
    else if (loser) takeaways++;
    if (e.turnoverType === 'MUFFED_PUNT' || e.turnoverType === 'KICKOFF_FUMBLE' || e.textCommentary.includes('BLOCKED')) bigKickPlay = true;
    if (e.penalty?.teamId === teamId) flags++;
    if (snapper !== teamId || e.isTry || e.penalty) continue;
    if (RUNS.has(e.playConcept)) {
      carries++;
      rushYards += e.yardsGained;
    }
    if (SCRIMMAGE.has(e.playConcept) && (e.snapDown ?? 0) >= 3 && (e.snapDistance ?? 99) <= 3 && e.yardsGained < (e.snapDistance ?? 0) && !e.isScore) shortYardageFails++;
  }

  // Red-zone trips without a touchdown: each team's drives (a run of its snaps) that reached the other team's 20
  const stalls = { [state.homeTeam.id]: 0, [state.awayTeam.id]: 0 };
  let drive: { team: string; reached: boolean; scored: boolean } | null = null;
  const close = () => {
    if (drive?.reached && !drive.scored) stalls[drive.team]++;
  };
  for (const e of log) {
    const snapper = e.snapTeamId ?? e.possessionTeamId;
    if (e.isTry) continue;
    if (!drive || drive.team !== snapper) {
      close();
      drive = { team: snapper, reached: false, scored: false };
    }
    if ((e.snapYardLine ?? 0) >= 80) drive.reached = true;
    if (e.scoreType === 'TOUCHDOWN' && e.possessionTeamId === snapper) drive.scored = true;
  }
  close();
  const opponentId = home ? state.awayTeam.id : state.homeTeam.id;

  return {
    ...base,
    phase: 'HALF',
    weather: state.weather,
    margin: ours - theirs,
    pointsFor: ours,
    pointsAgainst: theirs,
    runFor,
    runAgainst,
    turnovers,
    takeaways,
    flags,
    carries,
    yardsPerCarry: carries ? rushYards / carries : 0,
    redZoneStalls: stalls[teamId] ?? 0,
    theirRedZoneStalls: stalls[opponentId] ?? 0,
    shortYardageFails,
    bigKickPlay
  };
}

/** A number in [0, 1) from a string, the same every time. */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** How many speeches a screen shows: 3 before kickoff, 4 at halftime, 5 with a Halftime Adjuster on staff. */
export function talkCount(phase: TalkPhase, staff: HiredCoach[]): number {
  if (phase === 'PRE') return 3;
  return staff.some((c) => c.effectIds.includes('oc_halftime') || c.effectIds.includes('dc_halftime')) ? 5 : 4;
}

/**
 * The speeches on offer: the best fit first, then the next best of a different family, keeping at least one that
 * pushes (offense, momentum, big plays, kicks) and one that holds (defense, ball control, discipline). Speeches
 * offered last game fit a little worse, and the exact same offer never comes twice in a row.
 */
export function pickTalks(s: TalkSituation, opts: { seed: string; count: number; recent?: RecentTalks }): TalkOption[] {
  const recent = opts.recent ?? NO_RECENT_TALKS;
  const lastOffer = recent[s.phase];
  const ranked = TALKS.filter((t) => t.phase === s.phase)
    .map((talk) => {
      const fit = talk.fit(s);
      const score = fit <= 0 ? 0 : Math.max(0.05, fit - (lastOffer.includes(talk.id) ? RECENT_PENALTY : 0)) + hash01(opts.seed + talk.id) * JITTER;
      return { talk, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: typeof ranked = [];
  for (const c of ranked) {
    if (picked.length >= opts.count) break;
    if (!picked.some((p) => p.talk.family === c.talk.family)) picked.push(c);
  }

  // A real choice: one that pushes and one that holds (the last pick makes way, never the best fit)
  const attack = (c: (typeof ranked)[number]) => ATTACK_FAMILIES.includes(c.talk.family);
  for (const wantAttack of [true, false]) {
    if (picked.some((p) => attack(p) === wantAttack) || picked.length < 2) continue;
    const swap = ranked.find((c) => attack(c) === wantAttack && !picked.some((p) => p.talk.family === c.talk.family));
    if (swap) picked[picked.length - 1] = swap;
  }

  // Never the same offer twice in a row
  const sameAsLast = lastOffer.length === picked.length && picked.every((p) => lastOffer.includes(p.talk.id));
  if (sameAsLast && picked.length > 1) {
    const others = picked.slice(0, -1);
    const swap = ranked.find((c) => !picked.includes(c) && !others.some((p) => p.talk.family === c.talk.family));
    if (swap) picked[picked.length - 1] = swap;
  }

  return picked
    .sort((a, b) => b.score - a.score)
    .map(({ talk, score }) => {
      const last = recent.lines[talk.id];
      const line = last === undefined ? Math.floor(hash01(opts.seed + talk.id + 'line') * talk.lines.length) : (last + 1) % talk.lines.length;
      return { talk, line, score };
    });
}

/** Remembers an offer and the line of the speech given, for the next game's picks. */
export function rememberTalks(recent: RecentTalks, phase: TalkPhase, offered: TalkOption[], given: TalkOption): RecentTalks {
  return { ...recent, [phase]: offered.map((o) => o.talk.id), lines: { ...recent.lines, [given.talk.id]: given.line } };
}

/** "The first half" at halftime: the score and up to three things that stood out. */
export function firstHalfLines(s: TalkSituation, stakes: GameStakes | undefined): string[] {
  const score = s.margin > 0 ? `📊 Up ${s.margin}` : s.margin < 0 ? `📉 Down ${-s.margin}` : '🤝 Tied at the half';
  const opponent = stakes?.opponent.name ?? 'them';
  const where = s.home ? 'vs' : 'at';
  const facts = [
    stakes?.playoffRound && stakes.banner,
    stakes?.rivalry && `⚔️ Rivalry game ${where} ${opponent}`,
    !stakes?.playoffRound && !stakes?.rivalry && s.theirRank !== null && `🏟️ ${where === 'vs' ? 'Vs' : 'At'} #${s.theirRank} ${opponent}`,
    s.runFor >= 14 && `📈 You scored the last ${s.runFor}`,
    s.runAgainst >= 14 && `🔥 They scored the last ${s.runAgainst}`,
    s.turnovers >= 2 && `🧤 You turned it over ${s.turnovers} times`,
    s.flags >= 4 && `🚩 ${s.flags} flags against you`,
    s.redZoneStalls >= 2 && `🚧 ${s.redZoneStalls} trips inside their 20 without a touchdown`,
    s.theirRedZoneStalls >= 2 && `🛡️ They reached your 20 ${s.theirRedZoneStalls} times without a touchdown`,
    s.carries >= 6 && s.yardsPerCarry >= 5 && `🏃 ${s.yardsPerCarry.toFixed(1)} yards a carry`,
    s.carries >= 6 && s.yardsPerCarry < 3 && `🧱 ${s.yardsPerCarry.toFixed(1)} yards a carry`,
    s.shortYardageFails >= 2 && `🚧 Stopped ${s.shortYardageFails} times on 3rd or 4th and short`,
    s.bigKickPlay && '🦶 A big special-teams play'
  ].filter((f): f is string => typeof f === 'string');
  return [score, ...facts.slice(0, 3)];
}

/** The live game's stakes when the season can't place it (a resumed game from an older save): rivalry only. */
export function stakesFromGame(state: GameSimulationState, userTeamId: string): GameStakes {
  const home = state.homeTeam.id === userTeamId;
  const [us, opponent] = home ? [state.homeTeam, state.awayTeam] : [state.awayTeam, state.homeTeam];
  const rivalry = isRivalryGame(us, opponent);
  return { gameId: state.gameId, home, opponent, playoffRound: null, homecoming: false, seniorNight: false, rivalry, banner: rivalry ? '⚔️ Rivalry game' : null };
}
