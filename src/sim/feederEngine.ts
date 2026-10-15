import { BoosterOffer, FeederOutcome, FeederOutcomeType, FeederProspect, Player, PlayerClass, Position, PotentialGrade, ProspectSource, Team } from '../types/game';
import { LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { generateProceduralPlayer, INTAKE_SHIFT, programTalent, rollTalent } from '../generators/rosterGenerator';
import { NameProfile, randomPlayerName } from '../generators/names';
import { RecruitingContext, assignSuitors, choiceShares, pickHomeRival, rollPriorities } from './feederCompetition';
import { clamp, randomInt } from './math/variance';
import { activeBoosterOffers, BOOSTER_OFFERS } from './compliance';

// ============================================================================
// FEEDER PIPELINE (design spec 14, expanded)
// The pool holds next season's potential newcomers: district middle schoolers, 7-on-7 athletes who
// don't play tackle, families moving in, out-of-area stars (top programs only) and tryout walk-ons.
// Coaching events and personal contact shape who actually comes out; scouting only reveals ratings.
// ============================================================================

export const MIN_POOL_SIZE = 15;
export const MAX_POOL_SIZE = 60; // room for programs to grow the district pipeline (balance review 2026-10-14)
export const STAR_RECRUIT_MIN_PRESTIGE = 85; // older saves' pools still hold out-of-area stars
export const MAX_VARSITY_ROSTER = 73; // newcomers beyond this play JV instead (base roster is 70)

export const SOURCE_LABELS: Record<ProspectSource, string> = {
  FEEDER_MIDDLE_SCHOOL: 'District Middle Schools',
  SEVEN_ON_SEVEN: '7-on-7 Athletes',
  MOVE_IN: 'Move-Ins',
  STAR_RECRUIT: 'Out-of-Area Stars',
  OUT_OF_DISTRICT: 'Zoned Elsewhere',
  TRYOUT: 'Tryout Walk-Ons'
};


export const PROSPECT_ACTION_COSTS = { SCOUT: 10, VISIT: 15, PITCH_STAR: 40 };

/** The ways a coach contacts a prospect: each costs Coach Points, adds interest, and can be used once a week. */
export type ContactAction = 'TEXT' | 'EMAIL' | 'CALL' | 'VISIT' | 'INVITE' | 'WINE_AND_DINE';
export const CONTACT_ACTIONS: Record<ContactAction, { label: string; cost: number; interest: number }> = {
  TEXT: { label: 'Text', cost: 5, interest: 2 },
  EMAIL: { label: 'Email', cost: 15, interest: 4 },
  CALL: { label: 'Call', cost: 20, interest: 6 },
  VISIT: { label: 'Visit', cost: 30, interest: 9 },
  INVITE: { label: 'Invite', cost: 40, interest: 12 }, // a campus / game-night visit
  WINE_AND_DINE: { label: 'Wine & Dine', cost: 50, interest: 15 }
};
export const CONTACT_ORDER: ContactAction[] = ['TEXT', 'EMAIL', 'CALL', 'VISIT', 'INVITE', 'WINE_AND_DINE'];

/** Interest a contact adds: the full amount early, less once he is warm (60+) and less again once he is near committing (80+). */
export function contactGain(p: FeederProspect, action: ContactAction, staffBonus = 0): number {
  // Stars are harder to impress; faraway kids (the State and National lists) too
  const distance = p.scope === 'NATIONAL' ? 0.5 : p.scope === 'STATE' ? 0.75 : 1;
  // The JV head coach's Feeder Pipeline adds a share on top
  const base = CONTACT_ACTIONS[action].interest * (p.source === 'STAR_RECRUIT' ? 0.5 : 1) * distance * (1 + staffBonus);
  const scale = p.interestScore >= 80 ? 0.6 : p.interestScore >= 60 ? 0.8 : 1;
  return Math.max(1, Math.round(base * scale));
}

/** One contact with a prospect (the caller checks Coach Points and the once-a-week limit). */
export function contactProspect(p: FeederProspect, action: ContactAction, staffBonus = 0): FeederProspect {
  const contacted = {
    ...p,
    interestScore: clamp(p.interestScore + contactGain(p, action, staffBonus), 0, 100),
    coachContacts: p.coachContacts + 1,
    actionsThisWeek: [...(p.actionsThisWeek ?? []), action]
  };
  return withEvaluation(contacted);
}

export type FeederEventType =
  | 'YOUTH_CLINIC'
  | 'SEVEN_ON_SEVEN_LEAGUE'
  | 'LOCKDOWN_LEAGUE'
  | 'TRYOUT_DAY'
  | 'FAMILY_NIGHT'
  | 'QB_ACADEMY'
  | 'BALL_CARRIER_CLINIC'
  | 'ROUTE_RUNNERS_SCHOOL'
  | 'THE_TRENCHES'
  | 'WAR_ZONE'
  | 'LINEBACKER_U'
  | 'THE_NICKEL'
  | 'SPECIALIST_SHOWCASE'
  | 'COMBINE';

export type ProgramGroup = 'DISCOVER' | 'INTEREST' | 'POSITION' | 'SCOUT';

export interface FeederProgram {
  label: string;
  group: ProgramGroup;
  cost: number;
  every: number; // weeks before it can run again (its cooldown)
  positions?: Position[];
  description: string;
}

// ---------------------------------------------------------------------------
// Programs run all year except the post season (balance review 2026-10-14). They are the main way to build the
// district pipeline: discovery programs find new prospects, interest programs lift everyone, position programs
// work one position group (interest, a rating point, sometimes a new prospect), and the Combine scouts. Coach
// Points are the limit; each program has its own cooldown.
// ---------------------------------------------------------------------------
const POSITION_PROGRAM = { group: 'POSITION' as const, cost: 40, every: 3, description: 'Prospects at these positions: +6–10 interest and +1 rating (up to +3 each); sometimes a new one comes out.' };

export const FEEDER_EVENTS: Record<FeederEventType, FeederProgram> = {
  YOUTH_CLINIC: {
    label: 'Youth Football Clinic',
    group: 'DISCOVER',
    cost: 60,
    every: 4,
    description: '2–3 new middle schoolers; every district middle schooler +1 rating and +4–8 interest.'
  },
  SEVEN_ON_SEVEN_LEAGUE: {
    label: '7-on-7 League Night',
    group: 'DISCOVER',
    cost: 50,
    every: 4,
    positions: ['QB', 'RB', 'WR', 'TE'],
    description: '1–2 new offensive athletes; offensive prospects +5–10 interest.'
  },
  LOCKDOWN_LEAGUE: {
    label: 'Lockdown League',
    group: 'DISCOVER',
    cost: 50,
    every: 4,
    positions: ['LB', 'CB', 'S'],
    description: '1–2 new defensive athletes; defensive prospects +5–10 interest.'
  },
  TRYOUT_DAY: { label: 'Community Tryout Day', group: 'INTEREST', cost: 60, every: 4, description: '+5 interest for every prospect in your pipeline, and 1–2 walk-ons.' },
  FAMILY_NIGHT: { label: 'Family Night Cookout', group: 'INTEREST', cost: 120, every: 8, description: '+10 interest for every prospect in your pipeline.' },
  QB_ACADEMY: { ...POSITION_PROGRAM, label: 'Quarterback Academy', positions: ['QB'] },
  BALL_CARRIER_CLINIC: { ...POSITION_PROGRAM, label: 'Ball Carrier Clinic', positions: ['RB'] },
  ROUTE_RUNNERS_SCHOOL: { ...POSITION_PROGRAM, label: 'Route Runners School', positions: ['WR', 'TE'] },
  THE_TRENCHES: { ...POSITION_PROGRAM, label: 'The Trenches', positions: ['OT', 'OG', 'C'] },
  WAR_ZONE: { ...POSITION_PROGRAM, label: 'War Zone', positions: ['DE', 'DT'] },
  LINEBACKER_U: { ...POSITION_PROGRAM, label: 'Linebacker U', positions: ['LB'] },
  THE_NICKEL: { ...POSITION_PROGRAM, label: 'The Nickel', positions: ['CB', 'S'] },
  SPECIALIST_SHOWCASE: { ...POSITION_PROGRAM, label: 'Specialist Showcase', positions: ['K', 'P'] },
  COMBINE: {
    label: 'Speed & Strength Combine',
    group: 'SCOUT',
    cost: 25,
    every: 3,
    description: 'Reveals potential, speed and strength for five unscouted prospects.'
  }
};

/** A program can't raise one prospect's rating more than this. */
export const MAX_PROGRAM_BOOST = 3;

export const LINE_POSITIONS: Position[] = ['OT', 'OG', 'C', 'DE', 'DT'];
export const SKILL_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'CB', 'S'];
const COMBINE_SCOUTS = 5;
const POSITION_PROGRAM_FIND_CHANCE = 0.4;

