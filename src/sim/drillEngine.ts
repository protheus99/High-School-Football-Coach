import { Player, Position } from '../types/game';
import { clamp, randomInt } from './math/variance';

export type DrillType =
  | 'QB_FILM_AND_READS'       // +Football IQ, +Pass Accuracy
  | 'RB_BALL_SECURITY'        // +Carrying, -Fumble Rate
  | 'WR_CONTESTED_CATCH'      // +Catching, +Route Running
  | 'TRENCH_BLOCK_SHEDDING'   // +Strength, +Tackling, +Run Block
  | 'DB_BALL_HAWK_COVERAGE'   // +Coverage, +Agility
  | 'SPEED_AND_AGILITY_CONES';// +Speed, +Agility

export interface DrillResult {
  drillType: DrillType;
  primaryAttributeGained: string;
  pointsAwarded: number;
  message: string;
}

const OVERALL_GAIN_CHANCE = 0.3;

/**
 * Applies a position focus drill to one player.
 */
export function executePositionDrill(player: Player, drill: DrillType): DrillResult {
  let primaryAttribute = '';
  const gain = randomInt(1, 2);

  switch (drill) {
    case 'QB_FILM_AND_READS':
      player.attributes.footballIQ = clamp(player.attributes.footballIQ + gain, 30, 99);
      player.attributes.passingAccuracy = clamp(player.attributes.passingAccuracy + gain, 30, 99);
      primaryAttribute = 'Football IQ & Accuracy';
      break;

    case 'RB_BALL_SECURITY':
      player.attributes.carrying = clamp(player.attributes.carrying + gain + 1, 30, 99);
      primaryAttribute = 'Ball Carrying';
      break;

    case 'WR_CONTESTED_CATCH':
      player.attributes.catching = clamp(player.attributes.catching + gain, 30, 99);
      player.attributes.routeRunning = clamp(player.attributes.routeRunning + gain, 30, 99);
      primaryAttribute = 'Catching & Routes';
      break;

    case 'TRENCH_BLOCK_SHEDDING':
      if (['OT', 'OG', 'C'].includes(player.position)) {
        player.attributes.runBlocking = clamp(player.attributes.runBlocking + gain, 30, 99);
        primaryAttribute = 'Run Blocking';
      } else {
        player.attributes.tackling = clamp(player.attributes.tackling + gain, 30, 99);
        player.attributes.passRush = clamp(player.attributes.passRush + gain, 30, 99);
        primaryAttribute = 'Tackling & Pass Rush';
      }
      break;

    case 'DB_BALL_HAWK_COVERAGE':
      player.attributes.coverage = clamp(player.attributes.coverage + gain, 30, 99);
      player.attributes.agility = clamp(player.attributes.agility + 1, 30, 99);
      primaryAttribute = 'Coverage';
      break;

    case 'SPEED_AND_AGILITY_CONES':
      player.attributes.speed = clamp(player.attributes.speed + 1, 30, 99);
      player.attributes.agility = clamp(player.attributes.agility + gain, 30, 99);
      primaryAttribute = 'Speed & Agility';
      break;
  }

  // Focused reps occasionally show up in the overall rating (never a big swing)
  if (Math.random() < OVERALL_GAIN_CHANCE) player.overallRating = clamp(player.overallRating + 1, 35, 99);

  return {
    drillType: drill,
    primaryAttributeGained: primaryAttribute,
    pointsAwarded: gain,
    message: `${player.firstName} ${player.lastName} improved ${primaryAttribute} by +${gain}!`
  };
}

// ---------------------------------------------------------------------------
// Assistant-run drills: the head coach sets the weekly development focus and the
// position coaches pick the players and the right drill for each.
// ---------------------------------------------------------------------------

export type DrillFocus = 'BALANCED' | 'STARTERS' | 'YOUNG_PLAYERS' | 'WEAK_SPOTS';

export const DRILL_FOCUS_OPTIONS: { id: DrillFocus; label: string; help: string }[] = [
  { id: 'BALANCED', label: 'Balanced', help: 'A mix of starters and developing players.' },
  { id: 'STARTERS', label: 'Starters', help: 'Sharpen the players who start on Friday.' },
  { id: 'YOUNG_PLAYERS', label: 'Young Players', help: 'Develop freshmen and sophomores with upside.' },
  { id: 'WEAK_SPOTS', label: 'Weak Spots', help: 'Lift the weakest starters.' }
];

export const ASSISTANT_DRILLS_PER_WEEK = 6;
const POTENTIAL_RANK: Record<Player['potential'], number> = { 'A+': 4, A: 3, B: 2, C: 1, D: 0 };

/** The drill a position coach runs for each position. */
export const DRILL_FOR_POSITION: Record<Position, DrillType> = {
  QB: 'QB_FILM_AND_READS',
  RB: 'RB_BALL_SECURITY',
  WR: 'WR_CONTESTED_CATCH',
  TE: 'WR_CONTESTED_CATCH',
  OT: 'TRENCH_BLOCK_SHEDDING',
  OG: 'TRENCH_BLOCK_SHEDDING',
  C: 'TRENCH_BLOCK_SHEDDING',
  DE: 'TRENCH_BLOCK_SHEDDING',
  DT: 'TRENCH_BLOCK_SHEDDING',
  LB: 'TRENCH_BLOCK_SHEDDING',
  CB: 'DB_BALL_HAWK_COVERAGE',
  S: 'DB_BALL_HAWK_COVERAGE',
  K: 'SPEED_AND_AGILITY_CONES',
  P: 'SPEED_AND_AGILITY_CONES'
};

/** Who the assistants work with this week, based on the coach's focus (healthy players only). */
export function assistantDrillTargets(roster: Player[], focus: DrillFocus, count = ASSISTANT_DRILLS_PER_WEEK): Player[] {
  const healthy = roster.filter((p) => p.condition.injuryStatus === 'HEALTHY');
  const starters = healthy.filter((p) => p.depthChartTier === 1);
  const young = healthy
    .filter((p) => p.classYear === 'Freshman' || p.classYear === 'Sophomore')
    .sort((a, b) => POTENTIAL_RANK[b.potential] - POTENTIAL_RANK[a.potential] || b.overallRating - a.overallRating);
  const byRating = (list: Player[], dir: 1 | -1) => [...list].sort((a, b) => dir * (a.overallRating - b.overallRating));
  let ordered: Player[];
  switch (focus) {
    case 'STARTERS':
      ordered = byRating(starters, -1);
      break;
    case 'YOUNG_PLAYERS':
      ordered = young;
      break;
    case 'WEAK_SPOTS':
      ordered = byRating(starters, 1);
      break;
    default: {
      // Alternate starters and young players
      const a = byRating(starters, -1);
      ordered = [];
      for (let i = 0; ordered.length < count * 2 && (i < a.length || i < young.length); i++) {
        if (a[i]) ordered.push(a[i]);
        if (young[i]) ordered.push(young[i]);
      }
    }
  }
  return [...new Set(ordered)].slice(0, count);
}

/** One week of assistant-run drills; returns a short report line per player. */
export function runAssistantDrills(roster: Player[], focus: DrillFocus): string[] {
  return assistantDrillTargets(roster, focus).map((p) => {
    const result = executePositionDrill(p, DRILL_FOR_POSITION[p.position]);
    return `${p.position} ${p.firstName} ${p.lastName}: +${result.pointsAwarded} ${result.primaryAttributeGained}`;
  });
}
