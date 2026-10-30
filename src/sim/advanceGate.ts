import { getUserMatchup } from './userMatchup';
import { lockKey, PlayedGame } from './gameLock';
import { gradeWatchActive, reviewKey, startersAtRisk, weeksToReportCard } from './grades';
import { rulesForState } from './stateRules';
import { OFF_SEASON_WEEKS, STATE_FINAL_WEEK } from './scheduleEngine';

/** The grades review comes once per report card (every third week): in the week before it, when a fix still counts. */
export const isGradesReviewWeek = (week: number) => weeksToReportCard(week, STATE_FINAL_WEEK + 1 + OFF_SEASON_WEEKS) === 1;

/**
 * What stops the week from moving on, for the Advance button in the top bar (every screen) and the Hub alike:
 * a decision waiting (a dilemma or a warning), starters who could be ineligible that the coach hasn't reviewed on
 * Team › Grades this week, this week's game not played yet (it would be auto-simulated), or a game that kicked off
 * and must be finished first (a game counts once it kicks off). Null when the week can move on.
 */
export type AdvanceBlocker = 'DECISION' | 'GRADES' | 'GAME' | 'LIVE' | null;

type GateState = Parameters<typeof getUserMatchup>[0] & {
  activeDilemma: unknown;
  careerKey: string | null;
  playedGames: Record<string, PlayedGame>;
  currentYear: number;
  gradesReviewed?: string | null; // the week the coach last opened Team › Grades (sim/grades reviewKey)
  league?: { state?: string } | null;
};

/** Starters who could be ineligible, not yet reviewed on Team › Grades, in the week before a report card. */
export function gradesNeedReview(s: GateState): boolean {
  if (!isGradesReviewWeek(s.currentWeek)) return false;
  if (s.gradesReviewed === reviewKey(s.currentYear, s.currentWeek)) return false;
  if (!gradeWatchActive(s.currentWeek, s.playoffBracket, s.userTeamId)) return false;
  const team = s.leagueTeams.find((t) => t.id === s.userTeamId);
  return !!team?.roster && startersAtRisk(team, rulesForState(s.league?.state)).length > 0;
}

export function advanceBlocker(s: GateState): AdvanceBlocker {
  if (s.activeDilemma) return 'DECISION';
  if (gradesNeedReview(s)) return 'GRADES';
  const game = getUserMatchup(s);
  if (!game || game.isPlayed) return null;
  const opponent = game.home.id === s.userTeamId ? game.away : game.home;
  const written = s.careerKey ? s.playedGames[lockKey(s.careerKey, s.currentYear, s.currentWeek, opponent.id)] : undefined;
  return written?.status === 'LIVE' ? 'LIVE' : 'GAME';
}

/** The Advance button's face for each case. */
export const ADVANCE_LABEL: Record<NonNullable<AdvanceBlocker> | 'CLEAR', { label: string; title: string }> = {
  CLEAR: { label: '⏭ Advance', title: 'Advance to next week' },
  DECISION: { label: '⚠️ Review', title: 'A decision is waiting: answer it first' },
  GRADES: { label: '⚠️ Review', title: 'Starters could be ineligible: review their grades first' },
  GAME: { label: '🏈 Game', title: "This week's game hasn't been played: play it or auto-sim it" },
  LIVE: { label: '▶ Resume', title: "This week's game kicked off: finish it first" }
};