const MIDDLE_SCHOOLS = ['Lakeview MS', 'Cedar Creek MS', 'Oak Hill MS', 'Pecan Springs MS', 'Riverbend MS', 'Canyon Vista MS', 'Bluebonnet MS', 'Live Oak MS'];
const SEVEN_ON_SEVEN_CLUBS = ['Texas Elite 7v7', 'Lone Star Legends', 'Hill Country Hurricanes', 'Gulf Coast Speed', 'DFW Prime', 'Alamo City Ballers'];
const MOVE_IN_HOMETOWNS = ['Oklahoma City', 'Phoenix', 'Baton Rouge', 'Denver', 'Kansas City', 'Little Rock', 'Albuquerque', 'Tulsa'];
const STAR_HOMETOWNS = ['Miami, FL', 'Atlanta, GA', 'Los Angeles, CA', 'New Orleans, LA', 'Mobile, AL', 'Las Vegas, NV'];

const POSITION_WEIGHTS: [Position, number][] = [
  ['QB', 6], ['RB', 8], ['WR', 12], ['TE', 5], ['OT', 8], ['OG', 8], ['C', 4],
  ['DE', 8], ['DT', 7], ['LB', 10], ['CB', 10], ['S', 8], ['K', 1.5], ['P', 1.5]
];
const ATHLETE_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'LB', 'CB', 'S']; // what 7-on-7 develops

