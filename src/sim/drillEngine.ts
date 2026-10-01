import { Player } from '../types/game';
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

/**
 * Applies mid-season position focus drills using weekly coaching energy.
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

  // Recalculate player overall rating
  player.overallRating = clamp(
    Math.round(
      (player.attributes.speed +
        player.attributes.strength +
        player.attributes.footballIQ +
        (player.position === 'QB'
          ? player.attributes.passingAccuracy
          : player.position === 'RB'
          ? player.attributes.carrying
          : player.attributes.tackling)) /
        4
    ),
    35,
    99
  );

  return {
    drillType: drill,
    primaryAttributeGained: primaryAttribute,
    pointsAwarded: gain,
    message: `${player.firstName} ${player.lastName} improved ${primaryAttribute} by +${gain}!`
  };
}
