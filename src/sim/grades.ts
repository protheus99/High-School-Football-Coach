import { GradeFix, Player, Team } from '../types/game';
import { StateRules } from './stateRules';
import { isAcademicallyAtRisk } from './playerEngine';
import { FIRST_NON_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK, LAST_TRAINING_CAMP_WEEK } from './scheduleEngine';
import { findUserNode, PlayoffBracketState } from './playoffEngine';

// ---------------------------------------------------------------------------
// Grades: report cards come out every third week of the season (sim/playerEngine evaluateAcademicReport). Before
// one, the coach can book one fix for each player who is ineligible or close to the line; its GPA bonus counts at
// that report card. A fix can be cancelled for a refund until then. The teacher's help is once a season per player.
// ---------------------------------------------------------------------------

export const GRADE_FIXES: Record<GradeFix, { label: string; cost: number; gain: number }> = {
  STUDY_HALL: { label: 'Study hall', cost: 20, gain: 0.15 },
  TUTOR: { label: 'Tutor', cost: 60, gain: 0.25 },
  TEACHER: { label: 'Teacher', cost: 10, gain: 0.1 }
};
export const GRADE_FIX_ORDER: GradeFix[] = ['STUDY_HALL', 'TUTOR', 'TEACHER'];

/** Report cards come out as the coach advances into every third week from the first game week on. */
export const isReportCardWeek = (week: number) => week % 3 === 0 && week >= FIRST_NON_DISTRICT_WEEK;
/** The next week whose report card is still ahead (it comes out when the coach advances into it). */
export function nextReportCardWeek(week: number): number {
  let w = week + 1;
  while (!isReportCardWeek(w)) w++;
  return w;
}

/** The GPAs to show as a trend: the last report cards, then the current GPA if it has moved since. */
export function gpaTrend(p: Player, count = 3): number[] {
  const history = p.academics.gpaHistory ?? [];
  const values = history.length > 0 && history[history.length - 1] === p.academics.gpa ? history : [...history, p.academics.gpa];
  return values.slice(-count);
}

/** Can this fix be booked for the player now (ignoring Coach Points)? */
export function canBookFix(p: Player, fix: GradeFix, year: number): boolean {
  if (p.academics.gradeFix) return p.academics.gradeFix === fix; // the booked one can be cancelled
  return fix !== 'TEACHER' || p.academics.teacherYear !== year;
}

/** The players the Grades screen lists: ineligible first, then at risk; starters first, then by rating. */
export function gradeList(team: Team, rules: StateRules): Player[] {
  return team.roster
    .filter((p) => isAcademicallyAtRisk(p, rules))
    .sort(
      (a, b) =>
        Number(a.academics.isEligible) - Number(b.academics.isEligible) ||
        Number(a.depthChartTier !== 1) - Number(b.depthChartTier !== 1) ||
        b.overallRating - a.overallRating
    );
}

/** Starters who could be ineligible after the next report card (the Hub's card). */
export const startersAtRisk = (team: Team, rules: StateRules) => gradeList(team, rules).filter((p) => p.depthChartTier === 1);

/**
 * Whether grades are being watched this week: from the last camp weeks through the coach's playoff run, while
 * report cards still decide who plays.
 */
export function gradeWatchActive(week: number, bracket: PlayoffBracketState | null, userTeamId: string): boolean {
  if (week < LAST_TRAINING_CAMP_WEEK - 1) return false;
  if (week <= LAST_REGULAR_SEASON_WEEK) return true;
  return !!bracket?.isPlayoffsActive && !!findUserNode(bracket, userTeamId);
}

export const reviewKey = (year: number, week: number) => `${year}-${week}`;
