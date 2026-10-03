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
    // REGIONAL_SEEDED: playoff regions (groups of districts) each seed their own bracket, then the region survivors
    // meet statewide (Florida, Maryland, North Carolina, Alabama); see `regional`.
    format: 'DISTRICT_FINISH' | 'STATEWIDE_RANKING' | 'REGIONAL_SEEDED';
    qualifiersPerDistrict: number; // DISTRICT_FINISH
    bracketSize: number; // STATEWIDE_RANKING: teams in the bracket (a power of two); otherwise the field size
    // TOP_ENROLLMENT_HALF: once a district's qualifiers are set, the larger half by enrollment plays in the first division
    divisionSplit: 'NONE' | 'TOP_ENROLLMENT_HALF';
    divisionNames: string[]; // bracket names: one per division, or a single statewide bracket
    regional?: RegionalPlayoffs; // REGIONAL_SEEDED
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

/** A REGIONAL_SEEDED playoff: how teams are picked and seeded inside each playoff region. */
export interface RegionalPlayoffs {
  regions: { name: string; districts: number[] }[]; // playoff regions, by district number (1-based, as in the world data)
  // RANKING: by the power rating (standing in for MaxPreps, RPI or a point system); DISTRICT_FINISH: by district standings
  selection: 'RANKING' | 'DISTRICT_FINISH';
  qualifiersPerRegion: number;
  statewideQualifiers?: number; // pick the top N statewide first, then split them evenly across the regions in district order (NCHSAA)
  championsSeededFirst: boolean; // district champions qualify and take the top seeds in their region
  regionBracketSize: number; // slots per region bracket (a power of two); empty slots give the top seeds a bye
  regionalRounds: number; // rounds played inside a region before teams from different regions meet
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

/**
 * Tennessee TSSAA Class 6A (2025-27): 56 programs in eight regions. The top four in each region qualify; the
 * first round crosses paired regions (a region's #1 hosts the paired region's #4, #2 hosts #3). The BlueCross
 * Bowl is played at Finley Stadium in Chattanooga.
 */
export const TENNESSEE_RULES: StateRules = {
  state: 'Tennessee',
  governingBody: 'TSSAA',
  classification: '6A',
  districtLabel: 'Region',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 4,
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Class 6A'],
    regional: {
      regions: [
        { name: 'Regions 1-2', districts: [1, 2] },
        { name: 'Regions 3-4', districts: [3, 4] },
        { name: 'Regions 5-6', districts: [5, 6] },
        { name: 'Regions 7-8', districts: [7, 8] }
      ],
      selection: 'DISTRICT_FINISH',
      qualifiersPerRegion: 8,
      championsSeededFirst: true,
      regionBracketSize: 8,
      regionalRounds: 3
    },
    ...fiveRounds(
      ['First Round', 'Second Round', 'Quarterfinals', 'Semifinals', 'BlueCross Bowl'],
      [
        'Opening round: the top four in each region; region champions host the paired region\'s fourth seed',
        'Sixteen teams left',
        'The final eight',
        'The final four',
        'The title game at Finley Stadium in Chattanooga'
      ]
    ),
    championshipTitle: 'TSSAA 6A BlueCross Bowl',
    championshipVenue: 'Finley Stadium (Chattanooga, TN)'
  },
  // TSSAA: pass five classes the previous year (no GPA line), modeled on the game's GPA scale
  academics: { ruleName: 'Pass 5 classes', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: 35,
  overtime: { startYardsFromGoal: 10 }
};

/**
 * Ohio OHSAA Division I (from 2025): 69 programs in four regions. The top twelve in each region by computer
 * ratings (Harbin points) qualify and the top four have a first-round bye; region champions meet in the state
 * semifinals, and every final is played at Tom Benson Hall of Fame Stadium in Canton.
 */
export const OHIO_RULES: StateRules = {
  state: 'Ohio',
  governingBody: 'OHSAA',
  classification: 'Division I',
  districtLabel: 'League',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 0,
    bracketSize: 48,
    divisionSplit: 'NONE',
    divisionNames: ['Division I'],
    regional: {
      regions: [
        { name: 'Region 1', districts: [1, 2, 3] },
        { name: 'Region 2', districts: [4, 5, 6] },
        { name: 'Region 3', districts: [7, 8, 9] },
        { name: 'Region 4', districts: [10, 11, 12] }
      ],
      selection: 'RANKING',
      qualifiersPerRegion: 12,
      championsSeededFirst: false,
      regionBracketSize: 16,
      regionalRounds: 4
    },
    roundLabels: {
      BI_DISTRICT: 'First Round',
      AREA: 'Regional Quarterfinal',
      REGIONAL_SEMIFINAL: 'Regional Semifinal',
      REGIONAL_FINAL: 'Regional Final',
      STATE_SEMIFINAL: 'State Semifinal',
      STATE_FINAL: 'State Championship'
    },
    roundDescriptions: {
      BI_DISTRICT: 'Opening round: the top twelve in each region by Harbin points; the top four have a bye',
      AREA: 'The top four seeds enter',
      REGIONAL_SEMIFINAL: 'Final four in each region',
      REGIONAL_FINAL: 'The winner is region champion',
      STATE_SEMIFINAL: 'Region champions meet for a spot in the title game',
      STATE_FINAL: 'The title game at Tom Benson Hall of Fame Stadium in Canton'
    },
    championshipTitle: 'OHSAA Division I State Championship',
    championshipVenue: 'Tom Benson Hall of Fame Stadium (Canton, OH)'
  },
  // OHSAA: pass five one-credit courses the previous grading period
  academics: { ruleName: 'Pass 5 courses', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: 30, // OHSAA: running clock with a 30-point lead in the second half
  overtime: { startYardsFromGoal: 10 }
};

/**
 * Pennsylvania PIAA Class 6A: 72 programs in PIAA districts (District 1, 3 and 11 split into leagues). Modeled on
 * the Florida format, the closest fit to PIAA's district-champions-first path: four playoff regions of eight,
 * league champions take the top seeds and the ranking fills the rest; region champions meet in the state
 * semifinals.
 */
export const PENNSYLVANIA_RULES: StateRules = {
  state: 'Pennsylvania',
  governingBody: 'PIAA',
  classification: '6A',
  districtLabel: 'League',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 1,
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Class 6A'],
    regional: {
      regions: [
        { name: 'District 1', districts: [3, 4, 5] },
        { name: 'Philadelphia & Lehigh Valley', districts: [1, 8, 9] },
        { name: 'South Central', districts: [6, 7] },
        { name: 'Western', districts: [2, 10] }
      ],
      selection: 'RANKING',
      qualifiersPerRegion: 8,
      championsSeededFirst: true,
      regionBracketSize: 8,
      regionalRounds: 3
    },
    ...fiveRounds(
      ['First Round', 'Quarterfinal', 'Region Final', 'State Semifinal', 'State Championship'],
      [
        'Opening round: eight teams per region; league champions take the top seeds',
        'Final four in each region',
        'The winner is region champion',
        'Region champions meet for a spot in the title game',
        'The title game at Cumberland Valley High School in Mechanicsburg'
      ]
    ),
    championshipTitle: 'PIAA 6A State Championship',
    championshipVenue: 'Cumberland Valley High School (Mechanicsburg, PA)'
  },
  // PIAA: pass four full-credit subjects each grading period
  academics: { ruleName: 'Pass 4 full-credit subjects', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: 35, // PIAA: running clock with a 35-point lead in the second half
  overtime: { startYardsFromGoal: 10 }
};

/**
 * New Jersey NJSIAA: 59 programs in Non-Public A and Public Group 5 (North and South). Modeled on the Maryland
 * format, the closest fit to NJSIAA's power-point sectional seeding: the top eight in each of four playoff
 * regions by ranking, two sectional rounds, then the two survivors from each region meet other regions in
 * the state quarterfinals. (In reality Non-Public A and Group 5 crown separate champions.)
 */
export const NEW_JERSEY_RULES: StateRules = {
  state: 'New Jersey',
  governingBody: 'NJSIAA',
  classification: 'Group 5',
  districtLabel: 'League',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 0,
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Group 5 & Non-Public A'],
    regional: {
      regions: [
        { name: 'Non-Public A', districts: [1, 2] },
        { name: 'North', districts: [3, 4, 5] },
        { name: 'Central', districts: [6] },
        { name: 'South', districts: [7] }
      ],
      selection: 'RANKING',
      qualifiersPerRegion: 8,
      championsSeededFirst: false,
      regionBracketSize: 8,
      regionalRounds: 2
    },
    ...fiveRounds(
      ['Sectional Quarterfinal', 'Sectional Semifinal', 'State Quarterfinal', 'State Semifinal', 'State Championship'],
      [
        'Opening round: the top eight in each section by power points',
        'Two from each section reach the state quarterfinals',
        'The final eight, across sections',
        'The final four',
        'The title game at MetLife Stadium in East Rutherford'
      ]
    ),
    championshipTitle: 'NJSIAA State Championship',
    championshipVenue: 'MetLife Stadium (East Rutherford, NJ)'
  },
  // NJSIAA: pass 30 credits (a quarter of graduation requirements) the previous year
  academics: { ruleName: 'Pass 30 credits a year', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: 35,
  overtime: { startYardsFromGoal: 10 }
};

/**
 * Louisiana LHSAA Class 5A: 68 programs in ten districts. Modeled on the Georgia format, the closest fit to
 * LHSAA's power-rating seeding: one 32-team bracket seeded by the statewide power ranking, with district
 * champions guaranteed a top-16 seed. Finals at the Superdome. (In reality select and non-select schools
 * play separate brackets.)
 */
export const LOUISIANA_RULES: StateRules = {
  state: 'Louisiana',
  governingBody: 'LHSAA',
  classification: '5A',
  districtLabel: 'District',
  playoffs: {
    format: 'STATEWIDE_RANKING',
    qualifiersPerDistrict: 1,
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Class 5A'],
    ...fiveRounds(
      ['Bi-District', 'Regional', 'Quarterfinals', 'Semifinals', 'State Championship'],
      [
        'Opening round: 32 teams seeded by the LHSAA power rating; district champions host',
        'Sixteen teams left',
        'The final eight',
        'The final four',
        'The title game at the Caesars Superdome in New Orleans'
      ]
    ),
    championshipTitle: 'LHSAA 5A State Championship',
    championshipVenue: 'Caesars Superdome (New Orleans, LA)'
  },
  // LHSAA: pass six units the previous semester with a passing average
  academics: { ruleName: 'Pass 6 units', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: 35,
  overtime: { startYardsFromGoal: 10 }
};

// Round names and descriptions for a 5-round (32-slot) bracket: the first four region-round slots and the final
function fiveRounds(labels: string[], descriptions: string[]) {
  const [first, second, third, fourth, final] = labels;
  const [d1, d2, d3, d4, d5] = descriptions;
  return {
    roundLabels: { BI_DISTRICT: first, AREA: second, REGIONAL_SEMIFINAL: third, REGIONAL_FINAL: fourth, STATE_SEMIFINAL: fourth, STATE_FINAL: final },
    roundDescriptions: { BI_DISTRICT: d1, AREA: d2, REGIONAL_SEMIFINAL: d3, REGIONAL_FINAL: d4, STATE_SEMIFINAL: d4, STATE_FINAL: d5 }
  };
}

/**
 * Florida FHSAA Class 6A (2026-28: six classes plus Rural): 81 programs in 16 districts. Four regions of eight:
 * district champions take seeds 1-4 in their region by MaxPreps ranking, at-large teams by ranking fill 5-8.
 */
export const FLORIDA_RULES: StateRules = {
  state: 'Florida',
  governingBody: 'FHSAA',
  classification: '6A',
  districtLabel: 'District',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 1,
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Class 6A'],
    regional: {
      regions: [
        { name: 'Region 1', districts: [1, 2, 3, 4] },
        { name: 'Region 2', districts: [5, 6, 7, 8] },
        { name: 'Region 3', districts: [9, 10, 11, 12] },
        { name: 'Region 4', districts: [13, 14, 15, 16] }
      ],
      selection: 'RANKING',
      qualifiersPerRegion: 8,
      championsSeededFirst: true,
      regionBracketSize: 8,
      regionalRounds: 3
    },
    ...fiveRounds(
      ['Regional Quarterfinal', 'Regional Semifinal', 'Regional Final', 'State Semifinal', 'State Championship'],
      [
        'Opening round: eight teams per region; district champions are seeded 1-4',
        'Final four in each region',
        'The winner is region champion',
        'Region champions meet for a spot in the title game',
        'The title game at Pitbull Stadium in Miami'
      ]
    ),
    championshipTitle: 'FHSAA 6A State Championship',
    championshipVenue: 'Pitbull Stadium (Miami, FL)'
  },
  academics: { ruleName: '2.0 GPA every marking period', minimumGpa: 2.0, atRiskGpa: 2.3 },
  mercyRuleMargin: 35, // FHSAA: running clock with a 35-point lead in the second half
  overtime: { startYardsFromGoal: 10 }
};

/**
 * Maryland MPSSAA Class 4A (2025-27): 30 programs in four regions. The top eight in each region by the MPSSAA
 * point system play two region rounds; two per region reach the state quarterfinals.
 */
export const MARYLAND_RULES: StateRules = {
  state: 'Maryland',
  governingBody: 'MPSSAA',
  classification: '4A',
  districtLabel: 'Region',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 8,
    bracketSize: 32,
    divisionSplit: 'NONE',
    divisionNames: ['Class 4A'],
    regional: {
      regions: [
        { name: 'West', districts: [1] },
        { name: 'North', districts: [2] },
        { name: 'South', districts: [3] },
        { name: 'East', districts: [4] }
      ],
      selection: 'RANKING',
      qualifiersPerRegion: 8,
      championsSeededFirst: false,
      regionBracketSize: 8,
      regionalRounds: 2
    },
    ...fiveRounds(
      ['Region Quarterfinal', 'Region Semifinal', 'State Quarterfinal', 'State Semifinal', 'State Championship'],
      [
        'Opening round: the top eight in each region by the MPSSAA point system',
        'Two from each region reach the state quarterfinals',
        'The final eight, across regions',
        'The final four',
        'The title game at Navy-Marine Corps Memorial Stadium in Annapolis'
      ]
    ),
    championshipTitle: 'MPSSAA 4A State Championship',
    championshipVenue: 'Navy-Marine Corps Memorial Stadium (Annapolis, MD)'
  },
  // County rules (e.g. Montgomery County): a 2.0 average with no more than one failing grade
  academics: { ruleName: '2.0 average, at most one F', minimumGpa: 2.0, atRiskGpa: 2.3 },
  mercyRuleMargin: 35,
  overtime: { startYardsFromGoal: 10 }
};

