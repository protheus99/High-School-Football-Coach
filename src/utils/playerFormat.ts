import type { DepthChartTier, Player, PlayerClass } from '../types/game';

/**
 * One way to show a player everywhere. In lists: rating tile, position chip, full name, stars in brackets, then one
 * line of details (class · string · potential). In sentences: "OG D. Cantu". In play-by-play: the last name only.
 * Color is kept for trouble: red when he can't play, amber for a warning.
 */

export const CLASS_SHORT: Record<PlayerClass, string> = { Freshman: 'Fr', Sophomore: 'So', Junior: 'Jr', Senior: 'Sr' };
export const STRING_LABELS: Record<DepthChartTier, string> = { 1: '1st string', 2: '2nd string', 3: '3rd string' };

/** Rating tile colors: green 80+, blue 70s, amber 60s, gray below. */
export const ratingColor = (ovr: number) => (ovr >= 80 ? '#16A34A' : ovr >= 70 ? '#2563EB' : ovr >= 60 ? '#D97706' : '#94A3B8');

type Named = Pick<Player, 'firstName' | 'lastName'>;

/** "Damian Cantu" */
export const fullName = (p: Named) => `${p.firstName} ${p.lastName}`;
/** "D. Cantu" */
export const shortName = (p: Named) => `${p.firstName.charAt(0)}. ${p.lastName}`;
/** In a sentence or a stat line: "OG D. Cantu" */
export const playerMention = (p: Named & Pick<Player, 'position'>) => `${p.position} ${shortName(p)}`;
/** In a headline: "OG Damian Cantu" */
export const playerHeadline = (p: Named & Pick<Player, 'position'>) => `${p.position} ${fullName(p)}`;
/** "D. Cantu" from a prospect's single name ("Andre Lopez"); a one-word name stays as it is. */
export const shortFromName = (name: string) => {
  const [first, ...rest] = name.split(' ');
  return rest.length ? `${first.charAt(0)}. ${rest.join(' ')}` : name;
};
/** Stars after a name, "(3★)", or nothing for an unrated player. */
export const starsLabel = (stars: number) => (stars > 0 ? `(${stars}★)` : '');

export interface PlayerTrouble {
  kind: 'INELIGIBLE' | 'SUSPENDED' | 'SEASON_ENDING' | 'INJURED' | 'GPA_RISK';
  /** out: he can't play (red). warn: he plays, but watch it (amber). */
  tone: 'out' | 'warn';
  icon: string;
  /** The chip: "Injured · 3 wk" */
  label: string;
  /** In a sentence, after the name: "OG D. Cantu (injured, 3 wk)" */
  words: string;
}

const games = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;

/**
 * The one thing wrong with a player, most serious first: ineligible, suspended, out for the season, injured, then
 * (with the state's at-risk line) grades close to the line. A suspension is stored as a short injury, so it is
 * checked before injuries.
 */
export function playerTrouble(p: Player, atRiskGpa?: number): PlayerTrouble | null {
  const gpa = p.academics.gpa.toFixed(2);
  if (!p.academics.isEligible) return { kind: 'INELIGIBLE', tone: 'out', icon: '📚', label: `Ineligible · GPA ${gpa}`, words: 'ineligible, grades' };
  const { injuryStatus, injuryWeeksRemaining: weeks, isSuspended } = p.condition;
  if (isSuspended && injuryStatus !== 'HEALTHY') return { kind: 'SUSPENDED', tone: 'out', icon: '⛔', label: `Suspended · ${games(weeks)}`, words: `suspended, ${games(weeks)}` };
  if (injuryStatus === 'SEASON_ENDING') return { kind: 'SEASON_ENDING', tone: 'out', icon: '🩹', label: 'Out for season', words: 'out for the season' };
  if (injuryStatus !== 'HEALTHY') return { kind: 'INJURED', tone: 'out', icon: '🩹', label: `Injured · ${weeks} wk`, words: `injured, ${weeks} wk` };
  if (atRiskGpa !== undefined && p.academics.gpa < atRiskGpa) return { kind: 'GPA_RISK', tone: 'warn', icon: '📚', label: `GPA ${gpa}`, words: `GPA ${gpa}` };
  return null;
}

/** A newcomer this season: he joined the program this year (signing day or a transfer). */
export const isNewcomer = (p: Player, currentYear?: number) => currentYear !== undefined && p.joinedYear !== undefined && p.joinedYear === currentYear;
