import { ScheduledGame, Team } from '../types/game';
import type { ClassRules } from './classRules';
import { calculateDistrictStandings } from './districtEngine';
import { applyGameResult, FIRST_NON_DISTRICT_WEEK, firstPlayoffWeek, LAST_REGULAR_SEASON_WEEK, MAX_PLAYOFF_ROUNDS, roundRobinRounds } from './scheduleEngine';
import { simulateMacroMatch } from './macroSim';
import { BracketNode, bracketRoundNames, PlayoffBracketState, PlayoffDivision, PlayoffRound, powerRatings, seedOrder } from './playoffEngine';

// ---------------------------------------------------------------------------
// The generalized season and playoff engine: any classification's rules (classRules.ts) played on any league of
// districts. It covers
//   1. regular seasons of any length and district-game count (round robin, league-assigned or self-scheduled slates,
//      the last two as district games plus nearby opponents);
//   2. brackets of any field size, with byes for the top seeds, any number of rounds and the real round names;
//   3. selection and seeding by district finish, an RPI-style rating (WP x OWP x OOWP), a playoff point system
//      (Michigan, Wisconsin, Maryland, Virginia, Ohio's Harbin points) or a win threshold (Illinois);
//   4. region and section brackets that feed the state rounds, East/West halves and paired-district crossovers;
//   5. several brackets per class (Texas Division I/II, Louisiana select/non-select) and Illinois post-season classing.
// Every bracket fits the national calendar: at most six rounds, the final in the shared title week.
// ---------------------------------------------------------------------------

export interface ClassDistrict {
  name: string;
  teams: Team[];
  synthetic?: boolean; // grouped by classLeague.ts because the data has no district for these teams
}

/** A regular-season or bracket game result; home is listed first. */
export type GameSim = (gameId: string, week: number, home: Team, away: Team) => { homeScore: number; awayScore: number };

const macroGame: GameSim = (gameId, week, home, away) => simulateMacroMatch(gameId, week, home, away);

// ---------------------------------------------------------------------------
// 1. Regular season
// ---------------------------------------------------------------------------

/** District games per team the scheduling style allows (a district round robin, capped). */
function districtGameCap(rules: ClassRules, games: number): number {
  if (rules.season.districtGames !== null) return Math.min(rules.season.districtGames, games);
  switch (rules.season.scheduling) {
    case 'DISTRICT_ROUND_ROBIN':
      return games - 1;
    case 'LEAGUE_ASSIGNED':
      return games - 2;
    case 'MIXED':
      return games - 3;
    default:
      return Math.min(4, games - 1); // SELF_SCHEDULED: a few local games count as the district slate
  }
}

/** The weeks a `games`-game season uses out of the open weeks: spread out, open dates in the middle. */
export function seasonPlayWeeks(games: number, reserved: number[] = []): number[] {
  const weeks = Array.from({ length: LAST_REGULAR_SEASON_WEEK - FIRST_NON_DISTRICT_WEEK + 1 }, (_, k) => FIRST_NON_DISTRICT_WEEK + k).filter((w) => !reserved.includes(w));
  const n = Math.max(0, Math.min(games, weeks.length));
  if (n === weeks.length) return weeks;
  if (n <= 1) return weeks.slice(-n || weeks.length).slice(0, n);
  return Array.from({ length: n }, (_, k) => weeks[Math.round((k * (weeks.length - 1)) / (n - 1))]);
}

/**
 * A class's regular season: every district plays a (partial) round robin in its last weeks, then idle teams are
 * paired with nearby opponents (the next districts in the list first) they haven't met, so each team gets as close
 * to the season's game count as the league allows. No team plays twice in a week.
 */
