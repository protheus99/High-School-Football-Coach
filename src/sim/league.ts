import { OffensiveScheme, DefensiveScheme, Team } from '../types/game';
import texas6A from '../data/texas-6a.json';
import georgia7A from '../data/georgia-7a.json';
import florida6A from '../data/florida-6a.json';
import maryland4A from '../data/maryland-4a.json';
import northCarolina8A from '../data/north-carolina-8a.json';
import alabama6A from '../data/alabama-6a.json';
import tennessee6A from '../data/tennessee-6a.json';
import ohioD1 from '../data/ohio-d1.json';
import { generateDistrictTeams, NEIGHBOR_DISTRICT_SCHOOLS, PLAYOFF_REGION_DISTRICT_SCHOOLS } from '../generators/rosterGenerator';
import { nameProfileForArea } from '../generators/names';
import { OFF_SEASON_WEEKS, STATE_FINAL_WEEK } from './scheduleEngine';
import { rulesForState } from './stateRules';

export interface LeagueDistrict {
  id: string;
  name: string;
  area?: string;
  teamIds: string[];
}

export interface LeagueRegion {
  name: string;
  area?: string;
  districts: LeagueDistrict[];
}

/** The game world: regions of districts. Texas 6A splits playoff qualifiers into Division 1 and 2 (UIL). */
export interface LeagueStructure {
  name: string;
  state: string;
  splitDivisions: boolean;
  regions: LeagueRegion[];
}

export const DEFAULT_USER_SCHOOL = 'Austin Westlake';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** New Game: the school's prestige range for each difficulty (stronger programs are easier). */
export const DIFFICULTY_PRESTIGE: Record<Difficulty, { min: number; max: number }> = {
  EASY: { min: 90, max: 100 },
  MEDIUM: { min: 80, max: 89 },
  HARD: { min: 60, max: 79 }
};

/** A playable state's bundled top class: regions of districts of schools (built from the design spec / official alignments). */
interface StateWorldData {
  regions: {
    name: string;
    area: string;
    districts: {
      number: number;
      name: string;
      area: string;
      schools: { name: string; mascot: string; primaryColor: string; secondaryColor: string; prestige: number; offenseScheme: string; defenseScheme: string }[];
    }[];
  }[];
}

/** Every playable state's world: its data, league name, whether its brackets split by enrollment, and the default school. */
const STATE_WORLDS: Record<string, { data: StateWorldData; leagueName: string; splitDivisions: boolean; idPrefix: string; defaultSchool: string }> = {
  Texas: { data: texas6A, leagueName: 'UIL Class 6A', splitDivisions: true, idPrefix: 'tx_6a_d', defaultSchool: DEFAULT_USER_SCHOOL },
  Georgia: { data: georgia7A, leagueName: 'GHSA Class 7A', splitDivisions: false, idPrefix: 'ga_7a_r', defaultSchool: 'Buford' },
  Florida: { data: florida6A, leagueName: 'FHSAA Class 6A', splitDivisions: false, idPrefix: 'fl_6a_d', defaultSchool: 'Apopka' },
  Maryland: { data: maryland4A, leagueName: 'MPSSAA Class 4A', splitDivisions: false, idPrefix: 'md_4a_r', defaultSchool: 'Quince Orchard' },
  'North Carolina': { data: northCarolina8A, leagueName: 'NCHSAA Class 8A', splitDivisions: false, idPrefix: 'nc_8a_c', defaultSchool: 'Hough' },
  Alabama: { data: alabama6A, leagueName: 'AHSAA Class 6A', splitDivisions: false, idPrefix: 'al_6a_r', defaultSchool: 'Thompson' },
  Tennessee: { data: tennessee6A, leagueName: 'TSSAA Class 6A', splitDivisions: false, idPrefix: 'tn_6a_r', defaultSchool: 'Oakland' },
  Ohio: { data: ohioD1, leagueName: 'OHSAA Division I', splitDivisions: false, idPrefix: 'oh_d1_l', defaultSchool: 'Lakewood St. Edward' }
};

/** A random school in the state's top class whose prestige fits the difficulty. */
export function pickSchoolForDifficulty(difficulty: Difficulty, state = 'Texas'): string {
  const { min, max } = DIFFICULTY_PRESTIGE[difficulty];
  const all = (STATE_WORLDS[state] ?? STATE_WORLDS.Texas).data.regions.flatMap((r) => r.districts.flatMap((d) => d.schools));
  const fits = all.filter((s) => s.prestige >= min && s.prestige <= max);
  // Smaller states may have no school in a band: take the closest prestige instead
  const pool = fits.length > 0 ? fits : [...all].sort((a, b) => Math.abs(a.prestige - (min + max) / 2) - Math.abs(b.prestige - (min + max) / 2)).slice(0, 3);
  return pool[Math.floor(Math.random() * pool.length)].name;
}

/** A built game world and the team the user coaches. */
export interface GameWorld {
  league: LeagueStructure;
  teams: Team[];
  userTeamId: string;
}

