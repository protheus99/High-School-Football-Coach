import {
  GameSimulationState,
  PlayConcept,
  PlayEvent,
  Player,
  Position,
  Team,
  WeatherType,
  LeverageType
} from '../types/game';
import { calculateGaussianVariance, clamp, randomInt } from './math/variance';

// Helper to safely get starter/sub by position and stamina
function getActivePlayer(team: Team, pos: Position): Player {
  const eligible = team.roster.filter(
    (p) => (p.position === pos || p.secondaryPosition === pos) && p.academics.isEligible && p.condition.injuryStatus === 'HEALTHY'
  );

  if (eligible.length === 0) {
    // Return highest overall fallback
    return team.roster[0];
  }

  // Priority 1st string unless stamina < 60
  const tier1 = eligible.find((p) => p.depthChartTier === 1);
  if (tier1 && tier1.condition.inGameStamina >= 60) {
    return tier1;
  }

  const tier2 = eligible.find((p) => p.depthChartTier === 2);
  if (tier2) return tier2;

  return tier1 || eligible[0];
}

function getUnitAverage(team: Team, positions: Position[], stat: keyof Player['attributes']): number {
  const players = positions.map((pos) => getActivePlayer(team, pos));
  const sum = players.reduce((acc, p) => acc + (p.attributes[stat] as number), 0);
  return sum / (positions.length || 1);
}

/**
 * Calculates Base Matchup Delta (Δ_Base) based on play concept and active personnel
 */
export function calculateMatchupDelta(
  concept: PlayConcept,
  offense: Team,
  defense: Team
): { delta: number; passer?: Player; ballCarrier?: Player; receiver?: Player; tackler?: Player; sacker?: Player } {
  const qb = getActivePlayer(offense, 'QB');
  const rb = getActivePlayer(offense, 'RB');
  const wr = getActivePlayer(offense, 'WR');
  const te = getActivePlayer(offense, 'TE');

  const dt = getActivePlayer(defense, 'DT');
  const de = getActivePlayer(defense, 'DE');
  const lb = getActivePlayer(defense, 'LB');
  const cb = getActivePlayer(defense, 'CB');
  const s = getActivePlayer(defense, 'S');

  let delta = 0;

  switch (concept) {
    case 'INSIDE_RUN': {
      const olRun = getUnitAverage(offense, ['C', 'OG', 'OG'], 'runBlocking');
      const offScore =
        0.40 * olRun +
        0.35 * (rb.attributes.carrying * 0.5 + rb.attributes.strength * 0.5) +
        0.15 * rb.attributes.vision +
        0.10 * te.attributes.runBlocking;

      const defScore =
        0.45 * (dt.attributes.strength * 0.5 + dt.attributes.tackling * 0.5) +
        0.40 * lb.attributes.tackling +
        0.15 * s.attributes.tackling;

      delta = offScore - defScore;
      return { delta, ballCarrier: rb, tackler: lb };
    }

    case 'OUTSIDE_RUN': {
      const edgeBlock = (getActivePlayer(offense, 'OT').attributes.runBlocking + te.attributes.runBlocking) / 2;
      const offScore =
        0.40 * edgeBlock +
        0.40 * (rb.attributes.speed * 0.6 + rb.attributes.agility * 0.4) +
        0.20 * wr.attributes.runBlocking;

      const defScore =
        0.40 * (de.attributes.speed * 0.5 + de.attributes.tackling * 0.5) +
        0.35 * (lb.attributes.speed * 0.5 + lb.attributes.tackling * 0.5) +
        0.25 * cb.attributes.tackling;

      delta = offScore - defScore;
      return { delta, ballCarrier: rb, tackler: de };
    }

    case 'SHORT_PASS': {
      const olPass = getUnitAverage(offense, ['OT', 'OG', 'C'], 'passBlocking');
      const offScore =
        0.40 * (qb.attributes.passingAccuracy * 0.7 + qb.attributes.footballIQ * 0.3) +
        0.35 * (wr.attributes.routeRunning * 0.6 + wr.attributes.catching * 0.4) +
        0.25 * olPass;

      const defScore =
        0.45 * (lb.attributes.coverage * 0.5 + s.attributes.coverage * 0.5) +
        0.35 * cb.attributes.coverage +
        0.20 * (de.attributes.passRush * 0.5 + dt.attributes.passRush * 0.5);

      delta = offScore - defScore;
      return { delta, passer: qb, receiver: wr, tackler: cb, sacker: de };
    }

    case 'DEEP_PASS': {
      const olPass = getUnitAverage(offense, ['OT', 'OG', 'C'], 'passBlocking');
      const offScore =
        0.35 * (qb.attributes.armStrength * 0.6 + qb.attributes.passingAccuracy * 0.4) +
        0.35 * (wr.attributes.speed * 0.6 + wr.attributes.catching * 0.4) +
        0.30 * olPass;

      const defScore =
        0.40 * (cb.attributes.speed * 0.5 + cb.attributes.coverage * 0.5) +
        0.30 * (s.attributes.coverage * 0.6 + s.attributes.speed * 0.4) +
        0.30 * de.attributes.passRush;

      delta = offScore - defScore;
      return { delta, passer: qb, receiver: wr, tackler: s, sacker: de };
    }

    default:
      return { delta: 0 };
  }
}