/**
 * North Carolina NCHSAA Class 8A (2025-29: eight classes): 32 programs. RPI alone picks a 24-team field, split
 * East and West by location; the top four on each side get a first-round bye.
 */
export const NORTH_CAROLINA_RULES: StateRules = {
  state: 'North Carolina',
  governingBody: 'NCHSAA',
  classification: '8A',
  districtLabel: 'Conference',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 0,
    bracketSize: 24,
    divisionSplit: 'NONE',
    divisionNames: ['Class 8A'],
    regional: {
      // East to west: Wake & Johnston, Wake & Durham, the coast and Triad schools, then Charlotte
      regions: [
        { name: 'East', districts: [1, 2, 5] },
        { name: 'West', districts: [3, 4] }
      ],
      selection: 'RANKING',
      qualifiersPerRegion: 12,
      statewideQualifiers: 24,
      championsSeededFirst: false,
      regionBracketSize: 16,
      regionalRounds: 4
    },
    ...fiveRounds(
      ['First Round', 'Second Round', 'Third Round', 'Regional Final', 'State Championship'],
      [
        'Opening round: 24 teams by RPI, split East and West; the top four on each side have a bye',
        'Sixteen teams left',
        'Eight teams left',
        'The East and West finals',
        'The title game at Kenan Stadium in Chapel Hill'
      ]
    ),
    championshipTitle: 'NCHSAA 8A State Championship',
    championshipVenue: 'Kenan Stadium (Chapel Hill, NC)'
  },
  // NCHSAA: pass a minimum load (three of four block classes) the previous semester
  academics: { ruleName: 'Pass 3 of 4 classes', minimumGpa: 1.5, atRiskGpa: 1.8 },
  mercyRuleMargin: 42, // NCHSAA: running clock with a 42-point lead in the second half
  overtime: { startYardsFromGoal: 10 }
};

