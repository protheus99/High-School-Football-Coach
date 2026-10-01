import { Player, Position, Team } from '../types/game';
import { DEPTH_TEMPLATE, rebuildDepthChart } from './depthChart';
import { generateProceduralPlayer } from '../generators/rosterGenerator';
import { processOffSeasonProgression } from './playerEngine';
import { createEmptyPlayerStats } from './playerStats';
import { randomInt } from './math/variance';

// Incoming freshmen roll starter-level talent minus a youth penalty; three years of progression
// brings them back to the level of the generated rosters, keeping program strength stable. Only the core share
// of each position's freshmen is starter material; the rest are developmental depth players.
// Depth players develop and win jobs too, so fewer freshmen need to arrive as starter material (tuned so
// average starter strength holds steady across a decade)
const STARTER_FRESHMAN_SHARE = 0.55;

const newFreshman = (pos: Position, team: Team, takenNames: Set<string>, adjustment: number) => {
  const { roster, core } = DEPTH_TEMPLATE[pos];
  const tier = Math.random() < (core / roster) * STARTER_FRESHMAN_SHARE ? 1 : 3;
  return generateProceduralPlayer(pos, 'Freshman', tier, adjustment - randomInt(4, 8), { nameProfile: team.nameProfile, takenNames });
};

const NEXT_CLASS = { Freshman: 'Sophomore', Sophomore: 'Junior', Junior: 'Senior' } as const;

/**
 * Rolls a team into the next season: seniors graduate, everyone else moves up a class and
 * progresses, newcomers from the feeder pipeline join (already in their new grade), remaining
 * open spots are filled with freshmen, season stats and eligibility reset, and the depth chart is rebuilt.
 */
export function advanceTeamToNextSeason(
  team: Team,
  incomingPlayers: Player[] = [],
  freshmanAdjustment = 0 // AI feeder strategy: stronger or weaker generated freshman classes
): { graduated: Player[]; freshmen: Player[] } {
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
  const takenNames = new Set(team.roster.map((p) => `${p.firstName} ${p.lastName}`));
  const countAt = (pos: Position) => team.roster.filter((p) => p.position === pos).length;

  // Newcomers from the feeder pipeline join first (even beyond the template), then open spots are filled
  incomingPlayers.forEach((player) => {
    team.roster.push(player);
    freshmen.push(player);
  });
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    while (countAt(pos) < DEPTH_TEMPLATE[pos].roster) {
      const player = newFreshman(pos, team, takenNames, freshmanAdjustment);
      team.roster.push(player);
      freshmen.push(player);
    }
  });

  rebuildDepthChart(team.roster);
  return { graduated, freshmen };
}
