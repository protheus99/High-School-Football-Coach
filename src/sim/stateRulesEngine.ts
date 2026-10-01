import { StateGoverningBody, StateChampionshipConfig, Team } from '../types/game';
import { calculateDistrictStandings } from './districtEngine';

export const STATE_CHAMPIONSHIP_CONFIGS: Record<StateGoverningBody, StateChampionshipConfig> = {
  UIL: {
    governingBody: 'UIL',
    stateName: 'Texas',
    classificationName: 'Class 6A',
    formatType: 'SPLIT_ENROLLMENT_D1_D2',
    championshipVenueName: 'AT&T Stadium (Arlington, TX)',
    championshipTrophyTitle: 'UIL 6A State Championship',
    totalQualifyingTeams: 128,
    hasSplitDivisionBrackets: true,
    seedingMethod: 'DISTRICT_FINISH'
  },
  FHSAA: {
    governingBody: 'FHSAA',
    stateName: 'Florida',
    classificationName: 'Class 7A',
    formatType: 'DISTRICT_CHAMP_AT_LARGE_PR',
    championshipVenueName: 'Camping World Stadium (Orlando, FL)',
    championshipTrophyTitle: 'FHSAA 7A State Championship',
    totalQualifyingTeams: 32,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'POWER_RANKING_HYBRID'
  },
  GHSA: {
    governingBody: 'GHSA',
    stateName: 'Georgia',
    classificationName: 'Class 6A',
    formatType: 'QUADRANT_REGION_32',
    championshipVenueName: 'Mercedes-Benz Stadium (Atlanta, GA)',
    championshipTrophyTitle: 'GHSA 6A State Championship',
    totalQualifyingTeams: 32,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'DISTRICT_FINISH'
  },
  CIF: {
    governingBody: 'CIF',
    stateName: 'California',
    classificationName: 'Southern Section Div 1 / Open',
    formatType: 'COMPETITIVE_EQUITY_BOWLS',
    championshipVenueName: 'Saddleback College Stadium (Mission Viejo, CA)',
    championshipTrophyTitle: 'CIF State Open Division Bowl',
    totalQualifyingTeams: 16,
    hasSplitDivisionBrackets: true,
    seedingMethod: 'COMPETITIVE_EQUITY'
  },
  OHSAA: {
    governingBody: 'OHSAA',
    stateName: 'Ohio',
    classificationName: 'Division I',
    formatType: 'HARBIN_POINT_REGIONAL_16',
    championshipVenueName: 'Tom Benson Hall of Fame Stadium (Canton, OH)',
    championshipTrophyTitle: 'OHSAA Division I State Championship',
    totalQualifyingTeams: 64,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'HARBIN_POINTS'
  },
  PIAA: {
    governingBody: 'PIAA',
    stateName: 'Pennsylvania',
    classificationName: 'Class 6A',
    formatType: 'EAST_WEST_REGIONAL_BRACKET',
    championshipVenueName: 'Chapman Field (Mechanicsburg, PA)',
    championshipTrophyTitle: 'PIAA 6A State Championship',
    totalQualifyingTeams: 16,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'DISTRICT_FINISH'
  },
  LHSAA: {
    governingBody: 'LHSAA',
    stateName: 'Louisiana',
    classificationName: 'Class 5A / Division I',
    formatType: 'SELECT_NON_SELECT_SPLIT',
    championshipVenueName: 'Caesars Superdome (New Orleans, LA)',
    championshipTrophyTitle: 'LHSAA Division I State Championship',
    totalQualifyingTeams: 56,
    hasSplitDivisionBrackets: true,
    seedingMethod: 'POWER_RANKING_HYBRID'
  },
  AHSAA: {
    governingBody: 'AHSAA',
    stateName: 'Alabama',
    classificationName: 'Class 7A',
    formatType: 'FOUR_REGION_FIXED_16',
    championshipVenueName: 'Bryant-Denny Stadium / Jordan-Hare Stadium (Super 7)',
    championshipTrophyTitle: 'AHSAA 7A State Championship (Super 7)',
    totalQualifyingTeams: 16,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'DISTRICT_FINISH'
  },
  NCHSAA: {
    governingBody: 'NCHSAA',
    stateName: 'North Carolina',
    classificationName: 'Class 8A',
    formatType: 'EAST_WEST_REGIONAL_BRACKET',
    championshipVenueName: 'Kenan Stadium / Carter-Finley Stadium',
    championshipTrophyTitle: 'NCHSAA 8A State Championship',
    totalQualifyingTeams: 32,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'DISTRICT_FINISH'
  },
  TSSAA: {
    governingBody: 'TSSAA',
    stateName: 'Tennessee',
    classificationName: 'Class 6A / DII-AAA',
    formatType: 'QUADRANT_REGION_32',
    championshipVenueName: 'Finley Stadium (Chattanooga, TN)',
    championshipTrophyTitle: 'TSSAA BlueCross Bowl',
    totalQualifyingTeams: 32,
    hasSplitDivisionBrackets: true,
    seedingMethod: 'DISTRICT_FINISH'
  },
  NJSIAA: {
    governingBody: 'NJSIAA',
    stateName: 'New Jersey',
    classificationName: 'Non-Public A / Group 5',
    formatType: 'NON_PUBLIC_SUPER_GROUP',
    championshipVenueName: 'MetLife Stadium (East Rutherford, NJ)',
    championshipTrophyTitle: 'NJSIAA Non-Public A / Group 5 State Championship',
    totalQualifyingTeams: 32,
    hasSplitDivisionBrackets: true,
    seedingMethod: 'POWER_RANKING_HYBRID'
  },
  MPSSAA: {
    governingBody: 'MPSSAA',
    stateName: 'Maryland',
    classificationName: 'Class 4A',
    formatType: 'EAST_WEST_REGIONAL_BRACKET',
    championshipVenueName: 'Navy-Marine Corps Memorial Stadium (Annapolis, MD)',
    championshipTrophyTitle: 'MPSSAA 4A State Championship',
    totalQualifyingTeams: 16,
    hasSplitDivisionBrackets: false,
    seedingMethod: 'POWER_RANKING_HYBRID'
  }
};

