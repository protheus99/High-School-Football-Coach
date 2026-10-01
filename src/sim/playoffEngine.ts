import { Team } from '../types/game';
import { simulateMacroMatch } from './macroSim';
import { calculateDistrictStandings } from './districtEngine';
import { STATE_CHAMPIONSHIP_CONFIGS } from './stateRulesEngine';

export type PlayoffRound = 'BI_DISTRICT' | 'AREA' | 'REGIONAL' | 'STATE_FINAL';

const ROUND_ORDER: PlayoffRound[] = ['BI_DISTRICT', 'AREA', 'REGIONAL', 'STATE_FINAL'];
const ROUND_KEYS = { BI_DISTRICT: 'biDistrict', AREA: 'area', REGIONAL: 'regional', STATE_FINAL: 'stateFinal' } as const;
const PLAYOFF_QUALIFIERS_PER_DISTRICT = 4;

export interface BracketNode {
  matchupId: string;
  round: PlayoffRound;
  team1: Team; // higher seed / host
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
  championshipTitle?: string;
  championshipVenue?: string;
}

/** A district's playoff qualifiers in seed order (district standings with tiebreakers). */
function districtSeeds(teams: Team[]): Team[] {
  return calculateDistrictStandings(teams)
    .slice(0, PLAYOFF_QUALIFIERS_PER_DISTRICT)
    .map((row) => teams.find((t) => t.id === row.teamId)!);
}

/**
 * Initializes the 16-team single-elimination bracket from four districts.
 * Districts are paired (1st with 2nd, 3rd with 4th); each pairing plays 1 vs 4 and 2 vs 3
 * across districts with the higher seed hosting. Node order keeps each quarter of the bracket
 * adjacent so winners of neighboring nodes meet in the next round.
 */
export function buildInitialPlayoffBracket(districts: Team[][]): PlayoffBracketState {
  if (districts.length !== 4) {
    throw new Error(`A 16-team bracket needs 4 districts, got ${districts.length}`);
  }

  const biDistrict: BracketNode[] = [];
  for (let pair = 0; pair < 2; pair++) {
    const a = districtSeeds(districts[pair * 2]);
    const b = districtSeeds(districts[pair * 2 + 1]);
    const games: [Team, Team][] = [[a[0], b[3]], [b[1], a[2]], [b[0], a[3]], [a[1], b[2]]];
    games.forEach(([team1, team2]) =>
      biDistrict.push({ matchupId: `bd_${biDistrict.length + 1}`, round: 'BI_DISTRICT', team1, team2 })
    );
  }

  const uil = STATE_CHAMPIONSHIP_CONFIGS.UIL;
  return {
    isPlayoffsActive: true,
    currentRound: 'BI_DISTRICT',
    bracket: { biDistrict, area: [], regional: [], stateFinal: [] },
    championshipTitle: uil.championshipTrophyTitle,
    championshipVenue: uil.championshipVenueName
  };
}

export function getRoundNodes(bracketState: PlayoffBracketState, round: PlayoffRound = bracketState.currentRound): BracketNode[] {
  return bracketState.bracket[ROUND_KEYS[round]];
}

/** Records the user's live result (team1 is the home team) on their node in the current round. */
export function recordPlayoffResult(
  bracketState: PlayoffBracketState,
  userTeamId: string,
  score: { homeScore: number; awayScore: number }
): PlayoffBracketState {
  const node = getRoundNodes(bracketState).find((n) => n.team1.id === userTeamId || n.team2.id === userTeamId);
  if (node && !node.winnerTeamId) {
    node.team1Score = score.homeScore;
    node.team2Score = score.awayScore;
    node.winnerTeamId = score.homeScore > score.awayScore ? node.team1.id : node.team2.id;
  }
  return { ...bracketState };
}

/**
 * Resolves every undecided game in the current round (including the user's, if it was
 * not played live) and seeds the next round, or crowns the champion after the final.
 */
export function advancePlayoffRound(
  bracketState: PlayoffBracketState,
  userTeamId?: string,
  userGameScore?: { homeScore: number; awayScore: number }
): PlayoffBracketState {
  if (!bracketState.isPlayoffsActive) return bracketState;
  if (userTeamId && userGameScore) recordPlayoffResult(bracketState, userTeamId, userGameScore);

  const { currentRound } = bracketState;
  const nodes = getRoundNodes(bracketState);

  nodes.forEach((node) => {
    if (node.winnerTeamId) return;
    const res = simulateMacroMatch(`po_${currentRound}_${node.matchupId}`, 15, node.team1, node.team2, 'CLEAR');
    node.team1Score = res.homeScore;
    node.team2Score = res.awayScore;
    node.winnerTeamId = res.homeScore > res.awayScore ? node.team1.id : node.team2.id;
  });

  const winners = nodes.map((n) => (n.winnerTeamId === n.team1.id ? n.team1 : n.team2));

  if (currentRound === 'STATE_FINAL') {
    bracketState.stateChampionTeamId = winners[0].id;
    bracketState.isPlayoffsActive = false;
    return { ...bracketState };
  }

  const nextRound = ROUND_ORDER[ROUND_ORDER.indexOf(currentRound) + 1];
  const prefix = { AREA: 'ar', REGIONAL: 'rg', STATE_FINAL: 'sf', BI_DISTRICT: 'bd' }[nextRound];
  bracketState.bracket[ROUND_KEYS[nextRound]] = Array.from({ length: winners.length / 2 }, (_, i) => ({
    matchupId: `${prefix}_${i + 1}`,
    round: nextRound,
    team1: winners[i * 2],
    team2: winners[i * 2 + 1]
  }));
  bracketState.currentRound = nextRound;

  return { ...bracketState };
}
