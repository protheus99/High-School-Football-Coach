import {
  GameSimulationState,
  PlayConcept,
  PlayEvent,
  Player,
  Position,
  Team,
  WeatherType,
  LeverageType,
  DefensiveCall,
  PlayerStats,
  OffensiveScheme,
  DefensiveScheme
} from '../types/game';
import { calculateGaussianVariance, clamp, randomInt } from './math/variance';
import { addPlayerStats, createEmptyPlayerStats } from './playerStats';
import { compareDepth } from './depthChart';
import { disciplinePlayQualityPenalty } from './programMeters';
import { rulesForState } from './stateRules';

// Teams resting their starters on the current snap (set at the start of each simulateSnap call)
let restingTeamIds = new Set<string>();
const NEVER_RESTED: Position[] = ['K', 'P'];
// A team-rating point of staff edge in the live engine's per-snap matchup scale (calibrated in tests to match the
// simulated-game engine: +2 is about 73% against an equal team)
const LIVE_EDGE_SCALE = 1;

const isResting = (team: Team, pos: Position) => restingTeamIds.has(team.id) && !NEVER_RESTED.includes(pos);

// Helper to safely get starter/sub by position and stamina
function getActivePlayer(team: Team, pos: Position): Player {
  // Depth chart tiers decide who starts and who is next up (the calibration relies on roster order among co-starters)
  const eligible = team.roster.filter(
    (p) => (p.position === pos || p.secondaryPosition === pos) && p.academics.isEligible && p.condition.injuryStatus === 'HEALTHY'
  );

  if (eligible.length === 0) {
    // Return highest overall fallback
    return team.roster[0];
  }

  // Blowout: second string plays where available
  if (isResting(team, pos)) {
    const backup = eligible.find((p) => p.depthChartTier !== 1);
    if (backup) return backup;
  }

  // Priority 1st string unless stamina < 60
  const tier1 = eligible.find((p) => p.depthChartTier === 1);
  if (tier1 && tier1.condition.inGameStamina >= 60) {
    return tier1;
  }

  const nextUp = eligible.find((p) => p.depthChartTier === 2) ?? eligible.find((p) => p.depthChartTier !== 1);
  if (nextUp) return nextUp;

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

  // The coach's paid staff: its game-day edge (team-rating points, capped at +2) helps every snap, on offense
  // and on defense, the same amount it adds in simulated games; so does a dilemma's Friday edge
  const edgeOf = (t: Team) => (t.gameDayEdge ?? 0) + (t.fridayEdge ?? 0);
  const staffEdge = LIVE_EDGE_SCALE * (edgeOf(offense) - edgeOf(defense));
  const withEdge = <T extends { delta: number }>(result: T): T => ({ ...result, delta: result.delta + staffEdge });
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
      return withEdge({ delta, ballCarrier: rb, tackler: lb });
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
      return withEdge({ delta, ballCarrier: rb, tackler: de });
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
      return withEdge({ delta, passer: qb, receiver: wr, tackler: cb, sacker: de });
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
      return withEdge({ delta, passer: qb, receiver: wr, tackler: s, sacker: de });
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
 * Checks if a snap triggers high-leverage user choice.
 * When userTeamId is given, only the user's own possessions prompt; the AI calls its own plays.
 */
export function evaluateLeverageTrigger(state: GameSimulationState, userTeamId?: string): LeverageType | null {
  if (userTeamId && state.possessionTeamId !== userTeamId) {
    return null;
  }

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


// ============================================================================
// CALIBRATION CONSTANTS
// Tuned against the NFHS benchmark targets in src/sim/tests/simEngine.test.ts
// ============================================================================

const EXECUTION_STDEV = 12; // N(0, 12) execution roll from the design spec
const GAME_DAY_FORM_STDEV = 0; // 'Any Given Friday' per-team game form; disabled because it widened margins more than it added upsets
const EXPLOSIVE_PLAY_QUALITY = 25;
// League-average matchup delta per concept. Each snap's personnel edge is narrowed around it so better
// teams stay better without most games snowballing into routs (league averages are unchanged).
const MATCHUP_BASELINES = { INSIDE_RUN: 3.3, OUTSIDE_RUN: 0, SHORT_PASS: 8.3, DEEP_PASS: 2.1 };
const MATCHUP_SPREAD_SCALE = 0.5;
const SCHEME_EFFECT_SCALE = 0.5; // scheme and counter modifiers act all game long, so they are damped
const PREVENT_DEFENSE_DEFICIT = 15; // 4th-quarter lead at which the defense plays soft coverage
const PREVENT_DEFENSE_BONUS = 8;
const RED_ZONE_YARD_LINE = 80;
const RED_ZONE_BONUS = 6; // short field: offenses finish drives
const PASS_THRESHOLDS = {
  SHORT_PASS: { interception: -24, sack: -16, incomplete: 4 },
  DEEP_PASS: { interception: -19, sack: -15, incomplete: 6 }
};
const RUN_THRESHOLDS = { fumble: -27, tackleForLoss: -15 };
const PLAY_CLOCK_RUNOFF = { min: 21, max: 30 }; // running plays & completions
const INCOMPLETE_RUNOFF = 6;
const MERCY_RULE_RUNOFF = 45;
const MAX_FIELD_GOAL_ATTEMPT_YARDS = 47;
const REST_STARTERS_LEAD = 35; // second-half lead at which a coach pulls his starters (five scores)
const KILL_CLOCK_LEAD = 21; // second-half lead at which the offense keeps the ball on the ground
const BAD_SNAP_OR_BLOCK_CHANCE = 0.03;

const SCRIMMAGE_CONCEPTS: PlayConcept[] = ['INSIDE_RUN', 'OUTSIDE_RUN', 'SHORT_PASS', 'DEEP_PASS'];
type ScrimmageConcept = 'INSIDE_RUN' | 'OUTSIDE_RUN' | 'SHORT_PASS' | 'DEEP_PASS';

// Offense play-quality modifier for each defensive call (design spec 16 counter matrix)
const DEFENSIVE_CALL_MODIFIERS: Record<DefensiveCall, Record<ScrimmageConcept, number>> = {
  BASE: { INSIDE_RUN: 0, OUTSIDE_RUN: 0, SHORT_PASS: 0, DEEP_PASS: 0 },
  RUN_BLITZ: { INSIDE_RUN: -7, OUTSIDE_RUN: -5, SHORT_PASS: 3, DEEP_PASS: 6 },
  PASS_COVERAGE: { INSIDE_RUN: 6, OUTSIDE_RUN: 5, SHORT_PASS: -4, DEEP_PASS: -7 },
  BLITZ: { INSIDE_RUN: -3, OUTSIDE_RUN: -3, SHORT_PASS: -3, DEEP_PASS: 3 }
};
const BLITZ_EXTRA_STDEV = 3;

// Tactical schemes (design spec 16)
const OFFENSIVE_SCHEME_STYLE: Record<OffensiveScheme, { passRate: number; deepShare: number; insideShare: number }> = {
  TRIPLE_OPTION: { passRate: 0.45, deepShare: 0.3, insideShare: 0.4 }, // option runs to the edge, rare passes
  POWER_I: { passRate: 0.75, deepShare: 0.3, insideShare: 0.7 }, // downhill inside runs
  SPREAD: { passRate: 1.1, deepShare: 0.3, insideShare: 0.5 }, // quick passing game
  AIR_RAID: { passRate: 1.35, deepShare: 0.45, insideShare: 0.5 } // vertical shots
};
const OFFENSIVE_SCHEME_MODIFIERS: Record<OffensiveScheme, Record<ScrimmageConcept, number>> = {
  TRIPLE_OPTION: { INSIDE_RUN: 1, OUTSIDE_RUN: 3, SHORT_PASS: 0, DEEP_PASS: 0 },
  POWER_I: { INSIDE_RUN: 2, OUTSIDE_RUN: 0, SHORT_PASS: 0, DEEP_PASS: 0 },
  SPREAD: { INSIDE_RUN: 0, OUTSIDE_RUN: 0, SHORT_PASS: 1, DEEP_PASS: 0 },
  AIR_RAID: { INSIDE_RUN: -1, OUTSIDE_RUN: 0, SHORT_PASS: 0, DEEP_PASS: 1 }
};
const DEFENSIVE_SCHEME_MODIFIERS: Record<DefensiveScheme, Record<ScrimmageConcept, number>> = {
  FOUR_THREE: { INSIDE_RUN: -1, OUTSIDE_RUN: -1, SHORT_PASS: 0, DEEP_PASS: 1 }, // balanced
  FOUR_FOUR: { INSIDE_RUN: -4, OUTSIDE_RUN: -3, SHORT_PASS: 1, DEEP_PASS: 4 }, // heavy box, corners on an island
  THREE_THREE_FIVE: { INSIDE_RUN: 2, OUTSIDE_RUN: 1, SHORT_PASS: -2, DEEP_PASS: -1 }, // nickel vs spread
  DROP_EIGHT: { INSIDE_RUN: 4, OUTSIDE_RUN: 2, SHORT_PASS: -2, DEEP_PASS: -5 } // floods passing lanes
};

/** Scheme-on-scheme counters from the spec 16 matrix (offense quality bonus). */
function schemeCounterBonus(offense: OffensiveScheme, defense: DefensiveScheme, isPass: boolean): number {
  if (offense === 'TRIPLE_OPTION' && !isPass) return defense === 'THREE_THREE_FIVE' ? 3 : defense === 'FOUR_FOUR' ? -3 : 0;
  if (offense === 'AIR_RAID' && isPass) return defense === 'DROP_EIGHT' ? -3 : defense === 'FOUR_FOUR' ? 2 : 0;
  if (offense === 'SPREAD' && isPass) return defense === 'THREE_THREE_FIVE' ? -2 : 0;
  if (offense === 'POWER_I' && !isPass) return defense === 'DROP_EIGHT' ? 2 : 0;
  return 0;
}

const offensiveSchemeOf = (state: GameSimulationState, team: Team): OffensiveScheme =>
  state.offensiveGamePlan?.[team.id] ?? team.schemeOffense; // all-out pressure: more sacks and turnovers, more explosive plays allowed

/** Situational defensive call for an AI-coached defense. */
export function selectAIDefensiveCall(state: GameSimulationState): DefensiveCall {
  const r = Math.random();
  if (state.distance >= 8) return r < 0.45 ? 'PASS_COVERAGE' : r < 0.65 ? 'BLITZ' : r < 0.95 ? 'BASE' : 'RUN_BLITZ';
  if (state.distance <= 3) return r < 0.5 ? 'RUN_BLITZ' : r < 0.85 ? 'BASE' : 'BLITZ';
  return r < 0.55 ? 'BASE' : r < 0.7 ? 'RUN_BLITZ' : r < 0.85 ? 'PASS_COVERAGE' : 'BLITZ';
}

/** Healthy, eligible players at a position: first string first, then by overall. */
export function getPositionGroup(team: Team, pos: Position): Player[] {
  const group = team.roster
    .filter((p) => p.position === pos && p.academics.isEligible && p.condition.injuryStatus === 'HEALTHY')
    .sort(compareDepth);
  // Blowout: backups take the snaps (and the stats)
  return isResting(team, pos) ? [...group.filter((p) => p.depthChartTier !== 1), ...group.filter((p) => p.depthChartTier === 1)] : group;
}

/** Weighted pick among [player, weight] options, skipping positions with nobody available. */
function pickWeighted(options: [Player | undefined, number][]): Player | undefined {
  const available = options.filter((o): o is [Player, number] => o[0] !== undefined);
  const total = available.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [player, weight] of available) {
    roll -= weight;
    if (roll <= 0) return player;
  }
  return available[available.length - 1]?.[0];
}

// Usage shares from design spec 11.1
const pickReceiver = (team: Team) => {
  const wr = getPositionGroup(team, 'WR');
  return pickWeighted([[wr[0], 38], [wr[1], 24], [wr[2], 15], [getPositionGroup(team, 'TE')[0], 12], [getPositionGroup(team, 'RB')[0], 11]]);
};
const pickRusher = (team: Team) => {
  const rb = getPositionGroup(team, 'RB');
  return pickWeighted([[rb[0], 65], [rb[1], 25], [getPositionGroup(team, 'QB')[0], 10]]);
};
const pickRunTackler = (team: Team) => {
  const lb = getPositionGroup(team, 'LB');
  return pickWeighted([[lb[0], 25], [lb[1], 15], [getPositionGroup(team, 'DE')[0], 20], [getPositionGroup(team, 'DT')[0], 20], [getPositionGroup(team, 'S')[0], 10], [getPositionGroup(team, 'CB')[0], 10]]);
};
const pickPassTackler = (team: Team) => {
  const cb = getPositionGroup(team, 'CB');
  return pickWeighted([[cb[0], 30], [cb[1], 15], [getPositionGroup(team, 'S')[0], 30], [getPositionGroup(team, 'LB')[0], 25]]);
};
const pickSacker = (team: Team) =>
  pickWeighted([[getPositionGroup(team, 'DE')[0], 55], [getPositionGroup(team, 'DT')[0], 25], [getPositionGroup(team, 'LB')[0], 20]]);
const pickInterceptor = (team: Team) =>
  pickWeighted([[getPositionGroup(team, 'CB')[0], 55], [getPositionGroup(team, 'S')[0], 35], [getPositionGroup(team, 'LB')[0], 10]]);

/** Adds to a player's stat line for the current game. */
function credit(state: GameSimulationState, player: Player | undefined, delta: Partial<PlayerStats>) {
  if (!player) return;
  state.playerGameStats ??= {};
  state.playerGameStats[player.id] ??= createEmptyPlayerStats();
  addPlayerStats(state.playerGameStats[player.id], delta);
}
const isPassConcept = (c: PlayConcept) => c === 'SHORT_PASS' || c === 'DEEP_PASS';

/**
 * Resolves Field Goal attempt using NFHS probability formula
 * (includes the flat 3% bad snap / blocked kick roll).
 */
export function resolveFieldGoal(
  kicker: Player,
  distanceYards: number,
  windSpeed: number
): { isSuccess: boolean; text: string } {
  if (Math.random() < BAD_SNAP_OR_BLOCK_CHANCE) {
    return { isSuccess: false, text: `The ${distanceYards}-yard kick by K #${kicker.lastName} is BLOCKED!` };
  }

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

function setFirstDown(state: GameSimulationState, possessionTeamId: string, yardLine: number) {
  state.possessionTeamId = possessionTeamId;
  state.yardLine = yardLine;
  state.down = 1;
  state.distance = Math.min(10, 100 - yardLine);
}

/**
 * Resolves a kickoff (NFHS kick from the 40, or a free kick from the 20 after a safety)
 * and hands possession to the receiving team.
 */
export function resolveKickoff(
  state: GameSimulationState,
  kicking: Team,
  receiving: Team,
  kickSpot = 40
): { text: string; isTurnover: boolean } {
  const kicker = getActivePlayer(kicking, 'K');
  const returner = getActivePlayer(receiving, 'RB');
  const headwind = state.weather === 'HIGH_WIND' ? state.windSpeedMph : 0;
  const kickDist = Math.round(35 + kicker.attributes.kickingPower * 0.35 + calculateGaussianVariance(0, 4) - headwind * 0.5);
  const landing = kickSpot + kickDist; // measured from the kicking team's goal line

  if (landing >= 100) {
    setFirstDown(state, receiving.id, 20);
    return { text: ` Kickoff by #${kicker.lastName} sails into the end zone for a touchback.`, isTurnover: false };
  }

  const coverageSpeed = getUnitAverage(kicking, ['LB', 'S', 'CB'], 'speed');
  const returnYards = Math.max(0, Math.round(15 + returner.attributes.speed * 0.15 - coverageSpeed * 0.12 + calculateGaussianVariance(0, 6)));
  const spot = clamp(100 - landing + returnYards, 1, 99);
  const fumbleChance = state.weather === 'HEAVY_RAIN' ? 0.05 : 0.025;

  if (Math.random() < fumbleChance) {
    setFirstDown(state, kicking.id, 100 - spot);
    return { text: ` #${returner.lastName} FUMBLES the kickoff return! ${kicking.name} recovers!`, isTurnover: true };
  }

  setFirstDown(state, receiving.id, spot);
  return { text: ` #${returner.lastName} returns the kickoff ${returnYards} yds to the ${spot}.`, isTurnover: false };
}

/** Default AI play selection for the offense. */
function selectAIPlayConcept(state: GameSimulationState, scheme: OffensiveScheme, offenseLead = 0): PlayConcept {
  if (state.down === 4) {
    const fgDistance = 100 - state.yardLine + 17;
    if (fgDistance <= MAX_FIELD_GOAL_ATTEMPT_YARDS) return 'FIELD_GOAL';
    const goForIt =
      state.currentQuarter === 'OT' || (state.distance <= 2 && state.yardLine >= 40) || (state.distance <= 4 && state.yardLine >= 55);
    if (!goForIt) return 'PUNT';
  }

  const style = OFFENSIVE_SCHEME_STYLE[scheme];
  const secondHalf = typeof state.currentQuarter === 'number' && state.currentQuarter >= 3;
  const lateComeback = state.currentQuarter === 4 && offenseLead <= -9;
  let passChance = Math.min(0.9, (state.distance >= 8 ? 0.7 : state.distance <= 3 ? 0.25 : 0.45) * style.passRate);
  if (secondHalf && offenseLead >= KILL_CLOCK_LEAD) passChance *= 0.3; // grind the clock
  else if (lateComeback) passChance = Math.min(0.9, passChance * 1.4); // need points fast
  if (Math.random() < passChance) {
    return Math.random() < style.deepShare ? 'DEEP_PASS' : 'SHORT_PASS';
  }
  return Math.random() < style.insideShare ? 'INSIDE_RUN' : 'OUTSIDE_RUN';
}

/** Interception / fumble return yardage (design spec 8.4). */
function turnoverReturnYards(defender: Player | undefined, offense: Team): number {
  const defenderSpeed = defender?.attributes.speed ?? 60;
  const pursuit = getUnitAverage(offense, ['QB', 'RB', 'WR'], 'speed');
  return Math.max(0, Math.round(defenderSpeed * 0.3 - pursuit * 0.2 + calculateGaussianVariance(0, 8)));
}

/** Overtime possessions start this many yards from the goal line (the state's rule; Texas: the 10). */
const overtimeYardsFromGoal = (state: GameSimulationState) => rulesForState(state.homeTeam.state).overtime.startYardsFromGoal;

/** Starts a Kansas Plan overtime period; returns commentary. */
function startOvertimePeriod(state: GameSimulationState, period: number, firstOffenseTeamId: string): string {
  state.currentQuarter = 'OT';
  state.clockSecondsRemaining = 0;
  state.overtime = { period, possessionsCompleted: 0, firstOffenseTeamId };
  setFirstDown(state, firstOffenseTeamId, 100 - overtimeYardsFromGoal(state));
  const team = firstOffenseTeamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
  return ` OVERTIME ${period}: ${team.name} ball at the ${overtimeYardsFromGoal(state)}.`;
}

/**
 * Resolves a single play of football and updates state
 */
export function simulateSnap(
  state: GameSimulationState,
  chosenConcept?: PlayConcept,
  chosenDefensiveCall?: DefensiveCall
): { state: GameSimulationState; event: PlayEvent } {
  const snapQuarter = state.currentQuarter; // a field goal as time expires belongs to the quarter it was kicked in
  if (!state.openingPossessionTeamId) {
    state.openingPossessionTeamId = state.possessionTeamId;
  }
  // Coaches empty the bench in second-half blowouts (and under the mercy-rule running clock)
  const margin = state.homeScore - state.awayScore;
  const secondHalfBlowout = typeof state.currentQuarter === 'number' && state.currentQuarter >= 3 && Math.abs(margin) >= REST_STARTERS_LEAD;
  restingTeamIds = new Set(secondHalfBlowout || state.isMercyRuleActive ? [margin > 0 ? state.homeTeam.id : state.awayTeam.id] : []);

  state.gameDayForm ??= {
    [state.homeTeam.id]: calculateGaussianVariance(0, GAME_DAY_FORM_STDEV),
    [state.awayTeam.id]: calculateGaussianVariance(0, GAME_DAY_FORM_STDEV)
  };

  const isHomeOffense = state.possessionTeamId === state.homeTeam.id;
  const offense = isHomeOffense ? state.homeTeam : state.awayTeam;
  const defense = isHomeOffense ? state.awayTeam : state.homeTeam;
  const isOvertime = state.currentQuarter === 'OT';
  const addPoints = (team: Team, points: number) => {
    if (team.id === state.homeTeam.id) state.homeScore += points;
    else state.awayScore += points;
  };

  // A touchdown on the previous snap means this snap is the try (PAT kick or 2-point play)
  const lastEvent = state.eventLog[state.eventLog.length - 1];
  const isTryDown = lastEvent?.scoreType === 'TOUCHDOWN';
  // The situation at the snap, recorded on the event for the play-by-play (state changes below)
  const snap = { down: state.down, distance: state.distance, yardLine: state.yardLine };

  let concept: PlayConcept;
  if (isTryDown) {
    const goForTwo =
      chosenConcept === 'TWO_POINT_TRY' || (chosenConcept !== undefined && SCRIMMAGE_CONCEPTS.includes(chosenConcept));
    concept = goForTwo ? 'TWO_POINT_TRY' : 'PAT_KICK';
  } else {
    concept = chosenConcept && chosenConcept !== 'PAT_KICK' && chosenConcept !== 'TWO_POINT_TRY'
      ? chosenConcept
      : selectAIPlayConcept(
          state,
          offensiveSchemeOf(state, offense),
          isHomeOffense ? state.homeScore - state.awayScore : state.awayScore - state.homeScore
        );
  }

  const playId = `play_${Date.now()}_${randomInt(100, 999)}`;
  let yardsGained = 0;
  let isTurnover = false;
  let turnoverType: PlayEvent['turnoverType'];
  let isScore = false;
  let scoreType: PlayEvent['scoreType'];
  let commentary = '';
  let defensiveCall: DefensiveCall | undefined;
  let timeElapsed = state.isMercyRuleActive ? MERCY_RULE_RUNOFF : randomInt(PLAY_CLOCK_RUNOFF.min, PLAY_CLOCK_RUNOFF.max);

  // No kickoffs in overtime; possession is reset by the overtime rules below
  const kickoffUnlessOvertime = (kicking: Team, receiving: Team, kickSpot = 40) => {
    if (isOvertime) return;
    const kick = resolveKickoff(state, kicking, receiving, kickSpot);
    commentary += kick.text;
    if (kick.isTurnover) {
      isTurnover = true;
      turnoverType = 'FUMBLE';
    }
  };

  // Try after touchdown (untimed down)
  if (concept === 'PAT_KICK' || concept === 'TWO_POINT_TRY') {
    timeElapsed = 0;
    if (concept === 'PAT_KICK') {
      const kicker = getActivePlayer(offense, 'K');
      const res = resolveFieldGoal(kicker, 20, state.windSpeedMph);
      commentary = res.isSuccess ? `K #${kicker.lastName}'s extra point is GOOD.` : `K #${kicker.lastName}'s extra point is NO GOOD!`;
      if (res.isSuccess) {
        isScore = true;
        scoreType = 'PAT';
        addPoints(offense, 1);
      }
    } else {
      const tryConcept: PlayConcept = Math.random() < 0.5 ? 'INSIDE_RUN' : 'SHORT_PASS';
      const { delta } = calculateMatchupDelta(tryConcept, offense, defense);
      const quality = delta + getContextualModifier(state.weather, state.teamMomentum, tryConcept) + calculateGaussianVariance(0, EXECUTION_STDEV);
      if (quality > 2) {
        isScore = true;
        scoreType = 'TWO_POINT';
        addPoints(offense, 2);
        commentary = `Two-point try is GOOD! ${offense.name} converts.`;
      } else {
        commentary = `Two-point try FAILS! ${defense.name} holds at the goal line.`;
      }
    }
    kickoffUnlessOvertime(offense, defense);
  }
  // Field Goal execution
  else if (concept === 'FIELD_GOAL') {
    const kicker = getActivePlayer(offense, 'K');
    const fgDist = (100 - state.yardLine) + 17; // 17 yards for snap/endzone depth
    const fgRes = resolveFieldGoal(kicker, fgDist, state.windSpeedMph);
    commentary = fgRes.text;
    credit(state, kicker, { fieldGoalsAttempted: 1, fieldGoalsMade: fgRes.isSuccess ? 1 : 0 });

    if (fgRes.isSuccess) {
      isScore = true;
      scoreType = 'FIELD_GOAL';
      addPoints(offense, 3);
      kickoffUnlessOvertime(offense, defense);
    } else {
      // Opponent takes over at the spot of the kick (or their 20 if the kick was inside the 20)
      isTurnover = true;
      turnoverType = 'DOWNS';
      setFirstDown(state, defense.id, Math.max(20, 100 - (state.yardLine - 7)));
    }
  }
  // Punt execution
  else if (concept === 'PUNT') {
    const punter = getActivePlayer(offense, 'P');
    const returner = getActivePlayer(defense, 'CB');
    const canShank = punter.attributes.footballIQ < 50 || state.weather === 'HIGH_WIND';
    const gross = canShank && Math.random() < 0.04
      ? randomInt(8, 16)
      : Math.floor(22 + punter.attributes.kickingPower * 0.28 + calculateGaussianVariance(0, 5));
    const landing = state.yardLine + gross;

    if (landing >= 100) {
      setFirstDown(state, defense.id, 20);
      commentary = `P #${punter.lastName} punts into the end zone for a touchback.`;
    } else {
      const muffChance = clamp(8 - returner.attributes.catching * 0.08 + (state.weather === 'HEAVY_RAIN' ? 4 : 0), 1, 15) / 100;
      if (Math.random() < muffChance && Math.random() < 0.5) {
        isTurnover = true;
        turnoverType = 'FUMBLE';
        setFirstDown(state, offense.id, landing);
        commentary = `P #${punter.lastName} punts ${gross} yds... MUFFED by #${returner.lastName}! ${offense.name} recovers!`;
      } else {
        setFirstDown(state, defense.id, 100 - landing);
        commentary = `P #${punter.lastName} punts ${gross} yds to the opponent ${state.yardLine} yd line.`;
      }
    }
  }
  // Standard Scrimmage Plays
  else {
    const scrimmageConcept = concept as ScrimmageConcept;
    defensiveCall = chosenDefensiveCall ?? state.defensiveGamePlan?.[defense.id] ?? selectAIDefensiveCall(state);
    const { delta, passer } = calculateMatchupDelta(concept, offense, defense);
    const contextMod = getContextualModifier(state.weather, state.teamMomentum, concept) + DEFENSIVE_CALL_MODIFIERS[defensiveCall][scrimmageConcept];
    const variance = calculateGaussianVariance(0, EXECUTION_STDEV + (defensiveCall === 'BLITZ' ? BLITZ_EXTRA_STDEV : 0));
    const form = (state.gameDayForm?.[offense.id] ?? 0) - (state.gameDayForm?.[defense.id] ?? 0);
    const isPass = isPassConcept(concept);
    const offScheme = offensiveSchemeOf(state, offense);
    const schemeMod =
      OFFENSIVE_SCHEME_MODIFIERS[offScheme][scrimmageConcept] +
      DEFENSIVE_SCHEME_MODIFIERS[defense.schemeDefense][scrimmageConcept] +
      schemeCounterBonus(offScheme, defense.schemeDefense, isPass) +
      (isPass && state.weather === 'HEAVY_RAIN' && (offScheme === 'AIR_RAID' || offScheme === 'SPREAD') ? -5 : 0);
    const offenseLead = isHomeOffense ? state.homeScore - state.awayScore : state.awayScore - state.homeScore;
    const preventDefense = state.currentQuarter === 4 && offenseLead <= -PREVENT_DEFENSE_DEFICIT ? PREVENT_DEFENSE_BONUS : 0;
    const redZone = state.yardLine >= RED_ZONE_YARD_LINE ? RED_ZONE_BONUS : 0;
    const playQuality =
      MATCHUP_BASELINES[scrimmageConcept] +
      (delta - MATCHUP_BASELINES[scrimmageConcept]) * MATCHUP_SPREAD_SCALE +
      contextMod + variance + form + schemeMod * SCHEME_EFFECT_SCALE + preventDefense + redZone;
    const passThresholds = isPass ? PASS_THRESHOLDS[concept as 'SHORT_PASS' | 'DEEP_PASS'] : null;

    // Who is involved on this snap (usage shares from design spec 11.1)
    const receiver = isPass ? pickReceiver(offense) : undefined;
    const ballCarrier = isPass ? undefined : pickRusher(offense);
    const tackler = isPass ? pickPassTackler(defense) : pickRunTackler(defense);
    const label = (p: Player | undefined) => `${p?.position ?? ''} #${p?.lastName ?? '?'}`;

    // Catastrophic Turnover Check
    // Undisciplined offenses are closer to a fumble or interception on every snap
    const sloppiness = disciplinePlayQualityPenalty(offense);
    const fumbleThreshold = RUN_THRESHOLDS.fumble - (offScheme === 'POWER_I' ? 4 : 0) + sloppiness;
    const explosiveThreshold = EXPLOSIVE_PLAY_QUALITY - (offScheme === 'AIR_RAID' || offScheme === 'SPREAD' ? 3 : 0);
    if (passThresholds ? playQuality < passThresholds.interception + sloppiness : playQuality < fumbleThreshold) {
      isTurnover = true;
      turnoverType = isPass ? 'INTERCEPTION' : 'FUMBLE';
      const defender = isPass ? pickInterceptor(defense) : tackler;
      if (isPass) {
        commentary = `INTERCEPTED! QB #${passer?.lastName} picked off by ${label(defender)}!`;
        credit(state, passer, { passAttempts: 1, interceptionsThrown: 1 });
        credit(state, defender, { interceptionsCaught: 1 });
      } else {
        commentary = `FUMBLE! ${label(ballCarrier)} coughs up the football! Recovered by ${label(defender)}.`;
        credit(state, ballCarrier, { rushAttempts: 1, fumblesLost: 1 });
        credit(state, defender, { tackles: 1 });
      }

      const spot = isPass ? clamp(state.yardLine + (concept === 'DEEP_PASS' ? 20 : 6), 1, 99) : state.yardLine;
      const defenseYardLine = 100 - spot + (isOvertime ? 0 : turnoverReturnYards(defender, offense));
      if (defenseYardLine >= 100) {
        isScore = true;
        scoreType = 'TOUCHDOWN';
        addPoints(defense, 6);
        commentary += ` Returned all the way for a DEFENSIVE TOUCHDOWN!`;
        setFirstDown(state, defense.id, 97);
      } else {
        setFirstDown(state, defense.id, clamp(defenseYardLine, 1, 99));
      }
    } else {
      // Sack / TFL
      const canBeSacked = offScheme !== 'TRIPLE_OPTION'; // option QBs throw off play-action rollouts
      if (playQuality < (passThresholds ? (canBeSacked ? passThresholds.sack : -Infinity) : RUN_THRESHOLDS.tackleForLoss)) {
        yardsGained = Math.max(-randomInt(1, isPass ? 8 : 4), -state.yardLine);
        if (isPass) {
          const sacker = pickSacker(defense);
          commentary = `SACKED! ${label(sacker)} drags down QB #${passer?.lastName} for a loss of ${Math.abs(yardsGained)} yds.`;
          credit(state, sacker, { sacks: 1, tackles: 1, tacklesForLoss: 1 });
        } else {
          commentary = `TACKLED FOR LOSS! ${label(ballCarrier)} stopped behind the line by ${label(tackler)} for ${yardsGained} yds.`;
          credit(state, ballCarrier, { rushAttempts: 1, rushYards: yardsGained });
          credit(state, tackler, { tackles: 1, tacklesForLoss: 1 });
        }
      }
      // Incomplete Pass
      else if (passThresholds && playQuality < passThresholds.incomplete) {
        timeElapsed = Math.min(timeElapsed, INCOMPLETE_RUNOFF);
        commentary = `QB #${passer?.lastName} pass incomplete intended for ${label(receiver)}.`;
        credit(state, passer, { passAttempts: 1 });
      }
      // Normal Gain (scaled by execution quality)
      else {
        if (concept === 'DEEP_PASS') yardsGained = 9 + randomInt(0, 6) + Math.round(Math.max(0, playQuality) / 3);
        else if (concept === 'SHORT_PASS') yardsGained = 3 + randomInt(0, 4) + Math.round(Math.max(0, playQuality) / 5);
        else yardsGained = Math.max(0, Math.round(2.5 + playQuality / 4 + calculateGaussianVariance(0, 1.5)));
        if (playQuality > explosiveThreshold) yardsGained += randomInt(8, 30); // Explosive break
        yardsGained = Math.min(yardsGained, 100 - state.yardLine);
        const scores = state.yardLine + yardsGained >= 100;
        if (isPass) {
          commentary = `QB #${passer?.lastName} complete to ${label(receiver)} for ${yardsGained} yds.`;
          credit(state, passer, { passAttempts: 1, passCompletions: 1, passYards: yardsGained, passTDs: scores ? 1 : 0 });
          credit(state, receiver, { receptions: 1, receivingYards: yardsGained, receivingTDs: scores ? 1 : 0 });
        } else {
          commentary = `${label(ballCarrier)} rushes for ${yardsGained} yds.`;
          credit(state, ballCarrier, { rushAttempts: 1, rushYards: yardsGained, rushTDs: scores ? 1 : 0 });
        }
        if (!scores) {
          commentary += ` Tackled by ${label(tackler)}.`;
          credit(state, tackler, { tackles: 1 });
        }
      }

      state.yardLine += yardsGained;

      // Check Safety: conceding team free kicks from its own 20
      if (state.yardLine <= 0) {
        isScore = true;
        scoreType = 'SAFETY';
        addPoints(defense, 2);
        commentary += ` SAFETY! Tackled in end zone.`;
        kickoffUnlessOvertime(offense, defense, 20);
      }
      // Check Touchdown: scoring team keeps the ball for the try from the 3
      else if (state.yardLine >= 100) {
        isScore = true;
        scoreType = 'TOUCHDOWN';
        addPoints(offense, 6);
        commentary += ` TOUCHDOWN ${offense.name.toUpperCase()}!`;
        setFirstDown(state, offense.id, 97);
      }
      // Advance Down & Distance
      else if (yardsGained >= state.distance) {
        setFirstDown(state, offense.id, state.yardLine);
        commentary += ` FIRST DOWN!`;
      } else {
        state.distance -= yardsGained;
        if (state.down === 4) {
          isTurnover = true;
          turnoverType = 'DOWNS';
          commentary += ` Turnover on downs!`;
          setFirstDown(state, defense.id, 100 - state.yardLine);
        } else {
          state.down = (state.down + 1) as 2 | 3 | 4;
        }
      }
    }
  }

  // Overtime possession accounting (untimed)
  if (isOvertime && state.overtime) {
    const ot = state.overtime;
    const isSecondPossession = ot.possessionsCompleted === 1;
    const offenseLeads = isHomeOffense ? state.homeScore > state.awayScore : state.awayScore > state.homeScore;
    let possessionOver = false;

    if (concept === 'PAT_KICK' || concept === 'TWO_POINT_TRY') {
      possessionOver = true;
    } else if (scoreType === 'TOUCHDOWN') {
      if (isSecondPossession && offenseLeads) {
        state.isGameOver = true; // walk-off touchdown: no try needed
      }
    } else if (isScore || isTurnover || concept === 'PUNT') {
      possessionOver = true;
    }

    if (possessionOver) {
      if (!isSecondPossession) {
        const secondTeam = ot.firstOffenseTeamId === state.homeTeam.id ? state.awayTeam : state.homeTeam;
        ot.possessionsCompleted = 1;
        setFirstDown(state, secondTeam.id, 100 - overtimeYardsFromGoal(state));
        commentary += ` ${secondTeam.name} takes its overtime possession at the 10.`;
      } else if (state.homeScore !== state.awayScore) {
        state.isGameOver = true;
      } else {
        const nextFirst = ot.firstOffenseTeamId === state.homeTeam.id ? state.awayTeam.id : state.homeTeam.id;
        commentary += ` Still tied!${startOvertimePeriod(state, ot.period + 1, nextFirst)}`;
      }
    }
    if (state.isGameOver) commentary += ` FINAL IN OVERTIME!`;
  }

  // Clock Management & Quarter Progression (a touchdown always gets its try)
  if (!isOvertime) state.clockSecondsRemaining -= timeElapsed;
  if (!isOvertime && state.clockSecondsRemaining <= 0 && scoreType !== 'TOUCHDOWN') {
    if (state.currentQuarter === 4) {
      if (state.homeScore === state.awayScore) {
        const coinTossLoser = Math.random() < 0.5 ? state.homeTeam.id : state.awayTeam.id;
        commentary += ` END OF REGULATION, TIED ${state.homeScore}-${state.awayScore}!${startOvertimePeriod(state, 1, coinTossLoser)}`;
      } else {
        state.isGameOver = true;
      }
    } else if (typeof state.currentQuarter === 'number') {
      state.currentQuarter = (state.currentQuarter + 1) as 1 | 2 | 3 | 4;
      state.clockSecondsRemaining = 720; // 12-min quarters

      // Second-half kickoff: the team that opened with the ball kicks to the other
      if (state.currentQuarter === 3) {
        const openedHome = state.openingPossessionTeamId === state.homeTeam.id;
        const kick = resolveKickoff(
          state,
          openedHome ? state.homeTeam : state.awayTeam,
          openedHome ? state.awayTeam : state.homeTeam
        );
        commentary += ` HALFTIME.${kick.text}`;
      }
    }
  }
  state.clockSecondsRemaining = Math.max(0, state.clockSecondsRemaining);

  // Running clock once a second-half lead reaches the state's mercy-rule margin (none if the state has no mercy rule)
  const mercyMargin = rulesForState(state.homeTeam.state).mercyRuleMargin;
  if (mercyMargin !== null && typeof state.currentQuarter === 'number' && state.currentQuarter >= 3 && Math.abs(state.homeScore - state.awayScore) >= mercyMargin) {
    state.isMercyRuleActive = true;
  }

  if (defensiveCall && defensiveCall !== 'BASE') {
    commentary += ` [vs. ${defensiveCall.replace('_', ' ')}]`;
  }

  const event: PlayEvent = {
    playId,
    quarter: state.currentQuarter,
    snapQuarter,
    clockTimeRemainingSeconds: state.clockSecondsRemaining,
    down: state.down,
    distance: state.distance,
    yardLine: state.yardLine,
    snapDown: snap.down,
    snapDistance: snap.distance,
    snapYardLine: snap.yardLine,
    ...(isTryDown && { isTry: true }),
    possessionTeamId: state.possessionTeamId,
    playConcept: concept,
    yardsGained,
    isTurnover,
    turnoverType,
    isScore,
    scoreType,
    textCommentary: commentary,
    isLeverageMoment: false,
    ...(defensiveCall && { defensiveCall }),
    homeScoreAfter: state.homeScore,
    awayScoreAfter: state.awayScore
  };

  state.eventLog.push(event);
  return { state, event };
}
