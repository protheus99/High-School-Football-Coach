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
    // DISTRICT_FINISH: the top N of every district qualify and districts are paired (Texas UIL).
    // STATEWIDE_RANKING: a power ranking seeds one bracket 1..N; district champions are guaranteed a top-half seed (Georgia GHSA).
    format: 'DISTRICT_FINISH' | 'STATEWIDE_RANKING';
    qualifiersPerDistrict: number; // DISTRICT_FINISH
    bracketSize: number; // STATEWIDE_RANKING: teams in the bracket (a power of two)
    // TOP_ENROLLMENT_HALF: once a district's qualifiers are set, the larger half by enrollment plays in the first division
    divisionSplit: 'NONE' | 'TOP_ENROLLMENT_HALF';
    divisionNames: string[]; // bracket names: one per division, or a single statewide bracket
    roundLabels: Record<PlayoffRound, string>;
    roundDescriptions: Record<PlayoffRound, string>; // one line per round for the schedule
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
    format: 'DISTRICT_FINISH',
    qualifiersPerDistrict: 4,
    bracketSize: 64,
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
    roundDescriptions: {
      BI_DISTRICT: 'Opening round: the top four in each district face the paired district',
      AREA: 'Bi-District winners meet',
      REGIONAL_SEMIFINAL: 'Final four in each region',
      REGIONAL_FINAL: 'The winner is region champion',
      STATE_SEMIFINAL: 'Region champions meet for a spot in the title game',
      STATE_FINAL: 'The title game at AT&T Stadium in Arlington'
    },
    championshipTitle: 'UIL 6A State Championship',
    championshipVenue: 'AT&T Stadium (Arlington, TX)'
  },
  academics: { ruleName: 'No Pass, No Play', minimumGpa: 2.0, atRiskGpa: 2.3 },
  mercyRuleMargin: 35, // the game's running clock (UIL has no 11-man mercy rule; kept by design)
  overtime: { startYardsFromGoal: 10 }
};

/**
 * Georgia GHSA Class 7A (2026-28): 51 football programs in 8 regions. From 2026-27 a statewide power
 * ranking (win % x opponents' win % x opponents' opponents' win %) seeds a 32-team bracket; region
 * champions are guaranteed a top-16 seed and host in the first round.
 */
export const GEORGIA_RULES: StateRules = {
  state: 'Georgia',
  governingBody: 'GHSA',
  classification: '7A',
  districtLabel: 'Region',
  playoffs: {
    format: 'STATEWIDE_RANKING',
    qualifiersPerDistrict: 1, // region champions are guaranteed a spot
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Class 7A'],
    // A 32-team bracket uses the first four region-round slots and the final
    roundLabels: {
      BI_DISTRICT: 'First Round',
      AREA: 'Second Round',
      REGIONAL_SEMIFINAL: 'Quarterfinals',
      REGIONAL_FINAL: 'Semifinals',
      STATE_SEMIFINAL: 'Semifinals',
      STATE_FINAL: 'State Championship'
    },
    roundDescriptions: {
      BI_DISTRICT: 'Opening round: 32 teams seeded by the GHSA power ranking; region champions host',
      AREA: 'Sixteen teams left',
      REGIONAL_SEMIFINAL: 'The final eight',
      REGIONAL_FINAL: 'The final four',
      STATE_SEMIFINAL: 'The final four',
      STATE_FINAL: 'The title game at Mercedes-Benz Stadium in Atlanta'
    },
    championshipTitle: 'GHSA 7A State Championship',
    championshipVenue: 'Mercedes-Benz Stadium (Atlanta, GA)'
  },
  // GHSA: pass five of six classes the previous semester (no GPA line), modeled on the game's GPA scale
  academics: { ruleName: 'Pass 5 of 6 classes', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: 30, // GHSA: a 30-point lead brings a running clock
  overtime: { startYardsFromGoal: 10 }
};

/** Playable states and their rules. Add a state here once its rules and complete district data exist. */
export const STATE_RULES: Record<string, StateRules> = {
  Texas: TEXAS_RULES,
  Georgia: GEORGIA_RULES
};

export const PLAYABLE_STATES = Object.keys(STATE_RULES);

/** The rules for a state (Texas for anything not yet playable). */
export function rulesForState(state?: string): StateRules {
  return (state && STATE_RULES[state]) || TEXAS_RULES;
}
