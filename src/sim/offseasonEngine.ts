import { Player, Position, Team } from '../types/game';
import { DEPTH_TEMPLATE, rebuildDepthChart } from './depthChart';
import { generateProceduralPlayer } from '../generators/rosterGenerator';
import { processOffSeasonProgression } from './playerEngine';
import { createEmptyPlayerStats } from './playerStats';
import { randomInt } from './math/variance';

// Incoming freshmen roll starter-level talent minus a youth penalty; three years of progression
// brings them back to the level of the generated rosters, keeping program strength stable
const newFreshman = (pos: Position) => generateProceduralPlayer(pos, 'Freshman', 1, -randomInt(4, 8));

const NEXT_CLASS = { Freshman: 'Sophomore', Sophomore: 'Junior', Junior: 'Senior' } as const;

/**
 * Rolls a team into the next season: seniors graduate, everyone else moves up a class and
 * progresses, each position is refilled to its roster size with freshmen (incoming feeder
 * positions first), season stats and eligibility reset, and the depth chart is rebuilt.
 */
export function advanceTeamToNextSeason(team: Team, incomingPositions: Position[] = []): { graduated: Player[]; freshmen: Player[] } {
  const graduated = team.roster.filter((p) => p.classYear === 'Senior');
  team.roster = team.roster.filter((p) => p.classYear !== 'Senior');

  team.roster.forEach((p) => {
    processOffSeasonProgression(p, team.staff.strengthCoach.conditioningRating);
    p.classYear = NEXT_CLASS[p.classYear as keyof typeof NEXT_CLASS];
    p.age += 1;
    p.stats = createEmptyPlayerStats();
    p.academics.isEligible = true;
    p.academics.consecutiveFailingWeeks = 0;
    p.academics.studyHallAssigned = false;
  });

  const freshmen: Player[] = [];
  const countAt = (pos: Position) => team.roster.filter((p) => p.position === pos).length;

  // Signed feeder prospects join first (even beyond the template), then open spots are filled
  incomingPositions.forEach((pos) => {
    const player = newFreshman(pos);
    team.roster.push(player);
    freshmen.push(player);
  });
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    while (countAt(pos) < DEPTH_TEMPLATE[pos].roster) {
      const player = newFreshman(pos);
      team.roster.push(player);
      freshmen.push(player);
    }
  });

  rebuildDepthChart(team.roster);
  return { graduated, freshmen };
}
