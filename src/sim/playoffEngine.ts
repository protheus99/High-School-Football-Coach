import { Team } from '../types/game';
import { simulateMacroMatch, rollGameInjuries } from './macroSim';
import { LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { calculateDistrictStandings } from './districtEngine';
import { StateRules, TEXAS_RULES } from './stateRules';

export type PlayoffRound =
  | 'BI_DISTRICT'
  | 'AREA'
  | 'REGIONAL_SEMIFINAL'
  | 'REGIONAL_FINAL'
  | 'STATE_SEMIFINAL'
  | 'STATE_FINAL';

/** Round names shown in the game (the playable state's: Texas UIL). */
export const ROUND_LABELS: Record<PlayoffRound, string> = TEXAS_RULES.playoffs.roundLabels;

/** One line on what each round is (the schedule shows it for weeks without the user's game). */
export const ROUND_DESCRIPTIONS: Record<PlayoffRound, string> = {
  BI_DISTRICT: 'Opening round: the top four in each district face the paired district',
  AREA: 'Bi-District winners meet',
  REGIONAL_SEMIFINAL: 'Final four in each region',
  REGIONAL_FINAL: 'The winner is region champion',
  STATE_SEMIFINAL: 'Region champions meet for a spot in the title game',
  STATE_FINAL: 'The title game at AT&T Stadium in Arlington'
};

export interface BracketNode {
  matchupId: string;
  round: PlayoffRound;
  region?: string; // set while the game is inside a region bracket
  team1: Team; // higher seed / host
  team2: Team;
  team1Score?: number;
  team2Score?: number;
  winnerTeamId?: string;
  isBye?: boolean; // the paired district had no qualifier: team1 advances without playing (team2 repeats team1)
}

export interface PlayoffDivision {
  name: string; // "Division 1", "Division 2", or "State" when divisions are not split
  rounds: BracketNode[][];
  championTeamId?: string;
}

export interface PlayoffBracketState {
  isPlayoffsActive: boolean;
  roundNames: PlayoffRound[];
  currentRoundIndex: number;
  divisions: PlayoffDivision[];
  championshipTitle?: string;
  championshipVenue?: string;
}

/** Round names: region rounds count up from Bi-District, state rounds count down to the final. */
export function roundNamesFor(regionRounds: number, stateRounds: number): PlayoffRound[] {
  const region: PlayoffRound[][] = [[], ['REGIONAL_FINAL'], ['BI_DISTRICT', 'REGIONAL_FINAL'], ['BI_DISTRICT', 'AREA', 'REGIONAL_FINAL'],
    ['BI_DISTRICT', 'AREA', 'REGIONAL_SEMIFINAL', 'REGIONAL_FINAL']];
  const state: PlayoffRound[][] = [[], ['STATE_FINAL'], ['STATE_SEMIFINAL', 'STATE_FINAL']];
  const names = [...region[regionRounds], ...state[stateRounds]];
  if (stateRounds === 0) names[names.length - 1] = 'STATE_FINAL';
  return names;
}

/** A district's qualifiers in district-finish order (excluding banned teams). */
function districtQualifiers(teams: Team[], excludeTeamIds: string[], count: number): Team[] {
  const eligible = teams.filter((t) => !excludeTeamIds.includes(t.id));
  return calculateDistrictStandings(eligible)
    .slice(0, count)
    .map((row) => eligible.find((t) => t.id === row.teamId)!);
}

/** UIL 6A split: the two largest-enrollment qualifiers go to Division 1, the other two to Division 2 (each keeps finish order). */
function splitByEnrollment(qualifiers: Team[], perDivision: number): [Team[], Team[]] {
  const largest = [...qualifiers].sort((a, b) => (b.enrollment ?? 0) - (a.enrollment ?? 0)).slice(0, perDivision);
  return [qualifiers.filter((t) => largest.includes(t)), qualifiers.filter((t) => !largest.includes(t))];
}

/**
 * First-round games for one region. Districts are paired (1-2, 3-4, ...). With two qualifiers per district
 * the district champion hosts the paired district's runner-up; with four, 1 vs 4 and 2 vs 3. Node order
 * interleaves district pairs so that adjacent winners meet next without an immediate same-district rematch.
 */
function regionFirstRound(region: string, districtSeeds: Team[][]): BracketNode[] {
  const pairGames: [Team, Team][][] = [];
  for (let d = 0; d + 1 < districtSeeds.length; d += 2) {
    const a = districtSeeds[d];
    const b = districtSeeds[d + 1];
    pairGames.push(a.length >= 4 ? [[a[0], b[3]], [b[1], a[2]], [b[0], a[3]], [a[1], b[2]]] : [[a[0], b[1]], [b[0], a[1]]]);
  }
  const ordered: [Team, Team][] = [];
  if (pairGames[0]?.length === 2) {
    for (let p = 0; p < pairGames.length; p += 2) {
      const next = pairGames[p + 1] ?? [];
      ordered.push(pairGames[p][0], ...(next[0] ? [next[0]] : []), pairGames[p][1], ...(next[1] ? [next[1]] : []));
    }
  } else {
    pairGames.forEach((games) => ordered.push(...games));
  }
  // A missing opponent (a district short of qualifiers after state bans) means a bye: the other team advances
  return ordered
    .filter(([t1, t2]) => t1 || t2)
    .map(([t1, t2], i) => {
      const team1 = (t1 ?? t2)!;
      const bye = !t1 || !t2;
      return {
        matchupId: `${region}_bd_${i + 1}`,
        round: 'BI_DISTRICT' as PlayoffRound,
        region,
        team1,
        team2: bye ? team1 : t2!,
        ...(bye ? { isBye: true, winnerTeamId: team1.id } : {})
      };
    });
}

/**
 * Builds the state playoff bracket from the league (region -> district -> teams). Texas 6A splits each
 * district's four qualifiers into Division 1 and Division 2 by enrollment (64-team brackets, six rounds);
 * otherwise all four qualifiers enter one bracket.
 */
export function buildPlayoffBracket(
  regions: { name: string; districts: Team[][] }[],
  options: { splitDivisions: boolean; excludeTeamIds?: string[]; rules?: StateRules }
): PlayoffBracketState {
  const exclude = options.excludeTeamIds ?? [];
  const { playoffs } = options.rules ?? TEXAS_RULES;
  // A split league uses the state's divisions (the enrollment split); otherwise one statewide bracket
  const split = options.splitDivisions && playoffs.divisionSplit === 'TOP_ENROLLMENT_HALF';
  const divisionNames = split ? playoffs.divisionNames : ['State'];

  const divisions: PlayoffDivision[] = divisionNames.map((name, divisionIndex) => {
    const firstRound = regions.flatMap((region) => {
      const seeds = region.districts.map((teams) => {
        const qualifiers = districtQualifiers(teams, exclude, playoffs.qualifiersPerDistrict);
        return split ? splitByEnrollment(qualifiers, playoffs.qualifiersPerDistrict / divisionNames.length)[divisionIndex] : qualifiers;
      });
      return regionFirstRound(region.name, seeds);
    });
    return { name, rounds: [firstRound] };
  });

  const regionGames = divisions[0].rounds[0].length / Math.max(1, regions.length);
  const regionRounds = Math.log2(regionGames * 2);
  return {
    isPlayoffsActive: true,
    roundNames: roundNamesFor(regionRounds, Math.log2(regions.length)),
    currentRoundIndex: 0,
    divisions,
    championshipTitle: playoffs.championshipTitle,
    championshipVenue: playoffs.championshipVenue
  };
}

export function currentRound(bracketState: PlayoffBracketState): PlayoffRound {
  return bracketState.roundNames[bracketState.currentRoundIndex];
}

/** The user's game in the current round, if they are still alive. */
export function findUserNode(bracketState: PlayoffBracketState, userTeamId: string): { division: PlayoffDivision; node: BracketNode } | undefined {
  for (const division of bracketState.divisions) {
    const node = division.rounds[bracketState.currentRoundIndex]?.find((n) => n.team1.id === userTeamId || n.team2.id === userTeamId);
    if (node) return { division, node };
  }
  return undefined;
}

/** Which division the user's team entered (undefined if it did not qualify). */
export function userDivisionIndex(bracketState: PlayoffBracketState, userTeamId: string): number | undefined {
  const index = bracketState.divisions.findIndex((d) => d.rounds[0].some((n) => n.team1.id === userTeamId || n.team2.id === userTeamId));
  return index >= 0 ? index : undefined;
}

/**
 * Points the bracket at the league's team objects (a loaded save stores separate copies), so injuries
 * and eligibility from the league carry into simulated playoff games and back.
 */
export function relinkBracketTeams(bracketState: PlayoffBracketState, teams: Team[]): PlayoffBracketState {
  const byId = new Map(teams.map((t) => [t.id, t]));
  bracketState.divisions.forEach((d) =>
    d.rounds.forEach((round) =>
      round.forEach((n) => {
        n.team1 = byId.get(n.team1.id) ?? n.team1;
        n.team2 = byId.get(n.team2.id) ?? n.team2;
      })
    )
  );
  return bracketState;
}

/** Records the user's live result (team1 is the home team) on their node in the current round. */
export function recordPlayoffResult(
  bracketState: PlayoffBracketState,
  userTeamId: string,
  score: { homeScore: number; awayScore: number }
): PlayoffBracketState {
  const found = findUserNode(bracketState, userTeamId);
  if (found && !found.node.winnerTeamId) {
    found.node.team1Score = score.homeScore;
    found.node.team2Score = score.awayScore;
    found.node.winnerTeamId = score.homeScore > score.awayScore ? found.node.team1.id : found.node.team2.id;
  }
  return { ...bracketState };
}

/**
 * Resolves every undecided game in the current round across all divisions (including the user's, if it
 * was not played live), then seeds the next round from adjacent winners or crowns each division's champion.
 */
export function advancePlayoffRound(bracketState: PlayoffBracketState): PlayoffBracketState {
  if (!bracketState.isPlayoffsActive) return bracketState;
  const roundIndex = bracketState.currentRoundIndex;
  const isFinalRound = roundIndex === bracketState.roundNames.length - 1;
  const nextRound = bracketState.roundNames[roundIndex + 1];

  for (const division of bracketState.divisions) {
    const nodes = division.rounds[roundIndex];
    nodes.forEach((node) => {
      if (node.winnerTeamId) return;
      const week = LAST_REGULAR_SEASON_WEEK + 1 + roundIndex;
      const res = simulateMacroMatch(`po_${node.matchupId}`, week, node.team1, node.team2, 'CLEAR');
      rollGameInjuries(node.team1, week);
      rollGameInjuries(node.team2, week);
      node.team1Score = res.homeScore;
      node.team2Score = res.awayScore;
      node.winnerTeamId = res.homeScore > res.awayScore ? node.team1.id : node.team2.id;
    });
    const winners = nodes.map((n) => (n.winnerTeamId === n.team1.id ? n.team1 : n.team2));

    if (isFinalRound) {
      division.championTeamId = winners[0]?.id;
    } else {
      division.rounds[roundIndex + 1] = Array.from({ length: winners.length / 2 }, (_, i) => {
        const left = nodes[i * 2];
        const sameRegion = left.region !== undefined && left.region === nodes[i * 2 + 1].region;
        return {
          matchupId: `${division.name.replace(/\s+/g, '').toLowerCase()}_${nextRound}_${i + 1}`,
          round: nextRound,
          ...(sameRegion && { region: left.region }),
          team1: winners[i * 2],
          team2: winners[i * 2 + 1]
        };
      });
    }
  }

  if (isFinalRound) bracketState.isPlayoffsActive = false;
  else bracketState.currentRoundIndex = roundIndex + 1;
  return { ...bracketState };
}
