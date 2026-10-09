import { Player, Position, PotentialGrade, Team } from '../types/game';
import { clamp, randomInt } from './math/variance';
import { POSITION_KEY_SKILLS } from './playerEngine';
import type { SeasonPhase } from './scheduleEngine';

// ---------------------------------------------------------------------------
// Weekly training. The coach makes one decision, how hard the team practices; every healthy player trains
// the same way. Training builds key skills (and, every few points, the overall rating) at the cost of
// fatigue and the odd practice injury. The time of year multiplies both the gains and the practice load.
// Fatigue (0-100%, stored in condition.seasonWear) builds from games and practice and recovers with
// lighter weeks; tired players start games short on stamina and get hurt more.
// ---------------------------------------------------------------------------

export type PracticeIntensity = 'FULL' | 'LIMITED' | 'NO_PRACTICE' | 'WEEK_OFF';

export const PRACTICE_OPTIONS: { id: PracticeIntensity; label: string; help: string }[] = [
  { id: 'FULL', label: 'Full', help: 'Full pads: the most skill gain, the most fatigue and injury risk.' },
  { id: 'LIMITED', label: 'Limited', help: 'A lighter load: some skill gain, players recover a little.' },
  { id: 'NO_PRACTICE', label: 'No practice', help: 'Film day: a small skill gain and good recovery.' },
  { id: 'WEEK_OFF', label: 'Week off', help: 'Complete rest: no skill gain, the biggest recovery.' }
];

/** Saves from before the training model used the old practice names. */
export const migrateIntensity = (value: string | undefined): PracticeIntensity =>
  value === 'CONTACT' ? 'FULL' : value === 'WALKTHROUGH' ? 'NO_PRACTICE' : value === 'FULL' || value === 'NO_PRACTICE' || value === 'WEEK_OFF' ? value : 'LIMITED';

/** How much a week of training counts at each time of year (gains and practice load alike). */
export const PHASE_TRAINING: Record<SeasonPhase, number> = {
  SPRING_EVALUATION: 2,
  SUMMER_CAMP: 2,
  NON_DISTRICT: 1,
  DISTRICT_PLAY: 1,
  STATE_PLAYOFFS: 0.5,
  POST_SEASON: 0,
  OFF_SEASON: 2
};

// Training a player earns in a 1x week, in overall-rating points: one full point is +1 to each of his key skills
// (a point at a time, in turn) and +1 overall, the way off-season growth moves them together
const GAIN: Record<PracticeIntensity, number> = { FULL: 0.05, LIMITED: 0.024, NO_PRACTICE: 0.008, WEEK_OFF: 0 };
// Practice fatigue added in a 1x week (%), and fatigue every player recovers each week (%)
const PRACTICE_LOAD: Record<PracticeIntensity, number> = { FULL: 3, LIMITED: 1, NO_PRACTICE: 0, WEEK_OFF: 0 };
const RECOVERY: Record<PracticeIntensity, number> = { FULL: 3, LIMITED: 4, NO_PRACTICE: 8, WEEK_OFF: 14 };
// Chance one player is hurt in a 1x week of practice
const PRACTICE_INJURY: Record<PracticeIntensity, number> = { FULL: 0.005, LIMITED: 0.0015, NO_PRACTICE: 0, WEEK_OFF: 0 };
/** Fatigue from playing a game: starters carry the load. */
export const GAME_FATIGUE = { starter: 5, backup: 1 };
// Players with more potential pick things up faster
const POTENTIAL_LEARNING: Record<PotentialGrade, number> = { 'A+': 1.4, A: 1.2, B: 1, C: 0.8, D: 0.6 };
/** A conditioning coach this good speeds up recovery by a point a week. */
const CONDITIONING_RECOVERY_RATING = 80;

// ---------------------------------------------------------------------------
// Fatigue levels
// ---------------------------------------------------------------------------

export type FatigueLevel = 'Fresh' | 'Good' | 'Worn' | 'Tired' | 'Exhausted';

