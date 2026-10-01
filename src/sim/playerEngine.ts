import {
  Player,
  InjurySeverity,
  Position,
  PotentialGrade
} from '../types/game';
import { clamp, randomInt } from './math/variance';

/**
 * Handles in-game stamina depletion and fatigue recovery on the sideline.
 */
export function updateInGameStamina(player: Player, snapsPlayed: number, position: Position): void {
  let burnRate = 1.8;
  if (position === 'RB' || position === 'DE' || position === 'LB') burnRate = 2.8;
  else if (position === 'OT' || position === 'OG' || position === 'C' || position === 'DT') burnRate = 2.2;
  else if (position === 'QB' || position === 'CB' || position === 'S') burnRate = 1.2;

  player.condition.inGameStamina = clamp(
    player.condition.inGameStamina - snapsPlayed * burnRate,
    15,
    100
  );
}

/**
 * Restores in-game stamina when a player rests on the bench during possessions.
 */
export function restPlayerOnSideline(player: Player, seriesRested: number): void {
  const recovery = seriesRested * 8.5;
  const maxCap = 100 - player.condition.seasonWear * 0.5;
  player.condition.inGameStamina = clamp(player.condition.inGameStamina + recovery, 0, maxCap);
}

/**
 * Updates cumulative season wear at the end of each game week.
 */
export function processPostGameSeasonWear(player: Player, snapsPlayed: number, practiceIntensity: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT'): void {
  let wearIncrement = 0;
  if (snapsPlayed > 50) wearIncrement += 1.2;
  else if (snapsPlayed > 35) wearIncrement += 0.8;
  else if (snapsPlayed > 15) wearIncrement += 0.3;

  if (practiceIntensity === 'CONTACT') wearIncrement += 0.6;
  else if (practiceIntensity === 'WALKTHROUGH') wearIncrement -= 0.4;

  player.condition.seasonWear = clamp(player.condition.seasonWear + wearIncrement, 0, 45);
  player.condition.inGameStamina = clamp(100 - player.condition.seasonWear * 0.5, 55, 100);
}

/**
 * Checks for injuries on contact plays with fatigue multipliers.
 */
export function evaluateSnapInjury(player: Player): InjurySeverity {
  if (player.condition.injuryStatus !== 'HEALTHY') return player.condition.injuryStatus;

  const fatigueMultiplier = player.condition.inGameStamina < 50 ? 2.8 : 1.0;
  const roll = Math.random() * 1000;

  if (roll < 1.2 * fatigueMultiplier) {
    player.condition.injuryStatus = 'SEASON_ENDING';
    player.condition.injuryWeeksRemaining = 20;
    return 'SEASON_ENDING';
  }
  if (roll < 6.0 * fatigueMultiplier) {
    player.condition.injuryStatus = 'MODERATE';
    player.condition.injuryWeeksRemaining = randomInt(2, 4);
    return 'MODERATE';
  }
  if (roll < 22.0 * fatigueMultiplier) {
    player.condition.injuryStatus = 'DINGED';
    player.condition.injuryWeeksRemaining = 1;
    return 'DINGED';
  }

  return 'HEALTHY';
}

/**
 * Decrements injury recovery counters during Monday triage.
 */
export function processWeeklyInjuryHealing(player: Player): void {
  if (player.condition.injuryWeeksRemaining > 0) {
    player.condition.injuryWeeksRemaining -= 1;
    if (player.condition.injuryWeeksRemaining === 0) {
      player.condition.injuryStatus = 'HEALTHY';
    }
  }
}

/**
 * Evaluates 3-week academic report cards for "No Pass, No Play" eligibility.
 */
export function evaluateAcademicReport(player: Player): void {
  let gpaDelta = (Math.random() * 0.6 - 0.3);
  if (player.academics.studyHallAssigned) gpaDelta += 0.25;
  if (player.attributes.footballIQ > 75) gpaDelta += 0.1;

  player.academics.gpa = clamp(Number((player.academics.gpa + gpaDelta).toFixed(2)), 1.2, 4.0);

  if (player.academics.gpa < 2.0) {
    player.academics.isEligible = false;
    player.academics.consecutiveFailingWeeks += 3;
  } else {
    player.academics.isEligible = true;
    player.academics.consecutiveFailingWeeks = 0;
  }
}

/**
 * Calculates off-season player progression and growth spurts.
 */
export function processOffSeasonProgression(player: Player, strengthCoachRating: number): void {
  const potentialMap: Record<PotentialGrade, number> = {
    'A+': 6,
    'A': 4,
    'B': 3,
    'C': 1,
    'D': 0
  };

  let growth = potentialMap[player.potential];

  if (player.classYear === 'Freshman' && Math.random() < 0.30) {
    growth += randomInt(4, 8); // High freshman growth variance
  } else if (player.classYear === 'Sophomore' && Math.random() < 0.20) {
    growth += randomInt(3, 6);
  } else if (player.classYear === 'Junior' && Math.random() < 0.10) {
    growth += randomInt(2, 4);
  }

  if (strengthCoachRating >= 80) growth += 1;
  if (player.classYear === 'Senior') growth = Math.min(2, growth);

  player.overallRating = clamp(player.overallRating + growth, 35, 99);
  player.attributes.strength = clamp(player.attributes.strength + growth, 35, 99);
  player.attributes.speed = clamp(player.attributes.speed + Math.floor(growth * 0.75), 35, 99);
  player.attributes.agility = clamp(player.attributes.agility + Math.floor(growth * 0.7), 35, 99);
  player.attributes.footballIQ = clamp(player.attributes.footballIQ + 3, 30, 99);

  // Reset conditions for new year
  player.condition.seasonWear = 0;
  player.condition.inGameStamina = 100;
  player.condition.injuryStatus = 'HEALTHY';
  player.condition.injuryWeeksRemaining = 0;
}

/**
 * Emergency QB Fallback Selector if zero active quarterbacks remain.
 */
export function findEmergencyQuarterback(roster: Player[]): Player {
  const eligible = roster.filter((p) => p.academics.isEligible && p.condition.injuryStatus === 'HEALTHY');
  if (eligible.length === 0) return roster[0];

  return eligible.reduce((best, candidate) => {
    const candidateScore = candidate.attributes.armStrength * 0.4 + candidate.attributes.speed * 0.3 + candidate.attributes.footballIQ * 0.3;
    const bestScore = best.attributes.armStrength * 0.4 + best.attributes.speed * 0.3 + best.attributes.footballIQ * 0.3;
    return candidateScore > bestScore ? candidate : best;
  }, eligible[0]);
}
