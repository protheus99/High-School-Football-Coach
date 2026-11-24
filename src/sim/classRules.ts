import { STATE_CLASS_RULES } from '../data/stateClassRules';

// ---------------------------------------------------------------------------
// Per-class schedule and playoff rules for every classification in the expansion states. The data is generated
// from expansion/rules/<state>.json by scripts/build-state-rules.mjs (see src/data/stateClassRules.ts); the
// generalized season and playoff engine in classSeason.ts reads it. The playable top classes keep their
// hand-tuned StateRules (stateRules.ts) until the full team lists are wired in.
// ---------------------------------------------------------------------------

/** How a class builds its regular season. */
export type SeasonScheduling = 'DISTRICT_ROUND_ROBIN' | 'SELF_SCHEDULED' | 'LEAGUE_ASSIGNED' | 'MIXED';

/**
 * DISTRICT_FINISH: the top N of every district qualify and paired districts meet (Texas UIL, Tennessee, Alabama).
 * STATEWIDE_RANKING: one bracket seeded 1..N statewide (Georgia, Illinois 7A-8A, Louisiana per pool).
 * REGIONAL_SEEDED: playoff regions seed their own brackets and their survivors meet statewide (Ohio, Florida, NC).
 * SECTIONAL: every section (district) crowns a champion that feeds a state bracket (Pennsylvania, New York, Minnesota).
 * FALLBACK: no format data (private leagues): the best teams by rating play a short bracket.
 */
export type ClassFormat = 'DISTRICT_FINISH' | 'STATEWIDE_RANKING' | 'REGIONAL_SEEDED' | 'SECTIONAL' | 'FALLBACK';

/** How teams are picked and seeded: district standings, an RPI-style rating, a playoff point system, or a win line. */
export type ClassSelection = 'DISTRICT_FINISH' | 'RANKING' | 'POINTS' | 'WIN_THRESHOLD';

/**
 * Several champions per class. ENROLLMENT: each district's qualifiers split by enrollment (UIL 6A Division I / II).
 * SELECT: select (private, charter, magnet) and non-select schools play separate brackets (LHSAA).
 */
export type ClassSplit = 'NONE' | 'ENROLLMENT' | 'SELECT';

export interface ClassRegion {
  name: string;
  districts: string[]; // district names from the data (empty: the engine splits the class's districts in order)
}

export interface ClassPlayoffRules {
  format: ClassFormat;
  selection: ClassSelection;
  fieldSize: number | null; // teams per bracket; null: qualifiers per district x districts, or a share of the pool
  qualifiersPerDistrict: number | null;
  winThreshold: number | null; // WIN_THRESHOLD: wins that qualify outright (the field is then filled by points)
  statewideField: boolean; // pick the whole field statewide first, then split it across the regions in order (NCHSAA, IHSA)
  regions: ClassRegion[]; // playoff regions (REGIONAL_SEEDED) or half lists of sections (SECTIONAL); empty: none
  regionCount: number | null; // REGIONAL_SEEDED / SECTIONAL: region (section) brackets that feed the state rounds
  halves: string[]; // East/West style halves the regions are ordered into, so the halves meet in the final
  regionBracketSize: number | null; // slots per region bracket
  regionalRounds: number | null; // rounds inside a region before regions meet (null: until one team is left)
  sectionRounds: number | null; // SECTIONAL: rounds inside each section bracket (null: derived from the round names)
  championsSeededFirst: boolean; // district champions qualify and take the top seeds of their region
  split: ClassSplit;
  bracketNames: string[]; // one champion per bracket
  postseasonClassing: boolean; // IHSA: classes are assigned after the regular season, by enrollment among qualifiers
  rounds: string[]; // the real round names, first round to final (the engine trims or expands them to the bracket)
  championshipTitle: string;
  championshipVenue: string | null;
}

export interface ClassRules {
  state: string;
  governingBody: string;
  className: string;
  schools: number | null;
  districtLabel: string;
  season: {
    games: number; // regular-season games per team
    districtGames: number | null; // null: a district round robin (capped by the scheduling style)
    scheduling: SeasonScheduling;
  };
  playoffs: ClassPlayoffRules;
  defaults: string[]; // fields the data left null that got an engine default
  approximations: string[]; // where the engine knowingly departs from the real rules
}

/** Every state with per-class rules, in data order. */
export const CLASS_RULE_STATES = Object.keys(STATE_CLASS_RULES);

/** A state's classes (data order). */
export const stateClasses = (state: string): ClassRules[] => STATE_CLASS_RULES[state] ?? [];

/** One class's rules (undefined when the state or class has no data). */
export function classRulesFor(state: string, className: string): ClassRules | undefined {
  return stateClasses(state).find((c) => c.className === className);
}