/** All of Texas 6A from the design spec's database: 4 regions, 32 districts, every varsity program. */
export function buildTexasLeague(userSchool = DEFAULT_USER_SCHOOL): GameWorld {
  return buildStateWorld('Texas', userSchool);
}

/** A playable state's whole top class (Texas 6A, Georgia 7A), with the user at the given school. */
export function buildStateWorld(state: string, userSchool?: string, light = false): GameWorld {
  const world = STATE_WORLDS[state] ?? STATE_WORLDS.Texas;
  const stateName = STATE_WORLDS[state] ? state : 'Texas';
  const teams: Team[] = [];
  const regions: LeagueRegion[] = world.data.regions.map((region) => ({
    name: region.name,
    area: region.area,
    districts: region.districts.map((district) => {
      const districtTeams = generateDistrictTeams(
        `${world.idPrefix}${district.number}`,
        district.schools.map((s) => ({
          name: s.name,
          mascot: s.mascot,
          primary: s.primaryColor,
          secondary: s.secondaryColor,
          prestige: s.prestige,
          offenseScheme: s.offenseScheme as OffensiveScheme,
          defenseScheme: s.defenseScheme as DefensiveScheme
        })),
        { talentFromPrestige: true, state: stateName, nameProfile: nameProfileForArea(district.area), light }
      );
      teams.push(...districtTeams);
      return { id: `${world.idPrefix}${district.number}`, name: district.name, area: district.area, teamIds: districtTeams.map((t) => t.id) };
    })
  }));

  const userTeamId = (teams.find((t) => t.name === userSchool) ?? teams.find((t) => t.name === world.defaultSchool) ?? teams[0]).id;
  return { league: { name: world.leagueName, state: stateName, splitDivisions: world.splitDivisions, regions }, teams, userTeamId };
}

/**
 * A smaller world around an imported district (custom JSON or another state's district): the imported
 * district, a neighboring district for non-district games, and two more districts for a 16-team bracket.
 */
export function buildCustomLeague(imported: Team[], districtName = 'Custom District'): { league: LeagueStructure; teams: Team[] } {
  const neighbor = generateDistrictTeams('tx_6a_d25', NEIGHBOR_DISTRICT_SCHOOLS);
  const [regionC, regionD] = PLAYOFF_REGION_DISTRICT_SCHOOLS.map((schools, i) => generateDistrictTeams(`tx_6a_d${27 + i}`, schools));
  const district = (id: string, name: string, teams: Team[]): LeagueDistrict => ({ id, name, teamIds: teams.map((t) => t.id) });
  return {
    league: {
      name: districtName,
      state: imported[0]?.state ?? 'Texas',
      splitDivisions: false,
      regions: [
        { name: 'Region 1', districts: [district(imported[0]?.districtId ?? 'custom', districtName, imported), district('tx_6a_d25', 'District 25-6A', neighbor)] },
        { name: 'Region 2', districts: [district('tx_6a_d27', 'District 27-6A', regionC), district('tx_6a_d28', 'District 28-6A', regionD)] }
      ]
    },
    teams: [...imported, ...neighbor, ...regionC, ...regionD]
  };
}

/** A real state district file from public/leagues (built from the design spec's school databases). */
export interface StateDistrictFile {
  state: string;
  districtId: string;
  districtName: string;
  schools: {
    name: string;
    mascot: string;
    primaryColor?: string;
    secondaryColor?: string;
    prestige?: number;
    offenseScheme?: string;
    defenseScheme?: string;
  }[];
}

/** Districts in a state world: two regions of two districts, a 16-team bracket. */
export const STATE_WORLD_DISTRICTS = 4;

/** The districts closest to the user's in the state's list (files are ordered geographically by region). */
export function nearestDistrictIndexes(count: number, userIndex: number, needed = STATE_WORLD_DISTRICTS - 1): number[] {
  return Array.from({ length: count }, (_, i) => i)
    .filter((i) => i !== userIndex)
    .sort((a, b) => Math.abs(a - userIndex) - Math.abs(b - userIndex) || a - b)
    .slice(0, needed);
}

// Generic schools that fill out a state with fewer than four districts in the database
const FILLER_SCHOOLS: [string, string, string, string][] = [
  ['Riverside', 'Rams', '#7C2D12', '#F59E0B'],
  ['Lakeview', 'Lakers', '#1D4ED8', '#FFFFFF'],
  ['Oak Ridge', 'Oaks', '#166534', '#FACC15'],
  ['Fairview', 'Falcons', '#991B1B', '#E5E7EB'],
  ['Westfield', 'Warriors', '#4C1D95', '#FBBF24'],
  ['Northridge', 'Knights', '#0F172A', '#94A3B8'],
  ['Clearwater', 'Cougars', '#0E7490', '#F8FAFC'],
  ['Highland', 'Highlanders', '#14532D', '#DC2626'],
  ['Millbrook', 'Mustangs', '#B45309', '#1F2937'],
  ['Cedar Grove', 'Panthers', '#000000', '#F97316'],
  ['Summit', 'Spartans', '#1E3A8A', '#FCD34D'],
  ['Valley View', 'Vikings', '#6B21A8', '#E5E7EB'],
  ['Brookside', 'Bulldogs', '#B91C1C', '#000000'],
  ['Eastwood', 'Eagles', '#065F46', '#FDE68A'],
  ['Pine Crest', 'Pioneers', '#7F1D1D', '#D1D5DB'],
  ['Southview', 'Stallions', '#1E40AF', '#F87171']
];