/**
 * Alabama AHSAA Class 6A (2026-28, after 7A was folded in): 32 programs in four regions of eight. The top six in
 * each region qualify; the region champion and runner-up have a bye. The Super 7 moves to Mobile in 2026.
 */
export const ALABAMA_RULES: StateRules = {
  state: 'Alabama',
  governingBody: 'AHSAA',
  classification: '6A',
  districtLabel: 'Region',
  playoffs: {
    format: 'REGIONAL_SEEDED',
    qualifiersPerDistrict: 6,
    bracketSize: 24,
    divisionSplit: 'NONE',
    divisionNames: ['Class 6A'],
    regional: {
      regions: [
        { name: 'Region 1', districts: [1] },
        { name: 'Region 2', districts: [2] },
        { name: 'Region 3', districts: [3] },
        { name: 'Region 4', districts: [4] }
      ],
      selection: 'DISTRICT_FINISH',
      qualifiersPerRegion: 6,
      championsSeededFirst: true,
      regionBracketSize: 8,
      regionalRounds: 2
    },
    ...fiveRounds(
      ['First Round', 'Second Round', 'Quarterfinals', 'Semifinals', 'Super 7 Championship'],
      [
        'Opening round: the top six in each region; the top two have a bye',
        'Region champions and runners-up enter',
        'The final eight',
        'The final four',
        'The title game at Hancock Whitney Stadium in Mobile'
      ]
    ),
    championshipTitle: 'AHSAA 6A Super 7 Championship',
    championshipVenue: 'Hancock Whitney Stadium (Mobile, AL)'
  },
  // AHSAA: pass six subjects with a 70 average the previous year
  academics: { ruleName: 'Pass 6 subjects, 70 average', minimumGpa: 1.7, atRiskGpa: 2.0 },
  mercyRuleMargin: null, // AHSAA: a running clock only when both coaches agree
  overtime: { startYardsFromGoal: 10 }
};

