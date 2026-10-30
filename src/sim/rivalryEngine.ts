import { Team } from '../types/game';
import { rivalOf, rivalryName } from '../data/rivalries';

// ---------------------------------------------------------------------------
// Rivalry games: the schedule locks each rival game in every season (the last district week for district rivals,
// the last non-district week for rivals in other districts), and the coach's rivalry wins lift his program a little.
// Only his: given to every school, the powerhouses that win their rivalry most years kept climbing (prestige
// reverts only a tenth of the way each season) and state titles turned over less (measured in 10-season runs).
// A team plays one game a week, so schools that list each other lock in first; a one-way rivalry locks in only
// when both schools are still free that week. Any other meeting still counts as the rivalry game; nothing else
// bends the schedule (rivals in other states only meet if the out-of-state week pairs them).
// ---------------------------------------------------------------------------

/** What a rivalry win is worth: Booster Approval (Rating +1, the average of four meters) and prestige. */
export const RIVALRY_WIN_BOOSTERS = 4;
export const RIVALRY_WIN_PRESTIGE = 1;

export interface RivalryLocks {
  district: [string, string][]; // same district: the last district week
  nonDistrict: [string, string][]; // different districts in the state: the last non-district week
}

/**
 * The rival games to lock into a league's season: `regions` is region -> district -> teams. Pairs that list each
 * other come first, then one-way rivalries whose schools are both still free that week (in name order, so the
 * same league always locks the same games).
 */
export function rivalryLocks(regions: Team[][][]): RivalryLocks {
  const districtOf = new Map<string, string>();
  const teams: Team[] = [];
  regions.forEach((region, r) => region.forEach((district, d) => district.forEach((t) => (districtOf.set(t.id, `${r}-${d}`), teams.push(t)))));
  const key = (t: Team) => `${t.state ?? 'Texas'}|${t.name}`;
  const byKey = new Map(teams.map((t) => [key(t), t]));

  const candidates: { a: Team; b: Team; mutual: boolean }[] = [];
  const seen = new Set<string>();
  for (const a of teams) {
    const rival = rivalOf(a);
    const b = rival && byKey.get(`${rival.state}|${rival.school}`);
    if (!b || b.id === a.id) continue;
    const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const back = rivalOf(b);
    candidates.push({ a, b, mutual: back?.school === a.name && back.state === (a.state ?? 'Texas') });
  }
  candidates.sort((x, y) => Number(y.mutual) - Number(x.mutual) || x.a.name.localeCompare(y.a.name));

  const locks: RivalryLocks = { district: [], nonDistrict: [] };
  const used = { district: new Set<string>(), nonDistrict: new Set<string>() };
  for (const { a, b } of candidates) {
    const week = districtOf.get(a.id) === districtOf.get(b.id) ? 'district' : 'nonDistrict';
    if (used[week].has(a.id) || used[week].has(b.id)) continue;
    used[week].add(a.id).add(b.id);
    locks[week].push([a.id, b.id]);
  }
  return locks;
}

/** The coach's rivalry win: his boosters (Rating) and prestige go up. A loss costs nothing. */
export function applyRivalryWin(team: Team): void {
  team.programMeters.boosterApproval = Math.min(100, team.programMeters.boosterApproval + RIVALRY_WIN_BOOSTERS);
  team.prestige = Math.min(99, team.prestige + RIVALRY_WIN_PRESTIGE);
}

/** A rivalry name that is a trophy or a named game ("Jubilee Cup", "Battle for the Bell"), not "... Rivalry". */
export function isTrophyName(name: string): boolean {
  return !/\bRivalry$/.test(name.replace(/\s*\(.*\)$/, ''));
}

/** The headline for a rivalry game's final, from the side the story is about (`team` won or lost). */
export function rivalryHeadline(team: string, opponent: string, name: string, teamScore: number, opponentScore: number): string {
  const won = teamScore > opponentScore;
  const [high, low] = won ? [teamScore, opponentScore] : [opponentScore, teamScore];
  if (isTrophyName(name)) return won ? `${team} Wins the ${name}, ${high}-${low}` : `${opponent} Takes the ${name} From ${team}, ${high}-${low}`;
  return won ? `${team} Beats ${opponent} ${high}-${low} in the ${name}` : `${team} Falls to ${opponent} ${high}-${low} in the ${name}`;
}

/** The coach's rivalry games, as written down at each final (the series record and the Trophy Case read these). */
export interface RivalryResult {
  year: number;
  week: number;
  school: string; // the coach's school then
  opponent: string;
  name: string;
  won: boolean;
  score: string; // the coach's score first: "28-21"
}

/** The coach's series against a rival at one school: wins and losses. */
export function rivalrySeries(log: RivalryResult[], school: string, opponent: string): { wins: number; losses: number } {
  const games = log.filter((g) => g.school === school && g.opponent === opponent);
  return { wins: games.filter((g) => g.won).length, losses: games.filter((g) => !g.won).length };
}

/** The coach's view of a game: the rivalry's name, whose rivalry it is and the series so far, or null. */
export function rivalryFor(team: Team, opponent: Team, log: RivalryResult[] = []): { name: string; theirs: boolean; series: { wins: number; losses: number } } | null {
  const name = rivalryName(team, opponent);
  if (!name) return null;
  const own = rivalOf(team);
  const theirs = !(own?.school === opponent.name && own.state === (opponent.state ?? 'Texas'));
  return { name, theirs, series: rivalrySeries(log, team.name, opponent.name) };
}