const pick = <T,>(items: T[]): T => items[randomInt(0, items.length - 1)];

function weightedPosition(): Position {
  const total = POSITION_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [pos, w] of POSITION_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return pos;
  }
  return 'WR';
}

let prospectCounter = 0;

/** Who a prospect is generated for: the program's prestige and its regional name mix. */
export interface ProspectOwner {
  prestige: number;
  nameProfile?: NameProfile;
}

/** Creates one prospect from a source profile (hidden ratings, starting interest, departure risk, priorities). */
export function createProspect(
  source: ProspectSource,
  team: ProspectOwner,
  takenNames: Set<string> = new Set(),
  homeTeam?: { id: string; name: string; prestige?: number; state?: string }
): FeederProspect {
  const prestigeLean = (team.prestige - 75) / 2;
  const talent = rollTalent();
  let position = weightedPosition();
  let incomingClass: PlayerClass = 'Freshman';
  let overall: number;
  let potential: PotentialGrade = talent.potential;
  let interest: number;
  let origin: string;
  let speedBonus = 0;
  let transferRisk = 0.1;

  switch (source) {
    case 'FEEDER_MIDDLE_SCHOOL':
      overall = talent.ovr - randomInt(4, 8);
      interest = randomInt(35, 65) + prestigeLean;
      origin = pick(MIDDLE_SCHOOLS);
      break;
    case 'SEVEN_ON_SEVEN':
      position = pick(ATHLETE_POSITIONS);
      incomingClass = pick<PlayerClass>(['Freshman', 'Sophomore', 'Junior']);
      overall = talent.ovr - randomInt(3, 7); // raw at tackle football, but explosive athletes
      speedBonus = randomInt(6, 14);
      interest = randomInt(15, 40) + prestigeLean / 2;
      origin = pick(SEVEN_ON_SEVEN_CLUBS);
      break;
    case 'MOVE_IN':
      incomingClass = pick<PlayerClass>(['Freshman', 'Freshman', 'Sophomore', 'Junior', 'Senior']);
      overall = talent.ovr - (incomingClass === 'Freshman' ? randomInt(4, 8) : randomInt(0, 4));
      interest = randomInt(45, 75);
      origin = `Moving from ${pick(MOVE_IN_HOMETOWNS)}`;
      transferRisk = 0.05;
      break;
    case 'STAR_RECRUIT':
      incomingClass = pick<PlayerClass>(['Freshman', 'Sophomore', 'Junior']);
      overall = randomInt(80, 92) - (incomingClass === 'Freshman' ? 4 : 0);
      potential = Math.random() < 0.4 ? 'A+' : 'A';
      interest = randomInt(5, 25) + Math.max(0, prestigeLean / 2);
      origin = pick(STAR_HOMETOWNS);
      speedBonus = randomInt(0, 6);
      transferRisk = 0;
      break;
    case 'OUT_OF_DISTRICT': {
      // A rival's zoned player: the kind of starter material his school draws (its prestige and state), so the
      // programs around the coach's don't sign better classes than the rest of the state
      const homeTalent = homeTeam?.prestige !== undefined ? programTalent(homeTeam.prestige, homeTeam.state) : 0;
      incomingClass = pick<PlayerClass>(['Freshman', 'Freshman', 'Sophomore']);
      overall = talent.ovr + homeTalent - (incomingClass === 'Freshman' ? randomInt(4, 8) : randomInt(0, 3));
      interest = randomInt(5, 25) + Math.max(0, prestigeLean / 2);
      origin = homeTeam ? `Zoned to ${homeTeam.name}` : 'Neighboring district';
      transferRisk = 0.05;
      break;
    }
    case 'TRYOUT':
    default:
      incomingClass = pick<PlayerClass>(['Freshman', 'Freshman', 'Sophomore', 'Junior']);
      overall = randomInt(36, 50);
      potential = Math.random() < 0.25 ? 'C' : 'D';
      interest = randomInt(70, 95);
      origin = 'Student body';
      transferRisk = 0.05;
      break;
  }

  overall = clamp(Math.round(overall) - (source === 'TRYOUT' ? 0 : INTAKE_SHIFT), 35, 95);
  const { firstName, lastName } = randomPlayerName(team.nameProfile, takenNames);
  const name = `${firstName} ${lastName}`;
  return {
    id: `prospect_${Date.now()}_${++prospectCounter}`,
    name,
    source,
    middleSchool: origin,
    projectedPosition: position,
    incomingClass,
    trueOverall: overall,
    truePotential: potential,
    trueSpeed: clamp(overall + randomInt(-5, 5) + speedBonus, 40, 99),
    trueStrength: clamp(overall + randomInt(-6, 4), 40, 99),
    revealedPotential: 'UNKNOWN',
    scoutedSpeed: null,
    scoutedStrength: null,
    interestScore: clamp(Math.round(interest), 0, 100),
    coachContacts: 0,
    isTransferRisk: Math.random() < transferRisk,
    priorities: rollPriorities(source),
    suitors: [],
    ...(homeTeam && { homeTeamId: homeTeam.id })
  };
}

