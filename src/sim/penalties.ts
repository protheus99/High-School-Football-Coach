import { Player, Position, Team } from '../types/game';
import { NEUTRAL_DISCIPLINE } from './programMeters';

// ---------------------------------------------------------------------------
// Penalties. Rates are per snap for the whole unit on the field, tuned to about 5-6 accepted flags and ~45 yards
// per team per game (college teams average 5.5-9.4 flags and 44-79 yards; there is no published high school
// average). A team's rate rises with low player discipline and football IQ, low locker-room morale and season
// fatigue; a road offense jumps early more often in a loud stadium.
// ---------------------------------------------------------------------------

export type PenaltyId =
  | 'FALSE_START'
  | 'DELAY_OF_GAME'
  | 'ILLEGAL_FORMATION'
  | 'HOLDING'
  | 'OFFENSIVE_PASS_INTERFERENCE'
  | 'ILLEGAL_BLOCK'
  | 'OFFSIDE'
  | 'PASS_INTERFERENCE'
  | 'DEFENSIVE_HOLDING'
  | 'FACE_MASK'
  | 'ROUGHING_THE_PASSER'
  | 'PERSONAL_FOUL';

export interface PenaltyRule {
  id: PenaltyId;
  name: string;
  side: 'OFFENSE' | 'DEFENSE';
  timing: 'PRE_SNAP' | 'LIVE';
  yards: number;
  positions: Position[];
  perSnap: number;
  plays?: 'PASS' | 'RUN'; // only called on that kind of play
  autoFirstDown?: boolean;
}

export const PENALTIES: PenaltyRule[] = [
  { id: 'FALSE_START', name: 'False start', side: 'OFFENSE', timing: 'PRE_SNAP', yards: 5, positions: ['OT', 'OG', 'C', 'TE', 'WR'], perSnap: 0.021 },
  { id: 'DELAY_OF_GAME', name: 'Delay of game', side: 'OFFENSE', timing: 'PRE_SNAP', yards: 5, positions: ['QB'], perSnap: 0.004 },
  { id: 'ILLEGAL_FORMATION', name: 'Illegal formation', side: 'OFFENSE', timing: 'PRE_SNAP', yards: 5, positions: ['WR', 'TE'], perSnap: 0.004 },
  { id: 'HOLDING', name: 'Holding', side: 'OFFENSE', timing: 'LIVE', yards: 10, positions: ['OT', 'OG', 'C', 'TE'], perSnap: 0.021 },
  { id: 'OFFENSIVE_PASS_INTERFERENCE', name: 'Offensive pass interference', side: 'OFFENSE', timing: 'LIVE', yards: 15, positions: ['WR', 'TE'], perSnap: 0.006, plays: 'PASS' },
  { id: 'ILLEGAL_BLOCK', name: 'Illegal block in the back', side: 'OFFENSE', timing: 'LIVE', yards: 10, positions: ['WR', 'TE', 'RB'], perSnap: 0.008, plays: 'RUN' },
  { id: 'OFFSIDE', name: 'Offside', side: 'DEFENSE', timing: 'PRE_SNAP', yards: 5, positions: ['DE', 'DT', 'LB'], perSnap: 0.015 },
  { id: 'PASS_INTERFERENCE', name: 'Pass interference', side: 'DEFENSE', timing: 'LIVE', yards: 15, positions: ['CB', 'S', 'LB'], perSnap: 0.02, plays: 'PASS' },
  { id: 'DEFENSIVE_HOLDING', name: 'Holding', side: 'DEFENSE', timing: 'LIVE', yards: 10, positions: ['CB', 'S', 'LB'], perSnap: 0.006 },
  { id: 'FACE_MASK', name: 'Face mask', side: 'DEFENSE', timing: 'LIVE', yards: 15, positions: ['DE', 'DT', 'LB', 'CB', 'S'], perSnap: 0.003 },
  { id: 'ROUGHING_THE_PASSER', name: 'Roughing the passer', side: 'DEFENSE', timing: 'LIVE', yards: 15, positions: ['DE', 'DT', 'LB'], perSnap: 0.006, plays: 'PASS', autoFirstDown: true },
  { id: 'PERSONAL_FOUL', name: 'Personal foul, late hit', side: 'DEFENSE', timing: 'LIVE', yards: 15, positions: ['LB', 'CB', 'S', 'DE', 'DT'], perSnap: 0.003 }
];

// How many play each position on a typical snap
const ON_FIELD: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DE: 2, DT: 2, LB: 3, CB: 2, S: 2 };

// Starters average about 71 discipline and 72 football IQ
const PLAYER_DISCIPLINE_EFFECT = 0.04;
const PLAYER_IQ_EFFECT = 0.02;
const MORALE_EFFECT = 0.015;
const WEAR_EFFECT = 0.005;
const ROAD_FALSE_START = 1.25;

