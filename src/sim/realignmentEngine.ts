import { Team } from '../types/game';
import { randomInt } from './math/variance';

/**
 * State Athletic Association 2-Year Realignment & Reclassification Engine.
 * Adjusts enrollment classifications (1A to 6A) based on school prestige and growth.
 */
export function processStateRealignment(allTeams: Team[]): { reclassifiedTeams: { teamName: string; oldClass: string; newClass: string }[] } {
  const reclassifiedTeams: { teamName: string; oldClass: string; newClass: string }[] = [];

  allTeams.forEach((team) => {
    const oldClass = team.classification;

    // Fast-growing powerhouse schools move up in classification
    if (team.prestige >= 88 && (team.classification === '4A' || team.classification === '5A')) {
      team.classification = team.classification === '4A' ? '5A' : '6A';
      reclassifiedTeams.push({ teamName: team.name, oldClass, newClass: team.classification });
    }
    // Struggling low-enrollment programs drop
    else if (team.prestige <= 55 && team.classification === '6A') {
      team.classification = '5A';
      reclassifiedTeams.push({ teamName: team.name, oldClass, newClass: team.classification });
    }
  });

  return { reclassifiedTeams };
}
