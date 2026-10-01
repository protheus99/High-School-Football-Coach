import { Team, OffensiveScheme, DefensiveScheme } from '../types/game';
import { generateCompleteTeamRoster } from '../generators/rosterGenerator';

export interface CustomDistrictImportSchema {
  state: string;
  classification: '1A' | '2A' | '3A' | '4A' | '5A' | '6A';
  districtId: string;
  districtName?: string;
  schools: Array<{
    name: string;
    mascot: string;
    primaryColor: string;
    secondaryColor: string;
    prestige: number;
    headCoachName?: string;
    offenseScheme?: OffensiveScheme;
    defenseScheme?: DefensiveScheme;
  }>;
}

const OFFENSIVE_SCHEMES: OffensiveScheme[] = ['TRIPLE_OPTION', 'AIR_RAID', 'POWER_I', 'SPREAD'];
const DEFENSIVE_SCHEMES: DefensiveScheme[] = ['FOUR_THREE', 'FOUR_FOUR', 'THREE_THREE_FIVE', 'DROP_EIGHT'];

/**
 * Validates and converts user JSON into playable Team state.
 */
export function importCustomDistrictJSON(jsonString: string): { success: boolean; teams?: Team[]; error?: string } {
  try {
    const data = JSON.parse(jsonString) as CustomDistrictImportSchema;

    if (!data.schools || !Array.isArray(data.schools) || data.schools.length < 4) {
      return { success: false, error: 'A district must contain at least 4 schools.' };
    }

    const teams: Team[] = data.schools.map((school, i) => ({
      id: `custom_team_${school.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${i}`,
      name: school.name,
      mascot: school.mascot,
      classification: data.classification || '6A',
      state: data.state,
      districtId: data.districtId || 'custom_district',
      primaryColor: school.primaryColor || '#002D62',
      secondaryColor: school.secondaryColor || '#C4D600',
      prestige: Math.min(99, Math.max(40, school.prestige || 75)),
      playbookFamiliarity: 80,
      schemeOffense: OFFENSIVE_SCHEMES.includes(school.offenseScheme as OffensiveScheme) ? school.offenseScheme! : 'SPREAD',
      schemeDefense: DEFENSIVE_SCHEMES.includes(school.defenseScheme as DefensiveScheme) ? school.defenseScheme! : 'FOUR_THREE',
      programMeters: {
        schoolBoardTrust: 80,
        boosterApproval: 80,
        lockerRoomDiscipline: 80,
        complianceScore: 90
      },
      staff: {
        headCoachId: `coach_${i}`,
        headCoachName: school.headCoachName || `Coach ${school.name}`,
        reputation: school.prestige || 75,
        offensiveCoordinator: { name: 'OC Smith', playCalling: 75, qbWhispering: 72 },
        defensiveCoordinator: { name: 'DC Miller', schemeDiscipline: 75, tacklingTech: 72 },
        strengthCoach: { name: 'Trainer Jackson', conditioningRating: 80 }
      },
      roster: generateCompleteTeamRoster(),
      record: {
        wins: 0,
        losses: 0,
        districtWins: 0,
        districtLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        districtPointDifferential: 0,
        headToHeadHistory: {}
      }
    }));

    return { success: true, teams };
  } catch {
    return { success: false, error: 'Malformed JSON schema. Please verify syntax.' };
  }
}

/**
 * Exports active district data to a downloadable JSON file.
 */
export function exportDistrictToJSON(teams: Team[]): string {
  const exportPayload: CustomDistrictImportSchema = {
    state: teams[0]?.state ?? 'Texas',
    classification: teams[0]?.classification || '6A',
    districtId: teams[0]?.districtId || 'tx_6a_d26',
    schools: teams.map((t) => ({
      name: t.name,
      mascot: t.mascot,
      primaryColor: t.primaryColor,
      secondaryColor: t.secondaryColor,
      prestige: t.prestige,
      headCoachName: t.staff.headCoachName,
      offenseScheme: t.schemeOffense,
      defenseScheme: t.schemeDefense
    }))
  };

  return JSON.stringify(exportPayload, null, 2);
}
