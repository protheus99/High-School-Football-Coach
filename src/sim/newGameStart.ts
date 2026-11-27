import type { ScenarioId } from '../data/scenarios';
import type { ClassTarget } from './classLeague';
import type { SchoolFacts } from '../services/schoolLookup';
import type { Team } from '../types/game';
import { Program, scenarioForGroup } from './quickPick';
import type { CareerTerm } from './careerScore';

// What New Game hands the title screen when the coach taps Start, and how that becomes newScenarioGame's arguments.

/** How the coach reached the school (analytics): a Quick Pick deal, the manual listing, the search, a legend card, a team page link. */
export type PickPath = 'quick' | 'manual' | 'search' | 'legend' | 'link';

export interface NewGameStart {
  program: Program;
  coachName: string;
  length: CareerTerm;
  facts: SchoolFacts | null; // a missing mascot or colors, looked up during Coach Information
  path: PickPath;
}

/** newScenarioGame's scenario, school and class target: an original top-class school starts by name, any other by id. */
export function careerArgs(p: Program): { scenario: ScenarioId; school: string; target?: ClassTarget } {
  return { scenario: scenarioForGroup(p.group), school: p.name, ...(p.id && { target: { className: p.className, schoolId: p.id } }) };
}

/** The looked-up facts on the coach's team, where the data had none (never over facts on file). */
export function applySchoolFacts(team: Team, facts: SchoolFacts | null): boolean {
  if (!facts) return false;
  let changed = false;
  if (facts.mascot && !team.mascot) {
    team.mascot = facts.mascot;
    changed = true;
  }
  if (facts.colors && team.colorsConfirmed === false) {
    [team.primaryColor, team.secondaryColor] = facts.colors;
    delete team.colorsConfirmed;
    changed = true;
  }
  return changed;
}
