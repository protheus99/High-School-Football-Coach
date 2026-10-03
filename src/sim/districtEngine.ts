import { Team } from '../types/game';

export interface DistrictStandingRow {
  rank: number;
  teamId: string;
  name: string;
  districtRecord: string;
  overallRecord: string;
  pointDifferential: number;
  isPlayoffBound: boolean;
}

/**
 * Calculates official 8-team district standings using NFHS capped point differentials (+/- 17) and head-to-head tiebreakers.
 */
/** District standings; the top `playoffSpots` are marked playoff-bound (Texas: 4; see districtPlayoffSpots for other states). */
export function calculateDistrictStandings(teams: Team[], playoffSpots = 4): DistrictStandingRow[] {
  const sorted = [...teams].sort((a, b) => {
    // 1. District Wins
    if (b.record.districtWins !== a.record.districtWins) {
      return b.record.districtWins - a.record.districtWins;
    }

    // 2. Head to Head Check
    const h2h = a.record.headToHeadHistory[b.id];
    if (h2h) {
      return h2h.won ? -1 : 1;
    }

    // 3. Capped Point Differential (+/- 17 per game)
    if (b.record.districtPointDifferential !== a.record.districtPointDifferential) {
      return b.record.districtPointDifferential - a.record.districtPointDifferential;
    }

    // 4. Fewest Points Allowed
    return a.record.pointsAgainst - b.record.pointsAgainst;
  });

  return sorted.map((t, index) => ({
    rank: index + 1,
    teamId: t.id,
    name: t.name,
    districtRecord: `${t.record.districtWins}-${t.record.districtLosses}`,
    overallRecord: `${t.record.wins}-${t.record.losses}`,
    pointDifferential: t.record.districtPointDifferential,
    isPlayoffBound: index < playoffSpots
  }));
}

export interface PlayoffMatchup {
  round: 'BI_DISTRICT' | 'AREA' | 'REGIONAL' | 'STATE_FINAL';
  homeTeam: Team;
  awayTeam: Team;
  winnerTeamId?: string;
}

/**
 * Generates initial 16-Team Single Elimination Bracket (4 from District A, 4 from District B).
 */
export function initializePlayoffBracket(districtATeams: Team[], districtBTeams: Team[]): PlayoffMatchup[] {
  const d1 = calculateDistrictStandings(districtATeams);
  const d2 = calculateDistrictStandings(districtBTeams);

  const getTeam = (id: string, pool: Team[]) => pool.find((t) => t.id === id)!;

  // Standard Seed Matchups: 1 vs 4, 2 vs 3 across districts
  return [
    { round: 'BI_DISTRICT', homeTeam: getTeam(d1[0].teamId, districtATeams), awayTeam: getTeam(d2[3].teamId, districtBTeams) },
    { round: 'BI_DISTRICT', homeTeam: getTeam(d1[1].teamId, districtATeams), awayTeam: getTeam(d2[2].teamId, districtBTeams) },
    { round: 'BI_DISTRICT', homeTeam: getTeam(d2[0].teamId, districtBTeams), awayTeam: getTeam(d1[3].teamId, districtATeams) },
    { round: 'BI_DISTRICT', homeTeam: getTeam(d2[1].teamId, districtBTeams), awayTeam: getTeam(d1[2].teamId, districtATeams) }
  ];
}
