import { getUserMatchup } from './userMatchup';
import { lockKey, PlayedGame } from './gameLock';

/**
 * What stops the week from moving on, for the Advance button in the top bar (every screen) and the Hub alike:
 * a decision waiting (a dilemma), this week's game not played yet (it would be auto-simulated), or a game that
 * kicked off and must be finished first (a game counts once it kicks off). Null when the week can move on.
 */
export type AdvanceBlocker = 'DECISION' | 'GAME' | 'LIVE' | null;

type GateState = Parameters<typeof getUserMatchup>[0] & {
  activeDilemma: unknown;
  careerKey: string | null;
  playedGames: Record<string, PlayedGame>;
  currentYear: number;
};

export function advanceBlocker(s: GateState): AdvanceBlocker {
  if (s.activeDilemma) return 'DECISION';
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
  GAME: { label: '🏈 Game', title: "This week's game hasn't been played: play it or auto-sim it" },
  LIVE: { label: '▶ Resume', title: "This week's game kicked off: finish it first" }
};