/** How flag-prone a player is: 1 for a typical starter, about 0.3 for the most disciplined, up to 2.5. */
export function playerPenaltyFactor(p: Player): number {
  const raw = 1 + (71 - p.attributes.discipline) * PLAYER_DISCIPLINE_EFFECT + (72 - p.attributes.footballIQ) * PLAYER_IQ_EFFECT + p.condition.seasonWear * WEAR_EFFECT;
  return Math.max(0.3, Math.min(2.5, raw));
}

/** Locker-room morale: an unhappy team is a sloppier one. */
export function teamPenaltyFactor(team: Team): number {
  return Math.max(0.7, Math.min(1.5, 1 + (NEUTRAL_DISCIPLINE - (team.programMeters?.lockerRoomDiscipline ?? NEUTRAL_DISCIPLINE)) * MORALE_EFFECT));
}

export type PlayersAt = (team: Team, pos: Position) => Player[];

/** Default lineup: the healthy, eligible first string at each position, best rated first. */
export const startersAt: PlayersAt = (team, pos) =>
  (team.roster ?? [])
    .filter((p) => p.position === pos && p.academics.isEligible && p.condition.injuryStatus === 'HEALTHY')
    .sort((a, b) => a.depthChartTier - b.depthChartTier || b.overallRating - a.overallRating);

/** The players on the field who could commit this foul, each with how likely he is to be the one. */
function suspects(rule: PenaltyRule, team: Team, playersAt: PlayersAt): [Player, number][] {
  return rule.positions.flatMap((pos) => playersAt(team, pos).slice(0, ON_FIELD[pos] ?? 1).map((p): [Player, number] => [p, playerPenaltyFactor(p)]));
}

/** This rule's chance on one snap for this team (0 when the rule doesn't apply to the play). */
function ruleChance(rule: PenaltyRule, team: Team, isPass: boolean, isRoadOffense: boolean, playersAt: PlayersAt): { chance: number; who: [Player, number][] } {
  if (rule.plays && (rule.plays === 'PASS') !== isPass) return { chance: 0, who: [] };
  const who = suspects(rule, team, playersAt);
  const avgFactor = who.length ? who.reduce((s, [, f]) => s + f, 0) / who.length : 1;
  const road = rule.id === 'FALSE_START' && isRoadOffense ? ROAD_FALSE_START : 1;
  return { chance: rule.perSnap * avgFactor * teamPenaltyFactor(team) * road, who };
}

export interface Foul {
  rule: PenaltyRule;
  team: Team;
  player?: Player;
}

function pickWho(who: [Player, number][]): Player | undefined {
  let roll = Math.random() * who.reduce((s, [, w]) => s + w, 0);
  for (const [p, w] of who) {
    roll -= w;
    if (roll <= 0) return p;
  }
  return who[who.length - 1]?.[0];
}

/**
 * Rolls for a flag on one scrimmage snap: a pre-snap foul first (the play never happens), then a live-ball foul
 * (the play is called back or the yardage is enforced). Returns null on a clean snap.
 */
export function rollFoul(offense: Team, defense: Team, isPass: boolean, isRoadOffense: boolean, playersAt: PlayersAt = startersAt): Foul | null {
  for (const timing of ['PRE_SNAP', 'LIVE'] as const) {
    for (const rule of PENALTIES) {
      if (rule.timing !== timing) continue;
      const team = rule.side === 'OFFENSE' ? offense : defense;
      const { chance, who } = ruleChance(rule, team, isPass, isRoadOffense && rule.side === 'OFFENSE', playersAt);
      if (Math.random() < chance) return { rule, team, player: pickWho(who) };
    }
  }
  return null;
}

/** Yards actually walked off: half the distance to the goal when the full penalty would reach it. */
export const enforcedYards = (yards: number, yardsToGoal: number) => Math.min(yards, Math.floor(yardsToGoal / 2));

// Simulated games: about 57 offensive snaps a team, 45% of them passes
const MACRO_SNAPS = 57;
const MACRO_PASS_SHARE = 0.45;

function poisson(mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = Math.random();
  while (p > limit) {
    k += 1;
    p *= Math.random();
  }
  return k;
}

/** A simulated game's flags for one team: how many and how many yards. */
export function simulateTeamPenalties(team: Team, isRoad: boolean): { count: number; yards: number } {
  let count = 0;
  let yards = 0;
  PENALTIES.forEach((rule) => {
    const snaps = MACRO_SNAPS * (rule.plays === 'PASS' ? MACRO_PASS_SHARE : rule.plays === 'RUN' ? 1 - MACRO_PASS_SHARE : 1);
    const { chance } = ruleChance({ ...rule, plays: undefined }, team, true, isRoad && rule.side === 'OFFENSE', startersAt);
    const n = poisson(chance * snaps);
    count += n;
    yards += n * rule.yards;
  });
  return { count, yards };
}
