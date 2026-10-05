import { FeederProfile, FeederProspect, FeederStrategy, Player, Position, ProspectSource, ProspectSuitor, RecruitingFactor, Team } from '../types/game';
import { DEPTH_TEMPLATE, rebuildDepthChart } from './depthChart';
import { clamp, randomInt } from './math/variance';
import type { LeagueStructure } from './league';

// ============================================================================
// RECRUITING COMPETITION
// Rival programs compete for feeder prospects without keeping prospect lists of their own: each program
// has a feeder strategy and a hidden ethics rating, and rivals attach themselves to individual prospects.
// Every prospect weighs programs by their own priorities (playing time, winning, home, relationship,
// boosters). Programs that bend the rules build "heat" that may or may not catch up with them.
// ============================================================================

export const RECRUITING_FACTORS: RecruitingFactor[] = ['PLAYING_TIME', 'WINNING', 'HOME', 'RELATIONSHIP', 'BOOSTERS'];

export const FACTOR_LABELS: Record<RecruitingFactor, string> = {
  PLAYING_TIME: 'Playing time',
  WINNING: 'Winning',
  HOME: 'Staying home',
  RELATIONSHIP: 'Coach relationship',
  BOOSTERS: 'Boosters & facilities'
};

const BASE_PRIORITIES: Record<ProspectSource, Record<RecruitingFactor, number>> = {
  FEEDER_MIDDLE_SCHOOL: { HOME: 0.4, RELATIONSHIP: 0.25, PLAYING_TIME: 0.15, WINNING: 0.12, BOOSTERS: 0.08 },
  SEVEN_ON_SEVEN: { PLAYING_TIME: 0.3, RELATIONSHIP: 0.3, WINNING: 0.2, HOME: 0.1, BOOSTERS: 0.1 },
  MOVE_IN: { HOME: 0.3, WINNING: 0.25, PLAYING_TIME: 0.2, RELATIONSHIP: 0.15, BOOSTERS: 0.1 },
  STAR_RECRUIT: { WINNING: 0.35, PLAYING_TIME: 0.25, BOOSTERS: 0.2, RELATIONSHIP: 0.15, HOME: 0.05 },
  OUT_OF_DISTRICT: { HOME: 0.4, RELATIONSHIP: 0.22, WINNING: 0.18, PLAYING_TIME: 0.12, BOOSTERS: 0.08 },
  TRYOUT: { HOME: 0.5, RELATIONSHIP: 0.3, PLAYING_TIME: 0.1, WINNING: 0.05, BOOSTERS: 0.05 }
};

/** Each prospect's own priorities: the source's typical weights, individually shuffled. */
export function rollPriorities(source: ProspectSource): Record<RecruitingFactor, number> {
  const raw = RECRUITING_FACTORS.map((f) => [f, BASE_PRIORITIES[source][f] * (0.6 + Math.random() * 0.8)] as const);
  const total = raw.reduce((s, [, w]) => s + w, 0);
  return Object.fromEntries(raw.map(([f, w]) => [f, w / total])) as Record<RecruitingFactor, number>;
}