export function generateClassSchedule(
  districts: ClassDistrict[],
  rules: ClassRules,
  year: number,
  options: { reservedWeeks?: number[]; random?: () => number } = {}
): ScheduledGame[] {
  const random = options.random ?? Math.random;
  const playWeeks = seasonPlayWeeks(rules.season.games, options.reservedWeeks);
  const games = playWeeks.length;
  const cap = Math.max(0, districtGameCap(rules, games));
  const schedule: ScheduledGame[] = [];
  const booked = new Map(playWeeks.map((w) => [w, new Set<string>()]));
  const met = new Map<string, Set<string>>();
  const played = new Map<string, number>();
  const WINDOW = 48;
  const districtOf = new Map<string, number>();
  districts.forEach((d, i) => d.teams.forEach((t) => districtOf.set(t.id, i)));
  const add = (week: number, home: string, away: string, isDistrictGame: boolean) => {
    schedule.push({ gameId: `y${year}_w${week}_${home}_${away}`, week, homeTeamId: home, awayTeamId: away, isDistrictGame });
    booked.get(week)!.add(home).add(away);
    if (!met.has(home)) met.set(home, new Set());
    if (!met.has(away)) met.set(away, new Set());
    met.get(home)!.add(away);
    met.get(away)!.add(home);
    played.set(home, (played.get(home) ?? 0) + 1);
    played.set(away, (played.get(away) ?? 0) + 1);
  };

  // District round robins, in the last weeks of the season
  districts.forEach((d) => {
    const ids = shuffled(d.teams.map((t) => t.id), random);
    const rounds = roundRobinRounds(ids).slice(0, cap);
    rounds.forEach((pairs, r) => pairs.forEach(([home, away]) => add(playWeeks[games - rounds.length + r], home, away, true)));
  });

  // Nearby non-district opponents: teams in list (geographic) order, scanning ahead from each idle team. A few
  // tries with different starting points; the one that books the most games is kept. Tightest weeks go first.
  const order = districts.flatMap((d) => d.teams.map((t) => t.id));
  const weekOrder = [...playWeeks].sort((a, b) => booked.get(b)!.size - booked.get(a)!.size || a - b);
  let best: [number, string, string][] = [];
  const ceiling = playWeeks.reduce((n, w) => n + Math.floor((order.length - booked.get(w)!.size) / 2), 0);
  for (let attempt = 0; attempt < 6 && best.length < ceiling; attempt++) {
    const tryMet = new Map([...met].map(([id, set]) => [id, new Set(set)]));
    const tryPlayed = new Map(played);
    const added: [number, string, string][] = [];
    const fresh = (a: string, b: string) => a !== b && !tryMet.get(a)?.has(b);
    weekOrder.forEach((week) => {
      const busy = booked.get(week)!;
      const idle = order.filter((id) => !busy.has(id) && (tryPlayed.get(id) ?? 0) < games);
      if (idle.length < 2) return;
      // Hardest to place first: the idle team with the fewest fresh opponents nearby (within WINDOW places in list
      // order), against its least-wanted option, another district's first. The start rotates between tries.
      const start = Math.floor(random() * idle.length);
      const ring = [...idle.slice(start), ...idle.slice(0, start)];
      const reach = Math.min(WINDOW, Math.floor((ring.length - 1) / 2) || 1);
      const options = ring.map((team, i) => {
        const near: number[] = [];
        for (let j = -reach; j <= reach; j++) {
          const k = (i + j + ring.length) % ring.length;
          if (j !== 0 && !near.includes(k) && fresh(team, ring[k])) near.push(k);
        }
        return near;
      });
      const taken = new Array<boolean>(ring.length).fill(false);
      const left = options.map((o) => o.length);
      const take = (i: number) => {
        taken[i] = true;
        options[i].forEach((k) => left[k]--);
      };
      for (;;) {
        let i = -1;
        for (let x = 0; x < ring.length; x++) if (!taken[x] && left[x] > 0 && (i < 0 || left[x] < left[i])) i = x;
        if (i < 0) break;
        const open = options[i].filter((k) => !taken[k]);
        const other = open.filter((k) => districtOf.get(ring[k]) !== districtOf.get(ring[i]));
        const pool = other.length ? other : open;
        const k = pool.reduce((a, b) => (left[b] < left[a] ? b : a));
        take(i);
        take(k);
        const [team, pick] = [ring[i], ring[k]];
        [team, pick].forEach((id) => tryPlayed.set(id, (tryPlayed.get(id) ?? 0) + 1));
        if (!tryMet.has(team)) tryMet.set(team, new Set());
        if (!tryMet.has(pick)) tryMet.set(pick, new Set());
        tryMet.get(team)!.add(pick);
        tryMet.get(pick)!.add(team);
        added.push((week + i) % 2 === 0 ? [week, team, pick] : [week, pick, team]);
      }
    });
    if (added.length > best.length) best = added;
  }
  best.forEach(([week, home, away]) => add(week, home, away, false));
  return schedule.sort((a, b) => a.week - b.week);
}

/** Plays a class's regular-season schedule (default: the macro engine) and records the results on the teams. */
export function playClassSchedule(teams: Team[], schedule: ScheduledGame[], play: GameSim = macroGame): void {
  const byId = new Map(teams.map((t) => [t.id, t]));
  schedule.forEach((g) => {
    if (g.homeScore !== undefined) return;
    const home = byId.get(g.homeTeamId);
    const away = byId.get(g.awayTeamId);
    if (!home || !away) return;
    const box = play(g.gameId, g.week, home, away);
    g.homeScore = box.homeScore;
    g.awayScore = box.awayScore;
    applyGameResult(home, away, box.homeScore, box.awayScore, g.isDistrictGame);
  });
}

// ---------------------------------------------------------------------------
// 3. Selection and seeding ratings
// ---------------------------------------------------------------------------

/**
 * A playoff point system in the Michigan / Wisconsin / Maryland / Virginia / Harbin mold: per game, a win is worth
 * 80 points plus 8 per win by the opponent, a loss 4 per opponent win; the total is divided by games played.
 */
export function playoffPoints(teams: Team[], schedule: ScheduledGame[]): Map<string, number> {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const total = new Map<string, number>();
  const count = new Map<string, number>();
  schedule.forEach((g) => {
    if (g.homeScore === undefined || g.awayScore === undefined) return;
    const credit = (id: string, opponentId: string, won: boolean) => {
      const oppWins = byId.get(opponentId)?.record.wins ?? 0;
      total.set(id, (total.get(id) ?? 0) + (won ? 80 + 8 * oppWins : 4 * oppWins));
      count.set(id, (count.get(id) ?? 0) + 1);
    };
    credit(g.homeTeamId, g.awayTeamId, g.homeScore > g.awayScore);
    credit(g.awayTeamId, g.homeTeamId, g.awayScore > g.homeScore);
  });
  return new Map(teams.map((t) => [t.id, (total.get(t.id) ?? 0) / Math.max(1, count.get(t.id) ?? 0)]));
}

