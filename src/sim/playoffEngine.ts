import { ScheduledGame, Team } from '../types/game';
import { simulateMacroMatch, rollGameInjuries } from './macroSim';
import { LAST_REGULAR_SEASON_WEEK, firstPlayoffWeek } from './scheduleEngine';
import { calculateDistrictStandings } from './districtEngine';
import { StateRules, TEXAS_RULES, rulesForState } from './stateRules';
import { LeagueStructure, playoffRoundCount } from './league';

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
  firstWeek?: number; // the week of the first round (missing in older saves: week 18)
  divisions: PlayoffDivision[];
  championshipTitle?: string;
  championshipVenue?: string;
}

/** The rounds a league's playoffs will have (before the bracket exists): by its state's format and size. */
export function leagueRoundNames(league: LeagueStructure): PlayoffRound[] {
  const rules = rulesForState(league.state);
  if (rules.playoffs.format !== 'DISTRICT_FINISH') return roundNamesFor(playoffRoundCount(league) - 1, 1);
  const stateRounds = Math.log2(league.regions.length);
  return roundNamesFor(playoffRoundCount(league) - stateRounds, stateRounds);
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
  options: { splitDivisions: boolean; excludeTeamIds?: string[]; rules?: StateRules; schedule?: ScheduledGame[] }
): PlayoffBracketState {
  const bracket = buildBracket(regions, options);
  return { ...bracket, firstWeek: firstPlayoffWeek(bracket.roundNames.length) };
}

/** The week a bracket's round is played; and the round played in a week (-1 before the first, e.g. an open week). */
export const bracketRoundWeek = (bracket: PlayoffBracketState, roundIndex: number) => (bracket.firstWeek ?? LAST_REGULAR_SEASON_WEEK + 1) + roundIndex;
export const bracketRoundForWeek = (bracket: PlayoffBracketState, week: number) => week - (bracket.firstWeek ?? LAST_REGULAR_SEASON_WEEK + 1);

function buildBracket(
  regions: { name: string; districts: Team[][] }[],
  options: { splitDivisions: boolean; excludeTeamIds?: string[]; rules?: StateRules; schedule?: ScheduledGame[] }
): PlayoffBracketState {
  const exclude = options.excludeTeamIds ?? [];
  const { playoffs } = options.rules ?? TEXAS_RULES;
  if (playoffs.format === 'STATEWIDE_RANKING') return buildRankedBracket(regions, exclude, options.rules ?? TEXAS_RULES, options.schedule ?? []);
  if (playoffs.format === 'REGIONAL_SEEDED') return buildRegionalBracket(regions, exclude, options.rules ?? TEXAS_RULES, options.schedule ?? []);
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

/**
 * Power ratings in the GHSA style: a team's win % x its opponents' win % x its opponents' opponents' win %
 * (regular-season games), a strength-of-schedule measure like the NCAA's RPI.
 */
export function powerRatings(teams: Team[], schedule: ScheduledGame[]): Map<string, number> {
  const opponents = new Map<string, string[]>();
  schedule
    .filter((g) => g.homeScore !== undefined)
    .forEach((g) => {
      opponents.set(g.homeTeamId, [...(opponents.get(g.homeTeamId) ?? []), g.awayTeamId]);
      opponents.set(g.awayTeamId, [...(opponents.get(g.awayTeamId) ?? []), g.homeTeamId]);
    });
  const byId = new Map(teams.map((t) => [t.id, t]));
  const winPct = (id: string) => {
    const t = byId.get(id);
    const games = t ? t.record.wins + t.record.losses : 0;
    return games ? t!.record.wins / games : 0;
  };
  const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
  const opponentsWinPct = (id: string) => average((opponents.get(id) ?? []).map(winPct));
  return new Map(teams.map((t) => [t.id, winPct(t.id) * opponentsWinPct(t.id) * average((opponents.get(t.id) ?? []).map(opponentsWinPct))]));
}

/** Standard bracket order for seeds 1..n: adjacent pairs meet, and the top seeds can only meet late. */
function seedOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
}

/**
 * One statewide bracket seeded by power rating (Georgia GHSA). Every district (region) champion is
 * guaranteed a top-half seed: a champion ranked lower takes the last top-half spot and the others move down.
 */
function buildRankedBracket(regions: { name: string; districts: Team[][] }[], exclude: string[], rules: StateRules, schedule: ScheduledGame[]): PlayoffBracketState {
  const { playoffs } = rules;
  const size = playoffs.bracketSize;
  const half = size / 2;
  const eligible = regions.flatMap((r) => r.districts.flat()).filter((t) => !exclude.includes(t.id));
  const ratings = powerRatings(eligible, schedule);
  const champions = new Set(
    regions.flatMap((r) =>
      r.districts.map((teams) => calculateDistrictStandings(teams.filter((t) => !exclude.includes(t.id)))[0]?.teamId).filter((id): id is string => !!id)
    )
  );
  const ranked = [...eligible].sort((a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0) || b.prestige - a.prestige);
  const top = ranked.slice(0, half);
  const rest = ranked.slice(half);
  rest.filter((t) => champions.has(t.id)).forEach((champion) => {
    const bumped = [...top].reverse().find((t) => !champions.has(t.id));
    if (bumped) {
      top.splice(top.indexOf(bumped), 1);
      rest.unshift(bumped);
    }
    rest.splice(rest.indexOf(champion), 1);
    top.push(champion);
  });
  rest.sort((a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0) || b.prestige - a.prestige);
  const seeds = [...top, ...rest].slice(0, size);

  const order = seedOrder(size);
  const firstRound: BracketNode[] = [];
  for (let i = 0; i < size / 2; i++) {
    const high = seeds[order[2 * i] - 1];
    const low = seeds[order[2 * i + 1] - 1];
    if (!high && !low) continue;
    const team1 = (high ?? low)!;
    const bye = !high || !low;
    firstRound.push({
      matchupId: `state_r1_${i + 1}`,
      round: 'BI_DISTRICT',
      team1, // the higher seed hosts
      team2: bye ? team1 : low!,
      ...(bye ? { isBye: true, winnerTeamId: team1.id } : {})
    });
  }
  return {
    isPlayoffsActive: true,
    roundNames: roundNamesFor(Math.log2(size) - 1, 1),
    currentRoundIndex: 0,
    divisions: [{ name: playoffs.divisionNames[0] ?? 'State', rounds: [firstRound] }],
    championshipTitle: playoffs.championshipTitle,
    championshipVenue: playoffs.championshipVenue
  };
}

