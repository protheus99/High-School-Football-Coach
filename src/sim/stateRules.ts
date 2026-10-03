import type { StateGoverningBody } from '../types/game';
import type { PlayoffRound } from './playoffEngine';

// ---------------------------------------------------------------------------
// Per-state game rules. Everything state-specific the engines need lives here, so another state can be
// switched on by adding its rules (and complete district data) instead of changing engine code.
// Only states listed in STATE_RULES are playable; Texas is the default.
// ---------------------------------------------------------------------------

export interface StateRules {
  state: string;
  governingBody: StateGoverningBody;
  classification: string; // the top class the game models, e.g. "6A"
  districtLabel: string; // what the state calls its districts ("District", "Region", "Section")
  playoffs: {
    qualifiersPerDistrict: number;
    // TOP_ENROLLMENT_HALF: once a district's qualifiers are set, the larger half by enrollment plays in the first division
    divisionSplit: 'NONE' | 'TOP_ENROLLMENT_HALF';
    divisionNames: string[]; // bracket names: one per division, or a single statewide bracket
    roundLabels: Record<PlayoffRound, string>;
    championshipTitle: string;
    championshipVenue: string;
  };
  academics: {
    ruleName: string;
    minimumGpa: number; // below this a player is ineligible after a report card
    atRiskGpa: number; // close enough to the line to flag
  };
  // A second-half lead of this many points starts a running clock (null: the state has no mercy rule)
  mercyRuleMargin: number | null;
  overtime: {
    startYardsFromGoal: number; // each overtime possession starts this far from the goal line
  };
}

export const TEXAS_RULES: StateRules = {
  state: 'Texas',
  governingBody: 'UIL',
  classification: '6A',
  districtLabel: 'District',
  playoffs: {
    qualifiersPerDistrict: 4,
    divisionSplit: 'TOP_ENROLLMENT_HALF', // UIL 6A Division 1 / Division 2
    divisionNames: ['Division 1', 'Division 2'],
    roundLabels: {
      BI_DISTRICT: 'Bi-District',
      AREA: 'Area',
      REGIONAL_SEMIFINAL: 'Regional Semifinal',
      REGIONAL_FINAL: 'Regional Final',
      STATE_SEMIFINAL: 'State Semifinal',
      STATE_FINAL: 'State Championship'
    },
    championshipTitle: 'UIL 6A State Championship',
    championshipVenue: 'AT&T Stadium (Arlington, TX)'
  },
  academics: { ruleName: 'No Pass, No Play', minimumGpa: 2.0, atRiskGpa: 2.3 },
  mercyRuleMargin: 35, // the game's running clock (UIL has no 11-man mercy rule; kept by design)
  overtime: { startYardsFromGoal: 10 }
};

/** Playable states and their rules. Add a state here once its rules and complete district data exist. */
export const STATE_RULES: Record<string, StateRules> = {
  Texas: TEXAS_RULES
};

export const PLAYABLE_STATES = Object.keys(STATE_RULES);

/** The rules for a state (Texas for anything not yet playable). */
export function rulesForState(state?: string): StateRules {
  return (state && STATE_RULES[state]) || TEXAS_RULES;
}
