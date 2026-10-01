import { Team, CompactBoxScore, WeatherType, Player, PlayerStats } from '../types/game';
import { randomInt, clamp } from './math/variance';
import { getPositionGroup } from './matchEngine';
import { addPlayerStats } from './playerStats';

// Calibration constants (tuned against src/sim/tests/macroSim.test.ts targets)
const HOME_FIELD_RATING = 1;
const DRIVE_DELTA_SCALE = { td: 2.6, fg: 0.7, turnover: 0.8 };
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

/** Splits `total` across players by weight (whole numbers, remainder to the first). */
function splitByWeight(total: number, shares: [Player | undefined, number][], stat: keyof PlayerStats) {
  const available = shares.filter((s): s is [Player, number] => s[0] !== undefined);
  const weightSum = available.reduce((sum, [, w]) => sum + w, 0) || 1;
  let assigned = 0;
  available.forEach(([player, weight], i) => {
    const amount = i === available.length - 1 ? total - assigned : Math.round((total * weight) / weightSum);
    assigned += amount;
    addPlayerStats(player.stats, { [stat]: amount });
  });
}

/** Picks one player by weight. */
function pickByWeight(shares: [Player | undefined, number][]): Player | undefined {
  const available = shares.filter((s): s is [Player, number] => s[0] !== undefined);
  let roll = Math.random() * available.reduce((sum, [, w]) => sum + w, 0);
  for (const [player, weight] of available) {
    roll -= weight;
    if (roll <= 0) return player;
  }
  return available[0]?.[0];
}

/**
 * Credits individual season stats for an AI vs. AI game using the depth-chart
 * usage shares from design spec 11.1.
 */
function distributeMacroStats(
  team: Team,
  totals: { passYds: number; rushYds: number; touchdowns: number; interceptions: number; fumbles: number; opponentInterceptions: number; opponentPlays: number }
) {
  const qb = getPositionGroup(team, 'QB');
  const rb = getPositionGroup(team, 'RB');
  const wr = getPositionGroup(team, 'WR');
  const te = getPositionGroup(team, 'TE');
  const receivers: [Player | undefined, number][] = [[wr[0], 45], [wr[1], 25], [te[0], 15], [rb[0], 15]];
  const rushers: [Player | undefined, number][] = [[rb[0], 65], [rb[1], 25], [qb[0], 10]];
  const passers: [Player | undefined, number][] = [[qb[0], 85], [qb[1], 15]];

  const completions = Math.round(totals.passYds / 11);
  splitByWeight(totals.passYds, passers, 'passYards');
  splitByWeight(completions, passers, 'passCompletions');
  splitByWeight(Math.round(completions / 0.53), passers, 'passAttempts');
  splitByWeight(totals.passYds, receivers, 'receivingYards');
  splitByWeight(completions, receivers, 'receptions');
  splitByWeight(totals.rushYds, rushers, 'rushYards');
  splitByWeight(Math.round(totals.rushYds / 4.5), rushers, 'rushAttempts');

  for (let i = 0; i < totals.touchdowns; i++) {
    if (Math.random() < 0.55) {
      const passer = pickByWeight(passers);
      const target = pickByWeight(receivers);
      if (passer) addPlayerStats(passer.stats, { passTDs: 1 });
      if (target) addPlayerStats(target.stats, { receivingTDs: 1 });
    } else {
      const rusher = pickByWeight(rushers);
      if (rusher) addPlayerStats(rusher.stats, { rushTDs: 1 });
    }
  }
  if (qb[0]) addPlayerStats(qb[0].stats, { interceptionsThrown: totals.interceptions });
  if (rb[0]) addPlayerStats(rb[0].stats, { fumblesLost: totals.fumbles });

  // Defense: tackles from the opponent's offensive snaps, sacks, and interceptions caught
  const lb = getPositionGroup(team, 'LB');
  const cb = getPositionGroup(team, 'CB');
  const de = getPositionGroup(team, 'DE');
  const dt = getPositionGroup(team, 'DT');
  const s = getPositionGroup(team, 'S');
  const tacklers: [Player | undefined, number][] = [[lb[0], 22], [lb[1], 16], [de[0], 12], [dt[0], 10], [s[0], 14], [cb[0], 12], [cb[1], 8], [de[1], 6]];
  splitByWeight(Math.round(totals.opponentPlays * 0.85), tacklers, 'tackles');
  splitByWeight(randomInt(0, 4), [[de[0], 55], [dt[0], 25], [lb[0], 20]], 'sacks');
  splitByWeight(randomInt(2, 7), [[lb[0], 35], [de[0], 30], [dt[0], 20], [lb[1], 15]], 'tacklesForLoss');
  for (let i = 0; i < totals.opponentInterceptions; i++) {
    const defender = pickByWeight([[cb[0], 55], [s[0], 35], [lb[0], 10]]);
    if (defender) addPlayerStats(defender.stats, { interceptionsCaught: 1 });
  }

  team.roster.filter((p) => p.depthChartTier === 1).forEach((p) => (p.stats.gamesPlayed += 1));
}

/** Average overall rating of a team's first-string players. */
export function teamStarterRating(team: Team): number {
  const starters = team.roster.filter((p) => p.depthChartTier === 1);
  return starters.reduce((sum, p) => sum + p.overallRating, 0) / (starters.length || 1);
}

/**
 * Fast sub-millisecond AI vs AI background macro match simulation.
 * Credits individual player stats; team records are applied by the caller
 * (see applyGameResult in scheduleEngine) so playoff games stay off the regular-season record.
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
  let homeTDs = 0;
  let awayTDs = 0;

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
      homeTDs += 1;
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
      awayTDs += 1;
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
    const homeOT = resolveOvertimePossession(delta);
    const awayOT = resolveOvertimePossession(-delta);
    homeScore += homeOT;
    awayScore += awayOT;
    if (homeOT === 7) homeTDs += 1;
    if (awayOT === 7) awayTDs += 1;
  }

  // Individual stats (turnovers split ~60% interceptions / 40% fumbles)
  const homeINT = Math.round(homeTO * 0.6);
  const awayINT = Math.round(awayTO * 0.6);
  const plays = (passYds: number, rushYds: number) => Math.round(passYds / 11 / 0.53 + rushYds / 4.5);
  distributeMacroStats(homeTeam, {
    passYds: homePassYds, rushYds: homeRushYds, touchdowns: homeTDs, interceptions: homeINT, fumbles: homeTO - homeINT,
    opponentInterceptions: awayINT, opponentPlays: plays(awayPassYds, awayRushYds)
  });
  distributeMacroStats(awayTeam, {
    passYds: awayPassYds, rushYds: awayRushYds, touchdowns: awayTDs, interceptions: awayINT, fumbles: awayTO - awayINT,
    opponentInterceptions: homeINT, opponentPlays: plays(homePassYds, homeRushYds)
  });

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
