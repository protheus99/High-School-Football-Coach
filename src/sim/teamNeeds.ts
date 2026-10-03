import { FeederProspect, Position, Team } from '../types/game';
import { DEPTH_TEMPLATE } from './depthChart';
import { FEEDER_SIGNING_WEEK } from './scheduleEngine';
import { inUserPipeline } from './feederEngine';

/** One position's outlook for the incoming class. */
export interface PositionNeed {
  position: Position;
  target: number; // roster spots the program carries at the position
  returning: number; // players who will still be here
  leaving: number; // seniors who graduate
  leavingStarters: number;
  starterHoles: number; // starting jobs nobody returning holds
  need: number; // open roster spots
  pipeline: number; // prospects projected at the position
}

/**
 * Roster holes by position for the class the feeder pipeline is filling.
 * - Before signing day (pre season, weeks 1-2 of a signing season) seniors have already graduated, so the
 *   holes are the open spots on today's roster.
 * - The rest of the year the pipeline is next season's class, so this year's seniors count as leaving.
 */
export function teamNeeds(team: Team, pool: FeederProspect[], seniorsStillHere: boolean): PositionNeed[] {
  return (Object.keys(DEPTH_TEMPLATE) as Position[]).map((position) => {
    const { roster: target, starters } = DEPTH_TEMPLATE[position];
    const atPosition = team.roster.filter((p) => p.position === position);
    const leavingPlayers = seniorsStillHere ? atPosition.filter((p) => p.classYear === 'Senior') : [];
    const returningPlayers = atPosition.filter((p) => !leavingPlayers.includes(p));
    const returningStarters = returningPlayers.filter((p) => p.depthChartTier === 1).length;
    return {
      position,
      target,
      returning: returningPlayers.length,
      leaving: leavingPlayers.length,
      leavingStarters: leavingPlayers.filter((p) => p.depthChartTier === 1).length,
      starterHoles: Math.max(0, starters - returningStarters),
      need: Math.max(0, target - returningPlayers.length),
      pipeline: pool.filter((p) => p.projectedPosition === position && inUserPipeline(p)).length
    };
  });
}

/** Positions to target, most urgent first: starting jobs to fill, then the biggest gaps the pipeline doesn't cover. */
export function priorityNeeds(needs: PositionNeed[]): PositionNeed[] {
  return needs
    .filter((n) => n.starterHoles > 0 || n.need > n.pipeline)
    .sort((a, b) => b.starterHoles - a.starterHoles || b.need - b.pipeline - (a.need - a.pipeline));
}

/** Whether this year's seniors are still on the roster for the class the pipeline is filling. */
export function seniorsStillHere(currentYear: number, feederClassYear: number, currentWeek: number): boolean {
  return !(currentYear >= feederClassYear && currentWeek <= FEEDER_SIGNING_WEEK);
}
