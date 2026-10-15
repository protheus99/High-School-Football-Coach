import type { GameSimulationState, PlayEvent } from '../types/game';
import type { PlayAlertData } from '../sim/playAlerts';

/** The live game's sounds (made in soundEngine.ts). */
export type GameSound =
  | 'THUD'
  | 'WHISTLE'
  | 'ALERT'
  | 'TOUCHDOWN'
  | 'FIRST_DOWN'
  | 'KICK'
  | 'FIELD_GOAL_GOOD'
  | 'DOINK'
  | 'TAKEAWAY'
  | 'GIVEAWAY'
  | 'GROAN'
  | 'QUARTER_BUZZER'
  | 'CLOCK_TICKS';

/** The clock just before the snap. */
export interface ClockBefore {
  quarter: GameSimulationState['currentQuarter'];
  seconds: number;
}

const TWO_MINUTES = 120;
const CLOSE_GAME = 8; // one score

/**
 * The sounds a play gets, from the coach's side. Who a moment belongs to comes from the play's banners
 * (sim/playAlerts.ts), so a turnover is a takeaway or a giveaway for the coach's team, and the crowd groans only
 * when it's his team that lost the ball or missed the kick. One main sound per play, plus the quarter buzzer and the
 * two-minute clock when the play crosses them.
 */
export function soundsForPlay(
  event: PlayEvent | undefined,
  alerts: PlayAlertData[],
  userTeamId: string,
  before: ClockBefore,
  after: GameSimulationState,
  decision = false // the game now stops for the coach's call
): GameSound[] {
  const sounds: GameSound[] = [];
  const find = (...kinds: PlayAlertData['kind'][]) => alerts.find((a) => kinds.includes(a.kind));
  const ours = (a: PlayAlertData) => a.team.id === userTeamId;
  const turnover = find('INTERCEPTION', 'FUMBLE', 'TURNOVER_ON_DOWNS');
  const missed = find('FG_MISSED', 'FG_BLOCKED');

  if (find('TOUCHDOWN')) sounds.push('TOUCHDOWN');
  else if (decision) sounds.push('ALERT');
  else if (event?.penalty) sounds.push('WHISTLE');
  else if (find('FIELD_GOAL')) sounds.push('FIELD_GOAL_GOOD');
  else if (missed) {
    // The banner belongs to the defense: the coach's kick missed when it isn't his team's
    sounds.push(missed.kind === 'FG_MISSED' ? 'DOINK' : 'KICK');
    if (!ours(missed)) sounds.push('GROAN');
  } else if (turnover) sounds.push(...(ours(turnover) ? (['TAKEAWAY'] as const) : (['GIVEAWAY', 'GROAN'] as const)));
  else if (find('SAFETY')) sounds.push('WHISTLE');
  else if (find('PUNT') || event?.playConcept === 'PUNT') sounds.push('KICK');
  else if (find('FIRST_DOWN')) sounds.push('THUD', 'FIRST_DOWN');
  else if (event) sounds.push('THUD');

  // The end of the 1st and 3rd quarters (halftime has its own locker room; the end of the game its own tune)
  if ((before.quarter === 1 && after.currentQuarter === 2) || (before.quarter === 3 && after.currentQuarter === 4)) sounds.push('QUARTER_BUZZER');
  // The last two minutes of a close game begin
  const margin = Math.abs(after.homeScore - after.awayScore);
  if (before.quarter === 4 && after.currentQuarter === 4 && before.seconds > TWO_MINUTES && after.clockSecondsRemaining <= TWO_MINUTES && !after.isGameOver && margin <= CLOSE_GAME)
    sounds.push('CLOCK_TICKS');
  return sounds;
}

/** The band at the final whistle: a win, a loss, or nothing more for a tie. */
export function finalWhistleTune(state: GameSimulationState, userTeamId: string): 'VICTORY' | 'DEFEAT' | null {
  const mine = state.homeTeam.id === userTeamId ? state.homeScore : state.awayScore;
  const theirs = state.homeTeam.id === userTeamId ? state.awayScore : state.homeScore;
  return mine > theirs ? 'VICTORY' : mine < theirs ? 'DEFEAT' : null;
}