/** IHSA-style playoff points: the combined wins of every opponent (the win-threshold tiebreaker). */
function opponentWins(teams: Team[], schedule: ScheduledGame[]): Map<string, number> {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const sum = new Map<string, number>();
  schedule.forEach((g) => {
    if (g.homeScore === undefined) return;
    sum.set(g.homeTeamId, (sum.get(g.homeTeamId) ?? 0) + (byId.get(g.awayTeamId)?.record.wins ?? 0));
    sum.set(g.awayTeamId, (sum.get(g.awayTeamId) ?? 0) + (byId.get(g.homeTeamId)?.record.wins ?? 0));
  });
  return sum;
}

/** The selection rating each team is ranked by (higher is better). */
export function selectionRatings(teams: Team[], schedule: ScheduledGame[], rules: ClassRules): Map<string, number> {
  const { selection } = rules.playoffs;
  if (selection === 'POINTS') return playoffPoints(teams, schedule);
  if (selection === 'WIN_THRESHOLD') {
    const points = opponentWins(teams, schedule);
    return new Map(teams.map((t) => [t.id, t.record.wins * 1000 + (points.get(t.id) ?? 0)]));
  }
  return powerRatings(teams, schedule);
}

// ---------------------------------------------------------------------------
// 5. Several brackets per class
// ---------------------------------------------------------------------------

const SELECT_NAME = /\b(catholic|christian|academy|st\.?|saint|jesuit|prep|preparatory|country day|episcopal|lutheran|baptist|holy|sacred|cathedral|charter|magnet|university|lab|school of)\b/i;

const hashOf = (text: string) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/**
 * LHSAA select schools (private, charter, magnet, lab): the master list has no school type, so private-sounding names
 * are select, topped up (by a stable hash) to a quarter of the class.
 */
export function selectSchoolIds(teams: Team[]): Set<string> {
  const select = new Set(teams.filter((t) => SELECT_NAME.test(t.name)).map((t) => t.id));
  const want = Math.min(teams.length - 1, Math.ceil(teams.length / 4));
  [...teams]
    .filter((t) => !select.has(t.id))
    .sort((a, b) => hashOf(a.id) - hashOf(b.id))
    .slice(0, Math.max(0, want - select.size))
    .forEach((t) => select.add(t.id));
  return select;
}

/** Enrollment, or a stable stand-in when the data has none. */
export const enrollmentOf = (team: Team) => team.enrollment ?? 400 + (hashOf(team.id) % 2000);

// ---------------------------------------------------------------------------
// 2 and 4. Bracket layout
// ---------------------------------------------------------------------------

type Slot = { team: Team; region: string } | null;

interface Block {
  region: string;
  seeds: Team[]; // best seed first
}

/** Generic round names for a bracket with no names in the data: First Round ... Quarterfinal, State Semifinal, final. */
function genericRounds(rounds: number): string[] {
  const last = ['Quarterfinal', 'State Semifinal', 'State Championship'].slice(-Math.min(3, rounds));
  const early = ['First Round', 'Second Round', 'Third Round'].slice(0, Math.max(0, rounds - 3));
  return [...early, ...last];
}

/**
 * The data's round names fitted to a bracket of `rounds` rounds: extra leading names are dropped (a smaller field
 * starts later), and a missing round is added by splitting a regional/district/section round in two (UIL "Regional"
 * becomes Regional Semifinal and Regional Final) or by an opening round.
 */
export function fitRoundNames(names: string[], rounds: number): string[] {
  if (rounds <= 0) return [];
  const base = names.length ? [...names] : genericRounds(rounds);
  if (base.length >= rounds) return base.slice(base.length - rounds);
  const missing = rounds - base.length;
  // A round named for a whole stage (District Playoffs, Sectional) first, else the last regional/district/area round
  const splittable = (n: string) => !/final|championship|semifinal|bowl|state/i.test(n);
  const stage = base.findIndex((n) => /playoffs|sectional|section\b/i.test(n) && splittable(n));
  const lastRegional = base.map((n, i) => (/region|district|area/i.test(n) && splittable(n) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const at = stage >= 0 ? stage : lastRegional;
  if (at >= 0) {
    const stem = base[at].replace(/\s+playoffs?$/i, '').replace(/\s+round$/i, '');
    const parts = missing + 1;
    const named = parts === 2 ? ['Semifinal', 'Final'] : parts === 3 ? ['Quarterfinal', 'Semifinal', 'Final'] : Array.from({ length: parts }, (_, k) => (k === parts - 1 ? 'Final' : `Round ${k + 1}`));
    return [...base.slice(0, at), ...named.map((n) => `${stem} ${n}`), ...base.slice(at + 1)];
  }
  const opening = Array.from({ length: missing }, (_, k) => (missing === 1 ? 'Opening Round' : `Opening Round ${k + 1}`));
  return [...opening, ...base];
}

const log2Ceil = (n: number) => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));