/** Creates a prospect and, when a league context is available, attaches rival suitors. */
function createCompetedProspect(source: ProspectSource, team: Team, takenNames: Set<string>, ctx?: RecruitingContext): FeederProspect {
  if (!ctx) return createProspect(source, team, takenNames);
  const home = source === 'OUT_OF_DISTRICT' ? pickHomeRival(ctx) : undefined;
  return assignSuitors(createProspect(source, team, takenNames, home), ctx);
}

/**
 * The shared regional pool. Your own pipeline (15-40: district middle schoolers, 7-on-7 athletes, move-ins and
 * walk-ons, bigger for higher-prestige programs) plus, with a league context, the prospects zoned to every
 * other school in the region: 3-5 from each school in your district and 1-2 from each school elsewhere in the
 * region. Every program in the region can recruit any of them; their own zoned school starts ahead.
 */
export function generateFeederPool(team: Team, ctx?: RecruitingContext): FeederProspect[] {
  const counts: [ProspectSource, number][] = [
    ['FEEDER_MIDDLE_SCHOOL', 9 + Math.round(team.prestige / 10) + randomInt(-2, 2)],
    ['SEVEN_ON_SEVEN', randomInt(3, 6)],
    ['MOVE_IN', randomInt(1, 3)],
    ['TRYOUT', randomInt(2, 4)]
  ];
  const names = new Set<string>();
  const pool = counts.flatMap(([source, n]) => Array.from({ length: n }, () => createCompetedProspect(source, team, names, ctx)));
  while (pool.length < MIN_POOL_SIZE) pool.push(createCompetedProspect('FEEDER_MIDDLE_SCHOOL', team, names, ctx));
  const full = [...pool.slice(0, MAX_POOL_SIZE), ...(ctx ? regionProspects(team, ctx, names) : [])];
  return ctx ? ensureTopTalent(full, ctx) : full;
}

const isALevel = (p: FeederProspect) => p.truePotential === 'A' || p.truePotential === 'A+';
const isBLevel = (p: FeederProspect) => p.truePotential === 'B';

/** Whether a prospect belongs to the user's district (his zoned school's district, or the user's own pipeline). */
export function inUserDistrict(p: FeederProspect, ctx: RecruitingContext): boolean {
  return !p.homeTeamId || ctx.districtOf.get(p.homeTeamId) === ctx.districtOf.get(ctx.userTeamId);
}

/**
 * The Top 10 lists: the region's ten best A-level prospects, and the district's five best A-level and five
 * best B-level prospects.
 */
export function topTenLists(pool: FeederProspect[], ctx: RecruitingContext): { region: FeederProspect[]; district: FeederProspect[] } {
  const ranked = [...pool].sort((a, b) => prospectRankScore(b) - prospectRankScore(a));
  const district = ranked.filter((p) => inUserDistrict(p, ctx));
  return {
    region: ranked.filter(isALevel).slice(0, 10),
    district: [...district.filter(isALevel).slice(0, 5), ...district.filter(isBLevel).slice(0, 5)].sort((a, b) => prospectRankScore(b) - prospectRankScore(a))
  };
}

/**
 * Every pool has the talent the Top 10 lists need: at least ten A-level prospects in the region, and five
 * A-level and five B-level in the user's district. The best of the rest are upgraded to fill any gap.
 */
function ensureTopTalent(pool: FeederProspect[], ctx: RecruitingContext): FeederProspect[] {
  const next = [...pool];
  const upgrade = (eligible: (p: FeederProspect) => boolean, count: number, to: PotentialGrade, boost: number) => {
    next
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => eligible(p) && p.source !== 'TRYOUT')
      .sort((a, b) => b.p.trueOverall - a.p.trueOverall)
      .slice(0, Math.max(0, count))
      .forEach(({ p, i }) => (next[i] = { ...p, truePotential: to, trueOverall: Math.min(99, p.trueOverall + boost) }));
  };
  const district = (p: FeederProspect) => inUserDistrict(p, ctx);
  // A-level first (from the best non-A prospects), then fill the district's B-level spots from C and D
  upgrade((p) => district(p) && !isALevel(p), 5 - next.filter((p) => district(p) && isALevel(p)).length, 'A', 3);
  upgrade((p) => !isALevel(p) && !district(p), 10 - next.filter(isALevel).length, 'A', 3);
  upgrade((p) => district(p) && !isALevel(p) && !isBLevel(p), 5 - next.filter((p) => district(p) && isBLevel(p)).length, 'B', 2);
  return next;
}

