import { Team, RankedTeamEntry, StateAndNationalPolls, RankMovement } from '../types/game';
import { computeRatings, GameResult } from './computerRankings';

/**
 * The National Top 25 and every state's Top 25 with rank movement: the computer rankings (computerRankings.ts)
 * solved from every result this season, playoffs included.
 */
export function generateNationalAndStatePolls(
  allTeams: Team[],
  previousPolls: StateAndNationalPolls | null,
  currentWeek: number,
  results: GameResult[] = []
): StateAndNationalPolls {
  // 1. Rate every team from this season's results (strength of schedule and margins), best first
  const ratings = computeRatings(allTeams, results, currentWeek);
  const evaluatedTeams = allTeams
    .map((team) => {
      const r = ratings.get(team.id)!;
      return {
        team,
        pollPoints: Math.round(r.rating * 10) / 10,
        sos: Math.round(r.schedule * 10) / 10,
        qualityWins: r.qualityWins,
        record: { wins: r.wins, losses: r.losses }
      };
    })
    .sort((a, b) => b.pollPoints - a.pollPoints);

  // 2. Helper to determine movement compared to previous week
  const getPreviousRank = (teamId: string, prevRankings: RankedTeamEntry[] | undefined): number | null => {
    if (!prevRankings) return null;
    const found = prevRankings.find((entry) => entry.teamId === teamId);
    return found ? found.rank : null;
  };

  const calculateMovement = (currentRank: number, prevRank: number | null): { movement: RankMovement; movementDelta: number } => {
    if (prevRank === null) {
      return { movement: 'NEW_ENTRY', movementDelta: 0 };
    }
    const delta = prevRank - currentRank;
    if (delta > 0) return { movement: 'UP', movementDelta: delta };
    if (delta < 0) return { movement: 'DOWN', movementDelta: Math.abs(delta) };
    return { movement: 'UNCHANGED', movementDelta: 0 };
  };

  // 3. Build National Top 25
  const nationalTop25: RankedTeamEntry[] = evaluatedTeams.slice(0, 25).map((entry, index) => {
    const rank = index + 1;
    const prevRank = getPreviousRank(entry.team.id, previousPolls?.nationalTop25);
    const { movement, movementDelta } = calculateMovement(rank, prevRank);

    return {
      rank,
      previousRank: prevRank,
      movement,
      movementDelta,
      teamId: entry.team.id,
      teamName: entry.team.name,
      mascot: entry.team.mascot,
      state: entry.team.state || 'Texas',
      classification: entry.team.classification,
      record: entry.record,
      pollPoints: entry.pollPoints,
      strengthOfSchedule: entry.sos,
      firstPlaceVotes: 0, // computer rankings: no votes
      qualityWinsCount: entry.qualityWins
    };
  });

  // 4. Build "Others Receiving Votes" (Bubble Teams: Ranks 26–35)
  const bubbleTeams: RankedTeamEntry[] = evaluatedTeams.slice(25, 35).map((entry, index) => {
    const rank = index + 26;
    const prevRank = getPreviousRank(entry.team.id, previousPolls?.nationalTop25);
    const { movement, movementDelta } = calculateMovement(rank, prevRank);

    return {
      rank,
      previousRank: prevRank,
      movement,
      movementDelta,
      teamId: entry.team.id,
      teamName: entry.team.name,
      mascot: entry.team.mascot,
      state: entry.team.state || 'Texas',
      classification: entry.team.classification,
      record: entry.record,
      pollPoints: entry.pollPoints,
      strengthOfSchedule: entry.sos,
      firstPlaceVotes: 0,
      qualityWinsCount: entry.qualityWins
    };
  });

  // 5. Build State-by-State Rankings (Grouping teams by state)
  const stateRankings: Record<string, RankedTeamEntry[]> = {};
  const stateGroups: Record<string, typeof evaluatedTeams> = {};

  evaluatedTeams.forEach((entry) => {
    const stateName = entry.team.state || 'Texas';
    if (!stateGroups[stateName]) stateGroups[stateName] = [];
    stateGroups[stateName].push(entry);
  });

  Object.keys(stateGroups).forEach((stateName) => {
    stateRankings[stateName] = stateGroups[stateName].slice(0, 25).map((entry, index) => {
      const rank = index + 1;
      const prevRank = getPreviousRank(entry.team.id, previousPolls?.stateRankings[stateName]);
      const { movement, movementDelta } = calculateMovement(rank, prevRank);

      return {
        rank,
        previousRank: prevRank,
        movement,
        movementDelta,
        teamId: entry.team.id,
        teamName: entry.team.name,
        mascot: entry.team.mascot,
        state: stateName,
        classification: entry.team.classification,
        record: entry.record,
        pollPoints: entry.pollPoints,
        strengthOfSchedule: entry.sos,
        firstPlaceVotes: 0,
        qualityWinsCount: entry.qualityWins
      };
    });
  });

  return {
    week: currentWeek,
    nationalTop25,
    stateRankings,
    bubbleTeams
  };
}

/**
 * Checks if a game between two teams qualifies as a Top 25 / Top 10 National Showcase.
 */
export function evaluateRankedGameContext(
  teamAId: string,
  teamBId: string,
  nationalPoll: RankedTeamEntry[]
): { isRankedMatchup: boolean; rankA?: number; rankB?: number; isTop10Clash: boolean } {
  const entryA = nationalPoll.find((p) => p.teamId === teamAId);
  const entryB = nationalPoll.find((p) => p.teamId === teamBId);

  const rankA = entryA ? entryA.rank : undefined;
  const rankB = entryB ? entryB.rank : undefined;
  const isRankedMatchup = rankA !== undefined || rankB !== undefined;
  const isTop10Clash = (rankA !== undefined && rankA <= 10) && (rankB !== undefined && rankB <= 10);

  return {
    isRankedMatchup,
    rankA,
    rankB,
    isTop10Clash
  };
}
