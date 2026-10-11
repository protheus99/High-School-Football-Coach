import { PlayEvent } from '../types/game';

/** The stages of a flag in the live game: the play (live-ball fouls), the FLAG banner, the call, then the new spot. */
export type FlagStage = 'PLAY' | 'FLAG' | 'CALL' | 'SPOT';

/** How long each stage stays up (ms). */
export const FLAG_STAGE_MS: Record<FlagStage, number> = { PLAY: 1000, FLAG: 1300, CALL: 1500, SPOT: 1500 };

const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];

/** What the call means for the next snap: "The play comes back. 10 yards, replay 2nd down." */
export function flagResult(event: PlayEvent): string {
  const p = event.penalty!;
  const replay = `replay ${ORDINALS[event.down] ?? `${event.down}th`} down`;
  if (p.side === 'DEFENSE') return p.firstDown ? `${p.yards} yards. FIRST DOWN.` : `${p.yards} yards, ${replay}.`;
  return `${p.timing === 'LIVE' ? 'The play comes back.' : 'Dead ball.'} ${p.yards} yards, ${replay}.`;
}

/** The stages a flag runs through: a live-ball foul shows its play first. */
export const flagStages = (event: PlayEvent): FlagStage[] => (event.penalty?.timing === 'LIVE' && event.penalty.play ? ['PLAY', 'FLAG', 'CALL', 'SPOT'] : ['FLAG', 'CALL', 'SPOT']);