function fillerDistrict(state: string, index: number): StateDistrictFile {
  const slice = FILLER_SCHOOLS.slice((index * 8) % FILLER_SCHOOLS.length).concat(FILLER_SCHOOLS).slice(0, 8);
  return {
    state,
    districtId: `${state.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_filler_${index + 1}`,
    districtName: `${state} Conference ${index + 1}`,
    schools: slice.map(([name, mascot, primaryColor, secondaryColor]) => ({ name, mascot, primaryColor, secondaryColor, prestige: 60 + ((name.length * 7) % 25) }))
  };
}

/**
 * A world built from one state's real districts: the user's district plus its nearest neighbors in the same
 * state (two regions, a 16-team bracket). States with fewer than four districts are filled out with generic
 * schools from that state. The user coaches `userSchool` (default: the district's first school).
 */
export function buildStateLeague(userDistrict: StateDistrictFile, neighbors: StateDistrictFile[], userSchool?: string): GameWorld {
  const files = [userDistrict, ...neighbors.slice(0, STATE_WORLD_DISTRICTS - 1)];
  for (let i = 0; files.length < STATE_WORLD_DISTRICTS; i++) files.push(fillerDistrict(userDistrict.state, i));

  const teams: Team[] = [];
  const districts: LeagueDistrict[] = files.map((file) => {
    const districtTeams = generateDistrictTeams(
      file.districtId,
      file.schools.map((s) => ({
        name: s.name,
        mascot: s.mascot,
        primary: s.primaryColor ?? '#002D62',
        secondary: s.secondaryColor ?? '#C4D600',
        prestige: s.prestige,
        offenseScheme: s.offenseScheme as OffensiveScheme | undefined,
        defenseScheme: s.defenseScheme as DefensiveScheme | undefined
      })),
      { talentFromPrestige: true, state: file.state, nameProfile: nameProfileForArea(file.districtName) }
    );
    teams.push(...districtTeams);
    return { id: file.districtId, name: file.districtName, teamIds: districtTeams.map((t) => t.id) };
  });

  const userTeams = teams.filter((t) => districts[0].teamIds.includes(t.id));
  const userTeamId = (userTeams.find((t) => t.name === userSchool) ?? userTeams[0]).id;
  return {
    league: {
      name: `${userDistrict.state} ${userDistrict.districtName}`,
      state: userDistrict.state,
      splitDivisions: false,
      regions: [
        { name: 'Region 1', districts: districts.slice(0, 2) },
        { name: 'Region 2', districts: districts.slice(2, 4) }
      ]
    },
    teams,
    userTeamId
  };
}

/** Region -> district -> team objects, in league order. */
export function leagueRegionTeams(league: LeagueStructure, teams: Team[]): Team[][][] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return league.regions.map((region) =>
    region.districts.map((district) => district.teamIds.map((id) => byId.get(id)).filter((t): t is Team => t !== undefined))
  );
}

export function findDistrict(league: LeagueStructure, teamId: string): LeagueDistrict | undefined {
  for (const region of league.regions) {
    const district = region.districts.find((d) => d.teamIds.includes(teamId));
    if (district) return district;
  }
  return undefined;
}

export function findRegion(league: LeagueStructure, teamId: string): LeagueRegion | undefined {
  return league.regions.find((region) => region.districts.some((d) => d.teamIds.includes(teamId)));
}

/** Rounds needed: each region's qualifiers play down to a champion, then region champions meet. */
export function playoffRoundCount(league: LeagueStructure): number {
  const { playoffs } = rulesForState(league.state);
  if (playoffs.format === 'STATEWIDE_RANKING') return Math.log2(playoffs.bracketSize);
  if (playoffs.format === 'REGIONAL_SEEDED' && playoffs.regional) return Math.log2(playoffs.regional.regions.length * playoffs.regional.regionBracketSize);
  const split = league.splitDivisions && playoffs.divisionSplit === 'TOP_ENROLLMENT_HALF';
  const qualifiersPerDistrict = split ? playoffs.qualifiersPerDistrict / playoffs.divisionNames.length : playoffs.qualifiersPerDistrict;
  const regionQualifiers = (league.regions[0]?.districts.length ?? 0) * qualifiersPerDistrict;
  return Math.log2(regionQualifiers) + Math.log2(league.regions.length);
}

/** Pre season, camp and regular season + playoff rounds + the banquet week + the off season. */
export function seasonLength(league: LeagueStructure): number {
  void league; // the same for every state: the title games share week 23
  return STATE_FINAL_WEEK + 1 + OFF_SEASON_WEEKS;
}