export const FATIGUE_LEVELS: { level: FatigueLevel; min: number; injury: number; effect: string }[] = [
  { level: 'Fresh', min: 0, injury: 1, effect: 'No effect' },
  { level: 'Good', min: 15, injury: 1, effect: 'No effect' },
  { level: 'Worn', min: 35, injury: 1.15, effect: 'Injury risk ×1.15' },
  { level: 'Tired', min: 55, injury: 1.4, effect: 'Injury risk ×1.4, less stamina' },
  { level: 'Exhausted', min: 75, injury: 1.8, effect: 'Injury risk ×1.8, may sit' }
];

export const fatigueOf = (p: Player) => p.condition.seasonWear;
const levelInfo = (fatigue: number) => [...FATIGUE_LEVELS].reverse().find((l) => fatigue >= l.min) ?? FATIGUE_LEVELS[0];
export const fatigueLevel = (fatigue: number): FatigueLevel => levelInfo(fatigue).level;
/** How much more likely a player is to get hurt (in games and practice) at this fatigue. */
export const fatigueInjuryMultiplier = (fatigue: number) => levelInfo(fatigue).injury;
/** The stamina a player starts a game with: an exhausted starter (about 89%+) starts under the 60 the engine needs to play him. */
export const staminaFromFatigue = (fatigue: number) => clamp(100 - fatigue * 0.45, 55, 100);

// ---------------------------------------------------------------------------
// Coach boosts
// ---------------------------------------------------------------------------

export interface TrainingBoosts {
  gain: number; // team-wide gain multiplier (1 = none)
  byPosition: Partial<Record<Position, number>>; // extra gain share by position
  young: number; // extra gain share for freshmen and sophomores
  injuryReduction: number; // share of practice injuries avoided
  recovery: number; // extra fatigue recovered a week
  sources: string[]; // what to show the coach
}

export const NO_BOOSTS: TrainingBoosts = { gain: 1, byPosition: {}, young: 0, injuryReduction: 0, recovery: 0, sources: [] };
/** The most the staff can add to any one player's training gain. */
export const MAX_COACH_GAIN = 0.5;
const ASSISTANT_UPGRADE_GAIN = 0.2;
const POSITION_COACH_GAIN = 0.25; // a 99-rated position coach with a development effect

/**
 * What the coaches add: the Assistant Upgrade talent (+20% for everyone), position and JV coaches with a
 * development effect (up to +25% for their players), the Iron Body strength coach (fewer practice injuries)
 * and a strong conditioning coach (faster recovery).
 */
export function trainingBoosts(
  team: Team,
  assistantUpgrade: boolean,
  staff?: { developmentByPosition: Partial<Record<Position, number>>; freshmanDevelopment: number; injuryReduction: number }
): TrainingBoosts {
  const sources: string[] = [];
  const byPosition: Partial<Record<Position, number>> = {};
  Object.entries(staff?.developmentByPosition ?? {}).forEach(([pos, amount]) => {
    if ((amount ?? 0) > 0) byPosition[pos as Position] = POSITION_COACH_GAIN * Math.min(1, amount ?? 0);
  });
  const young = POSITION_COACH_GAIN * Math.min(1, staff?.freshmanDevelopment ?? 0);
  const positions = Object.keys(byPosition);
  if (assistantUpgrade) sources.push(`+${ASSISTANT_UPGRADE_GAIN * 100}% gain · Assistant Upgrade`);
  if (positions.length) sources.push(`+gain for ${positions.join('/')} · position coaches`);
  if (young > 0) sources.push('+gain for Fr/So · JV staff');
  const injuryReduction = staff?.injuryReduction ?? 0;
  if (injuryReduction > 0) sources.push(`−${Math.round(injuryReduction * 100)}% practice injuries · S&C`);
  const recovery = team.staff.strengthCoach.conditioningRating >= CONDITIONING_RECOVERY_RATING ? 1 : 0;
  if (recovery) sources.push('+1% recovery a week · conditioning');
  return { gain: assistantUpgrade ? 1 + ASSISTANT_UPGRADE_GAIN : 1, byPosition, young, injuryReduction, recovery, sources };
}

const isYoung = (p: Player) => p.classYear === 'Freshman' || p.classYear === 'Sophomore';

