import {
  Team,
  Player,
  Position,
  StatCategory,
  RankedPlayerEntry,
  PositionalProspectGroup,
  PlayerRankingsAndStatsState
} from '../types/game';
import { clamp } from './math/variance';

/**
 * Calculates a player's Composite Recruit Score (0 to 1000)
 * Evaluates Overall Rating, Physical Measurables, Potential, and Star Rating.
 */
export function calculateCompositeRecruitScore(player: Player): number {
  const ovrScore = (player.overallRating / 99) * 500; // 500 pts max
  const speedStrengthScore = ((player.attributes.speed + player.attributes.strength + player.attributes.agility) / (99 * 3)) * 250; // 250 pts
  const starScore = (player.recruiting.starRating / 5) * 150; // 150 pts

  const potentialBonus =
    player.potential === 'A+' ? 100 :
    player.potential === 'A' ? 75 :
    player.potential === 'B' ? 50 : 25;

  return Math.round(clamp(ovrScore + speedStrengthScore + starScore + potentialBonus, 200, 999));
}

/**
 * Helper to build a readable primary stat line based on position
 */
export function getPlayerPrimaryStatLine(player: Player): string {
  if (player.position === 'QB') {
    return `${player.stats.passYards} Yds, ${player.stats.passTDs} TD, ${player.stats.interceptionsThrown} INT`;
  }
  if (player.position === 'RB') {
    return `${player.stats.rushYards} Rush Yds, ${player.stats.rushTDs} TD (${player.stats.rushAttempts} Car)`;
  }
  if (player.position === 'WR' || player.position === 'TE') {
    return `${player.stats.receptions} Rec, ${player.stats.receivingYards} Yds, ${player.stats.receivingTDs} TD`;
  }
  if (['LB', 'DE', 'DT'].includes(player.position)) {
    return `${player.stats.tackles} Tkls, ${player.stats.tacklesForLoss} TFL, ${player.stats.sacks} Sacks`;
  }
  if (['CB', 'S'].includes(player.position)) {
    return `${player.stats.tackles} Tkls, ${player.stats.interceptionsCaught} INT`;
  }
  if (player.position === 'K') {
    return `${player.stats.fieldGoalsMade}/${player.stats.fieldGoalsAttempted} FG`;
  }
  return `Rating: ${player.overallRating} OVR`;
}

/**
 * Generates all National and State-by-State statistical leaderboards and positional prospect rankings.
 */