/**
 * Evaluates contextual environment modifiers
 */
export function getContextualModifier(weather: WeatherType, momentum: number, playConcept: PlayConcept): number {
  let mod = momentum * 3; // -6 to +6

  if (weather === 'HEAVY_RAIN') {
    if (playConcept === 'SHORT_PASS' || playConcept === 'DEEP_PASS') mod -= 15;
    if (playConcept === 'INSIDE_RUN') mod += 5;
  } else if (weather === 'HIGH_WIND') {
    if (playConcept === 'DEEP_PASS') mod -= 20;
  }

  return mod;
}

/**
 * Checks if a snap triggers high-leverage user choice
 */
export function evaluateLeverageTrigger(state: GameSimulationState): LeverageType | null {
  const lastEvent = state.eventLog[state.eventLog.length - 1];
  if (lastEvent?.scoreType === 'TOUCHDOWN') {
    return 'PAT_DECISION';
  }

  if (state.down === 4) {
    if (state.distance <= 3 || state.yardLine >= 55) {
      return 'FOURTH_DOWN';
    }
  }

  if (state.yardLine >= 95 && state.down <= 2) {
    return 'RED_ZONE_GOAL_TO_GO';
  }

  if (
    state.currentQuarter === 4 &&
    state.clockSecondsRemaining <= 120 &&
    Math.abs(state.homeScore - state.awayScore) <= 8
  ) {
    return 'TWO_MINUTE_DRILL';
  }

  return null;
}

/**
 * Resolves Field Goal attempt using NFHS probability formula
 */
export function resolveFieldGoal(
  kicker: Player,
  distanceYards: number,
  windSpeed: number
): { isSuccess: boolean; text: string } {
  const prob = clamp(
    92 - (distanceYards - 20) * 3.2 - windSpeed * 0.75 + kicker.attributes.kickingAccuracy * 0.35,
    5,
    96
  );

  const roll = Math.random() * 100;
  const isSuccess = roll < prob;

  return {
    isSuccess,
    text: isSuccess
      ? `K #${kicker.lastName} converts the ${distanceYards}-yard Field Goal!`
      : `K #${kicker.lastName}'s ${distanceYards}-yard Field Goal attempt is NO GOOD!`
  };
}

/**
 * Resolves a single play of football and updates state
 */
