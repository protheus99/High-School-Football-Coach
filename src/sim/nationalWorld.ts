import { ScheduledGame, Team } from '../types/game';
import { buildStateWorld, LeagueStructure, leagueRegionTeams } from './league';
import { applyGameResult, FIRST_NON_DISTRICT_WEEK, generateSeasonSchedule, LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { simulateMacroMatch, teamStarterRating } from './macroSim';
import { advancePlayoffRound, bracketRoundForWeek, buildPlayoffBracket, PlayoffBracketState, relinkBracketTeams } from './playoffEngine';
import { PLAYABLE_STATES, rulesForState } from './stateRules';
import { programTalent } from '../generators/rosterGenerator';
import { prestigeReversion } from './programMeters';
import { applyRunAheadRound, gameKey, WeekResults } from './runAhead';

// ---------------------------------------------------------------------------
// The national world: every playable state other than the user's plays the same calendar as a light league,
// so national and state polls and stat leaders cover the whole country. A light team keeps only its stat
// leaders (LIGHT_STARTERS in the roster generator) and a fixed team rating in place of its full roster, about a
// tenth of a full team's size. Games, standings, power ratings and playoffs run on the same engines.
// ---------------------------------------------------------------------------

export interface LightLeague {
  state: string;
  league: LeagueStructure;
  teams: Team[];
  schedule: ScheduledGame[];
  bracket: PlayoffBracketState | null;
}

const WIN_ODDS_PER_RATING = 0.49; // logistic slope: a 1-point edge wins about 62% (the macro engine's calibration)
const WINS_PER_PRESTIGE_POINT = 2; // wins beyond (or short of) expectations per prestige point

/**
 * How a light program's season moves its prestige: by how it did against what its schedule predicted (wins over or
 * under the expected wins against the opponents it actually played), plus a point for a state title. Judging
 * seasons by wins alone moved favorites up and underdogs down every year, and prestige feeds the next roster: within
 * 20 years the other states had 3x as many programs at 99 and 2x as many under 60.
 */
export function seasonPrestigeNudge(team: Team, schedule: ScheduledGame[], teamsById: Map<string, Team>, champion: boolean): number {
  const rating = (t?: Team) => t?.lightRating ?? 0;
  const played = schedule.filter((g) => g.homeScore !== undefined && (g.homeTeamId === team.id || g.awayTeamId === team.id));
  const expected = played.reduce((sum, g) => {
    const opponent = teamsById.get(g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId);
    return opponent ? sum + 1 / (1 + Math.exp(-WIN_ODDS_PER_RATING * (rating(team) - rating(opponent)))) : sum;
  }, 0);
  const wins = played.filter((g) => (g.homeTeamId === team.id ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!)).length;
  // Fractions round by chance, so a season moves prestige by exactly what it earned on average (rounding to the
  // nearest point docked favorites, who can only fall short, nearly every year)
  const surprise = Math.max(-2, Math.min(2, (wins - expected) / WINS_PER_PRESTIGE_POINT));
  const whole = Math.trunc(surprise);
  return whole + (Math.random() < Math.abs(surprise - whole) ? Math.sign(surprise) : 0) + (champion ? 1 : 0);
}

/**
 * A state's whole top class as a light league with this year's schedule. Programs keep last year's prestige
 * (with a nudge for how the season went) when `previous` is given.
 */
export function buildLightLeague(state: string, year: number, previous?: LightLeague): LightLeague {
  const { league, teams } = buildStateWorld(state, undefined, true);
  // Team ids come from school names, which repeat across states (West Forsyth: Georgia and North Carolina)
  const suffix = `__${state.toLowerCase().replace(/[^a-z]+/g, '_')}`;
  teams.forEach((t) => (t.id += suffix));
  league.regions.forEach((r) => r.districts.forEach((d) => (d.teamIds = d.teamIds.map((id) => id + suffix))));
  const before = new Map((previous?.teams ?? []).map((t) => [t.id, t]));
  const champions = new Set(previous?.bracket?.divisions.map((d) => d.championTeamId).filter(Boolean));
  teams.forEach((t) => {
    const last = before.get(t.id);
    if (!last) return;
    const nudge = seasonPrestigeNudge(last, previous!.schedule, before, champions.has(t.id));
    // t.prestige is the school's historical prestige (fresh from the data): seasons pull it away, history pulls it back
    const prestige = Math.max(40, Math.min(99, last.prestige + nudge + prestigeReversion(last.prestige, t.prestige)));
    // Talent follows prestige the way roster generation does
    t.lightRating = (t.lightRating ?? 60) + programTalent(prestige, state) - programTalent(t.prestige, state);
    t.prestige = prestige;
  });
  // Week 8 stays open for the national out-of-state week
  return { state, league, teams, schedule: generateSeasonSchedule(leagueRegionTeams(league, teams), year, { reservedWeeks: [FIRST_NON_DISTRICT_WEEK] }), bracket: null };
}

/** Every playable state except the user's, as light leagues. */
export function buildNationalWorld(userState: string, year: number, previous: LightLeague[] = []): LightLeague[] {
  return PLAYABLE_STATES.filter((s) => s !== userState).map((s) =>
    buildLightLeague(
      s,
      year,
      previous.find((l) => l.state === s)
    )
  );
}

/** Plays one week of a light league: its regular-season games, then (from week 17) its playoffs. Games already
 * simulated ahead (run-ahead results) keep those scores. */
export function simulateLightWeek(light: LightLeague, week: number, ahead: WeekResults | null = null): void {
  if (week <= LAST_REGULAR_SEASON_WEEK) {
    const byId = new Map(light.teams.map((t) => [t.id, t]));
    light.schedule
      .filter((g) => g.week === week && g.homeScore === undefined)
      .forEach((g) => {
        const home = byId.get(g.homeTeamId);
        const away = byId.get(g.awayTeamId);
        if (!home || !away) return;
        const pre = ahead?.week === week ? ahead.games[gameKey(light.state, g.gameId)] : undefined;
        const box = pre ?? simulateMacroMatch(g.gameId, g.week, home, away);
        g.homeScore = box.homeScore;
        g.awayScore = box.awayScore;
        applyGameResult(home, away, box.homeScore, box.awayScore, g.isDistrictGame);
      });
    // The regular season is over: seed the playoffs (the first round is played in the bracket's first week)
    if (week === LAST_REGULAR_SEASON_WEEK) {
      const regionTeams = leagueRegionTeams(light.league, light.teams);
      light.bracket = buildPlayoffBracket(
        light.league.regions.map((region, i) => ({ name: region.name, districts: regionTeams[i] })),
        { splitDivisions: light.league.splitDivisions, rules: rulesForState(light.state), schedule: light.schedule }
      );
    }
    return;
  }
  if (light.bracket?.isPlayoffsActive && bracketRoundForWeek(light.bracket, week) >= 0) {
    applyRunAheadRound(light.bracket, light.state, ahead, week);
    light.bracket = advancePlayoffRound(light.bracket);
  }
}

/** Plays freshly built light leagues forward through a week (loading a save from before the national world). */
export function catchUpNationalWorld(leagues: LightLeague[], throughWeek: number): void {
  leagues.forEach((l) => {
    for (let week = 1; week <= throughWeek; week++) {
      const played = week <= LAST_REGULAR_SEASON_WEEK ? l.schedule.some((g) => g.week === week && g.homeScore !== undefined) : false;
      if (!played) simulateLightWeek(l, week);
    }
  });
}

/** After loading a save: the bracket's teams are the league's team objects again. */
export function relinkNationalWorld(leagues: LightLeague[]): LightLeague[] {
  return leagues.map((l) => ({ ...l, bracket: l.bracket ? relinkBracketTeams(l.bracket, l.teams) : null }));
}

/** How rolled light ratings map onto the coach's league: the same state's rolled and real ratings, sorted. */
export interface LightCalibration {
  rolled: number[]; // a freshly rolled light version of the coach's state, ascending
  real: number[]; // the coach's league's game-day ratings, ascending
  teamRatings: Record<string, number>; // the same ratings by team (next season's out-of-state pairing uses them)
}

/**
 * Keeps the country on the coach's league's scale. The coach's league is fully simulated (rosters, classes, talent
 * waves), while light leagues are rolled from the data each year. A freshly rolled light version of the coach's
 * state is compared with the real league, rating by rating: the mapping matches the whole shape, the top tail
 * included (talent waves give real leagues more standout teams than rolled ratings have, and a level-and-spread match
 * left the coach's state owning the national polls). Measured at each season's opener, once the freshmen are in.
 */
export function measureLightCalibration(userState: string, leagueTeams: Team[]): LightCalibration {
  const teamRatings = Object.fromEntries(leagueTeams.map((t) => [t.id, teamStarterRating(t)]));
  return {
    rolled: buildStateWorld(userState, undefined, true).teams.map((t) => t.lightRating ?? 0).sort((a, b) => a - b),
    real: Object.values(teamRatings).sort((a, b) => a - b),
    teamRatings
  };
}

/** A rolled rating's place on the real scale: same rank in the distribution (straight-line beyond its ends). */
export function mapLightRating(x: number, { rolled, real }: LightCalibration): number {
  const n = rolled.length;
  const at = (q: number) => {
    const pos = q * (real.length - 1);
    const i = Math.floor(pos);
    return real[i] + (real[Math.min(i + 1, real.length - 1)] - real[i]) * (pos - i);
  };
  const tail = Math.max(2, Math.round(n / 10));
  if (x >= rolled[n - 1]) {
    const slope = (real[real.length - 1] - real[real.length - tail]) / Math.max(0.5, rolled[n - 1] - rolled[n - tail]);
    return real[real.length - 1] + (x - rolled[n - 1]) * Math.max(0.5, Math.min(2, slope));
  }
  if (x <= rolled[0]) {
    const slope = (real[tail - 1] - real[0]) / Math.max(0.5, rolled[tail - 1] - rolled[0]);
    return real[0] + (x - rolled[0]) * Math.max(0.5, Math.min(2, slope));
  }
  let i = 0;
  while (rolled[i + 1] < x) i++;
  const q = (i + (x - rolled[i]) / Math.max(1e-9, rolled[i + 1] - rolled[i])) / (n - 1);
  return at(q);
}

/**
 * Puts freshly rolled light leagues on the coach's league's scale. Applied as each season's light leagues are built,
 * before the out-of-state games are paired by rating: pairing on unmapped ratings had handed the coach's state
 * slightly weaker opponents, and its out-of-state wins inflated every in-state schedule in the computer rankings.
 */
export function applyLightCalibration(leagues: LightLeague[], c: LightCalibration): void {
  leagues.forEach((l) => l.teams.forEach((t) => t.lightRating !== undefined && (t.lightRating = mapLightRating(t.lightRating, c))));
}

/** Every team in the country: the user's league plus the light leagues. */
export const nationalTeams = (leagueTeams: Team[], leagues: LightLeague[]) => [...leagueTeams, ...leagues.flatMap((l) => l.teams)];