export function topPriority(p: FeederProspect): RecruitingFactor {
  return RECRUITING_FACTORS.reduce((best, f) => (p.priorities[f] > p.priorities[best] ? f : best), RECRUITING_FACTORS[0]);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface RecruitingContext {
  userTeamId: string;
  teamsById: Map<string, Team>;
  districtOf: Map<string, string>;
  regionOf: Map<string, number>;
}

export function buildRecruitingContext(league: LeagueStructure, teams: Team[], userTeamId: string): RecruitingContext {
  const districtOf = new Map<string, string>();
  const regionOf = new Map<string, number>();
  league.regions.forEach((region, r) =>
    region.districts.forEach((district) =>
      district.teamIds.forEach((id) => {
        districtOf.set(id, district.id);
        regionOf.set(id, r);
      })
    )
  );
  return { userTeamId, teamsById: new Map(teams.map((t) => [t.id, t])), districtOf, regionOf };
}

// ---------------------------------------------------------------------------
// Pull: how strongly a program attracts a specific prospect
// ---------------------------------------------------------------------------

function homeScore(p: FeederProspect, team: Team, ctx: RecruitingContext): number {
  const home = p.homeTeamId ?? (p.source === 'STAR_RECRUIT' ? undefined : ctx.userTeamId);
  if (!home) return 30; // relocating from out of state: nowhere is home yet
  if (team.id === home) return 100;
  if (ctx.districtOf.get(team.id) === ctx.districtOf.get(home)) return 55;
  if (ctx.regionOf.get(team.id) === ctx.regionOf.get(home)) return 35;
  return 15;
}

function playingTimeScore(p: FeederProspect, team: Team): number {
  const position: Position = p.projectedPosition;
  const returning = team.roster.filter((pl) => pl.position === position && pl.depthChartTier === 1 && pl.classYear !== 'Senior');
  if (returning.length < DEPTH_TEMPLATE[position].starters) return 90; // a starting job is open
  const weakest = Math.min(...returning.map((pl) => pl.overallRating));
  return clamp(50 + (p.trueOverall - weakest) * 3, 0, 100);
}

function winningScore(team: Team): number {
  const games = team.record.wins + team.record.losses;
  return 0.6 * team.prestige + 0.4 * (games ? team.record.wins / games : 0.5) * 100;
}

const boosterScore = (team: Team, inducement: boolean) => Math.min(100, team.programMeters.boosterApproval + (inducement ? 45 : 0));

/**
 * Stars and out-of-district players don't consider programs that haven't recruited them: below a
 * relationship of 50 a program's pull is discounted (down to 20%), except for the player's zoned school.
 */
function awareness(p: FeederProspect, team: Team, relationship: number): number {
  if (p.source !== 'STAR_RECRUIT' && p.source !== 'OUT_OF_DISTRICT') return 1;
  if (team.id === p.homeTeamId) return 1;
  return clamp(relationship / 50, 0.2, 1);
}

/** Weighted pull of a program on a prospect (0-100). */
export function programPull(p: FeederProspect, team: Team, relationship: number, inducement: boolean, ctx: RecruitingContext): number {
  const scores: Record<RecruitingFactor, number> = {
    PLAYING_TIME: playingTimeScore(p, team),
    WINNING: winningScore(team),
    HOME: homeScore(p, team, ctx),
    RELATIONSHIP: relationship,
    BOOSTERS: boosterScore(team, inducement)
  };
  return awareness(p, team, relationship) * RECRUITING_FACTORS.reduce((sum, f) => sum + p.priorities[f] * scores[f], 0);
}

const PULL_SHARPNESS = 4; // higher = the strongest pull wins more decisively
const STAY_HOME_PULL = 68; // out-of-area stars can simply stay where they are

export interface ChoiceShare {
  teamId: string | null; // null: stays home / out of state
  name: string;
  share: number;
}

/** How a prospect's decision splits between programs (the user, rival suitors, their zoned school, staying home). */
export function choiceShares(p: FeederProspect, ctx: RecruitingContext, includeUser = true): ChoiceShare[] {
  const options: { teamId: string | null; name: string; pull: number }[] = [];
  const user = ctx.teamsById.get(ctx.userTeamId);
  if (includeUser && user) options.push({ teamId: user.id, name: user.name, pull: programPull(p, user, p.interestScore, !!p.userInducement, ctx) });
  p.suitors.forEach((s) => {
    const team = ctx.teamsById.get(s.teamId);
    if (team) options.push({ teamId: team.id, name: team.name, pull: programPull(p, team, s.effort, s.inducement, ctx) });
  });
  if (p.homeTeamId && !options.some((o) => o.teamId === p.homeTeamId)) {
    const home = ctx.teamsById.get(p.homeTeamId);
    if (home) options.push({ teamId: home.id, name: home.name, pull: programPull(p, home, 55, false, ctx) });
  }
  if (p.source === 'STAR_RECRUIT') options.push({ teamId: null, name: 'Stays home', pull: STAY_HOME_PULL });

  const weights = options.map((o) => Math.pow(Math.max(1, o.pull), PULL_SHARPNESS));
  const total = weights.reduce((s, w) => s + w, 0);
  return options.map((o, i) => ({ teamId: o.teamId, name: o.name, share: weights[i] / total }));
}

// ---------------------------------------------------------------------------
// Rival suitors
// ---------------------------------------------------------------------------

function pickTeams(candidates: Team[], count: number): Team[] {
  const pool = [...candidates];
  const picked: Team[] = [];
  while (picked.length < count && pool.length) {
    // Higher-prestige programs are more likely to be in the mix
    const total = pool.reduce((s, t) => s + t.prestige, 0);
    let roll = Math.random() * total;
    const index = pool.findIndex((t) => (roll -= t.prestige) <= 0);
    picked.push(...pool.splice(index < 0 ? 0 : index, 1));
  }
  return picked;
}

function startingEffort(strategy: FeederStrategy | undefined, p: FeederProspect, teamId: string): number {
  if (p.homeTeamId === teamId) return randomInt(45, 65); // a program working its own zoned kid
  switch (strategy) {
    case 'RECRUIT_STARS':
      return p.source === 'STAR_RECRUIT' ? randomInt(45, 65) : randomInt(15, 30);
    case 'CHASE_TRANSFERS':
      return p.source === 'MOVE_IN' || p.source === 'OUT_OF_DISTRICT' ? randomInt(35, 55) : randomInt(15, 30);
    case 'STAND_PAT':
      return randomInt(5, 15);
    default:
      return randomInt(10, 30);
  }
}

/** Attaches rival programs to a prospect, depending on where the prospect comes from. */
export function assignSuitors(p: FeederProspect, ctx: RecruitingContext): FeederProspect {
  const userRegion = ctx.regionOf.get(ctx.userTeamId);
  const userDistrict = ctx.districtOf.get(ctx.userTeamId);
  const others = [...ctx.teamsById.values()].filter((t) => t.id !== ctx.userTeamId && t.id !== p.homeTeamId);
  const sameDistrict = others.filter((t) => ctx.districtOf.get(t.id) === userDistrict);
  const sameRegion = others.filter((t) => ctx.regionOf.get(t.id) === userRegion);
  let suitors: Team[] = [];

  switch (p.source) {
    case 'FEEDER_MIDDLE_SCHOOL':
      if (Math.random() < 0.1) suitors = pickTeams(Math.random() < 0.6 ? sameDistrict : sameRegion, 1); // rare
      break;
    case 'SEVEN_ON_SEVEN':
      if (Math.random() < 0.6) suitors = pickTeams(sameRegion, randomInt(1, 2));
      break;
    case 'MOVE_IN':
      if (Math.random() < 0.7) suitors = pickTeams(Math.random() < 0.5 ? sameDistrict : sameRegion, randomInt(1, 2));
      break;
    case 'OUT_OF_DISTRICT':
      if (Math.random() < 0.3) suitors = pickTeams(sameRegion, 1);
      break;
    case 'STAR_RECRUIT':
      suitors = pickTeams(others.filter((t) => t.prestige >= 85), randomInt(2, 3));
      break;
    default:
      break;
  }

  const list: ProspectSuitor[] = suitors.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    effort: startingEffort(t.feederProfile?.strategy, p, t.id),
    inducement: false
  }));
  if (p.homeTeamId) {
    const home = ctx.teamsById.get(p.homeTeamId);
    if (home) list.unshift({ teamId: home.id, teamName: home.name, effort: startingEffort(home.feederProfile?.strategy, p, home.id), inducement: false });
  }
  return { ...p, suitors: list };
}