/** Prospects zoned to the other schools in the user's region (the shared part of the pool). */
function regionProspects(team: Team, ctx: RecruitingContext, names: Set<string>): FeederProspect[] {
  const userDistrict = ctx.districtOf.get(ctx.userTeamId);
  const userRegion = ctx.regionOf.get(ctx.userTeamId);
  return [...ctx.teamsById.values()]
    .filter((t) => t.id !== ctx.userTeamId && ctx.regionOf.get(t.id) === userRegion)
    .flatMap((school) => {
      const count = ctx.districtOf.get(school.id) === userDistrict ? randomInt(3, 5) : randomInt(1, 2);
      return Array.from({ length: count }, () => assignSuitors(createProspect('OUT_OF_DISTRICT', team, names, school), ctx));
    });
}

/** Prospects in the user's own pipeline: zoned to the user's school (or nobody's), or already interested. */
export const inUserPipeline = (p: FeederProspect) => !p.homeTeamId || p.interestScore >= 40;

const POTENTIAL_POINTS: Record<PotentialGrade, number> = { 'A+': 12, A: 9, B: 5, C: 2, D: 0 };
/** The public prospect ranking (what recruiting services say about him), used for the Top 10 lists. */
export const prospectRankScore = (p: FeederProspect) => p.trueOverall + POTENTIAL_POINTS[p.truePotential];

/** Interest at or above this makes a verbal commitment; the highest committed school wins on signing day. */
export const COMMIT_THRESHOLD = 80;
const INDUCEMENT_INTEREST = 10; // a booster offer is worth this much interest on signing day

/** Every school's interest in a prospect (the user's and each rival's), highest first. */
export function schoolInterest(p: FeederProspect, userTeamId: string): { teamId: string; interest: number }[] {
  return [{ teamId: userTeamId, interest: p.interestScore + (p.userInducement ? INDUCEMENT_INTEREST : 0) }, ...p.suitors.map((s) => ({ teamId: s.teamId, interest: s.effort + (s.inducement ? INDUCEMENT_INTEREST : 0) }))]
    .map((e) => ({ ...e, interest: Math.min(100, e.interest) }))
    .sort((a, b) => b.interest - a.interest);
}

/** Where the prospect is committed right now (80+ interest; ties at the top stay open until signing day). */
export function currentCommitment(p: FeederProspect, userTeamId: string): { teamId: string; interest: number; tied: boolean } | null {
  const [top, next] = schoolInterest(p, userTeamId);
  if (!top || top.interest < COMMIT_THRESHOLD) return null;
  return { ...top, tied: next !== undefined && next.interest === top.interest };
}

export function interestLabel(score: number): string {
  if (score >= 75) return 'Hot';
  if (score >= 50) return 'Warm';
  if (score >= 25) return 'Lukewarm';
  return 'Cold';
}

/** Interest at which a prospect counts as evaluated: he's close enough to the program for a real look. */
export const EVALUATION_INTEREST = 50;
/** Evaluated: scouted (e.g. at a combine) or interested enough (50+). */
export const isEvaluated = (p: FeederProspect) => p.revealedPotential !== 'UNKNOWN' || p.interestScore >= EVALUATION_INTEREST;
/** Records the evaluation once he reaches 50 interest, so it stays if his interest later falls. */
/** A booster offer from the coach: its interest right away (each offer once per prospect). */
export function boostProspect(p: FeederProspect, offer: BoosterOffer): FeederProspect {
  if (p.boosterOffers?.includes(offer)) return p;
  return withEvaluation({ ...p, interestScore: Math.min(100, p.interestScore + BOOSTER_OFFERS[offer].interest), boosterOffers: [...(p.boosterOffers ?? []), offer] });
}

export const withEvaluation = (p: FeederProspect) => (p.revealedPotential === 'UNKNOWN' && p.interestScore >= EVALUATION_INTEREST ? scoutProspect(p) : p);

/** Scouting reveals potential, speed and strength (useful, but it doesn't change anyone's mind). */
export function scoutProspect(p: FeederProspect): FeederProspect {
  return { ...p, revealedPotential: p.truePotential, scoutedSpeed: p.trueSpeed, scoutedStrength: p.trueStrength };
}

/** A home visit / meeting with the family: big early impact, diminishing with repeated contact. Stars barely move. */
export function visitProspect(p: FeederProspect): FeederProspect {
  const gain = p.source === 'STAR_RECRUIT' ? Math.max(1, 4 - p.coachContacts) : Math.max(3, 14 - 3 * p.coachContacts);
  return { ...p, interestScore: clamp(p.interestScore + gain, 0, 100), coachContacts: p.coachContacts + 1 };
}

