import { StateAndNationalPolls } from '../types/game';
import { INTERSTATE, PrecomputedGame } from './runAhead';
import { stateAbbreviation } from '../utils/format';
import { rivalryName } from '../data/rivalries';

// ---------------------------------------------------------------------------
// "Around the state": once the coach's game is over, the week's top games from the run-ahead finals (the same
// results Advance Week applies). Up to 8, in this order: his league's games, games with a team in his state's top
// 10, upsets (a nationally ranked team lost), the national top 5, and in the playoffs his division's other games.
// Up to three rivalry games come right after his league's (ranked teams first), so rivalry week gets its spotlight.
// ---------------------------------------------------------------------------

export type TopGameTag = 'LEAGUE' | 'RIVALRY' | 'STATE_TOP_10' | 'UPSET' | 'NATIONAL_TOP_5' | 'DIVISION';

export const MAX_RIVALRY_GAMES = 3;

/** A game's team's state: the game's own, or from an out-of-state game's "Alabama v Texas" label. */
const teamState = (game: PrecomputedGame, side: 'home' | 'away') => (game.state === INTERSTATE ? game.label?.split(' v ')[side === 'home' ? 0 : 1] : game.state);

/** The rivalry's name when the game is one (the home team's name for it), or undefined. */
export function gameRivalry(game: PrecomputedGame): string | undefined {
  return rivalryName({ name: game.homeName, state: teamState(game, 'home') }, { name: game.awayName, state: teamState(game, 'away') });
}

export interface TopGame {
  game: PrecomputedGame;
  tag: TopGameTag;
}

export const MAX_TOP_GAMES = 8;

/** The week's top games, each once, with why it made the list. */
export function topGames(input: {
  results: PrecomputedGame[];
  userState: string;
  districtIds: Set<string>; // the coach's league (district)
  polls: StateAndNationalPolls | null;
  divisionKey?: string; // in the playoffs: the key prefix of the coach's division's games ("California|po_0_")
}): TopGame[] {
  const { results, userState, districtIds, polls, divisionKey } = input;
  const national = new Map((polls?.nationalTop25 ?? []).map((e) => [e.teamId, e.rank]));
  const stateTop10 = new Map((polls?.stateRankings[userState] ?? []).filter((e) => e.rank <= 10).map((e) => [e.teamId, e.rank]));
  const best = (g: PrecomputedGame, ranks: Map<string, number>) => Math.min(ranks.get(g.homeId) ?? 99, ranks.get(g.awayId) ?? 99);
  const loser = (g: PrecomputedGame) => (g.homeScore > g.awayScore ? g.awayId : g.homeScore < g.awayScore ? g.homeId : null);
  const winner = (g: PrecomputedGame) => (g.homeScore > g.awayScore ? g.homeId : g.homeScore < g.awayScore ? g.awayId : null);
  const isUpset = (g: PrecomputedGame) => {
    const lost = loser(g);
    const lostRank = lost ? national.get(lost) : undefined;
    return lostRank !== undefined && (national.get(winner(g)!) ?? 99) > lostRank;
  };

  const groups: [TopGameTag, PrecomputedGame[]][] = [
    ['LEAGUE', results.filter((g) => g.state === userState && !g.label && districtIds.has(g.homeId) && districtIds.has(g.awayId))],
    [
      'RIVALRY',
      results
        .filter((g) => (g.state === userState || g.state === INTERSTATE) && gameRivalry(g) !== undefined)
        .sort((a, b) => best(a, stateTop10) - best(b, stateTop10))
        .slice(0, MAX_RIVALRY_GAMES)
    ],
    ['STATE_TOP_10', results.filter((g) => stateTop10.has(g.homeId) || stateTop10.has(g.awayId)).sort((a, b) => best(a, stateTop10) - best(b, stateTop10))],
    ['UPSET', results.filter(isUpset).sort((a, b) => (national.get(loser(a)!) ?? 99) - (national.get(loser(b)!) ?? 99))],
    ['NATIONAL_TOP_5', results.filter((g) => best(g, national) <= 5).sort((a, b) => best(a, national) - best(b, national))],
    ['DIVISION', divisionKey ? results.filter((g) => g.key.startsWith(divisionKey)) : []]
  ];
  const picked: TopGame[] = [];
  const seen = new Set<string>();
  for (const [tag, games] of groups) {
    for (const game of games) {
      if (picked.length >= MAX_TOP_GAMES) return picked;
      if (seen.has(game.key)) continue;
      seen.add(game.key);
      picked.push({ game, tag });
    }
  }
  return picked;
}

/** The tag's words: "League", "CA top 10", "Upset", "Nat. top 5", or "Division" (the coach's division in the playoffs). */
export function topGameTagLabel(tag: TopGameTag, userState: string): string {
  switch (tag) {
    case 'LEAGUE':
      return 'League';
    case 'RIVALRY':
      return 'Rivalry';
    case 'STATE_TOP_10':
      return `${stateAbbreviation(userState)} top 10`;
    case 'UPSET':
      return 'Upset';
    case 'NATIONAL_TOP_5':
      return 'Nat. top 5';
    case 'DIVISION':
      return 'Division';
  }
}

/** A team's state when it isn't the coach's: "AL" for an Alabama game, from an interstate game's "AL v TX" label. */
export function otherStateOf(game: PrecomputedGame, side: 'home' | 'away', userState: string): string | null {
  const state = game.state === INTERSTATE ? game.label?.split(' v ')[side === 'home' ? 0 : 1] : game.state;
  return state && state !== userState ? stateAbbreviation(state) : null;
}
