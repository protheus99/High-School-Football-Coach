import { Team, StateGoverningBody } from '../types/game';
import { simulateMacroMatch } from './macroSim';
import { calculateDistrictStandings } from './districtEngine';
import { STATE_CHAMPIONSHIP_CONFIGS, splitTexasDistrictQualifiers } from './stateRulesEngine';

export type PlayoffRound = 'BI_DISTRICT' | 'AREA' | 'REGIONAL' | 'STATE_FINAL';

export interface BracketNode {
  matchupId: string;
  round: PlayoffRound;
  team1: Team;
  team2: Team;
  team1Score?: number;
  team2Score?: number;
  winnerTeamId?: string;
}

export interface PlayoffBracketState {
  isPlayoffsActive: boolean;
  currentRound: PlayoffRound;
  bracket: {
    biDistrict: BracketNode[];
    area: BracketNode[];
    regional: BracketNode[];
    stateFinal: BracketNode[];
  };
  stateChampionTeamId?: string;
}

/**
 * Initializes a 16-Team Single-Elimination State Playoff Bracket pairing
 * District A (User's District) against District B.
 */
export function buildInitialPlayoffBracket(districtATeams: Team[], districtBTeams: Team[]): PlayoffBracketState {
  const d1 = calculateDistrictStandings(districtATeams);
  const d2 = calculateDistrictStandings(districtBTeams);

  const getTeam = (id: string, pool: Team[]) => pool.find((t) => t.id === id)!;

  // 1 vs 4, 2 vs 3 seeds across both districts (8 matches in the Round of 16)
  const biDistrict: BracketNode[] = [
    { matchupId: 'bd_1', round: 'BI_DISTRICT', team1: getTeam(d1[0].teamId, districtATeams), team2: getTeam(d2[3].teamId, districtBTeams) },
    { matchupId: 'bd_2', round: 'BI_DISTRICT', team1: getTeam(d1[1].teamId, districtATeams), team2: getTeam(d2[2].teamId, districtBTeams) },
    { matchupId: 'bd_3', round: 'BI_DISTRICT', team1: getTeam(d2[0].teamId, districtBTeams), team2: getTeam(d1[3].teamId, districtATeams) },
    { matchupId: 'bd_4', round: 'BI_DISTRICT', team1: getTeam(d2[1].teamId, districtBTeams), team2: getTeam(d1[2].teamId, districtATeams) },
    // Lower quadrant matches
    { matchupId: 'bd_5', round: 'BI_DISTRICT', team1: districtBTeams[0] || districtATeams[0], team2: districtBTeams[3] || districtATeams[3] },
    { matchupId: 'bd_6', round: 'BI_DISTRICT', team1: districtBTeams[1] || districtATeams[1], team2: districtBTeams[2] || districtATeams[2] },
    { matchupId: 'bd_7', round: 'BI_DISTRICT', team1: districtATeams[0], team2: districtBTeams[2] || districtATeams[2] },
    { matchupId: 'bd_8', round: 'BI_DISTRICT', team1: districtATeams[1], team2: districtBTeams[3] || districtATeams[3] }
  ];

  return {
    isPlayoffsActive: true,
    currentRound: 'BI_DISTRICT',
    bracket: {
      biDistrict,
      area: [],
      regional: [],
      stateFinal: []
    }
  };
}

/**
 * Builds the opening playoff round using the state's championship format (e.g. Texas D1/D2 split).
 */
export function buildStateSpecificPlayoffBracket(
  governingBody: StateGoverningBody,
  districtATeams: Team[],
  districtBTeams: Team[]
): PlayoffBracketState {
  const config = STATE_CHAMPIONSHIP_CONFIGS[governingBody] || STATE_CHAMPIONSHIP_CONFIGS.UIL;

  // 1. Texas UIL Split D1/D2 Format
  if (config.formatType === 'SPLIT_ENROLLMENT_D1_D2') {
    const distA = splitTexasDistrictQualifiers(districtATeams);
    const distB = splitTexasDistrictQualifiers(districtBTeams);

    const biDistrictD1: BracketNode[] = [
      { matchupId: 'tx_d1_1', round: 'BI_DISTRICT', team1: distA.division1[0], team2: distB.division1[1] },
      { matchupId: 'tx_d1_2', round: 'BI_DISTRICT', team1: distB.division1[0], team2: distA.division1[1] },
      { matchupId: 'tx_d1_3', round: 'BI_DISTRICT', team1: distA.division1[0], team2: distB.division1[0] },
      { matchupId: 'tx_d1_4', round: 'BI_DISTRICT', team1: distA.division1[1], team2: distB.division1[1] }
    ];

    return {
      isPlayoffsActive: true,
      currentRound: 'BI_DISTRICT',
      bracket: {
        biDistrict: biDistrictD1,
        area: [],
        regional: [],
        stateFinal: []
      }
    };
  }

  // 2. Standard 16-Team Regional/Quadrant Crossover (Alabama 7A, PA 6A, NC 8A, Georgia 6A)
  const d1 = calculateDistrictStandings(districtATeams);
  const d2 = calculateDistrictStandings(districtBTeams);
  const getTeam = (id: string, pool: Team[]) => pool.find((t) => t.id === id)!;

  const biDistrict: BracketNode[] = [
    { matchupId: 'bd_1', round: 'BI_DISTRICT', team1: getTeam(d1[0].teamId, districtATeams), team2: getTeam(d2[3].teamId, districtBTeams) },
    { matchupId: 'bd_2', round: 'BI_DISTRICT', team1: getTeam(d1[1].teamId, districtATeams), team2: getTeam(d2[2].teamId, districtBTeams) },
    { matchupId: 'bd_3', round: 'BI_DISTRICT', team1: getTeam(d2[0].teamId, districtBTeams), team2: getTeam(d1[3].teamId, districtATeams) },
    { matchupId: 'bd_4', round: 'BI_DISTRICT', team1: getTeam(d2[1].teamId, districtBTeams), team2: getTeam(d1[2].teamId, districtATeams) }
  ];

  return {
    isPlayoffsActive: true,
    currentRound: 'BI_DISTRICT',
    bracket: {
      biDistrict,
      area: [],
      regional: [],
      stateFinal: []
    }
  };
}