/**
 * Region brackets that merge into one state bracket (Florida, Maryland, North Carolina, Alabama). Each playoff
 * region picks and seeds its own teams; empty slots are byes for the top seeds. When teams leave a region before
 * its winner is decided (Maryland and Alabama send two to the state quarterfinals), the region's halves are
 * interleaved with the other regions' so those survivors meet teams from another region.
 */
function buildRegionalBracket(regions: { name: string; districts: Team[][] }[], exclude: string[], rules: StateRules, schedule: ScheduledGame[]): PlayoffBracketState {
  const { playoffs } = rules;
  const config = playoffs.regional!;
  const districts = regions.flatMap((r) => r.districts).map((teams) => teams.filter((t) => !exclude.includes(t.id)));
  const ratings = powerRatings(districts.flat(), schedule);
  const byRating = (a: Team, b: Team) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0) || b.prestige - a.prestige;
  const standings = districts.map((teams) => calculateDistrictStandings(teams).map((row) => teams.find((t) => t.id === row.teamId)!));
  const champions = new Set(standings.map((rows) => rows[0]?.id).filter((id): id is string => !!id));
  const groupTeams = (group: { districts: number[] }) => group.districts.flatMap((d) => districts[d - 1] ?? []);

  // Each region's qualifiers, best seed first
  let seeded: Team[][];
  if (config.statewideQualifiers) {
    // Statewide field, then split evenly across the regions in district order (NCHSAA: by longitude)
    const order = config.regions.flatMap((g) => g.districts);
    const districtIndex = new Map(districts.flatMap((teams, d) => teams.map((t) => [t.id, order.indexOf(d + 1)] as const)));
    const field = districts.flat().sort(byRating).slice(0, config.statewideQualifiers);
    const placed = [...field].sort((a, b) => (districtIndex.get(a.id) ?? 0) - (districtIndex.get(b.id) ?? 0) || byRating(a, b));
    const per = Math.ceil(placed.length / config.regions.length);
    seeded = config.regions.map((_, i) => placed.slice(i * per, (i + 1) * per).sort(byRating));
  } else if (config.selection === 'DISTRICT_FINISH') {
    seeded = config.regions.map((group) => group.districts.flatMap((d) => standings[d - 1] ?? []).slice(0, config.qualifiersPerRegion));
  } else {
    seeded = config.regions.map((group) => {
      const teams = groupTeams(group).sort(byRating);
      const first = config.championsSeededFirst ? teams.filter((t) => champions.has(t.id)) : [];
      return [...first, ...teams.filter((t) => !first.includes(t))].slice(0, config.qualifiersPerRegion);
    });
  }

  // Each region's first-round games in bracket order (1v8, 4v5, 3v6, 2v7 for eight slots)
  const order = seedOrder(config.regionBracketSize);
  const regionGames = seeded.map((seeds, r) => {
    const name = config.regions[r].name;
    const games: BracketNode[] = [];
    for (let i = 0; i < order.length / 2; i++) {
      const high = seeds[order[2 * i] - 1];
      const low = seeds[order[2 * i + 1] - 1];
      const team1 = (high ?? low)!;
      if (!team1) continue; // never happens with the configured sizes (each region fills at least half its slots)
      const bye = !high || !low;
      games.push({
        matchupId: `${name.replace(/\s+/g, '').toLowerCase()}_r1_${i + 1}`,
        round: 'BI_DISTRICT',
        region: name,
        team1,
        team2: bye ? team1 : low!,
        ...(bye ? { isBye: true, winnerTeamId: team1.id } : {})
      });
    }
    return games;
  });

  // Interleave region pieces so the first cross-region round pairs region 1 with region 2, 3 with 4, ...
  const pieces = 2 ** (Math.log2(config.regionBracketSize) - config.regionalRounds);
  const pieceSize = config.regionBracketSize / 2 / pieces;
  const firstRound: BracketNode[] = [];
  for (let p = 0; p < pieces; p++) regionGames.forEach((games) => firstRound.push(...games.slice(p * pieceSize, (p + 1) * pieceSize)));

  return {
    isPlayoffsActive: true,
    roundNames: roundNamesFor(Math.log2(config.regions.length * config.regionBracketSize) - 1, 1),
    currentRoundIndex: 0,
    divisions: [{ name: playoffs.divisionNames[0] ?? 'State', rounds: [firstRound] }],
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
      const week = bracketRoundWeek(bracketState, roundIndex);
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