/** One player's training progress for a week (overall-rating points). */
function weeklyGain(p: Player, intensity: PracticeIntensity, multiplier: number, boosts: TrainingBoosts): number {
  const coach = Math.min(MAX_COACH_GAIN, (boosts.byPosition[p.position] ?? 0) + (isYoung(p) ? boosts.young : 0));
  return GAIN[intensity] * multiplier * POTENTIAL_LEARNING[p.potential] * boosts.gain * (1 + coach);
}

const practiceInjuryChance = (p: Player, intensity: PracticeIntensity, multiplier: number, boosts: TrainingBoosts) =>
  PRACTICE_INJURY[intensity] * multiplier * fatigueInjuryMultiplier(fatigueOf(p)) * (1 - boosts.injuryReduction);

const canTrain = (p: Player) => p.condition.injuryStatus === 'HEALTHY';

/** Skill points (+1 to one key skill each) that a week's progress is worth for this player. */
const skillPointsFor = (p: Player, progress: number) => progress * POSITION_KEY_SKILLS[p.position].length;

/**
 * Adds training progress (overall-rating points). It is earned as skill points: each is +1 to the player's
 * next key skill (they take turns), and each full turn through his key skills is +1 overall, so every
 * position improves at the same pace. Returns the skill points earned.
 */
export function trainPlayer(p: Player, progress: number): number {
  const skills = POSITION_KEY_SKILLS[p.position];
  // A new player starts part of the way to his next point, so the roster doesn't all improve the same week
  const t = (p.training = p.training ?? { progress: Math.random(), points: 0 });
  t.progress += skillPointsFor(p, progress);
  let earned = 0;
  while (t.progress >= 1) {
    t.progress -= 1;
    t.points += 1;
    earned += 1;
    const skill = skills[t.points % skills.length];
    p.attributes[skill] = clamp((p.attributes[skill] as number) + 1, 20, 99);
    if (t.points % skills.length === 0) p.overallRating = clamp(p.overallRating + 1, 35, 99);
  }
  return earned;
}

/** Sets the fatigue and the stamina that comes with it. */
export function setFatigue(p: Player, fatigue: number): void {
  p.condition.seasonWear = clamp(fatigue, 0, 100);
  p.condition.inGameStamina = staminaFromFatigue(p.condition.seasonWear);
}

export interface TrainingReport {
  week: number;
  intensity: PracticeIntensity;
  multiplier: number;
  skillPoints: number;
  overallGains: number;
  improved: string[]; // a few of the players who gained, e.g. "QB J. Carter +1 Pass Accuracy"
  injured: string[]; // practice injuries, e.g. "LB M. Price (1 week)"
}

const SKILL_LABELS: Partial<Record<keyof Player['attributes'], string>> = {
  passingAccuracy: 'Accuracy',
  armStrength: 'Arm',
  vision: 'Vision',
  carrying: 'Ball Carrying',
  routeRunning: 'Routes',
  catching: 'Catching',
  runBlocking: 'Run Block',
  passBlocking: 'Pass Block',
  passRush: 'Pass Rush',
  tackling: 'Tackling',
  coverage: 'Coverage',
  kickingPower: 'Kick Power',
  kickingAccuracy: 'Kick Accuracy'
};

/**
 * One week of practice for a team, after its game (if it had one): game and practice fatigue, recovery,
 * training gains for every healthy player and practice injuries.
 */