/** Playable states and their rules. Add a state here once its rules and complete district data exist. */
export const STATE_RULES: Record<string, StateRules> = {
  Texas: TEXAS_RULES,
  Georgia: GEORGIA_RULES,
  Florida: FLORIDA_RULES,
  Maryland: MARYLAND_RULES,
  'North Carolina': NORTH_CAROLINA_RULES,
  Alabama: ALABAMA_RULES,
  Tennessee: TENNESSEE_RULES,
  Ohio: OHIO_RULES,
  Pennsylvania: PENNSYLVANIA_RULES,
  'New Jersey': NEW_JERSEY_RULES,
  Louisiana: LOUISIANA_RULES
};

export const PLAYABLE_STATES = Object.keys(STATE_RULES);

/** The rules for a state (Texas for anything not yet playable). */
export function rulesForState(state?: string): StateRules {
  return (state && STATE_RULES[state]) || TEXAS_RULES;
}

/** Playoff spots per district when a playoff region seeds by district finish (Tennessee: 8 per two-region group = top 4 each). */
export const finishSpotsPerDistrict = (r: RegionalPlayoffs) => Math.round(r.qualifiersPerRegion / Math.max(1, r.regions[0]?.districts.length ?? 1));

/**
 * How many places in a district's standings are a guaranteed playoff spot: the top N (Texas, Alabama), the
 * champion (Georgia, Florida), or none where a ranking alone picks the field (Maryland, North Carolina).
 */
