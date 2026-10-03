import { ScheduledGame, Team } from '../types/game';
import { buildStateWorld, LeagueStructure, leagueRegionTeams } from './league';
import { applyGameResult, FIRST_NON_DISTRICT_WEEK, generateSeasonSchedule, LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { simulateMacroMatch, teamStarterRating } from './macroSim';
import { advancePlayoffRound, bracketRoundForWeek, buildPlayoffBracket, PlayoffBracketState, relinkBracketTeams } from './playoffEngine';
import { PLAYABLE_STATES, rulesForState } from './stateRules';
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
    const nudge = (champions.has(t.id) ? 2 : 0) + (last.record.wins >= 9 ? 1 : last.record.wins <= 3 ? -1 : 0);
    const prestige = Math.max(40, Math.min(99, last.prestige + nudge));
    // Talent follows prestige the way roster generation does (0.3 OVR per prestige point)
    t.lightRating = (t.lightRating ?? 60) + (prestige - t.prestige) * 0.3;
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

/**
 * Keeps the country developing at the same pace. The coach's league is fully simulated: its players grow
 * season by season, while light leagues are rebuilt from the data each year. At each season's opener the
 * league's average game-day rating is compared with a freshly built league of its state, and every light team
 * moves by that difference. Returns the shift.
 */
export function calibrateLightLeagues(leagues: LightLeague[], userState: string, leagueTeams: Team[]): number {
  const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const fresh = buildStateWorld(userState, undefined, true).teams.map((t) => t.lightRating ?? 0);
  const shift = average(leagueTeams.map(teamStarterRating)) - average(fresh);
  leagues.forEach((l) => l.teams.forEach((t) => t.lightRating !== undefined && (t.lightRating += shift)));
  return shift;
}

/** Every team in the country: the user's league plus the light leagues. */
export const nationalTeams = (leagueTeams: Team[], leagues: LightLeague[]) => [...leagueTeams, ...leagues.flatMap((l) => l.teams)];
