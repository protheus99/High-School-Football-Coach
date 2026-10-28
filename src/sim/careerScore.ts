import type { ScenarioId } from '../data/scenarios';
import type { Team } from '../types/game';
import type { PlayoffBracketState } from './playoffEngine';

// ---------------------------------------------------------------------------
// Career points: every completed season is scored, and the total, scaled up for programs that started with
// less prestige, ranks the career in the Hall of Fame against every career of the same length. A career is
// one contract: a new game, an extension or a new job each start their own Hall of Fame entry.
// ---------------------------------------------------------------------------

export const CAREER_POINTS = { win: 5, loss: 1, playoffWin: 8, stateTitle: 10, nationalTitle: 15, collegeSignee: 1 };

/** How many seasons a career runs (chosen at New Game; careers of the same length compete with each other). */
export type CareerLength = 3 | 5 | 10;
export const CAREER_LENGTHS: CareerLength[] = [3, 5, 10];
/** Contracts offered after a career ends (ten years is only for new games). */
export const CONTRACT_LENGTHS: CareerLength[] = [3, 5];

/** The starting-prestige bonus: x1.00 at 99 prestige, x1.12 at 87, x1.41 at 58. */
export const prestigeMultiplier = (startingPrestige = 99) => 1 + (99 - Math.max(1, Math.min(99, Math.round(startingPrestige)))) / 100;

export interface CareerSeason {
  year: number;
  school: string; // where the coach was that season
  wins: number; // regular season (playoff wins are counted on their own)
  losses: number; // including a playoff loss
  playoffWins: number; // games won on the field (byes don't count)
  stateTitle: boolean;
  nationalTitle?: boolean; // #1 in the final national poll
  collegeSignees: number;
  points: number;
  vacated?: { wins: number; playoffWins: number; stateTitle: boolean; nationalTitle: boolean }; // taken away by the final review (booster violations)
}

/** A career: who, which scenario, the program it started with, and every season so far. */
export interface Career {
  id: string;
  coachName: string;
  scenario: ScenarioId;
  state: string;
  startingSchool: string; // the world name
  startingProgram: string; // the name the program is known by
  startedYear: number;
  length: CareerLength; // seasons in the career (the contract)
  startingPrestige?: number; // the program's prestige when the contract began (older careers: none, x1.00)
  coachId?: string; // the coach across contracts in one save (Team › Career lists them together)
  token?: string; // the career's secret for the global leaderboard (only this device can update it)
  seasons: CareerSeason[];
  // Shady dilemma calls that came to light (their "future reckoning"). The coach's 1st is his Billy Martin chance
  // (invalidates: false); from the 2nd on, the career is an invalid playthrough, listed apart on the Hall of Fame.
  // Older saves' reckonings have no flag: each one invalidates, as it did then.
  reckonings?: { year: number; week: number; title: string; invalidates?: boolean }[];
}

/** The reckonings that make a career an invalid playthrough. */
export const invalidReckonings = (career: Pick<Career, 'reckonings'>) => (career.reckonings ?? []).filter((r) => r.invalidates !== false);

/** One season's points: wins 5, losses 1, playoff wins 8, a state title 10, a national title 15, each college signee 1. */
export function seasonPoints(s: Omit<CareerSeason, 'year' | 'school' | 'points'>): number {
  return (
    s.wins * CAREER_POINTS.win +
    s.losses * CAREER_POINTS.loss +
    s.playoffWins * CAREER_POINTS.playoffWin +
    (s.stateTitle ? CAREER_POINTS.stateTitle : 0) +
    (s.nationalTitle ? CAREER_POINTS.nationalTitle : 0) +
    s.collegeSignees * CAREER_POINTS.collegeSignee
  );
}

/** The seasons' points before the starting-prestige bonus. */
export const careerBasePoints = (career: Career) => career.seasons.reduce((sum, s) => sum + s.points, 0);
/** The Hall of Fame score: the seasons' points times the starting-prestige bonus. */
export const careerPoints = (career: Career) => Math.round(careerBasePoints(career) * prestigeMultiplier(career.startingPrestige));
export const careerTitles = (career: Career) => career.seasons.filter((s) => s.stateTitle).length;
export const careerNationalTitles = (career: Career) => career.seasons.filter((s) => s.nationalTitle).length;
export const isCareerComplete = (career: Career) => career.seasons.length >= career.length;

/**
 * The coach's season once the state championship games are decided: the regular-season record, the playoff
 * games played (team records only hold the regular season), the title, and the seniors who signed with colleges.
 */
export function scoreSeason(team: Team, bracket: PlayoffBracketState | null, year: number, nationalTitle = false): CareerSeason {
  const games = (bracket?.divisions ?? []).flatMap((d) => d.rounds.flat()).filter((n) => !n.isBye && n.winnerTeamId && (n.team1.id === team.id || n.team2.id === team.id));
  const playoffWins = games.filter((n) => n.winnerTeamId === team.id).length;
  const season = {
    wins: team.record.wins,
    losses: team.record.losses + (games.length - playoffWins),
    playoffWins,
    stateTitle: !!bracket?.divisions.some((d) => d.championTeamId === team.id),
    ...(nationalTitle && { nationalTitle }),
    collegeSignees: team.roster.filter((p) => p.classYear === 'Senior' && p.recruiting.isNationalLetterOfIntentSigned).length
  };
  return { year, school: team.name, ...season, points: seasonPoints(season) };
}

/** A season's wins and titles taken away (improper booster offers found at the contract's final review). */
export function vacateSeason(season: CareerSeason): CareerSeason {
  if (season.vacated) return season;
  const kept = { wins: 0, losses: season.losses, playoffWins: 0, stateTitle: false, collegeSignees: season.collegeSignees };
  return {
    ...season,
    ...kept,
    nationalTitle: undefined,
    points: seasonPoints(kept),
    vacated: { wins: season.wins, playoffWins: season.playoffWins, stateTitle: season.stateTitle, nationalTitle: !!season.nationalTitle }
  };
}