export function runTrainingWeek(team: Team, intensity: PracticeIntensity, phase: SeasonPhase, week: number, played: boolean, boosts: TrainingBoosts = NO_BOOSTS): TrainingReport {
  const multiplier = PHASE_TRAINING[phase];
  const report: TrainingReport = { week, intensity, multiplier, skillPoints: 0, overallGains: 0, improved: [], injured: [] };
  team.roster.forEach((p) => {
    const gameLoad = played ? (p.depthChartTier === 1 ? GAME_FATIGUE.starter : GAME_FATIGUE.backup) : 0;
    const practicing = canTrain(p) && multiplier > 0;
    const load = practicing ? PRACTICE_LOAD[intensity] * multiplier : 0;
    // Injured players rest: they recover like a week off
    const recovery = (practicing ? RECOVERY[intensity] : RECOVERY.WEEK_OFF) + boosts.recovery;
    setFatigue(p, fatigueOf(p) + gameLoad + load - recovery);
    if (!practicing) return;
    const before = p.overallRating;
    const skillsBefore = { ...p.attributes };
    const earned = trainPlayer(p, weeklyGain(p, intensity, multiplier, boosts));
    if (earned > 0) {
      report.skillPoints += earned;
      report.overallGains += p.overallRating - before;
      const skill = POSITION_KEY_SKILLS[p.position].find((s) => p.attributes[s] !== skillsBefore[s]);
      if (skill) report.improved.push(`${p.position} ${p.firstName.charAt(0)}. ${p.lastName} +${earned} ${SKILL_LABELS[skill] ?? skill}`);
    }
    if (Math.random() < practiceInjuryChance(p, intensity, multiplier, boosts)) {
      const weeks = Math.random() < 0.75 ? 1 : randomInt(2, 3);
      Object.assign(p.condition, { injuryStatus: weeks === 1 ? 'DINGED' : 'MODERATE', injuryWeeksRemaining: weeks, injuredInWeek: week });
      report.injured.push(`${p.position} ${p.firstName.charAt(0)}. ${p.lastName} (${weeks} week${weeks === 1 ? '' : 's'})`);
    }
  });
  return report;
}

/** Computer programs: push hard in weeks without a game, ease off in game weeks. */
export const aiIntensity = (gameWeek: boolean): PracticeIntensity => (gameWeek ? 'LIMITED' : 'FULL');

/** What one option would do this week, for the coach to compare before advancing. */
export interface PracticePreview {
  intensity: PracticeIntensity;
  skillPoints: number; // expected training points across the roster
  starterFatigue: number; // change for a healthy starter (%)
  injuryRisk: number; // chance at least one player is hurt in practice (0-1)
}

export function previewPractice(team: Team, intensity: PracticeIntensity, phase: SeasonPhase, hasGame: boolean, boosts: TrainingBoosts = NO_BOOSTS): PracticePreview {
  const multiplier = PHASE_TRAINING[phase];
  const healthy = team.roster.filter(canTrain);
  const skillPoints = multiplier > 0 ? healthy.reduce((sum, p) => sum + skillPointsFor(p, weeklyGain(p, intensity, multiplier, boosts)), 0) : 0;
  const starterFatigue = (hasGame ? GAME_FATIGUE.starter : 0) + (multiplier > 0 ? PRACTICE_LOAD[intensity] * multiplier : 0) - RECOVERY[multiplier > 0 ? intensity : 'WEEK_OFF'] - boosts.recovery;
  const noInjury = multiplier > 0 ? healthy.reduce((odds, p) => odds * (1 - practiceInjuryChance(p, intensity, multiplier, boosts)), 1) : 1;
  return { intensity, skillPoints, starterFatigue, injuryRisk: 1 - noInjury };
}

const units = (weeks: number, phase: SeasonPhase) => weeks * PHASE_TRAINING[phase];
/** A year of computer-style training (full in weeks without a game, limited in game weeks), in overall points before learning. */
const DEFAULT_SEASON_PROGRESS =
  (units(4, 'SPRING_EVALUATION') + units(3, 'SUMMER_CAMP') + units(4, 'OFF_SEASON')) * GAIN.FULL +
  (units(3, 'NON_DISTRICT') + units(7, 'DISTRICT_PLAY') + units(2, 'STATE_PLAYOFFS')) * GAIN.LIMITED;

/**
 * The growth a typical year of practice gives a player (overall points, about +1.4 for a B potential). Practice
 * is now part of how players develop, so off-season growth leaves this much out: a program that trains like
 * the computer's grows as players always have, one that pushes harder gets ahead, and one that rests falls behind.
 */
export const defaultSeasonGrowth = (potential: PotentialGrade) => DEFAULT_SEASON_PROGRESS * POTENTIAL_LEARNING[potential];

/** A season of computer-style training at once, for rosters aged before the game starts (keeps them in line with the live league). */
export function applySeasonOfTraining(p: Player): void {
  trainPlayer(p, defaultSeasonGrowth(p.potential));
}
