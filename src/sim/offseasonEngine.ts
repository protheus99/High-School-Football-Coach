import { Player, Position, Team } from '../types/game';
import { DEPTH_TEMPLATE, rebuildDepthChart } from './depthChart';
import { generateProceduralPlayer, INTAKE_SHIFT, programTalent } from '../generators/rosterGenerator';
import { STAFF_DEVELOPMENT_CAP } from './coachingStaff';
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
  // Freshmen carry the program's talent (prestige and state), as a rebuilt program would: dynasties reload
  return generateProceduralPlayer(pos, 'Freshman', tier, Math.round(adjustment + programTalent(team.prestige, team.state)) - randomInt(4, 8) - INTAKE_SHIFT, { nameProfile: team.nameProfile, takenNames });
};

const NEXT_CLASS = { Freshman: 'Sophomore', Sophomore: 'Junior', Junior: 'Senior' } as const;

/**
 * Rolls a team into the next season in one step (graduation and progression, then the incoming class).
 * The game splits these: the year turns over at week 1, newcomers arrive after feeder signing day.
 */
export function advanceTeamToNextSeason(
  team: Team,
  incomingPlayers: Player[] = [],
  freshmanAdjustment = 0, // AI feeder strategy: stronger or weaker generated freshman classes
  conditioningBonus = 0 // the user's Weight Room Fanatic talent
): { graduated: Player[]; freshmen: Player[] } {
  const graduated = graduateAndProgress(team, conditioningBonus);
  const freshmen = addIncomingClass(team, incomingPlayers, freshmanAdjustment);
  return { graduated, freshmen };
}

/**
 * New year: seniors graduate, everyone else moves up a class and progresses, season stats and
 * eligibility reset, and the depth chart is rebuilt from who is left.
 */
export function graduateAndProgress(
  team: Team,
  conditioningBonus = 0,
  staffDevelopment?: { byPosition: Partial<Record<Position, number>>; allPlayers: number; young: number } // the coach's paid staff
): Player[] {
  const graduated = team.roster.filter((p) => p.classYear === 'Senior');
  team.roster = team.roster.filter((p) => p.classYear !== 'Senior');

  team.roster.forEach((p) => {
    processOffSeasonProgression(p, team.staff.strengthCoach.conditioningRating + conditioningBonus);
    if (staffDevelopment) {
      // Position coaches, the strength program and the JV staff add growth (fractions round up by chance),
      // at most +0.5 a season per player: about +2 over a four-year roster cycle, matching the game-day cap
      const young = p.classYear === 'Freshman' || p.classYear === 'Sophomore' ? staffDevelopment.young : 0;
      const growth = Math.min(STAFF_DEVELOPMENT_CAP, (staffDevelopment.byPosition[p.position] ?? 0) + staffDevelopment.allPlayers + young);
      const whole = Math.floor(growth) + (Math.random() < growth - Math.floor(growth) ? 1 : 0);
      p.overallRating = Math.min(99, p.overallRating + whole);
    }
    p.classYear = NEXT_CLASS[p.classYear as keyof typeof NEXT_CLASS];
    p.age += 1;
    p.stats = createEmptyPlayerStats();
    p.academics.isEligible = true;
    p.academics.consecutiveFailingWeeks = 0;
  });
  rebuildDepthChart(team.roster);
  return graduated;
}

/**
 * Feeder signing day: newcomers from the pipeline join (already in their grade), remaining open spots are
 * filled with freshmen, and the depth chart is rebuilt.
 */
export function addIncomingClass(team: Team, incomingPlayers: Player[] = [], freshmanAdjustment = 0): Player[] {
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
  return freshmen;
}
