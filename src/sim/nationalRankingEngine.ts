import { Team, RankedTeamEntry, StateAndNationalPolls, RankMovement } from '../types/game';
import { clamp } from './math/variance';

/**
 * Calculates poll rating points for a team based on Record, SoS, Prestige, and Quality Wins.
 */
export function calculateTeamPollRating(team: Team, allTeams: Team[]): {
  pollPoints: number;
  sos: number;
  qualityWins: number;
} {
  const totalGames = team.record.wins + team.record.losses;
  const winPct = totalGames > 0 ? team.record.wins / totalGames : 0.5;

  // 1. Strength of Schedule (SoS) calculation from opponent prestige & win rates
  let opponentPrestigeSum = 0;
  let opponentWinsSum = 0;
  let opponentTotalGames = 0;
  let qualityWins = 0;

  const opponentIds = Object.keys(team.record.headToHeadHistory);
  opponentIds.forEach((oppId) => {
    const opp = allTeams.find((t) => t.id === oppId);
    if (opp) {
      opponentPrestigeSum += opp.prestige;
      const oppGames = opp.record.wins + opp.record.losses;
      opponentWinsSum += opp.record.wins;
      opponentTotalGames += oppGames > 0 ? oppGames : 1;

      // Quality win check (beating a team with prestige >= 85 or positive record)
      if (team.record.headToHeadHistory[oppId]?.won && (opp.prestige >= 85 || opp.record.wins >= 5)) {
        qualityWins++;
      }
    }
  });

  const avgOppPrestige = opponentIds.length > 0 ? opponentPrestigeSum / opponentIds.length : team.prestige;
  const oppWinPct = opponentTotalGames > 0 ? opponentWinsSum / opponentTotalGames : 0.5;
  const sos = clamp(Math.round(avgOppPrestige * 0.6 + oppWinPct * 40), 20, 99);

  // 2. Margin of Victory / Point Differential bonus (capped)
  const avgPointDiff = totalGames > 0 ? team.record.districtPointDifferential / totalGames : 0;
  const pointDiffBonus = clamp(avgPointDiff * 1.5, -20, 25);

  // 3. Composite Poll Formula (Scale: 0 to 1000)
  // Win record (45%) + SoS (25%) + Program Prestige (15%) + Quality Wins (10%) + Point Diff (5%)
  const winRecordScore = winPct * 450;
  const sosScore = (sos / 100) * 250;
  const prestigeScore = (team.prestige / 100) * 150;
  const qualityWinScore = Math.min(100, qualityWins * 25);

  let rawPollPoints = winRecordScore + sosScore + prestigeScore + qualityWinScore + pointDiffBonus;

  // Penalize losing teams heavily (teams with 2+ losses cannot easily hold top national spots)
  if (team.record.losses === 1) rawPollPoints *= 0.88;
  if (team.record.losses === 2) rawPollPoints *= 0.72;
  if (team.record.losses >= 3) rawPollPoints *= 0.50;

  return {
    pollPoints: Math.round(rawPollPoints),
    sos,
    qualityWins
  };
}

/**
 * Generates both the National Top 25 and State-by-State Polls with rank movement.
 */
export function generateNationalAndStatePolls(
  allTeams: Team[],
  previousPolls: StateAndNationalPolls | null,
  currentWeek: number
): StateAndNationalPolls {
  // 1. Calculate ratings for every loaded team
  const evaluatedTeams = allTeams.map((team) => {
    const { pollPoints, sos, qualityWins } = calculateTeamPollRating(team, allTeams);
    return {
      team,
      pollPoints,
      sos,
      qualityWins
    };
  });

  // Sort overall pool by poll points descending
  evaluatedTeams.sort((a, b) => b.pollPoints - a.pollPoints);

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
      record: { wins: entry.team.record.wins, losses: entry.team.record.losses },
      pollPoints: entry.pollPoints,
      strengthOfSchedule: entry.sos,
      firstPlaceVotes: rank === 1 ? 52 : rank === 2 ? 10 : rank === 3 ? 3 : 0,
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
      record: { wins: entry.team.record.wins, losses: entry.team.record.losses },
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
        record: { wins: entry.team.record.wins, losses: entry.team.record.losses },
        pollPoints: entry.pollPoints,
        strengthOfSchedule: entry.sos,
        firstPlaceVotes: rank === 1 ? 45 : 0,
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
