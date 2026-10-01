import { OffensiveScheme, DefensiveScheme, Team } from '../types/game';
import texas6A from '../data/texas-6a.json';
import { generateDistrictTeams, NEIGHBOR_DISTRICT_SCHOOLS, PLAYOFF_REGION_DISTRICT_SCHOOLS } from '../generators/rosterGenerator';
import { nameProfileForArea } from '../generators/names';
import { LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';

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

/** All of Texas 6A from the design spec's database: 4 regions, 32 districts, every varsity program. */
export function buildTexasLeague(): { league: LeagueStructure; teams: Team[]; userTeamId: string } {
  const teams: Team[] = [];
  const regions: LeagueRegion[] = texas6A.regions.map((region) => ({
    name: region.name,
    area: region.area,
    districts: region.districts.map((district) => {
      const districtTeams = generateDistrictTeams(
        `tx_6a_d${district.number}`,
        district.schools.map((s) => ({
          name: s.name,
          mascot: s.mascot,
          primary: s.primaryColor,
          secondary: s.secondaryColor,
          prestige: s.prestige,
          offenseScheme: s.offenseScheme as OffensiveScheme,
          defenseScheme: s.defenseScheme as DefensiveScheme
        })),
        { talentFromPrestige: true, state: 'Texas', nameProfile: nameProfileForArea(district.area) }
      );
      teams.push(...districtTeams);
      return { id: `tx_6a_d${district.number}`, name: district.name, area: district.area, teamIds: districtTeams.map((t) => t.id) };
    })
  }));

  const userTeamId = teams.find((t) => t.name === DEFAULT_USER_SCHOOL)?.id ?? teams[0].id;
  return { league: { name: 'UIL Class 6A', state: 'Texas', splitDivisions: true, regions }, teams, userTeamId };
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
  const qualifiersPerDistrict = league.splitDivisions ? 2 : 4;
  const regionQualifiers = (league.regions[0]?.districts.length ?? 0) * qualifiersPerDistrict;
  return Math.log2(regionQualifiers) + Math.log2(league.regions.length);
}

/** Regular season + playoff rounds + the banquet week. */
export function seasonLength(league: LeagueStructure): number {
  return LAST_REGULAR_SEASON_WEEK + playoffRoundCount(league) + 1;
}