/**
 * Simulates non-user playoff matches in the active round and advances winners.
 */
export function advancePlayoffRound(
  bracketState: PlayoffBracketState,
  userTeamId: string,
  userGameScore?: { homeScore: number; awayScore: number }
): PlayoffBracketState {
  const { currentRound, bracket } = bracketState;
  const currentNodes =
    currentRound === 'BI_DISTRICT' ? bracket.biDistrict :
    currentRound === 'AREA' ? bracket.area :
    currentRound === 'REGIONAL' ? bracket.regional :
    bracket.stateFinal;

  const winners: Team[] = [];

  currentNodes.forEach((node, i) => {
    // If matchup involves the user's team and a live score was provided
    if (node.team1.id === userTeamId || node.team2.id === userTeamId) {
      if (userGameScore) {
        node.team1Score = userGameScore.homeScore;
        node.team2Score = userGameScore.awayScore;
        const winner = node.team1Score >= node.team2Score ? node.team1 : node.team2;
        node.winnerTeamId = winner.id;
        winners.push(winner);
      }
    } else {
      // AI vs AI background simulation
      const res = simulateMacroMatch(`po_${currentRound}_${i}`, 15, node.team1, node.team2, 'CLEAR');
      node.team1Score = res.homeScore;
      node.team2Score = res.awayScore;
      const winner = res.homeScore >= res.awayScore ? node.team1 : node.team2;
      node.winnerTeamId = winner.id;
      winners.push(winner);
    }
  });

  // Seed subsequent rounds
  if (currentRound === 'BI_DISTRICT') {
    bracketState.bracket.area = [
      { matchupId: 'ar_1', round: 'AREA', team1: winners[0] || currentNodes[0].team1, team2: winners[1] || currentNodes[1].team2 },
      { matchupId: 'ar_2', round: 'AREA', team1: winners[2] || currentNodes[2].team1, team2: winners[3] || currentNodes[3].team2 },
      { matchupId: 'ar_3', round: 'AREA', team1: winners[4] || currentNodes[4].team1, team2: winners[5] || currentNodes[5].team2 },
      { matchupId: 'ar_4', round: 'AREA', team1: winners[6] || currentNodes[6].team1, team2: winners[7] || currentNodes[7].team2 }
    ];
    bracketState.currentRound = 'AREA';
  } else if (currentRound === 'AREA') {
    bracketState.bracket.regional = [
      { matchupId: 'rg_1', round: 'REGIONAL', team1: winners[0] || bracketState.bracket.area[0].team1, team2: winners[1] || bracketState.bracket.area[1].team2 },
      { matchupId: 'rg_2', round: 'REGIONAL', team1: winners[2] || bracketState.bracket.area[2].team1, team2: winners[3] || bracketState.bracket.area[3].team2 }
    ];
    bracketState.currentRound = 'REGIONAL';
  } else if (currentRound === 'REGIONAL') {
    bracketState.bracket.stateFinal = [
      { matchupId: 'sf_1', round: 'STATE_FINAL', team1: winners[0] || bracketState.bracket.regional[0].team1, team2: winners[1] || bracketState.bracket.regional[1].team2 }
    ];
    bracketState.currentRound = 'STATE_FINAL';
  } else if (currentRound === 'STATE_FINAL') {
    bracketState.stateChampionTeamId = winners[0]?.id || bracketState.bracket.stateFinal[0]?.team1.id;
    bracketState.isPlayoffsActive = false;
  }

  return { ...bracketState };
}
