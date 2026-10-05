import { SCENARIOS } from '../../src/data/scenarios';

// ---------------------------------------------------------------------------
// What the server accepts. Scores are computed on the player's device, so every submission is checked: the
// program must be a scenario program, the totals must be possible for the seasons played, and the points
// must match the formula. That stops typos and casual edits; a determined cheater who submits a believable
// career can't be stopped without simulating the games on the server.
// ---------------------------------------------------------------------------

export const POINTS = { win: 5, loss: 1, playoffWin: 8, stateTitle: 10, collegeSignee: 1 };
export const LENGTHS = [3, 5, 10];
const MAX_REGULAR_GAMES = 10; // weeks 8-17, the out-of-state game included
const MAX_PLAYOFF_GAMES = 6; // Ohio's six rounds are the most
const MAX_SIGNEES = 40; // seniors signing with colleges in one season (far above what the game produces)

export interface Submission {
  careerId: string;
  token: string; // the career's secret: only its owner can update it
  coachName: string;
  scenario: string;
  state: string;
  startingSchool: string;
  startingProgram: string;
  length: number;
  seasons: number;
  wins: number; // regular season and playoffs
  losses: number;
  playoffWins: number;
  titles: number;
  collegeSignees: number;
  points: number;
}

const PROGRAMS = new Map<string, string>(SCENARIOS.flatMap((s) => s.programs.map((p) => [`${s.id}|${p.state}|${p.school}`, p.displayName] as const)));

const isCount = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;

/** Letters, digits, spaces and simple punctuation; 1-24 characters. */
export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name.normalize('NFKC').replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return cleaned.length > 0 ? cleaned : null;
}

/** The submission ready to store, or the reason it was rejected. */
export function validate(body: unknown): { ok: true; value: Submission } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Expected a JSON object' };
  const b = body as Record<string, unknown>;
  if (typeof b.careerId !== 'string' || !/^career_[\w-]{4,64}$/.test(b.careerId)) return { ok: false, error: 'Bad careerId' };
  if (typeof b.token !== 'string' || !/^[\w-]{16,128}$/.test(b.token)) return { ok: false, error: 'Bad token' };
  const coachName = cleanName(b.coachName);
  if (!coachName) return { ok: false, error: 'Bad coachName' };
  if (typeof b.scenario !== 'string' || typeof b.state !== 'string' || typeof b.startingSchool !== 'string') return { ok: false, error: 'Bad program' };
  const program = PROGRAMS.get(`${b.scenario}|${b.state}|${b.startingSchool}`);
  if (!program) return { ok: false, error: 'Not a scenario program' };
  if (typeof b.length !== 'number' || !LENGTHS.includes(b.length)) return { ok: false, error: 'Bad length' };
  const length = b.length;
  if (!isCount(b.seasons, length) || b.seasons < 1) return { ok: false, error: 'Bad seasons' };
  const seasons = b.seasons;
  if (!isCount(b.playoffWins, seasons * MAX_PLAYOFF_GAMES)) return { ok: false, error: 'Bad playoffWins' };
  if (!isCount(b.wins, seasons * (MAX_REGULAR_GAMES + MAX_PLAYOFF_GAMES)) || b.wins < b.playoffWins) return { ok: false, error: 'Bad wins' };
  if (!isCount(b.losses, seasons * (MAX_REGULAR_GAMES + 1))) return { ok: false, error: 'Bad losses' };
  // A season is at most ten regular-season games plus the playoff games won and one playoff loss
  if (b.wins - b.playoffWins + b.losses > seasons * (MAX_REGULAR_GAMES + 1)) return { ok: false, error: 'Too many games' };
  if (!isCount(b.titles, seasons) || b.titles > b.playoffWins) return { ok: false, error: 'Bad titles' };
  if (!isCount(b.collegeSignees, seasons * MAX_SIGNEES)) return { ok: false, error: 'Bad collegeSignees' };
  const expected =
    (b.wins - b.playoffWins) * POINTS.win + b.losses * POINTS.loss + b.playoffWins * POINTS.playoffWin + b.titles * POINTS.stateTitle + b.collegeSignees * POINTS.collegeSignee;
  if (b.points !== expected) return { ok: false, error: 'Points do not match the formula' };
  return {
    ok: true,
    value: {
      careerId: b.careerId,
      token: b.token,
      coachName,
      scenario: b.scenario,
      state: b.state,
      startingSchool: b.startingSchool,
      startingProgram: program,
      length,
      seasons,
      wins: b.wins,
      losses: b.losses,
      playoffWins: b.playoffWins,
      titles: b.titles,
      collegeSignees: b.collegeSignees,
      points: expected
    }
  };
}
