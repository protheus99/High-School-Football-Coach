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
  down: number;
  distance: number;
}

/**
 * Which alert (if any) a resolved play deserves, comparing the game before the snap with `after`.
 * Credit is decided from the state change rather than the event's possession field, which already
 * points at the new offense after a turnover. Likewise the event's down and distance are the values
 * after the play, so first downs are measured against the pre-snap distance.
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
    // The defense takes it away, except a muffed punt, which the punting (snapping) team recovers. Decided from
    // the pre-snap offense, since a half can end on the play and the kickoff then changes possession.
    const defense = offense.id === after.homeTeam.id ? after.awayTeam : after.homeTeam;
    const takeaway = event.turnoverType === 'MUFFED_PUNT' ? offense : defense;
    if (event.turnoverType === 'INTERCEPTION') return make('INTERCEPTION', takeaway);
    if (event.turnoverType === 'FUMBLE' || event.turnoverType === 'MUFFED_PUNT') return make('FUMBLE', takeaway);
    if (event.turnoverType === 'DOWNS') return make('TURNOVER_ON_DOWNS', takeaway);
    return null;
  }
  const kick = event.playConcept === 'PUNT' || event.playConcept === 'FIELD_GOAL';
  // Scores and turnovers were handled above, so gaining the line to gain is a first down for the team that
  // snapped it, even on the last play of the half when the kickoff then hands the ball over
  const movedChains = event.yardsGained >= before.distance || /FIRST DOWN/i.test(event.textCommentary);
  if (!kick && movedChains) return make('FIRST_DOWN', offense);
  return null;
}