export function districtPlayoffSpots(rules: StateRules): number {
  const { playoffs } = rules;
  if (playoffs.format === 'DISTRICT_FINISH') return playoffs.qualifiersPerDistrict;
  if (playoffs.format === 'STATEWIDE_RANKING') return 1;
  const r = playoffs.regional;
  if (!r) return 0;
  if (r.selection === 'DISTRICT_FINISH') return finishSpotsPerDistrict(r);
  return r.championsSeededFirst ? 1 : 0;
}

/** One sentence on how a team makes the playoffs (standings, Hub). */
export function playoffQualifyText(rules: StateRules): string {
  const { playoffs, districtLabel } = rules;
  const label = districtLabel.toLowerCase();
  if (playoffs.format === 'STATEWIDE_RANKING')
    return `${districtLabel} champions are guaranteed a playoff spot and a top-${playoffs.bracketSize / 2} seed; the rest of the ${playoffs.bracketSize}-team bracket is filled by the statewide power ranking.`;
  const r = playoffs.regional;
  if (playoffs.format === 'REGIONAL_SEEDED' && r) {
    const byes = r.regionBracketSize - r.qualifiersPerRegion;
    const byeWhere = r.statewideQualifiers ? 'on each side' : r.regions.every((g) => g.districts.length === 1) ? `in each ${label}` : 'in each playoff region';
    const byeText = byes > 0 ? ` The top ${byes} ${byeWhere} get a first-round bye.` : '';
    if (r.statewideQualifiers)
      return `The top ${r.statewideQualifiers} in the power ranking make the playoffs, split ${r.regions.map((g) => g.name).join(' and ')}.${byeText}`;
    if (r.selection === 'DISTRICT_FINISH') return `The top ${finishSpotsPerDistrict(r)} in each ${label} make the playoffs.${byeText}`;
    if (r.championsSeededFirst)
      return `${districtLabel} champions qualify and take the top seeds in their playoff region; the power ranking fills the rest of each ${r.regionBracketSize}-team region bracket.`;
    // Ohio: each playoff region holds several leagues
    const group = r.regions.every((g) => g.districts.length === 1) ? label : 'playoff region';
    return `The top ${r.qualifiersPerRegion} in each ${group} by the power ranking make the playoffs.${byeText}`;
  }
  return `The top ${playoffs.qualifiersPerDistrict} in each ${label} make the playoffs.`;
}
