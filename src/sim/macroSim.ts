import { Team, CompactBoxScore, WeatherType } from '../types/game';
import { randomInt, clamp } from './math/variance';

// Calibration constants (tuned against src/sim/tests/macroSim.test.ts targets)
const HOME_FIELD_RATING = 1;
const DRIVE_DELTA_SCALE = { td: 1.6, fg: 0.5, turnover: 0.6 };
const BASE_DRIVE_ODDS = { td: 25, fg: 12, turnover: 15 };

/** One Kansas Plan overtime possession from the opponent's 10: points scored (7, 3 or 0). */
function resolveOvertimePossession(delta: number): number {
  const roll = Math.random() * 100;
  const tdChance = clamp(45 + delta * 1.6, 20, 70);
  const fgChance = 30;
  if (roll < tdChance) return 7;
  if (roll < tdChance + fgChance) return 3;
  return 0;
}

/** Average overall rating of a team's first-string players. */
export function teamStarterRating(team: Team): number {
  const starters = team.roster.filter((p) => p.depthChartTier === 1);
  return starters.reduce((sum, p) => sum + p.overallRating, 0) / (starters.length || 1);
}

/**
 * Fast sub-millisecond AI vs AI background macro match simulation.
 */
export function simulateMacroMatch(
  gameId: string,
  week: number,
  homeTeam: Team,
  awayTeam: Team,
  weather: WeatherType = 'CLEAR'
): CompactBoxScore {
  const homeOvr = teamStarterRating(homeTeam);
  const awayOvr = teamStarterRating(awayTeam);
  const delta = (homeOvr + HOME_FIELD_RATING) - awayOvr;

  const totalDrives = 11 + randomInt(-1, 2);
  let homeScore = 0;
  let awayScore = 0;

  let homePassYds = 0;
  let homeRushYds = 0;
  let homeTO = 0;

  let awayPassYds = 0;
  let awayRushYds = 0;
  let awayTO = 0;

  for (let i = 0; i < totalDrives; i++) {
    // Home drive
    const homeRoll = Math.random() * 100;
    const homeTdProb = clamp(BASE_DRIVE_ODDS.td + delta * DRIVE_DELTA_SCALE.td, 5, 45);
    const homeFgProb = clamp(BASE_DRIVE_ODDS.fg + delta * DRIVE_DELTA_SCALE.fg, 3, 25);
    const homeToProb = clamp(BASE_DRIVE_ODDS.turnover - delta * DRIVE_DELTA_SCALE.turnover + (weather === 'HEAVY_RAIN' ? 5 : 0), 4, 24);

    if (homeRoll < homeTdProb) {
      homeScore += 7;
      homePassYds += randomInt(20, 45);
      homeRushYds += randomInt(15, 35);
    } else if (homeRoll < homeTdProb + homeFgProb) {
      homeScore += 3;
      homePassYds += randomInt(15, 30);
      homeRushYds += randomInt(10, 25);
    } else if (homeRoll < homeTdProb + homeFgProb + homeToProb) {
      homeTO += 1;
      homePassYds += randomInt(5, 15);
      homeRushYds += randomInt(0, 10);
    } else {
      homePassYds += randomInt(3, 10);
      homeRushYds += randomInt(3, 8);
    }

    // Away drive
    const awayRoll = Math.random() * 100;
    const awayTdProb = clamp(BASE_DRIVE_ODDS.td - delta * DRIVE_DELTA_SCALE.td, 5, 45);
    const awayFgProb = clamp(BASE_DRIVE_ODDS.fg - delta * DRIVE_DELTA_SCALE.fg, 3, 25);
    const awayToProb = clamp(BASE_DRIVE_ODDS.turnover + delta * DRIVE_DELTA_SCALE.turnover + (weather === 'HEAVY_RAIN' ? 5 : 0), 4, 24);

    if (awayRoll < awayTdProb) {
      awayScore += 7;
      awayPassYds += randomInt(20, 45);
      awayRushYds += randomInt(15, 35);
    } else if (awayRoll < awayTdProb + awayFgProb) {
      awayScore += 3;
      awayPassYds += randomInt(15, 30);
      awayRushYds += randomInt(10, 25);
    } else if (awayRoll < awayTdProb + awayFgProb + awayToProb) {
      awayTO += 1;
      awayPassYds += randomInt(5, 15);
      awayRushYds += randomInt(0, 10);
    } else {
      awayPassYds += randomInt(3, 10);
      awayRushYds += randomInt(3, 8);
    }
  }

  // Kansas Plan overtime: alternate possessions from the 10 until the tie is broken
  let overtimePeriods = 0;
  while (homeScore === awayScore) {
    overtimePeriods += 1;
    homeScore += resolveOvertimePossession(delta);
    awayScore += resolveOvertimePossession(-delta);
  }

  // Update records
  const margin = homeScore - awayScore;
  const cappedMargin = clamp(margin, -17, 17);

  homeTeam.record.wins += homeScore > awayScore ? 1 : 0;
  homeTeam.record.losses += homeScore < awayScore ? 1 : 0;
  homeTeam.record.pointsFor += homeScore;
  homeTeam.record.pointsAgainst += awayScore;
  homeTeam.record.districtPointDifferential += cappedMargin;

  awayTeam.record.wins += awayScore > homeScore ? 1 : 0;
  awayTeam.record.losses += awayScore < homeScore ? 1 : 0;
  awayTeam.record.pointsFor += awayScore;
  awayTeam.record.pointsAgainst += homeScore;
  awayTeam.record.districtPointDifferential += -cappedMargin;

  const homeQb = homeTeam.roster.find((p) => p.position === 'QB') || homeTeam.roster[0];
  const homeRb = homeTeam.roster.find((p) => p.position === 'RB') || homeTeam.roster[0];

  return {
    gameId,
    week,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore,
    awayScore,
    weather,
    ...(overtimePeriods > 0 && { overtimePeriods }),
    leaders: {
      passing: {
        playerId: homeQb.id,
        name: `${homeQb.firstName} ${homeQb.lastName}`,
        line: `${Math.floor(homePassYds / 12)}/${Math.floor(homePassYds / 7)}, ${homePassYds} YDS, ${Math.floor(homeScore / 7)} TD`
      },
      rushing: {
        playerId: homeRb.id,
        name: `${homeRb.firstName} ${homeRb.lastName}`,
        line: `${Math.floor(homeRushYds / 4.5)} CAR, ${homeRushYds} YDS`
      },
      receiving: {
        playerId: homeTeam.roster[2]?.id || 'rec_1',
        name: `${homeTeam.roster[2]?.lastName || 'Receiver'}`,
        line: `5 REC, ${Math.floor(homePassYds * 0.45)} YDS`
      },
      defense: {
        playerId: homeTeam.roster[5]?.id || 'def_1',
        name: `${homeTeam.roster[5]?.lastName || 'Defender'}`,
        line: `8 TKL, 2 TFL`
      }
    },
    teamTotals: {
      homeTotalYards: homePassYds + homeRushYds,
      homePassYards: homePassYds,
      homeRushYards: homeRushYds,
      homeTurnovers: homeTO,
      awayTotalYards: awayPassYds + awayRushYds,
      awayPassYards: awayPassYds,
      awayRushYards: awayRushYds,
      awayTurnovers: awayTO
    }
  };
}