/** Blocks laid out as bracket slots; `regionalRounds` below a block's depth interleaves blocks (two survivors per region). */
function layoutBlocks(blocks: Block[], blockSize: number, regionalRounds: number): Slot[] {
  const padded = [...blocks];
  while (padded.length & (padded.length - 1)) padded.push({ region: '', seeds: [] });
  const order = seedOrder(blockSize);
  const blockSlots = padded.map((b) => order.map((s) => (b.seeds[s - 1] ? { team: b.seeds[s - 1], region: b.region } : null)));
  const depth = Math.log2(blockSize);
  const pieces = 2 ** Math.max(0, depth - Math.max(0, Math.min(depth, regionalRounds)));
  const pieceSize = blockSize / pieces;
  const slots: Slot[] = [];
  for (let p = 0; p < pieces; p++) blockSlots.forEach((s) => slots.push(...s.slice(p * pieceSize, (p + 1) * pieceSize)));
  return slots;
}

/** Spreads a smaller bracket over `size` slots so its teams wait out the extra early rounds with byes. */
function spread(slots: Slot[], size: number): Slot[] {
  if (slots.length >= size) return slots;
  const step = size / Math.max(1, slots.length);
  const out: Slot[] = Array.from({ length: size }, () => null);
  slots.forEach((s, i) => (out[i * step] = s));
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A master-list district against a name in the rules ("District 7 (WPIAL)" is District 7, District 10 is not District 1). */
function sameDistrict(district: string, listed: string): boolean {
  const d = norm(district);
  const l = norm(listed);
  if (!d || !l || !Number.isNaN(Number(listed))) return false;
  const prefix = (a: string, b: string) => a.startsWith(b) && !/\d/.test(a[b.length] ?? '');
  return d === l || prefix(d, l) || prefix(l, d);
}

/** Region (section) groups of districts: by the data's names where they match, else contiguous in list order. */
export function regionize(districts: ClassDistrict[], count: number, named: { name: string; districts: string[] }[] = []): ClassDistrict[][] {
  const n = Math.max(1, count);
  if (named.length === n) {
    const match = (d: ClassDistrict, r: { name: string; districts: string[] }) => (!!norm(d.name) && norm(r.name) === norm(d.name)) || r.districts.some((x) => sameDistrict(d.name, x));
    const groups: ClassDistrict[][] = named.map(() => []);
    const unmatched: ClassDistrict[] = [];
    districts.forEach((d) => {
      const r = named.findIndex((g) => match(d, g));
      if (r >= 0) groups[r].push(d);
      else unmatched.push(d);
    });
    if (groups.every((g) => g.length > 0)) {
      unmatched.forEach((d) => groups.reduce((a, b) => (teamCount(b) < teamCount(a) ? b : a)).push(d));
      return groups;
    }
  }
  if (districts.length >= n) {
    // Contiguous groups of districts with about the same number of teams
    const total = districts.reduce((s, d) => s + d.teams.length, 0);
    const groups: ClassDistrict[][] = Array.from({ length: n }, () => []);
    let g = 0;
    let acc = 0;
    districts.forEach((d, i) => {
      const left = districts.length - i;
      if (groups[g].length > 0 && g < n - 1 && (acc >= (total * (g + 1)) / n || left <= n - 1 - g)) g++;
      groups[g].push(d);
      acc += d.teams.length;
    });
    return groups;
  }
  // Fewer districts than regions (one statewide list): cut the teams into contiguous pieces
  const flat = districts.flatMap((d) => d.teams.map((t) => ({ t, d: d.name })));
  return Array.from({ length: n }, (_, g) => {
    const piece = flat.slice(Math.round((g * flat.length) / n), Math.round(((g + 1) * flat.length) / n));
    const byName = new Map<string, Team[]>();
    piece.forEach(({ t, d }) => byName.set(d, [...(byName.get(d) ?? []), t]));
    return [...byName].map(([name, teams]) => ({ name, teams }));
  });
}

const teamCount = (g: ClassDistrict[]) => g.reduce((s, d) => s + d.teams.length, 0);

/** Districts ordered into halves by the data's half lists (East first), keeping list order inside each half. */
function orderByHalves(districts: ClassDistrict[], halves: { name: string; districts: string[] }[]): ClassDistrict[] {
  if (halves.length < 2) return districts;
  const halfOf = (d: ClassDistrict) => {
    const h = halves.findIndex((r) => r.districts.some((x) => sameDistrict(d.name, x)));
    return h < 0 ? halves.length : h;
  };
  return districts.map((d, i) => ({ d, h: halfOf(d), i })).sort((a, b) => a.h - b.h || a.i - b.i).map((x) => x.d);
}

/** A short name for merged districts (bracket region labels stay phone-sized): "1-6A / 2-6A", or "District 1 +3". */
export function shortJoin(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const both = names.join(' / ');
  return names.length === 2 && both.length <= 24 ? both : `${names[0]} +${names.length - 1}`;
}

type RankedGroup = { name: string; ranked: Team[]; parts?: string[] };

/** Merges adjacent districts (the smallest pair first) until there are at most `count`; their standings interleave. */
function mergeRanked(groups: RankedGroup[], count: number, size: (g: { ranked: Team[] }) => number): RankedGroup[] {
  const out = [...groups];
  while (out.length > Math.max(1, count)) {
    let best = 0;
    for (let i = 1; i + 1 < out.length; i++) if (size(out[i]) + size(out[i + 1]) < size(out[best]) + size(out[best + 1])) best = i;
    const [a, b] = [out[best], out[best + 1]];
    const ranked: Team[] = [];
    for (let k = 0; k < Math.max(a.ranked.length, b.ranked.length); k++) [a.ranked[k], b.ranked[k]].forEach((t) => t && ranked.push(t));
    const parts = [...(a.parts ?? [a.name]), ...(b.parts ?? [b.name])];
    out.splice(best, 2, { name: shortJoin(parts), ranked, parts });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Playoffs
// ---------------------------------------------------------------------------

export interface ClassPlayoffs {
  bracket: PlayoffBracketState;
  fieldSizes: number[]; // teams entered per bracket
  notes: string[]; // approximations made for this league (on top of the class's own)
}

interface PoolContext {
  rules: ClassRules;
  schedule: ScheduledGame[];
  ratings: Map<string, number>;
  notes: string[];
}

const MAX_FIELD = 2 ** MAX_PLAYOFF_ROUNDS;

/** Default field for a ranked bracket with no size in the data: half the pool, capped by the round names. */
function defaultField(rules: ClassRules, pool: number): number {
  const names = rules.playoffs.rounds.length;
  const cap = names ? 2 ** Math.min(names, MAX_PLAYOFF_ROUNDS) : rules.playoffs.format === 'FALLBACK' ? 8 : 32;
  return Math.max(Math.min(2, pool), Math.min(cap, Math.floor(pool / 2)));
}

/** A district's standings (best first). */
const standingsOf = (teams: Team[]) => {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return calculateDistrictStandings(teams).map((r) => byId.get(r.teamId)!);
};

/** Picks and seeds `count` teams from a set of districts by the class's selection. */
function pickField(groups: ClassDistrict[], count: number, ctx: PoolContext): Team[] {
  const { rules, ratings } = ctx;
  const byRating = (a: Team, b: Team) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0) || b.prestige - a.prestige || (a.id < b.id ? -1 : 1);
  const teams = groups.flatMap((d) => d.teams);
  if (rules.playoffs.selection === 'DISTRICT_FINISH') {
    // Every district champion, then every runner-up, ... (each tier by rating)
    const places = groups.map((d) => standingsOf(d.teams));
    const depth = Math.max(0, ...places.map((p) => p.length));
    return Array.from({ length: depth }, (_, k) => places.map((p) => p[k]).filter((t): t is Team => !!t).sort(byRating)).flat().slice(0, count);
  }
  const sorted = [...teams].sort(byRating);
  if (rules.playoffs.championsSeededFirst && rules.playoffs.format !== 'STATEWIDE_RANKING') {
    const champions = new Set(groups.map((d) => standingsOf(d.teams)[0]?.id).filter(Boolean));
    return [...sorted.filter((t) => champions.has(t.id)), ...sorted.filter((t) => !champions.has(t.id))].slice(0, count);
  }
  return sorted.slice(0, count);
}

/** One statewide bracket (Georgia, Illinois 7A-8A, a Louisiana pool, the fallback). */
function statewideBlocks(districts: ClassDistrict[], ctx: PoolContext, field?: Team[]): { blocks: Block[]; size: number; rr: number; entered: number } {
  const { rules, ratings } = ctx;
  const pool = districts.reduce((s, d) => s + d.teams.length, 0);
  const size = Math.min(MAX_FIELD, field?.length ?? rules.playoffs.fieldSize ?? defaultField(rules, pool));
  let seeds = field ? field.slice(0, size) : pickField(districts, size, ctx);
  if (rules.playoffs.championsSeededFirst && !field) {
    // GHSA: district champions are guaranteed a top-half seed (a lower-rated champion bumps the last non-champion)
    const half = Math.ceil(seeds.length / 2);
    const champions = new Set(districts.map((d) => standingsOf(d.teams)[0]?.id).filter(Boolean));
    const all = [...districts.flatMap((d) => d.teams)].sort((a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0) || b.prestige - a.prestige);
    const top = all.slice(0, half);
    const rest = all.slice(half);
    rest.filter((t) => champions.has(t.id)).forEach((champion) => {
      const bumped = [...top].reverse().find((t) => !champions.has(t.id));
      if (!bumped) return;
      top.splice(top.indexOf(bumped), 1);
      rest.unshift(bumped);
      rest.splice(rest.indexOf(champion), 1);
      top.push(champion);
    });
    seeds = [...top, ...rest.sort((a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0))].slice(0, size);
  }
  const blockSize = 2 ** log2Ceil(Math.max(1, seeds.length));
  return { blocks: [{ region: '', seeds }], size: blockSize, rr: Math.log2(blockSize), entered: seeds.length };
}

/** Top N per district, paired districts crossing 1v4 / 2v3 (Texas UIL, Tennessee, Alabama, Kansas 3A-1A). */
function districtFinishBlocks(districts: ClassDistrict[], ctx: PoolContext, perDistrict: number, ranked?: { name: string; ranked: Team[] }[]): { blocks: Block[]; size: number; rr: number; entered: number } {
  const { rules } = ctx;
  let groups: RankedGroup[] = ranked ?? districts.map((d) => ({ name: d.name, ranked: standingsOf(d.teams).slice(0, perDistrict) }));
  groups = groups.filter((g) => g.ranked.length > 0);
  const sizeOf = (g: { ranked: Team[] }) => g.ranked.length;
  // The data's field (32 = eight regions of four in Tennessee) and the calendar cap both limit the district count
  const fieldDistricts = rules.playoffs.fieldSize ? Math.max(1, Math.floor(rules.playoffs.fieldSize / Math.max(1, perDistrict))) : groups.length;
  const calendarDistricts = 2 ** Math.max(0, MAX_PLAYOFF_ROUNDS - log2Ceil(2 * perDistrict) + 1);
  const target = Math.min(fieldDistricts, calendarDistricts);
  if (groups.length > target) {
    ctx.notes.push(`${groups.length} districts merged into ${target} for the ${target * perDistrict}-team field`);
    groups = mergeRanked(groups, target, sizeOf).map((g) => ({ ...g, ranked: g.ranked.slice(0, perDistrict) }));
  }
  const blocks: Block[] = [];
  for (let i = 0; i < groups.length; i += 2) {
    const a = groups[i].ranked;
    const b = groups[i + 1]?.ranked ?? [];
    const seeds: Team[] = [];
    for (let k = 0; k < Math.max(a.length, b.length); k++) [a[k], b[k]].forEach((t) => t && seeds.push(t));
    blocks.push({ region: groups[i + 1] ? shortJoin([...(groups[i].parts ?? [groups[i].name]), ...(groups[i + 1].parts ?? [groups[i + 1].name])]) : groups[i].name, seeds });
  }
  const size = 2 ** log2Ceil(2 * perDistrict);
  return { blocks, size, rr: Math.log2(size), entered: blocks.reduce((s, b) => s + b.seeds.length, 0) };
}

/** Region brackets that merge into the state rounds (Ohio, Florida, Maryland, NC, Michigan, NJ, Virginia...). */
function regionalBlocks(districts: ClassDistrict[], ctx: PoolContext, field?: Team[]): { blocks: Block[]; size: number; rr: number; entered: number } {
  const { rules } = ctx;
  const p = rules.playoffs;
  const count = Math.max(1, p.regionCount ?? (p.regions.length || 4));
  const groups = regionize(districts, count, p.regions);
  const names = regionNames(rules, count);
  const pool = districts.reduce((s, d) => s + d.teams.length, 0);
  const fieldSize = Math.min(MAX_FIELD, field?.length ?? p.fieldSize ?? defaultField(rules, pool));
  const perRegion = Array.from({ length: count }, (_, r) => Math.floor(fieldSize / count) + (r < fieldSize % count ? 1 : 0));
  let seeded: Team[][];
  if (field || p.statewideField) {
    // NCHSAA / IHSA: the field is picked statewide, then split across the regions in geographic order
    const picked = field ?? pickField(districts, fieldSize, ctx);
    const regionOf = new Map(groups.flatMap((g, r) => g.flatMap((d) => d.teams.map((t) => [t.id, r] as const))));
    const listIndex = new Map(districts.flatMap((d) => d.teams).map((t, i) => [t.id, i]));
    const placed = [...picked].sort((a, b) => (regionOf.get(a.id) ?? 0) - (regionOf.get(b.id) ?? 0) || (listIndex.get(a.id) ?? 0) - (listIndex.get(b.id) ?? 0));
    const order = new Map(picked.map((t, i) => [t.id, i]));
    let at = 0;
    seeded = perRegion.map((n) => {
      const chunk = placed.slice(at, at + n).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      at += n;
      return chunk;
    });
  } else {
    seeded = groups.map((g, r) => pickField(g, perRegion[r], ctx));
  }
  const widest = Math.max(1, ...seeded.map((s) => s.length), Math.min(p.regionBracketSize ?? 0, Math.max(...perRegion)));
  let size = 2 ** log2Ceil(widest);
  // The calendar: region rounds plus state rounds fit in six weeks
  const stateRounds = log2Ceil(count);
  while (Math.log2(size) + stateRounds > MAX_PLAYOFF_ROUNDS && size > 1) {
    size /= 2;
    ctx.notes.push(`region brackets cut to ${size} for the national calendar`);
  }
  seeded = seeded.map((s) => s.slice(0, size));
  const rr = p.regionalRounds ?? Math.log2(size);
  return { blocks: seeded.map((seeds, r) => ({ region: names[r], seeds })), size, rr, entered: seeded.reduce((s, x) => s + x.length, 0) };
}

/** Section champions feed the state bracket (Pennsylvania districts, New York and Minnesota sections). */
function sectionalBlocks(districts: ClassDistrict[], ctx: PoolContext): { blocks: Block[]; size: number; rr: number; entered: number } {
  const { rules } = ctx;
  const p = rules.playoffs;
  const sections = Math.max(1, p.regionCount ?? 8);
  const ordered = orderByHalves(districts, p.regions);
  // Too many sections: merge neighbors. A few short: each keeps its own bracket and the open slots are byes. One list
  // for the whole class (no section data): cut it into sections in list order.
  const keep = districts.length <= sections && districts.length >= Math.ceil(sections / 2);
  const groups = keep ? ordered.map((d) => [d]) : regionize(ordered, sections);
  if (districts.length > sections) ctx.notes.push(`${districts.length} sections merged into ${sections} for the state bracket`);
  if (!keep && districts.length < sections) ctx.notes.push(`${districts.length} listed districts split into ${sections} sections in list order`);
  const size = Math.min(p.regionBracketSize ?? 4, 2 ** Math.max(0, MAX_PLAYOFF_ROUNDS - log2Ceil(sections)));
  // Merged districts keep their names; pieces of one statewide list are numbered sections
  const nameOf = (g: ClassDistrict[], s: number) => ((keep || districts.length >= sections) && g.length ? shortJoin(g.map((d) => d.name)) : `Section ${s + 1}`);
  const blocks = groups.map((g, s) => ({ region: nameOf(g, s), seeds: pickField(g, size, ctx) }));
  return { blocks, size, rr: Math.log2(size), entered: blocks.reduce((s, b) => s + b.seeds.length, 0) };
}

/** Region names: the data's, or numbered inside the halves (Region A 1, Region A 2...), or Region 1..n. */
function regionNames(rules: ClassRules, count: number): string[] {
  const p = rules.playoffs;
  if (p.regions.length === count) return p.regions.map((r) => r.name);
  if (p.halves.length > 1 && count % p.halves.length === 0) {
    const per = count / p.halves.length;
    return Array.from({ length: count }, (_, i) => `${p.halves[Math.floor(i / per)]} ${(i % per) + 1}`);
  }
  return Array.from({ length: count }, (_, i) => `Region ${i + 1}`);
}

/** One pool's bracket slots (before the brackets of a class are aligned to the same round count). */
function poolSlots(districts: ClassDistrict[], ctx: PoolContext, opts: { perDistrict?: number; ranked?: { name: string; ranked: Team[] }[]; field?: Team[] }): { slots: Slot[]; entered: number } {
  const { format } = ctx.rules.playoffs;
  const teams = districts.reduce((s, d) => s + d.teams.length, 0);
  if (teams === 0) return { slots: [], entered: 0 };
  const plan =
    format === 'DISTRICT_FINISH'
      ? districtFinishBlocks(districts, ctx, opts.perDistrict ?? ctx.rules.playoffs.qualifiersPerDistrict ?? 2, opts.ranked)
      : format === 'REGIONAL_SEEDED'
        ? regionalBlocks(districts, ctx, opts.field)
        : format === 'SECTIONAL'
          ? sectionalBlocks(districts, ctx)
          : statewideBlocks(districts, ctx, opts.field);
  let slots = layoutBlocks(plan.blocks, plan.size, plan.rr);
  // Trim empty trailing halves (a short field never needs more rounds than its teams)
  while (slots.length > 1 && slots.slice(slots.length / 2).every((s) => !s)) slots = slots.slice(0, slots.length / 2);
  return { slots, entered: plan.entered };
}

/**
 * Builds a class's playoffs after its regular season: picks and seeds each bracket's field by the class's rules,
 * lays out byes for the top seeds, and aligns every bracket to the same rounds (the real round names) so all of
 * them finish in the shared title week. `field` (per bracket) replaces the selection: Illinois post-season classing.
 */
export function buildClassPlayoffs(
  districts: ClassDistrict[],
  rules: ClassRules,
  schedule: ScheduledGame[],
  options: { excludeTeamIds?: string[]; fields?: Team[][] } = {}
): ClassPlayoffs {
  const exclude = new Set(options.excludeTeamIds ?? []);
  const eligible = districts.map((d) => ({ name: d.name, teams: d.teams.filter((t) => !exclude.has(t.id)) })).filter((d) => d.teams.length > 0);
  const all = eligible.flatMap((d) => d.teams);
  const ctx: PoolContext = { rules, schedule, ratings: selectionRatings(all, schedule, rules), notes: [] };
  const p = rules.playoffs;
  const names = p.bracketNames.length ? p.bracketNames : [rules.className];

  // The pools that each crown a champion
  let pools: { name: string; slots: Slot[]; entered: number }[];
  if (options.fields) {
    pools = options.fields.map((field, i) => ({ name: names[i] ?? `${rules.className} ${i + 1}`, ...poolSlots(eligible, ctx, { field }) }));
  } else if (p.split === 'SELECT' && names.length >= 2) {
    const select = selectSchoolIds(all);
    const selectIndex = names.findIndex((n) => /select/i.test(n) && !/non/i.test(n));
    const filterPool = (isSelect: boolean) => eligible.map((d) => ({ name: d.name, teams: d.teams.filter((t) => select.has(t.id) === isSelect) })).filter((d) => d.teams.length > 0);
    pools = names.slice(0, 2).map((name, i) => ({ name, ...poolSlots(filterPool(i === (selectIndex < 0 ? 0 : selectIndex)), ctx, {}) }));
  } else if (p.split === 'ENROLLMENT' && names.length >= 2) {
    if (p.format === 'DISTRICT_FINISH') {
      // UIL: each district's qualifiers, the larger half by enrollment to Division I
      const perDistrict = p.qualifiersPerDistrict ?? 4;
      const half = Math.ceil(perDistrict / 2);
      const split = eligible.map((d) => {
        const qualifiers = standingsOf(d.teams).slice(0, perDistrict);
        const larger = new Set([...qualifiers].sort((a, b) => enrollmentOf(b) - enrollmentOf(a)).slice(0, half).map((t) => t.id));
        return { name: d.name, div: [qualifiers.filter((t) => larger.has(t.id)), qualifiers.filter((t) => !larger.has(t.id))] };
      });
      pools = names.slice(0, 2).map((name, i) => ({ name, ...poolSlots(eligible, ctx, { perDistrict: half, ranked: split.map((s) => ({ name: s.name, ranked: s.div[i] })) }) }));
    } else {
      const median = [...all].sort((a, b) => enrollmentOf(b) - enrollmentOf(a))[Math.floor(all.length / 2)];
      const cut = median ? enrollmentOf(median) : 0;
      pools = names.slice(0, 2).map((name, i) => ({
        name,
        ...poolSlots(eligible.map((d) => ({ name: d.name, teams: d.teams.filter((t) => (enrollmentOf(t) >= cut) === (i === 0)) })).filter((d) => d.teams.length), ctx, {})
      }));
    }
  } else {
    pools = [{ name: names[0], ...poolSlots(eligible, ctx, {}) }];
  }
  pools = pools.filter((pool) => pool.entered > 0);

  // Every bracket plays the same rounds (the widest), the smaller ones with byes, so all finals share the title week
  const width = Math.max(1, ...pools.map((pool) => pool.slots.length));
  const roundCount = Math.min(MAX_PLAYOFF_ROUNDS, log2Ceil(width));
  const divisions: PlayoffDivision[] = pools.map((pool) => {
    const slots = spread(pool.slots, 2 ** roundCount);
    const slug = pool.name.replace(/[^A-Za-z0-9]+/g, '').toLowerCase() || 'state';
    if (roundCount === 0) return { name: pool.name, rounds: [], championTeamId: slots[0]?.team.id };
    const firstRound: BracketNode[] = [];
    for (let k = 0; k < slots.length / 2; k++) {
      const high = slots[2 * k];
      const low = slots[2 * k + 1];
      if (!high && !low) continue;
      const team1 = (high ?? low)!;
      const bye = !high || !low;
      const region = high && low ? (high.region === low.region && high.region ? high.region : undefined) : team1.region || undefined;
      firstRound.push({
        matchupId: `${slug}_r1_${k + 1}`,
        round: 'BI_DISTRICT',
        ...(region && { region }),
        team1: team1.team,
        team2: bye ? team1.team : low!.team,
        slot: k,
        ...(bye ? { isBye: true, winnerTeamId: team1.team.id } : {})
      });
    }
    return { name: pool.name, rounds: [firstRound] };
  });

  const roundNames: PlayoffRound[] = roundCount > 0 ? bracketRoundNames(roundCount) : [];
  divisions.forEach((d) => d.rounds[0]?.forEach((n) => (n.round = roundNames[0])));
  const roundLabels = fitRoundNames(p.rounds, roundCount);
  if (p.rounds.length && p.rounds.length !== roundCount) ctx.notes.push(`${p.rounds.length} round names fitted to a ${roundCount}-round bracket`);
  const bracket: PlayoffBracketState = {
    isPlayoffsActive: roundCount > 0 && divisions.length > 0,
    roundNames,
    currentRoundIndex: 0,
    firstWeek: firstPlayoffWeek(roundCount),
    divisions,
    championshipTitle: p.championshipTitle,
    ...(p.championshipVenue && { championshipVenue: p.championshipVenue }),
    roundLabels
  };
  return { bracket, fieldSizes: pools.map((pool) => pool.entered), notes: ctx.notes };
}

/**
 * IHSA post-season classing: the state's qualifiers (the win line, then wins and playoff points to fill every class's
 * field) are sorted by enrollment and cut into the classes, largest class first. Returns each class's field, seeded
 * by wins then playoff points. `classes` are the state's classes with their (pre-season) teams.
 */
export function postseasonClassFields(classes: { rules: ClassRules; teams: Team[] }[], schedule: ScheduledGame[]): Map<string, Team[]> {
  const teams = classes.flatMap((c) => c.teams);
  const points = opponentWins(teams, schedule);
  const rank = (a: Team, b: Team) => b.record.wins - a.record.wins || (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1);
  const total = classes.reduce((s, c) => s + (c.rules.playoffs.fieldSize ?? 0), 0);
  const qualifiers = [...teams].sort(rank).slice(0, total);
  // Largest class first: by its teams' average enrollment
  const avg = (c: { teams: Team[] }) => c.teams.reduce((s, t) => s + enrollmentOf(t), 0) / Math.max(1, c.teams.length);
  const bySize = [...classes].sort((a, b) => avg(b) - avg(a));
  const byEnrollment = [...qualifiers].sort((a, b) => enrollmentOf(b) - enrollmentOf(a) || (a.id < b.id ? -1 : 1));
  const fields = new Map<string, Team[]>();
  let at = 0;
  bySize.forEach((c) => {
    const n = c.rules.playoffs.fieldSize ?? 0;
    fields.set(c.rules.className, byEnrollment.slice(at, at + n).sort(rank));
    at += n;
  });
  return fields;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