/** The full recruiting pitch to an out-of-area star: expensive and a long shot. */
export function pitchStarRecruit(p: FeederProspect, team: Team): FeederProspect {
  if (p.source !== 'STAR_RECRUIT') return p;
  const gain = Math.max(1, Math.round((randomInt(2, 6) - Math.floor(p.coachContacts / 4)) * (team.prestige >= 92 ? 1.25 : 1)));
  return { ...p, interestScore: clamp(p.interestScore + gain, 0, 100), coachContacts: p.coachContacts + 1 };
}

/** Runs an off-season program event; returns the updated pool and any newly discovered prospects. */
export function runFeederEvent(
  pool: FeederProspect[],
  type: FeederEventType,
  team: Team,
  ctx?: RecruitingContext,
  interestFactor: (p: FeederProspect) => number = () => 1 // the staff's recruiters and Family Ties
): { pool: FeederProspect[]; discovered: FeederProspect[] } {
  const room = () => MAX_POOL_SIZE - pool.filter((p) => !p.homeTeamId).length - discovered.length;
  const discovered: FeederProspect[] = [];
  const names = new Set(pool.map((p) => p.name));
  const discover = (source: ProspectSource, count: number, positions?: Position[]) => {
    for (let i = 0; i < count && room() > 0; i++) {
      const prospect = createCompetedProspect(source, team, names, ctx);
      discovered.push(positions ? { ...prospect, projectedPosition: pick(positions) } : prospect);
    }
  };
  const warm = (match: (p: FeederProspect) => boolean, min: number, max: number) => {
    pool = pool.map((p) => (match(p) ? { ...p, interestScore: clamp(p.interestScore + Math.round(randomInt(min, max) * interestFactor(p)), 0, 100) } : p));
  };

  // A rating point from coaching, up to MAX_PROGRAM_BOOST per prospect
  const coachUp = (match: (p: FeederProspect) => boolean) => {
    pool = pool.map((p) =>
      match(p) && (p.programBoost ?? 0) < MAX_PROGRAM_BOOST ? { ...p, trueOverall: Math.min(99, p.trueOverall + 1), programBoost: (p.programBoost ?? 0) + 1 } : p
    );
  };
  const mine = (p: FeederProspect) => inUserPipeline(p) && p.source !== 'STAR_RECRUIT';
  const program = FEEDER_EVENTS[type];
  const at = (p: FeederProspect) => !!program.positions?.includes(p.projectedPosition);

  if (type === 'YOUTH_CLINIC') {
    const middleSchooler = (p: FeederProspect) => p.source === 'FEEDER_MIDDLE_SCHOOL' && !p.homeTeamId;
    warm(middleSchooler, 4, 8);
    coachUp(middleSchooler);
    discover('FEEDER_MIDDLE_SCHOOL', randomInt(2, 3));
  } else if (type === 'SEVEN_ON_SEVEN_LEAGUE' || type === 'LOCKDOWN_LEAGUE') {
    warm((p) => mine(p) && at(p), 5, 10);
    discover('SEVEN_ON_SEVEN', randomInt(1, 2), program.positions);
  } else if (type === 'TRYOUT_DAY') {
    warm(mine, 5, 5);
    discover('TRYOUT', randomInt(1, 2));
  } else if (type === 'FAMILY_NIGHT') {
    warm(mine, 10, 10);
  } else if (type === 'COMBINE') {
    const unscouted = pool.filter((p) => !isEvaluated(p) && inUserPipeline(p)).slice(0, COMBINE_SCOUTS).map((p) => p.id);
    pool = pool.map((p) => (unscouted.includes(p.id) ? scoutProspect(p) : p));
  } else {
    // A position program
    warm((p) => mine(p) && at(p), 6, 10);
    coachUp((p) => mine(p) && at(p));
    if (Math.random() < POSITION_PROGRAM_FIND_CHANCE) discover('FEEDER_MIDDLE_SCHOOL', 1, program.positions);
  }
  return { pool: [...pool, ...discovered].map(withEvaluation), discovered: discovered.map(withEvaluation) };
}

/** Families occasionally move into the district during the year. */
export function maybeMoveInArrival(pool: FeederProspect[], team: Team, week: number, ctx?: RecruitingContext): FeederProspect | null {
  if (week > LAST_REGULAR_SEASON_WEEK || pool.filter((p) => !p.homeTeamId).length >= MAX_POOL_SIZE || Math.random() > 0.12) return null;
  return createCompetedProspect('MOVE_IN', team, new Set(pool.map((p) => p.name)), ctx);
}

/** Chance a prospect comes out for the team next season. */
export function joinChance(p: FeederProspect, prestige: number): number {
  const interest = p.interestScore / 100;
  const prestigeBonus = (prestige - 75) / 200;
  switch (p.source) {
    case 'FEEDER_MIDDLE_SCHOOL':
      return clamp(0.05 + 0.5 * interest + prestigeBonus, 0.02, 0.9);
    case 'SEVEN_ON_SEVEN':
      return clamp(0.45 * interest + prestigeBonus, 0.02, 0.8);
    case 'MOVE_IN':
      return clamp(0.35 + 0.35 * interest + prestigeBonus, 0.05, 0.95);
    case 'STAR_RECRUIT':
      return clamp((p.interestScore - 55) / 100, 0, 0.45); // a long shot even when they love you
    case 'OUT_OF_DISTRICT':
      return clamp((p.interestScore - 40) / 100, 0, 0.5); // pulling a kid from his zoned school is rare
    case 'TRYOUT':
    default:
      return clamp(0.6 + 0.2 * interest, 0, 0.9);
  }
}

