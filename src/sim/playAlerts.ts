import { GameSimulationState, PlayEvent, Team } from '../types/game';

export type PlayAlertKind =
  | 'FIRST_DOWN'
  | 'TOUCHDOWN'
  | 'INTERCEPTION'
  | 'FUMBLE'
  | 'FIELD_GOAL'
  | 'FG_MISSED'
  | 'FG_BLOCKED'
  | 'SAFETY'
  | 'TURNOVER_ON_DOWNS'
  | 'PUNT';

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
export function alertsForPlay(event: PlayEvent, before: PreSnap, after: GameSimulationState): PlayAlertData[] {
  const teamOf = (id: string) => (id === after.homeTeam.id ? after.homeTeam : after.awayTeam);
  const offense = teamOf(before.possessionTeamId);
  const defense = offense.id === after.homeTeam.id ? after.awayTeam : after.homeTeam;
  const make = (kind: PlayAlertKind, team: Team): PlayAlertData => ({ id: `${event.playId}_${kind}`, kind, team });
  const alerts: PlayAlertData[] = [];

  // Kickoffs happen on the same play as a field goal, a try, or the snap that ends the half; a fumbled return is
  // an extra moment for the team the commentary says recovered ("Westlake recovers!")
  const kickoffRecoverer = (): Team | undefined => {
    if (!/FUMBLES the kickoff return/i.test(event.textCommentary)) return undefined;
    // Longest name first, so "Spring Westfield recovers!" isn't read as "Westfield recovers!"
    return [after.homeTeam, after.awayTeam]
      .sort((a, b) => b.name.length - a.name.length)
      .find((t) => event.textCommentary.includes(`${t.name} recovers!`));
  };
  const withKickoffFumble = (list: PlayAlertData[]): PlayAlertData[] => {
    const recoverer = kickoffRecoverer();
    return recoverer && !list.some((a) => a.kind === 'FUMBLE' && a.team.id === recoverer.id) ? [...list, make('FUMBLE', recoverer)] : list;
  };

  if (event.isScore || event.isTry) {
    const homeScored = after.homeScore > before.homeScore;
    const awayScored = after.awayScore > before.awayScore;
    const scorer = homeScored ? after.homeTeam : awayScored ? after.awayTeam : undefined;
    if (scorer && event.scoreType === 'TOUCHDOWN') alerts.push(make('TOUCHDOWN', scorer));
    if (scorer && event.scoreType === 'FIELD_GOAL') alerts.push(make('FIELD_GOAL', scorer));
    if (scorer && event.scoreType === 'SAFETY') alerts.push(make('SAFETY', scorer));
    // PATs and two-point tries get no banner of their own
    return withKickoffFumble(alerts);
  }
  if (event.isTurnover) {
    // The defense takes it away, except a muffed punt, which the punting (snapping) team recovers. Decided from
    // the pre-snap offense, since a half can end on the play and the kickoff then changes possession.
    if (event.turnoverType === 'INTERCEPTION') alerts.push(make('INTERCEPTION', defense));
    else if (event.turnoverType === 'FUMBLE' && !kickoffRecoverer()) alerts.push(make('FUMBLE', defense));
    else if (event.turnoverType === 'MUFFED_PUNT') alerts.push(make('FUMBLE', offense));
    else if (event.turnoverType === 'DOWNS') {
      // A missed or blocked field goal is recorded as a turnover on downs; say what actually happened
      if (event.playConcept === 'FIELD_GOAL') alerts.push(make(/BLOCKED/i.test(event.textCommentary) ? 'FG_BLOCKED' : 'FG_MISSED', defense));
      else alerts.push(make('TURNOVER_ON_DOWNS', defense));
    }
    return withKickoffFumble(alerts);
  }
  // A clean punt hands the ball to the receiving team (muffs and return touchdowns were handled above)
  if (event.playConcept === 'PUNT') return withKickoffFumble([make('PUNT', defense)]);
  const kick = event.playConcept === 'FIELD_GOAL';
  // Scores and turnovers were handled above, so gaining the line to gain is a first down for the team that
  // snapped it, even on the last play of the half when the kickoff then hands the ball over
  const movedChains = event.yardsGained >= before.distance || /FIRST DOWN/i.test(event.textCommentary);
  if (!kick && movedChains) alerts.push(make('FIRST_DOWN', offense));
  return withKickoffFumble(alerts);
}

/** The main alert for a play (the first of `alertsForPlay`), or null. */
export function alertForPlay(event: PlayEvent, before: PreSnap, after: GameSimulationState): PlayAlertData | null {
  return alertsForPlay(event, before, after)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Presentation rules: good or bad from the user's point of view, and the headline
// ---------------------------------------------------------------------------

export type AlertTone = 'good' | 'bad' | 'neutral';

/**
 * Green for good news for the user's team, red for bad. Every alert is credited to the team the moment
 * belongs to (scorer, team that took the ball, offense that moved the chains), so it's good when that's the
 * user's team. Punts are routine and stay neutral.
 */
export function alertTone(alert: PlayAlertData, userTeamId: string | undefined): AlertTone {
  if (alert.kind === 'PUNT' || !userTeamId) return 'neutral';
  return alert.team.id === userTeamId ? 'good' : 'bad';
}

const LABELS: Record<PlayAlertKind, string> = {
  FIRST_DOWN: 'FIRST DOWN!',
  TOUCHDOWN: 'TOUCHDOWN!',
  INTERCEPTION: 'INTERCEPTION!',
  FUMBLE: 'FUMBLE!',
  FIELD_GOAL: "IT'S GOOD!",
  FG_MISSED: 'NO GOOD!',
  FG_BLOCKED: 'BLOCKED!',
  SAFETY: 'SAFETY!',
  TURNOVER_ON_DOWNS: 'TURNOVER!',
  PUNT: 'PUNT'
};

/** The banner headline. A fumble says whether the user's team got it back or lost it. */
export function alertLabel(alert: PlayAlertData, tone: AlertTone): string {
  if (alert.kind === 'FUMBLE' && tone !== 'neutral') return tone === 'good' ? 'FUMBLE RECOVERED!' : 'FUMBLE LOST!';
  return LABELS[alert.kind];
}
