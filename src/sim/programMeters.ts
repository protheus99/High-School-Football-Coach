import { Player, Team } from '../types/game';

// ---------------------------------------------------------------------------
// What the program meters do (Compliance sanctions and Booster Approval live in their own engines).
//
// Morale      - (stored as lockerRoomDiscipline) low-morale teams turn the ball over more (live and simulated
//               games), and below 50 starters get suspended. Full-contact practices build it; walkthroughs let it slip.
// Board Trust - the board decides how much of your time goes to football: it raises or cuts the weekly
//               Coach Points income. Wins build it, losses cost it. Under 35 at season's end puts you on
//               the hot seat; two such seasons in a row and you are fired.
// ---------------------------------------------------------------------------

/**
 * The program's Rating: the average of the four background meters (Board Trust, Booster Approval,
 * Morale, Compliance). The meters keep their own effects; the coach sees only this number.
 */
export function programRating(team: Team): number {
  const m = team.programMeters;
  return Math.round((m.schoolBoardTrust + m.boosterApproval + m.lockerRoomDiscipline + m.complianceScore) / 4);
}

/** Problems worth telling the coach about, in plain words (the meters themselves stay hidden). */
export function ratingAlerts(team: Team, onHotSeat: boolean): string[] {
  const m = team.programMeters;
  const alerts: string[] = [];
  if (onHotSeat) alerts.push('You are on the hot seat: another bad season and the board will make a change.');
  else if (m.schoolBoardTrust < HOT_SEAT_TRUST) alerts.push('The school board is losing patience. Win games to win it back.');
  if (m.lockerRoomDiscipline < SUSPENSION_DISCIPLINE) alerts.push('Locker-room morale is low: expect sloppy play and suspensions.');
  if (m.complianceScore < 40) alerts.push('The state association is watching the program closely.');
  if (m.boosterApproval < 50) alerts.push('Boosters are unhappy, which hurts feeder recruiting.');
  return alerts;
}

/** Discipline where a team plays clean, average football (the typical AI program). */
export const NEUTRAL_DISCIPLINE = 78;

/** Extra turnover chance per simulated drive, in percentage points (negative for disciplined teams). */
export function disciplineTurnoverPoints(team: Team): number {
  return Math.max(-2, Math.min(4, (NEUTRAL_DISCIPLINE - team.programMeters.lockerRoomDiscipline) * 0.1));
}

/** Live engine: how much closer each snap is to a fumble or interception (play-quality points). */
export function disciplinePlayQualityPenalty(team: Team): number {
  return Math.max(-1.5, Math.min(3, (NEUTRAL_DISCIPLINE - team.programMeters.lockerRoomDiscipline) * 0.06));
}

export const SUSPENSION_DISCIPLINE = 50;

/** Weekly chance (0-0.5) that a starter is suspended for a game. */
export const suspensionChance = (discipline: number) => (discipline >= SUSPENSION_DISCIPLINE ? 0 : Math.min(0.5, (SUSPENSION_DISCIPLINE - discipline) / 60));

/** A healthy, eligible starter picked for a one-game suspension, or undefined. */
export function pickSuspension(team: Team): Player | undefined {
  if (Math.random() >= suspensionChance(team.programMeters.lockerRoomDiscipline)) return undefined;
  const candidates = team.roster.filter((p) => p.depthChartTier === 1 && p.academics.isEligible && p.condition.injuryStatus === 'HEALTHY');
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Weekly discipline drift from practice intensity. */
export const PRACTICE_DISCIPLINE: Record<'WALKTHROUGH' | 'STANDARD' | 'CONTACT', number> = { WALKTHROUGH: -1, STANDARD: 0, CONTACT: 1 };

/** Weekly Coach Points the board adds (or cuts) on top of the allowance. */
export function boardCpModifier(boardTrust: number): number {
  if (boardTrust >= 80) return 10;
  if (boardTrust >= 60) return 0;
  if (boardTrust >= 40) return -5;
  return -10;
}

/** Board Trust change for a result. */
export const BOARD_RESULT_DELTA = { win: 2, loss: -2, playoffWin: 3 };

export const HOT_SEAT_TRUST = 35;

export type BoardReview = 'SECURE' | 'HOT_SEAT' | 'FIRED';

/** Season-end review: under 35 is a warning; a second straight season under 35 ends the job. */
export function boardReview(boardTrust: number, alreadyOnHotSeat: boolean): BoardReview {
  if (boardTrust >= HOT_SEAT_TRUST) return 'SECURE';
  return alreadyOnHotSeat ? 'FIRED' : 'HOT_SEAT';
}

/**
 * A program's prestige drifts back toward its history: each season it moves this share of the way to the school's
 * historical level (fractions round by chance). Good and bad seasons still move it for years at a time, but without
 * the pull every program wandered further each decade, piling powers up at 99 and strugglers under 60.
 */
export const PRESTIGE_REVERSION = 0.1;
export function prestigeReversion(prestige: number, historical: number): number {
  const pull = (historical - prestige) * PRESTIGE_REVERSION;
  const whole = Math.trunc(pull);
  return whole + (Math.random() < Math.abs(pull - whole) ? Math.sign(pull) : 0);
}