/** A rival program's zoned player for the user to try to pull away (out-of-district prospects). */
export function pickHomeRival(ctx: RecruitingContext): Team | undefined {
  const userRegion = ctx.regionOf.get(ctx.userTeamId);
  const candidates = [...ctx.teamsById.values()].filter((t) => t.id !== ctx.userTeamId && ctx.regionOf.get(t.id) === userRegion);
  return candidates[randomInt(0, candidates.length - 1)];
}

// ---------------------------------------------------------------------------
// AI feeder strategy, weekly recruiting and rule-bending
// ---------------------------------------------------------------------------

/** A program's hidden integrity: most are honest-ish, some will cut corners. */
/** Chance an AI program changes head coach in an off-season (the new coach brings his own integrity). */
export const COACHING_CHANGE_CHANCE = 0.08;

export function initialFeederProfile(): FeederProfile {
  const r = Math.random();
  const ethics = r < 0.15 ? randomInt(10, 35) : r < 0.75 ? randomInt(40, 75) : randomInt(76, 95);
  return { strategy: 'BUILD_LOCAL', ethics, violationHeat: 0 };
}

/** Each off-season an AI coach picks how to work the feeder system. */
export function chooseFeederStrategy(team: Team): FeederStrategy {
  const graduatingStarters = team.roster.filter((p) => p.depthChartTier === 1 && p.classYear === 'Senior').length;
  if (team.prestige >= 85 && team.programMeters.boosterApproval >= 70 && Math.random() < 0.6) return 'RECRUIT_STARS';
  if (graduatingStarters >= 7 && Math.random() < 0.6) return 'CHASE_TRANSFERS';
  if ((team.programMeters.boosterApproval < 60 || team.prestige < 60) && Math.random() < 0.5) return 'STAND_PAT';
  return 'BUILD_LOCAL';
}