function missedOutcome(source: ProspectSource): FeederOutcomeType {
  const r = Math.random();
  switch (source) {
    case 'FEEDER_MIDDLE_SCHOOL':
      return r < 0.55 ? 'NOT_PLAYING' : r < 0.85 ? 'OTHER_SCHOOL' : 'LEFT_AREA';
    case 'SEVEN_ON_SEVEN':
      return r < 0.8 ? 'NOT_PLAYING' : 'OTHER_SCHOOL';
    case 'MOVE_IN':
      return r < 0.5 ? 'OTHER_SCHOOL' : r < 0.8 ? 'LEFT_AREA' : 'NOT_PLAYING';
    case 'STAR_RECRUIT':
    case 'OUT_OF_DISTRICT':
      return 'OTHER_SCHOOL';
    case 'TRYOUT':
    default:
      return 'NOT_PLAYING';
  }
}

/**
 * Chance a prospect plays football at all once they pick a school. Stars and out-of-district players will
 * play somewhere (their question is where); for everyone else coaching interest drives it.
 */
function playsFootballChance(p: FeederProspect, prestige: number): number {
  if (p.source === 'STAR_RECRUIT') return 0.95;
  if (p.source === 'OUT_OF_DISTRICT') return 0.9;
  return joinChance(p, prestige);
}

const RIVAL_FOLLOW_THROUGH = 0.85; // a prospect leaning to a rival still sometimes skips football

/** Chance the prospect ends up on the user's team: their share of the decision times the chance they play. */
export function userJoinProbability(p: FeederProspect, prestige: number, ctx?: RecruitingContext): number {
  if (!ctx) return joinChance(p, prestige);
  const userShare = choiceShares(p, ctx).find((c) => c.teamId === ctx.userTeamId)?.share ?? 0;
  return userShare * playsFootballChance(p, prestige);
}

function pickShare<T extends { share: number }>(shares: T[]): T {
  let roll = Math.random();
  for (const s of shares) {
    roll -= s.share;
    if (roll <= 0) return s;
  }
  return shares[shares.length - 1];
}

/** Turns a committed prospect into a player who keeps their name and true ratings. */
export function prospectToPlayer(p: FeederProspect): Player {
  const [firstName, ...rest] = p.name.split(' ');
  return generateProceduralPlayer(p.projectedPosition, p.incomingClass, 1, 0, {
    firstName,
    lastName: rest.join(' '),
    overall: p.trueOverall,
    potential: p.truePotential,
    speed: p.trueSpeed,
    strength: p.trueStrength
  });
}

/** A prospect signing with a school: flagged when that school's boosters made him an illegal offer. */
export function signProspect(p: FeederProspect, teamId: string, userTeamId?: string): Player {
  const player = prospectToPlayer(p);
  const induced = teamId === userTeamId ? p.userInducement || activeBoosterOffers(p) : p.suitors.find((s) => s.teamId === teamId)?.inducement;
  if (induced) player.improperlyRecruited = true;
  return player;
}

/**
 * Varsity roster limit: if the roster runs over, the lowest-rated newcomers play JV instead
 * (returning players keep their spots). Updates the outcomes in place; returns who was moved.
 */
export function enforceVarsityRosterLimit(team: Team, newcomers: Player[], outcomes: FeederOutcome[]): Player[] {
  const excess = team.roster.length - MAX_VARSITY_ROSTER;
  if (excess <= 0) return [];
  const toJV = [...newcomers].sort((a, b) => a.overallRating - b.overallRating).slice(0, excess);
  team.roster = team.roster.filter((p) => !toJV.includes(p));
  toJV.forEach((player) => {
    const outcome = outcomes.find((o) => o.playerId === player.id);
    if (outcome) outcome.outcome = 'JV_TEAM';
  });
  return toJV;
}

/** A prospect who signed with a rival program (the player joins that team's roster). */
export interface RivalSigning {
  teamId: string;
  player: Player;
}

/**
 * End of year: every prospect decides. Without a league context each prospect only weighs the user's
 * program; with one, rival suitors (and a zoned school or staying home) compete for them.
 */
