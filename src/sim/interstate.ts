import { ScheduledGame, Team } from '../types/game';
import { teamStarterRating } from './macroSim';
import { FIRST_NON_DISTRICT_WEEK } from './scheduleEngine';
import { generateCompleteTeamRoster, programTalent } from '../generators/rosterGenerator';

// ---------------------------------------------------------------------------
// Out-of-state games open the season. Every league leaves its first game week (week 8) open, and that week
// every team in the country plays a team from another state of similar strength (neighbors first, like real
// border games and national showcases). In the second game week, teams an odd-sized state leaves idle meet
// idle teams from another state. The rest of the season stays in the state: non-district games in the
// region, then district play, with in-state fill-ins. These games link the states into one national network,
// which is what lets the computer rankings compare them.
// ---------------------------------------------------------------------------

export const INTERSTATE_WEEK = FIRST_NON_DISTRICT_WEEK; // the season opener
const LAST_INTERSTATE_WEEK = FIRST_NON_DISTRICT_WEEK + 1; // out-of-state fill-ins only in the first two game weeks

/** States whose teams commonly meet (borders and regional showcases); California's showcases go to Texas. */
export const STATE_NEIGHBORS: Record<string, string[]> = {
  Texas: ['Louisiana', 'California'],
  Louisiana: ['Texas', 'Alabama'],
  Alabama: ['Georgia', 'Tennessee', 'Florida', 'Louisiana'],
  Georgia: ['Florida', 'Alabama', 'Tennessee', 'North Carolina'],
  Florida: ['Georgia', 'Alabama'],
  Tennessee: ['Georgia', 'Alabama', 'North Carolina'],
  'North Carolina': ['Tennessee', 'Georgia', 'Maryland'],
  Maryland: ['Pennsylvania', 'North Carolina', 'New Jersey'],
  Pennsylvania: ['Ohio', 'New Jersey', 'Maryland'],
  'New Jersey': ['Pennsylvania', 'Maryland'],
  Ohio: ['Pennsylvania'],
  California: ['Texas']
};

// Rating points: a neighbor state's team wins a near tie. Kept small so games stay even (a big state like Texas would
// otherwise soak up its neighbors' teams as underdogs, and lopsided results would inflate its ratings)
const NON_NEIGHBOR_PENALTY = 0.5;

export interface StateLeagueSchedule {
  state: string;
  teams: Team[];
  schedule: ScheduledGame[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Pairs teams from different states for one week: in random order, each against the closest-rated team left from
 * another state, above or below it (neighbors preferred). Going strongest-first made the team choosing always the
 * favorite, and a big state's teams, which have to look past their own state's crowd, chose far more often: they
 * opened as favorites and their wins inflated their state in the computer rankings. `first` is placed before anyone
 * else (the coach's team always gets a game). Pairs that already met are skipped.
 */
function pairAcrossStates(
  pool: { team: Team; state: string; rating: number }[],
  week: number,
  year: number,
  met: Set<string>,
  first?: string
): ScheduledGame[] {
  const open = [...pool].map((e) => ({ e, key: e.team.id === first ? -1 : Math.random() })).sort((a, b) => a.key - b.key).map(({ e }) => e);
  const games: ScheduledGame[] = [];
  while (open.length > 1) {
    const me = open.shift()!;
    let best = -1;
    let bestScore = Infinity;
    open.forEach((other, i) => {
      if (other.state === me.state || met.has(pairKey(me.team.id, other.team.id))) return;
      const neighbor = (STATE_NEIGHBORS[me.state] ?? []).includes(other.state) || (STATE_NEIGHBORS[other.state] ?? []).includes(me.state);
      const score = Math.abs(other.rating - me.rating) + (neighbor ? 0 : NON_NEIGHBOR_PENALTY) + Math.random() * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0) continue;
    const [opponent] = open.splice(best, 1);
    const [home, away] = Math.random() < 0.5 ? [me.team, opponent.team] : [opponent.team, me.team];
    met.add(pairKey(home.id, away.id));
    games.push({ gameId: `y${year}_w${week}_${home.id}_${away.id}`, week, homeTeamId: home.id, awayTeamId: away.id, isDistrictGame: false });
  }
  return games;
}

/**
 * The season's out-of-state games: everyone in week 8, then week-9 fill-ins for teams their own league leaves
 * idle (odd-sized states). League schedules must already leave week 8 open.
 */
export function scheduleInterstateGames(
  leagues: StateLeagueSchedule[],
  year: number,
  firstTeamId?: string,
  ratingOf: (team: Team) => number = teamStarterRating // pairing strength (default: today's game-day rating)
): ScheduledGame[] {
  const entries = leagues.flatMap((l) => l.teams.map((team) => ({ team, state: l.state, rating: ratingOf(team) })));
  const met = new Set(leagues.flatMap((l) => l.schedule.map((g) => pairKey(g.homeTeamId, g.awayTeamId))));
  const games = pairAcrossStates(entries, INTERSTATE_WEEK, year, met, firstTeamId);
  for (let week = INTERSTATE_WEEK + 1; week <= LAST_INTERSTATE_WEEK; week++) {
    const busy = new Set([...leagues.flatMap((l) => l.schedule), ...games].filter((g) => g.week === week).flatMap((g) => [g.homeTeamId, g.awayTeamId]));
    const idle = entries.filter((e) => !busy.has(e.team.id));
    games.push(...pairAcrossStates(idle, week, year, met, idle.some((e) => e.team.id === firstTeamId) ? firstTeamId : undefined));
  }
  return games;
}

/**
 * A light team the coach will face gets a full roster (generated the way its league's rosters are), so the
 * game can be played live. It keeps playing its own league with that roster.
 */
export function expandToFullRoster(team: Team): void {
  if (team.lightRating === undefined) return;
  team.roster = generateCompleteTeamRoster(programTalent(team.prestige, team.state), team.nameProfile);
  delete team.lightRating;
}
