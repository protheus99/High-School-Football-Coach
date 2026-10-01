import { Team, CompactBoxScore, WeatherType } from '../types/game';
import { randomInt, clamp } from './math/variance';

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
  const homeOvr = homeTeam.prestige;
  const awayOvr = awayTeam.prestige;
  const delta = (homeOvr + 3) - awayOvr; // +3 Home Field Advantage

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
    const homeTdProb = clamp(22 + delta * 0.8, 5, 45);
    const homeFgProb = clamp(12 + delta * 0.3, 3, 25);
    const homeToProb = clamp(10 - delta * 0.4 + (weather === 'HEAVY_RAIN' ? 5 : 0), 4, 20);

    if (homeRoll < homeTdProb) {
      homeScore += 7;
      homePassYds += randomInt(35, 75);
      homeRushYds += randomInt(20, 45);
    } else if (homeRoll < homeTdProb + homeFgProb) {
      homeScore += 3;
      homePassYds += randomInt(20, 40);
      homeRushYds += randomInt(15, 30);
    } else if (homeRoll < homeTdProb + homeFgProb + homeToProb) {
      homeTO += 1;
    } else {
      homePassYds += randomInt(5, 20);
      homeRushYds += randomInt(5, 15);
    }

    // Away drive
    const awayRoll = Math.random() * 100;
    const awayTdProb = clamp(22 - delta * 0.8, 5, 45);
    const awayFgProb = clamp(12 - delta * 0.3, 3, 25);
    const awayToProb = clamp(10 + delta * 0.4 + (weather === 'HEAVY_RAIN' ? 5 : 0), 4, 20);

    if (awayRoll < awayTdProb) {
      awayScore += 7;
      awayPassYds += randomInt(35, 75);
      awayRushYds += randomInt(20, 45);
    } else if (awayRoll < awayTdProb + awayFgProb) {
      awayScore += 3;
      awayPassYds += randomInt(20, 40);
      awayRushYds += randomInt(15, 30);
    } else if (awayRoll < awayTdProb + awayFgProb + awayToProb) {
      awayTO += 1;
    } else {
      awayPassYds += randomInt(5, 20);
      awayRushYds += randomInt(5, 15);
    }
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