/**
 * Texas UIL 6A Division 1 vs. Division 2 Split Resolver.
 * Takes 4 playoff qualifiers from a district and places the 2 larger enrollment schools
 * into Division 1, and the 2 smaller into Division 2.
 */
export function splitTexasDistrictQualifiers(districtTeams: Team[]): { division1: Team[]; division2: Team[] } {
  const standings = calculateDistrictStandings(districtTeams);
  const qualifiers = standings.slice(0, 4).map((row) => districtTeams.find((t) => t.id === row.teamId)!);

  // Sort the 4 qualifiers by prestige / enrollment size
  const sortedByEnrollment = [...qualifiers].sort((a, b) => b.prestige - a.prestige);

  return {
    division1: [sortedByEnrollment[0], sortedByEnrollment[1]], // Larger 6A-D1
    division2: [sortedByEnrollment[2], sortedByEnrollment[3]]  // Smaller 6A-D2
  };
}

/**
 * Florida FHSAA Power-Ranked At-Large Qualifier Resolver.
 * Automatically gives seeds 1-4 to District Champions and fills seeds 5-8 via power ranking.
 */
export function resolveFloridaRegionalSeeds(districtChampions: Team[], atLargePool: Team[]): Team[] {
  const sortedChampions = [...districtChampions].sort((a, b) => b.record.wins - a.record.wins);
  const sortedAtLarge = [...atLargePool]
    .filter((t) => !districtChampions.some((c) => c.id === t.id))
    .sort((a, b) => b.prestige * 0.5 + b.record.wins * 5 - (a.prestige * 0.5 + a.record.wins * 5));

  // Top 4 seeds are District Champions; 5-8 are at-large power ranking wildcards
  return [...sortedChampions.slice(0, 4), ...sortedAtLarge.slice(0, 4)];
}
