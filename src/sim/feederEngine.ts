import { FeederOutcome, FeederOutcomeType, FeederProspect, Player, PlayerClass, Position, PotentialGrade, ProspectSource, Team } from '../types/game';
import { generateProceduralPlayer, rollTalent } from '../generators/rosterGenerator';
import { randomPlayerName } from '../generators/names';
import { clamp, randomInt } from './math/variance';

// ============================================================================
// FEEDER PIPELINE (design spec 14, expanded)
// The pool holds next season's potential newcomers: district middle schoolers, 7-on-7 athletes who
// don't play tackle, families moving in, out-of-area stars (top programs only) and tryout walk-ons.
// Coaching events and personal contact shape who actually comes out; scouting only reveals ratings.
// ============================================================================

export const MIN_POOL_SIZE = 15;
export const MAX_POOL_SIZE = 40;
export const STAR_RECRUIT_MIN_PRESTIGE = 85;
export const MAX_VARSITY_ROSTER = 45; // newcomers beyond this play JV instead

export const SOURCE_LABELS: Record<ProspectSource, string> = {
  FEEDER_MIDDLE_SCHOOL: 'District Middle Schools',
  SEVEN_ON_SEVEN: '7-on-7 Athletes',
  MOVE_IN: 'Move-Ins',
  STAR_RECRUIT: 'Out-of-Area Stars',
  TRYOUT: 'Tryout Walk-Ons'
};

/** Coach AP: full budget during spring and summer, a smaller in-season budget. */
export function weeklyActionPoints(week: number): number {
  return week <= 4 ? 100 : 40;
}

export const PROSPECT_ACTION_COSTS = { SCOUT: 10, VISIT: 15, PITCH_STAR: 40 };

export type FeederEventType = 'YOUTH_CLINIC' | 'SEVEN_ON_SEVEN_LEAGUE' | 'TRYOUT_DAY';

export const FEEDER_EVENTS: Record<FeederEventType, { label: string; cost: number; description: string }> = {
  YOUTH_CLINIC: {
    label: 'Youth Football Clinic',
    cost: 50,
    description: 'Coach up the district middle schoolers: they improve and warm to the program, and new players may come out.'
  },
  SEVEN_ON_SEVEN_LEAGUE: {
    label: '7-on-7 League Night',
    cost: 40,
    description: "Host the summer 7-on-7 circuit: athletes who don't play tackle get a taste of your program."
  },
  TRYOUT_DAY: {
    label: 'Community Tryout Day',
    cost: 30,
    description: 'Open tryouts for the student body: walk-ons who can fill out the depth chart.'
  }
};

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

/** Creates one prospect from a source profile (hidden ratings, starting interest, departure risk). */
export function createProspect(source: ProspectSource, team: Team, takenNames: Set<string> = new Set()): FeederProspect {
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

  overall = clamp(Math.round(overall), 35, 95);
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
    isTransferRisk: Math.random() < transferRisk
  };
}

/** Next season's pool (15-40): bigger and richer for higher-prestige programs; stars only for top programs. */
export function generateFeederPool(team: Team): FeederProspect[] {
  const counts: [ProspectSource, number][] = [
    ['FEEDER_MIDDLE_SCHOOL', 9 + Math.round(team.prestige / 10) + randomInt(-2, 2)],
    ['SEVEN_ON_SEVEN', randomInt(3, 6)],
    ['MOVE_IN', randomInt(1, 3)],
    ['STAR_RECRUIT', team.prestige >= STAR_RECRUIT_MIN_PRESTIGE ? randomInt(1, 3) : 0],
    ['TRYOUT', randomInt(2, 4)]
  ];
  const names = new Set<string>();
  const pool = counts.flatMap(([source, n]) => Array.from({ length: n }, () => createProspect(source, team, names)));
  while (pool.length < MIN_POOL_SIZE) pool.push(createProspect('FEEDER_MIDDLE_SCHOOL', team, names));
  return pool.slice(0, MAX_POOL_SIZE);
}

export function interestLabel(score: number): string {
  if (score >= 75) return 'Hot';
  if (score >= 50) return 'Warm';
  if (score >= 25) return 'Lukewarm';
  return 'Cold';
}

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
  const gain = Math.round(randomInt(3, 9) * (team.prestige >= 92 ? 1.25 : 1));
  return { ...p, interestScore: clamp(p.interestScore + gain, 0, 100), coachContacts: p.coachContacts + 1 };
}

/** Runs an off-season program event; returns the updated pool and any newly discovered prospects. */
export function runFeederEvent(pool: FeederProspect[], type: FeederEventType, team: Team): { pool: FeederProspect[]; discovered: FeederProspect[] } {
  const room = () => MAX_POOL_SIZE - pool.length - discovered.length;
  const discovered: FeederProspect[] = [];
  const names = new Set(pool.map((p) => p.name));
  const discover = (source: ProspectSource, count: number) => {
    for (let i = 0; i < count && room() > 0; i++) discovered.push(createProspect(source, team, names));
  };

  if (type === 'YOUTH_CLINIC') {
    pool = pool.map((p) =>
      p.source === 'FEEDER_MIDDLE_SCHOOL'
        ? { ...p, interestScore: clamp(p.interestScore + randomInt(4, 8), 0, 100), trueOverall: Math.min(99, p.trueOverall + 1) }
        : p
    );
    discover('FEEDER_MIDDLE_SCHOOL', randomInt(0, 2));
  } else if (type === 'SEVEN_ON_SEVEN_LEAGUE') {
    pool = pool.map((p) => (p.source === 'SEVEN_ON_SEVEN' ? { ...p, interestScore: clamp(p.interestScore + randomInt(5, 10), 0, 100) } : p));
    discover('SEVEN_ON_SEVEN', randomInt(1, 2));
  } else {
    discover('TRYOUT', randomInt(2, 4));
  }
  return { pool: [...pool, ...discovered], discovered };
}

/** Families occasionally move into the district during the year. */
export function maybeMoveInArrival(pool: FeederProspect[], team: Team, week: number): FeederProspect | null {
  if (week > 12 || pool.length >= MAX_POOL_SIZE || Math.random() > 0.12) return null;
  return createProspect('MOVE_IN', team, new Set(pool.map((p) => p.name)));
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
      return 'OTHER_SCHOOL';
    case 'TRYOUT':
    default:
      return 'NOT_PLAYING';
  }
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

/** End of year: every prospect decides. Returns the newcomers and what happened to everyone. */
export function resolveFeederClass(pool: FeederProspect[], team: Team): { joined: Player[]; outcomes: FeederOutcome[] } {
  const joined: Player[] = [];
  const outcomes: FeederOutcome[] = pool.map((p) => {
    let outcome: FeederOutcomeType;
    if (p.isTransferRisk && Math.random() < 0.5) outcome = 'LEFT_AREA';
    else if (Math.random() < joinChance(p, team.prestige)) outcome = 'JOINED';
    else outcome = missedOutcome(p.source);

    const player = outcome === 'JOINED' ? prospectToPlayer(p) : undefined;
    if (player) joined.push(player);
    return {
      prospectId: p.id,
      ...(player && { playerId: player.id }),
      prospectName: p.name,
      source: p.source,
      position: p.projectedPosition,
      outcome,
      ...(outcome === 'JOINED' && { overall: p.trueOverall })
    };
  });
  return { joined, outcomes };
}