/** Freshman-class talent shift from an AI program's feeder strategy. */
export const STRATEGY_FRESHMAN_ADJUSTMENT: Record<FeederStrategy, number> = {
  BUILD_LOCAL: 2,
  CHASE_TRANSFERS: 0,
  RECRUIT_STARS: 0,
  STAND_PAT: -3
};

function weeklyEffortGain(strategy: FeederStrategy | undefined, p: FeederProspect, teamId: string): number {
  if (p.homeTeamId === teamId) return randomInt(0, 2); // a program keeps working its own zoned kids
  switch (strategy) {
    case 'RECRUIT_STARS':
      return p.source === 'STAR_RECRUIT' || p.trueOverall >= 72 ? randomInt(2, 4) : randomInt(0, 1);
    case 'CHASE_TRANSFERS':
      return p.source === 'MOVE_IN' || p.source === 'OUT_OF_DISTRICT' ? randomInt(2, 4) : randomInt(0, 1);
    case 'STAND_PAT':
      return Math.random() < 0.3 ? 1 : 0;
    default:
      return randomInt(0, 2);
  }
}

/** Heat added to a program for an illegal recruiting offer. */
export function inducementHeat(p: FeederProspect): number {
  return p.source === 'STAR_RECRUIT' ? 20 : 12;
}

/** How many prospects an AI program will work at once (its own zoned kids don't count). */
const targetLimit = (team: Team) => (team.feederProfile?.strategy === 'STAND_PAT' ? 2 : 4 + Math.round(team.prestige / 25));
const WEEKLY_NEW_TARGET_CHANCE: Record<FeederStrategy, number> = { RECRUIT_STARS: 0.7, CHASE_TRANSFERS: 0.6, BUILD_LOCAL: 0.5, STAND_PAT: 0.15 };

/**
 * AI programs recruit the shared pool: each week a program may add a new target (better prospects and ones
 * in its own district first), up to its limit. The prospect's zoned school is always in the mix.
 */