export function resolveFeederClass(
  pool: FeederProspect[],
  team: Team,
  ctx?: RecruitingContext
): { joined: Player[]; rivalSignings: RivalSigning[]; outcomes: FeederOutcome[] } {
  const joined: Player[] = [];
  const rivalSignings: RivalSigning[] = [];
  const outcomes: FeederOutcome[] = pool.map((p) => {
    // The potential the coach had seen (prospects he evaluated), kept for the signing day board
    const known = withEvaluation(p).revealedPotential;
    const base = { prospectId: p.id, prospectName: p.name, source: p.source, position: p.projectedPosition, ...(known !== 'UNKNOWN' && { potential: known }) };
    if (p.isTransferRisk && Math.random() < 0.5) return { ...base, outcome: 'LEFT_AREA' as FeederOutcomeType };

    if (!ctx) {
      if (Math.random() < joinChance(p, team.prestige)) {
        const player = signProspect(p, team.id, team.id);
        joined.push(player);
        return { ...base, outcome: 'JOINED' as FeederOutcomeType, playerId: player.id, overall: p.trueOverall };
      }
      return { ...base, outcome: missedOutcome(p.source) };
    }

    // Commitments decide first: the school with the highest interest at 80+ signs him (ties at the top are a coin flip)
    const bids = schoolInterest(p, ctx.userTeamId).filter((b) => b.interest >= COMMIT_THRESHOLD);
    if (bids.length > 0) {
      const tied = bids.filter((b) => b.interest === bids[0].interest);
      const winner = tied[randomInt(0, tied.length - 1)];
      if (winner.teamId === ctx.userTeamId) {
        const player = signProspect(p, ctx.userTeamId, ctx.userTeamId);
        joined.push(player);
        return { ...base, outcome: 'JOINED' as FeederOutcomeType, playerId: player.id, overall: p.trueOverall };
      }
      const school = ctx.teamsById.get(winner.teamId);
      if (school) {
        rivalSignings.push({ teamId: school.id, player: signProspect(p, school.id) });
        return { ...base, outcome: 'OTHER_SCHOOL' as FeederOutcomeType, destinationTeamId: school.id, destinationName: school.name };
      }
    }

    // Nobody committed him: he decides on fit (his zoned school, playing time, relationships)
    const choice = pickShare(choiceShares(p, ctx));
    if (choice.teamId === ctx.userTeamId) {
      if (Math.random() < playsFootballChance(p, team.prestige)) {
        const player = signProspect(p, ctx.userTeamId, ctx.userTeamId);
        joined.push(player);
        return { ...base, outcome: 'JOINED' as FeederOutcomeType, playerId: player.id, overall: p.trueOverall };
      }
      const missed = missedOutcome(p.source);
      return { ...base, outcome: missed === 'OTHER_SCHOOL' ? ('NOT_PLAYING' as FeederOutcomeType) : missed };
    }
    if (choice.teamId === null) return { ...base, outcome: 'OTHER_SCHOOL' as FeederOutcomeType, destinationName: 'Stayed home' };
    if (Math.random() < RIVAL_FOLLOW_THROUGH) {
      rivalSignings.push({ teamId: choice.teamId, player: signProspect(p, choice.teamId) });
      return { ...base, outcome: 'OTHER_SCHOOL' as FeederOutcomeType, destinationTeamId: choice.teamId, destinationName: choice.name };
    }
    return { ...base, outcome: 'NOT_PLAYING' as FeederOutcomeType };
  });
  return { joined, rivalSignings, outcomes };
}

// ---------------------------------------------------------------------------
// Statewide elite recruits: out-of-area stars contested among the top AI programs
// ---------------------------------------------------------------------------

export const STATEWIDE_ELITE_COUNT = 10; // a Texas-sized class (254 programs)
const ELITE_REFERENCE_PROGRAMS = 254;

/** The elite list scales with the league: about one per 25 programs (10 in Texas, 1 in Maryland's 32-team class). */
export const statewideEliteCount = (programs: number) => Math.max(1, Math.round((STATEWIDE_ELITE_COUNT * programs) / ELITE_REFERENCE_PROGRAMS));

export function generateStatewideElite(ctx: RecruitingContext): FeederProspect[] {
  const names = new Set<string>();
  return Array.from({ length: statewideEliteCount(ctx.teamsById.size) }, () => assignSuitors(createProspect('STAR_RECRUIT', { prestige: 80 }, names), ctx)).filter(
    (p) => p.suitors.length > 0
  );
}

/** Resolves the elite list among its AI suitors; winners join those programs. */
export function resolveStatewideElite(elite: FeederProspect[], ctx: RecruitingContext): { signings: RivalSigning[]; headlines: string[] } {
  const signings: RivalSigning[] = [];
  const headlines: string[] = [];
  [...elite]
    .sort((a, b) => b.trueOverall - a.trueOverall)
    .forEach((p) => {
      const choice = pickShare(choiceShares(p, ctx, false));
      if (choice.teamId === null) return;
      signings.push({ teamId: choice.teamId, player: signProspect(p, choice.teamId) });
      if (headlines.length < 3) headlines.push(`${choice.name} lands ${p.incomingClass.toLowerCase()} ${p.projectedPosition} ${p.name} (${p.middleSchool})`);
    });
  return { signings, headlines };
}