export function generatePlayerRankingsAndLeaderboards(
  allTeams: Team[],
  currentWeek: number
): PlayerRankingsAndStatsState {
  // 1. Flatten all players into an enriched flat array
  const allPlayers: { player: Player; team: Team; state: string; recruitScore: number }[] = [];

  allTeams.forEach((team) => {
    const stateName = team.state || 'Texas';
    team.roster.forEach((player) => {
      allPlayers.push({
        player,
        team,
        state: stateName,
        recruitScore: calculateCompositeRecruitScore(player)
      });
    });
  });

  // 2. Statistical Leaderboard Comparator Map
  const statComparators: Record<StatCategory, (p: Player) => number> = {
    PASS_YARDS: (p) => p.stats.passYards,
    PASS_TDS: (p) => p.stats.passTDs,
    RUSH_YARDS: (p) => p.stats.rushYards,
    RUSH_TDS: (p) => p.stats.rushTDs,
    REC_YARDS: (p) => p.stats.receivingYards,
    TACKLES: (p) => p.stats.tackles,
    SACKS: (p) => p.stats.sacks,
    INTERCEPTIONS: (p) => p.stats.interceptionsCaught
  };

  const categories: StatCategory[] = [
    'PASS_YARDS', 'PASS_TDS', 'RUSH_YARDS', 'RUSH_TDS',
    'REC_YARDS', 'TACKLES', 'SACKS', 'INTERCEPTIONS'
  ];

  // Build National Stat Leaders
  const nationalStatLeaders: Record<StatCategory, RankedPlayerEntry[]> = {} as Record<StatCategory, RankedPlayerEntry[]>;
  categories.forEach((cat) => {
    const sorted = [...allPlayers]
      .filter((entry) => statComparators[cat](entry.player) > 0)
      .sort((a, b) => statComparators[cat](b.player) - statComparators[cat](a.player))
      .slice(0, 50);

    nationalStatLeaders[cat] = sorted.map((entry, idx) => ({
      rank: idx + 1,
      player: entry.player,
      teamId: entry.team.id,
      teamName: entry.team.name,
      state: entry.state,
      classification: entry.team.classification,
      primaryStatLine: getPlayerPrimaryStatLine(entry.player),
      compositeRecruitScore: entry.recruitScore
    }));
  });

  // Build State-by-State Stat Leaders
  const stateStatLeaders: Record<string, Record<StatCategory, RankedPlayerEntry[]>> = {};
  const stateGroups: Record<string, typeof allPlayers> = {};

  allPlayers.forEach((entry) => {
    if (!stateGroups[entry.state]) stateGroups[entry.state] = [];
    stateGroups[entry.state].push(entry);
  });

  Object.keys(stateGroups).forEach((stateName) => {
    stateStatLeaders[stateName] = {} as Record<StatCategory, RankedPlayerEntry[]>;
    categories.forEach((cat) => {
      const sorted = [...stateGroups[stateName]]
        .filter((entry) => statComparators[cat](entry.player) > 0)
        .sort((a, b) => statComparators[cat](b.player) - statComparators[cat](a.player))
        .slice(0, 25);

      stateStatLeaders[stateName][cat] = sorted.map((entry, idx) => ({
        rank: idx + 1,
        player: entry.player,
        teamId: entry.team.id,
        teamName: entry.team.name,
        state: stateName,
        classification: entry.team.classification,
        primaryStatLine: getPlayerPrimaryStatLine(entry.player),
        compositeRecruitScore: entry.recruitScore
      }));
    });
  });

  // 3. Positional Prospect Rankings (National & State)
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'];
  const positionalProspects: Record<Position, PositionalProspectGroup> = {} as Record<Position, PositionalProspectGroup>;

  positions.forEach((pos) => {
    const posPlayers = allPlayers.filter((entry) => entry.player.position === pos);

    // National sort by composite recruit score
    const nationalSorted = [...posPlayers]
      .sort((a, b) => b.recruitScore - a.recruitScore)
      .slice(0, 50)
      .map((entry, idx) => ({
        rank: idx + 1,
        player: entry.player,
        teamId: entry.team.id,
        teamName: entry.team.name,
        state: entry.state,
        classification: entry.team.classification,
        primaryStatLine: getPlayerPrimaryStatLine(entry.player),
        compositeRecruitScore: entry.recruitScore
      }));

    // State sort by position
    const stateRankings: Record<string, RankedPlayerEntry[]> = {};
    Object.keys(stateGroups).forEach((stateName) => {
      const statePosPlayers = posPlayers.filter((entry) => entry.state === stateName);
      stateRankings[stateName] = statePosPlayers
        .sort((a, b) => b.recruitScore - a.recruitScore)
        .slice(0, 20)
        .map((entry, idx) => ({
          rank: idx + 1,
          player: entry.player,
          teamId: entry.team.id,
          teamName: entry.team.name,
          state: stateName,
          classification: entry.team.classification,
          primaryStatLine: getPlayerPrimaryStatLine(entry.player),
          compositeRecruitScore: entry.recruitScore
        }));
    });

    positionalProspects[pos] = {
      position: pos,
      nationalRankings: nationalSorted,
      stateRankings
    };
  });

  // 4. National Overall Top 100 Recruits
  const nationalOverallTop100: RankedPlayerEntry[] = [...allPlayers]
    .sort((a, b) => b.recruitScore - a.recruitScore)
    .slice(0, 100)
    .map((entry, idx) => ({
      rank: idx + 1,
      player: entry.player,
      teamId: entry.team.id,
      teamName: entry.team.name,
      state: entry.state,
      classification: entry.team.classification,
      primaryStatLine: getPlayerPrimaryStatLine(entry.player),
      compositeRecruitScore: entry.recruitScore
    }));

  return {
    week: currentWeek,
    nationalStatLeaders,
    stateStatLeaders,
    positionalProspects,
    nationalOverallTop100
  };
}