function addRivalTargets(pool: FeederProspect[], ctx: RecruitingContext): FeederProspect[] {
  const userRegion = ctx.regionOf.get(ctx.userTeamId);
  const schools = [...ctx.teamsById.values()].filter((t) => t.id !== ctx.userTeamId && ctx.regionOf.get(t.id) === userRegion);
  if (schools.length === 0 || pool.length === 0) return pool;
  const targetsOf = new Map<string, number>();
  pool.forEach((p) => p.suitors.forEach((s) => s.teamId !== p.homeTeamId && targetsOf.set(s.teamId, (targetsOf.get(s.teamId) ?? 0) + 1)));
  const next = [...pool];
  schools.forEach((school) => {
    const strategy = school.feederProfile?.strategy ?? 'BUILD_LOCAL';
    if ((targetsOf.get(school.id) ?? 0) >= targetLimit(school) || Math.random() > WEEKLY_NEW_TARGET_CHANCE[strategy]) return;
    const district = ctx.districtOf.get(school.id);
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const index = randomInt(0, next.length - 1);
      const p = next[index];
      if (p.homeTeamId === school.id || p.suitors.some((s) => s.teamId === school.id)) continue;
      const nearby = (p.homeTeamId ? ctx.districtOf.get(p.homeTeamId) === district : ctx.districtOf.get(ctx.userTeamId) === district) ? 8 : 0;
      const score = p.trueOverall + nearby + Math.random() * 10;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return;
    const p = next[bestIndex];
    next[bestIndex] = { ...p, suitors: [...p.suitors, { teamId: school.id, teamName: school.name, effort: startingEffort(strategy, p, school.id), inducement: false }] };
    targetsOf.set(school.id, (targetsOf.get(school.id) ?? 0) + 1);
  });
  return next;
}

/**
 * Rivals keep working their targets all year, until feeder signing day in pre season, and pick up new ones.
 * Low-ethics programs may have boosters make an illegal offer to a valuable prospect, which adds heat to
 * that program.
 */
export function advanceRivalRecruiting(pool: FeederProspect[], ctx: RecruitingContext, _week: number): FeederProspect[] {
  return addRivalTargets(pool, ctx).map((p) => {
    if (p.suitors.length === 0) return p;
    const suitors = p.suitors.map((s) => {
      const team = ctx.teamsById.get(s.teamId);
      const profile = team?.feederProfile;
      let { effort, inducement } = s;
      effort = clamp(effort + weeklyEffortGain(profile?.strategy, p, s.teamId), 0, 100);
      const valuable = p.source === 'STAR_RECRUIT' || p.trueOverall >= 72;
      if (profile && !inducement && valuable && profile.ethics < CLEAN_ETHICS && Math.random() < (CLEAN_ETHICS - profile.ethics) / 400) {
        inducement = true;
        profile.violationHeat += inducementHeat(p);
      }
      return { ...s, effort, inducement };
    });
    return { ...p, suitors };
  });
}

/** In-season detection: a small weekly chance that the evidence surfaces. */
export const weeklyDetectionChance = (heat: number) => heat / 1500;
/** Year-end investigation: a bigger roll; heat that isn't caught fades. */
export const yearEndDetectionChance = (heat: number) => heat / 300;
export const HEAT_DECAY = 0.75;

// ---------------------------------------------------------------------------
// Getting caught costs the roster, not just prestige: the players brought in with illegal offers are ruled
// ineligible, and the program spends two seasons on recruiting probation (weaker freshman classes, and no
// chasing stars, rivals' players or out-of-area prospects).
// ---------------------------------------------------------------------------

/** Programs at or above this integrity never make illegal offers; a caught program is brought up to it (it cleans up). */
export const CLEAN_ETHICS = 40;

/** Seasons on recruiting probation: the season the program is punished in and the next. */
export const PROBATION_SEASONS = 2;
/** Rating points off every generated freshman while a program is on probation. */
export const PROBATION_FRESHMAN_PENALTY = 3;

export const onProbation = (probationUntil: number | null | undefined, season: number) => probationUntil != null && probationUntil >= season;

/** Prospects a program on probation may not recruit: out-of-area stars, rivals' zoned players and the State and National lists. */
export const restrictedOnProbation = (p: FeederProspect) => !!p.scope || p.source === 'STAR_RECRUIT' || p.source === 'OUT_OF_DISTRICT';

/** The players who joined through illegal booster offers are ruled ineligible and leave the roster. */
export function removeImproperRecruits(team: Team): Player[] {
  const ineligible = team.roster.filter((p) => p.improperlyRecruited);
  if (ineligible.length === 0) return [];
  team.roster = team.roster.filter((p) => !p.improperlyRecruited);
  rebuildDepthChart(team.roster);
  return ineligible;
}
