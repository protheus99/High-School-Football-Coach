import { GameSimulationState, PlayEvent, Team } from '../types/game';

export type PlayAlertKind = 'FIRST_DOWN' | 'TOUCHDOWN' | 'INTERCEPTION' | 'FUMBLE' | 'FIELD_GOAL' | 'SAFETY' | 'TURNOVER_ON_DOWNS';

export interface PlayAlertData {
  id: string;
  kind: PlayAlertKind;
  team: Team; // the team the moment belongs to (scorer, team that took the ball, or the offense)
}

/** The bits of the game state from just before the snap that decide who a moment belongs to. */
export interface PreSnap {
  possessionTeamId: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Which alert (if any) a resolved play deserves, comparing the game before the snap with `after`.
 * Credit is decided from the state change rather than the event's possession field, which already
 * points at the new offense after a turnover.
 */
export function alertForPlay(event: PlayEvent, before: PreSnap, after: GameSimulationState): PlayAlertData | null {
  const teamOf = (id: string) => (id === after.homeTeam.id ? after.homeTeam : after.awayTeam);
  const offense = teamOf(before.possessionTeamId);
  const make = (kind: PlayAlertKind, team: Team): PlayAlertData => ({ id: `${event.playId}_${kind}`, kind, team });

  if (event.isScore) {
    const homeScored = after.homeScore > before.homeScore;
    const awayScored = after.awayScore > before.awayScore;
    if (!homeScored && !awayScored) return null;
    const scorer = homeScored ? after.homeTeam : after.awayTeam;
    if (event.scoreType === 'TOUCHDOWN') return make('TOUCHDOWN', scorer);
    if (event.scoreType === 'FIELD_GOAL') return make('FIELD_GOAL', scorer);
    if (event.scoreType === 'SAFETY') return make('SAFETY', scorer);
    return null; // PATs and two-point tries don't need a banner
  }
  if (event.isTurnover) {
    // Whoever holds the ball afterwards took it away (on a muffed punt that's the punting team)
    const takeaway = teamOf(after.possessionTeamId);
    if (event.turnoverType === 'INTERCEPTION') return make('INTERCEPTION', takeaway);
    if (event.turnoverType === 'FUMBLE' || event.turnoverType === 'MUFFED_PUNT') return make('FUMBLE', takeaway);
    if (event.turnoverType === 'DOWNS') return make('TURNOVER_ON_DOWNS', takeaway);
    return null;
  }
  const kick = event.playConcept === 'PUNT' || event.playConcept === 'FIELD_GOAL';
  if (!kick && event.yardsGained >= event.distance && after.possessionTeamId === before.possessionTeamId && after.down === 1) {
    return make('FIRST_DOWN', offense);
  }
  return null;
}