export function simulateSnap(
  state: GameSimulationState,
  chosenConcept?: PlayConcept
): { state: GameSimulationState; event: PlayEvent } {
  const isHomeOffense = state.possessionTeamId === state.homeTeam.id;
  const offense = isHomeOffense ? state.homeTeam : state.awayTeam;
  const defense = isHomeOffense ? state.awayTeam : state.homeTeam;

  // Default play concept selection if not forced by user
  let concept: PlayConcept = chosenConcept || 'INSIDE_RUN';
  if (!chosenConcept) {
    if (state.down === 4) {
      concept = state.yardLine >= 65 ? 'FIELD_GOAL' : 'PUNT';
    } else if (state.distance > 7) {
      concept = Math.random() > 0.4 ? 'SHORT_PASS' : 'DEEP_PASS';
    } else {
      concept = Math.random() > 0.5 ? 'INSIDE_RUN' : 'OUTSIDE_RUN';
    }
  }

  const playId = `play_${Date.now()}_${randomInt(100, 999)}`;
  let yardsGained = 0;
  let isTurnover = false;
  let turnoverType: PlayEvent['turnoverType'];
  let isScore = false;
  let scoreType: PlayEvent['scoreType'];
  let commentary = '';
  let timeElapsed = state.isMercyRuleActive ? 45 : randomInt(28, 40);

  // Field Goal execution
  if (concept === 'FIELD_GOAL') {
    const kicker = getActivePlayer(offense, 'K');
    const fgDist = (100 - state.yardLine) + 17; // 17 yards for snap/endzone depth
    const fgRes = resolveFieldGoal(kicker, fgDist, state.windSpeedMph);

    if (fgRes.isSuccess) {
      isScore = true;
      scoreType = 'FIELD_GOAL';
      if (isHomeOffense) state.homeScore += 3;
      else state.awayScore += 3;
      commentary = fgRes.text;
    } else {
      isTurnover = true;
      turnoverType = 'DOWNS';
      commentary = fgRes.text;
    }

    // Reset possession
    state.possessionTeamId = defense.id;
    state.yardLine = clamp(100 - state.yardLine, 20, 80);
    state.down = 1;
    state.distance = 10;
  }
  // Punt execution
  else if (concept === 'PUNT') {
    const punter = getActivePlayer(offense, 'P');
    const gross = Math.floor(22 + punter.attributes.kickingPower * 0.28 + calculateGaussianVariance(0, 5));
    const netPunt = clamp(gross, 10, 55);

    state.possessionTeamId = defense.id;
    state.yardLine = clamp(100 - (state.yardLine + netPunt), 10, 90);
    state.down = 1;
    state.distance = 10;
    commentary = `P #${punter.lastName} punts ${netPunt} yds to the opponent ${state.yardLine} yd line.`;
  }
  // Standard Scrimmage Plays
  else {
    const { delta, passer, ballCarrier, receiver, tackler, sacker } = calculateMatchupDelta(concept, offense, defense);
    const contextMod = getContextualModifier(state.weather, state.teamMomentum, concept);
    const variance = calculateGaussianVariance(0, 12);
    const playQuality = delta + contextMod + variance;

    // Catastrophic Turnover Check
    if (playQuality < -30) {
      isTurnover = true;
      if (concept === 'SHORT_PASS' || concept === 'DEEP_PASS') {
        turnoverType = 'INTERCEPTION';
        commentary = `INTERCEPTED! QB #${passer?.lastName} picked off by DB #${tackler?.lastName}!`;
      } else {
        turnoverType = 'FUMBLE';
        commentary = `FUMBLE! RB #${ballCarrier?.lastName} coughs up the football! Recovered by defense.`;
      }
      state.possessionTeamId = defense.id;
      state.yardLine = clamp(100 - state.yardLine, 10, 90);
      state.down = 1;
      state.distance = 10;
    }
    // Sack / TFL
    else if (playQuality < -15) {
      yardsGained = -randomInt(2, 6);
      state.yardLine += yardsGained;
      commentary =
        concept === 'SHORT_PASS' || concept === 'DEEP_PASS'
          ? `SACKED! DE #${sacker?.lastName} drags down QB #${passer?.lastName} for a loss of ${Math.abs(yardsGained)} yds.`
          : `TACKLED FOR LOSS! RB #${ballCarrier?.lastName} stopped behind the line for ${yardsGained} yds.`;
    }
    // Incomplete Pass
    else if ((concept === 'SHORT_PASS' || concept === 'DEEP_PASS') && playQuality < 0) {
      yardsGained = 0;
      timeElapsed = 6;
      commentary = `QB #${passer?.lastName} pass incomplete intended for WR #${receiver?.lastName}.`;
    }
    // Normal Gain
    else {
      const base = concept === 'DEEP_PASS' ? 14 : 3;
      yardsGained = base + randomInt(1, 6);
      if (playQuality > 25) yardsGained += randomInt(15, 35); // Explosive break
      state.yardLine += yardsGained;
      commentary =
        concept === 'SHORT_PASS' || concept === 'DEEP_PASS'
          ? `QB #${passer?.lastName} complete to WR #${receiver?.lastName} for ${yardsGained} yds.`
          : `RB #${ballCarrier?.lastName} rushes for ${yardsGained} yds. Tackled by #${tackler?.lastName}.`;
    }

    // Check Safety
    if (state.yardLine <= 0) {
      isScore = true;
      scoreType = 'SAFETY';
      if (isHomeOffense) state.awayScore += 2;
      else state.homeScore += 2;
      commentary += ` SAFETY! Tackled in end zone.`;
      state.possessionTeamId = defense.id;
      state.yardLine = 35;
      state.down = 1;
      state.distance = 10;
    }
    // Check Touchdown
    else if (state.yardLine >= 100) {
      isScore = true;
      scoreType = 'TOUCHDOWN';
      if (isHomeOffense) state.homeScore += 6;
      else state.awayScore += 6;
      commentary += ` TOUCHDOWN ${offense.name.toUpperCase()}!`;
      state.yardLine = 98; // 2-yd line for PAT
    }
    // Advance Down & Distance
    else if (!isTurnover) {
      if (yardsGained >= state.distance) {
        state.down = 1;
        state.distance = 10;
        commentary += ` FIRST DOWN!`;
      } else {
        state.down += 1;
        state.distance -= yardsGained;
        if (state.down > 4) {
          isTurnover = true;
          turnoverType = 'DOWNS';
          commentary += ` Turnover on downs!`;
          state.possessionTeamId = defense.id;
          state.yardLine = 100 - state.yardLine;
          state.down = 1;
          state.distance = 10;
        }
      }
    }
  }

  // Clock Management & Quarter Progression
  state.clockSecondsRemaining -= timeElapsed;
  if (state.clockSecondsRemaining <= 0) {
    if (state.currentQuarter === 4) {
      state.isGameOver = true;
    } else if (typeof state.currentQuarter === 'number') {
      state.currentQuarter = (state.currentQuarter + 1) as 1 | 2 | 3 | 4;
      state.clockSecondsRemaining = 720; // 12-min quarters
    }
  }

  // Mercy Rule Check (35+ point differential in 2nd half)
  if (typeof state.currentQuarter === 'number' && state.currentQuarter >= 3 &&Math.abs(state.homeScore - state.awayScore) >= 35) {
    state.isMercyRuleActive = true;
  }

  const event: PlayEvent = {
    playId,
    quarter: state.currentQuarter,
    clockTimeRemainingSeconds: Math.max(0, state.clockSecondsRemaining),
    down: state.down,
    distance: state.distance,
    yardLine: state.yardLine,
    possessionTeamId: state.possessionTeamId,
    playConcept: concept,
    yardsGained,
    isTurnover,
    turnoverType,
    isScore,
    scoreType,
    textCommentary: commentary,
    isLeverageMoment: false
  };

  state.eventLog.push(event);
  return { state, event };
}
