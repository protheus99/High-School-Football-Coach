import type { ScenarioId } from '../data/scenarios';
import type { Team } from '../types/game';
import type { PlayoffBracketState } from './playoffEngine';

// ---------------------------------------------------------------------------
// Career points: every completed season is scored, and the total ranks the coach on the leaderboard of the
// program the career started with.
// ---------------------------------------------------------------------------

export const CAREER_POINTS = { win: 5, loss: 1, playoffWin: 8, stateTitle: 10, collegeSignee: 1 };

/** How many seasons a career runs (chosen at New Game; careers of the same length compete with each other). */
export type CareerLength = 3 | 5 | 10;
export const CAREER_LENGTHS: CareerLength[] = [3, 5, 10];

export interface CareerSeason {
  year: number;
  school: string; // where the coach was that season
  wins: number; // regular season (playoff wins are counted on their own)
  losses: number; // including a playoff loss
  playoffWins: number; // games won on the field (byes don't count)
  stateTitle: boolean;
  collegeSignees: number;
  points: number;
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
  length: CareerLength; // seasons in the career
  seasons: CareerSeason[];
}

/** One season's points: wins 5, losses 1, playoff wins 8, a state title 10, each player signing with a college 1. */
export function seasonPoints(s: Omit<CareerSeason, 'year' | 'school' | 'points'>): number {
  return (
    s.wins * CAREER_POINTS.win +
    s.losses * CAREER_POINTS.loss +
    s.playoffWins * CAREER_POINTS.playoffWin +
    (s.stateTitle ? CAREER_POINTS.stateTitle : 0) +
    s.collegeSignees * CAREER_POINTS.collegeSignee
  );
}

export const careerPoints = (career: Career) => career.seasons.reduce((sum, s) => sum + s.points, 0);
export const careerTitles = (career: Career) => career.seasons.filter((s) => s.stateTitle).length;
export const isCareerComplete = (career: Career) => career.seasons.length >= career.length;

/**
 * The coach's season once the state championship games are decided: the regular-season record, the playoff
 * games played (team records only hold the regular season), the title, and the seniors who signed with colleges.
 */
export function scoreSeason(team: Team, bracket: PlayoffBracketState | null, year: number): CareerSeason {
  const games = (bracket?.divisions ?? []).flatMap((d) => d.rounds.flat()).filter((n) => !n.isBye && n.winnerTeamId && (n.team1.id === team.id || n.team2.id === team.id));
  const playoffWins = games.filter((n) => n.winnerTeamId === team.id).length;
  const season = {
    wins: team.record.wins,
    losses: team.record.losses + (games.length - playoffWins),
    playoffWins,
    stateTitle: !!bracket?.divisions.some((d) => d.championTeamId === team.id),
    collegeSignees: team.roster.filter((p) => p.classYear === 'Senior' && p.recruiting.isNationalLetterOfIntentSigned).length
  };
  return { year, school: team.name, ...season, points: seasonPoints(season) };
}
