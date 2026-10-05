import { FeederOutcome, FeederProspect, PotentialGrade, Team } from '../types/game';
import { clamp, randomInt } from './math/variance';
import { COMMIT_THRESHOLD, createProspect, prospectRankScore, prospectToPlayer, RivalSigning, schoolInterest, signProspect } from './feederEngine';
import { RecruitingContext } from './feederCompetition';
import type { LightLeague } from './nationalWorld';

// ---------------------------------------------------------------------------
// The wide pools: prospects beyond the user's region. STATE: the best kids zoned to schools in the state's other
// regions (only states with more than one region, i.e. Texas; elsewhere the region pool is the whole state).
// NATIONAL: the best incoming class in every other playable state. Anyone can be recruited, but it is harder
// the farther away he lives: contacts earn less interest, and winning his commitment still needs his family to
// agree to move. These lists are kept apart from the regional pool, whose rivals and signing rules are local.
// ---------------------------------------------------------------------------

export type WideScope = 'STATE' | 'NATIONAL';

/** Interest a contact earns, by distance: a state-wide kid is a long drive, a national one a plane ride. */
export const WIDE_CONTACT_FACTOR: Record<WideScope, number> = { STATE: 0.75, NATIONAL: 0.5 };
/** Chance a family moves when the user wins the commitment. */
export const RELOCATION_CHANCE: Record<WideScope, number> = { STATE: 0.7, NATIONAL: 0.45 };

const STATE_PROSPECT_CHANCE = 0.3; // per school in the other regions
const NATIONAL_PER_STATE = 15;

/** A wide-pool prospect: a strong player (A or B potential), zoned to a school that is working him. */
function wideProspect(
  scope: WideScope,
  home: Team,
  names: Set<string>,
  homeState: string
): FeederProspect {
  const p = createProspect('OUT_OF_DISTRICT', home, names, home);
  const potential: PotentialGrade = Math.random() < 0.15 ? 'A+' : Math.random() < 0.55 ? 'A' : 'B';
  return {
    ...p,
    scope,
    homeState,
    truePotential: potential,
    trueOverall: clamp(p.trueOverall + (potential === 'B' ? 1 : 4), 35, 95),
    interestScore: randomInt(0, 10), // he has barely heard of the user's program
    middleSchool: `Zoned to ${home.name}${scope === 'NATIONAL' ? ` (${homeState})` : ''}`,
    suitors: [{ teamId: home.id, teamName: home.name, effort: randomInt(45, 65), inducement: false }]
  };
}

/** Picks a school with a lean toward higher prestige (strong programs produce more top kids). */
function pickSchool(schools: Team[]): Team {
  const total = schools.reduce((s, t) => s + t.prestige, 0);
  let roll = Math.random() * total;
  return schools.find((t) => (roll -= t.prestige) <= 0) ?? schools[0];
}

/** This year's State and National lists. */
export function generateWidePool(ctx: RecruitingContext, userState: string, nationalLeagues: LightLeague[]): FeederProspect[] {
  const names = new Set<string>();
  const userRegion = ctx.regionOf.get(ctx.userTeamId);
  const otherRegions = [...ctx.teamsById.values()].filter((t) => ctx.regionOf.get(t.id) !== userRegion);
  const state = otherRegions.filter(() => Math.random() < STATE_PROSPECT_CHANCE).map((school) => wideProspect('STATE', school, names, userState));
  const national = nationalLeagues.flatMap((light) =>
    Array.from({ length: NATIONAL_PER_STATE }, () => wideProspect('NATIONAL', pickSchool(light.teams), names, light.state))
  );
  return [...state, ...national].sort((a, b) => prospectRankScore(b) - prospectRankScore(a));
}

/** Weekly: each zoned school keeps working its kid; the user's once-a-week contacts reset. */
export function advanceWidePool(pool: FeederProspect[]): FeederProspect[] {
  return pool.map((p) => ({
    ...p,
    actionsThisWeek: [],
    suitors: p.suitors.map((s) => ({ ...s, effort: clamp(s.effort + randomInt(0, 2), 0, 100) }))
  }));
}

/** The chance he ends up with the user: winning the commitment (or close to it), then his family moving. */
export function wideJoinProbability(p: FeederProspect, userTeamId: string): number {
  const scope = p.scope ?? 'STATE';
  const [top, next] = schoolInterest(p, userTeamId);
  if (top.teamId === userTeamId && top.interest >= COMMIT_THRESHOLD) return RELOCATION_CHANCE[scope] * (next && next.interest === top.interest ? 0.5 : 1);
  // Not committed: only a slim chance he picks a faraway school on his own
  const mine = schoolInterest(p, userTeamId).find((e) => e.teamId === userTeamId)!.interest;
  return clamp((mine - 50) / 400, 0, 0.1) * RELOCATION_CHANCE[scope];
}

/**
 * Signing day for the wide pools: a prospect whose highest interest (80+) is the user's comes if his family
 * agrees to move; anyone else stays with his zoned school (state rivals in the user's league add him to their
 * roster; other states' light teams keep only their stat leaders, so nothing changes there). Outcomes are
 * reported only for prospects the user recruited.
 */
export function resolveWidePool(
  pool: FeederProspect[],
  ctx: RecruitingContext
): { joined: ReturnType<typeof prospectToPlayer>[]; rivalSignings: RivalSigning[]; outcomes: FeederOutcome[] } {
  const joined: ReturnType<typeof prospectToPlayer>[] = [];
  const rivalSignings: RivalSigning[] = [];
  const outcomes: FeederOutcome[] = [];
  pool.forEach((p) => {
    const recruited = p.coachContacts > 0;
    const base = { prospectId: p.id, prospectName: p.name, source: p.source, position: p.projectedPosition };
    const userWins = Math.random() < wideJoinProbability(p, ctx.userTeamId);
    if (userWins) {
      const player = signProspect(p, ctx.userTeamId, ctx.userTeamId);
      joined.push(player);
      outcomes.push({ ...base, outcome: 'JOINED', playerId: player.id, overall: p.trueOverall });
      return;
    }
    const home = p.suitors[0];
    if (home && ctx.teamsById.has(home.teamId)) rivalSignings.push({ teamId: home.teamId, player: signProspect(p, home.teamId) });
    if (recruited) outcomes.push({ ...base, outcome: 'OTHER_SCHOOL', destinationTeamId: home?.teamId, destinationName: home ? `${home.teamName}${p.scope === 'NATIONAL' ? ` (${p.homeState})` : ''}` : 'Stayed home' });
  });
  return { joined, rivalSignings, outcomes };
}
