import { SCENARIOS, scenarioById, ScenarioId } from '../../src/data/scenarios';
import { dataPrestige } from '../../src/data/stateWorlds';

// ---------------------------------------------------------------------------
// What the server accepts. Scores are computed on the player's device, so every submission is checked: the
// school must be in the state's data, the totals must be possible for the seasons played, and the points
// must match the formula (the seasons' points times the starting-prestige bonus). That stops typos and casual edits; a determined cheater who submits a believable
// career can't be stopped without simulating the games on the server.
// ---------------------------------------------------------------------------

export const POINTS = { win: 5, loss: 1, playoffWin: 8, stateTitle: 10, nationalTitle: 15, collegeSignee: 1 };
const SCENARIO_IDS = ['RECLAIM', 'POWERHOUSE', 'OPEN'];
const MIN_PRESTIGE = 40; // the game never lets a program fall below 40

/** The starting-prestige bonus: x1.00 at 99 prestige, x1.12 at 87, x1.59 at 40 (the game's careerScore). */
export const prestigeMultiplier = (startingPrestige: number) => 1 + (99 - startingPrestige) / 100;
export const LENGTHS = [3, 5, 10];
const MAX_REGULAR_GAMES = 10; // weeks 8-17, the out-of-state game included
const MAX_PLAYOFF_GAMES = 6; // Ohio's six rounds are the most
const MAX_SIGNEES = 25; // seniors signing with colleges in one season (a whole senior class, above what the game produces)

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
  nationalTitles: number; // #1 in the final national poll (older games don't send it: 0)
  startingPrestige: number; // the program's prestige when the contract began (older games don't send it: 99, no bonus)
  collegeSignees: number;
  points: number;
}

const PROGRAMS = new Map<string, string>(SCENARIOS.flatMap((s) => s.programs.map((p) => [`${s.id}|${p.state}|${p.school}`, p.displayName] as const)));

const isCount = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;

/**
 * The starting prestige a coach's first contract at this program has: the scenario's rule applied to the school's
 * prestige in the state's data (Reclaim caps it at 72, Powerhouse lifts it to 96, Your Pick keeps it). Extensions
 * and new jobs start at the program's prestige at the time, which only a coach with a finished career can have.
 */
export function firstContractPrestige(scenario: string, state: string, school: string): number | undefined {
  const data = dataPrestige(state, school);
  return data === undefined ? undefined : scenarioById(scenario as ScenarioId).startingPrestige(data);
}

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
  if (!SCENARIO_IDS.includes(b.scenario)) return { ok: false, error: 'Bad scenario' };
  // A scenario program goes by its scenario name; any other school in the state ("Your Pick", or a new job) by its own
  const program = PROGRAMS.get(`${b.scenario}|${b.state}|${b.startingSchool}`) ?? (dataPrestige(b.state, b.startingSchool) !== undefined ? b.startingSchool : undefined);
  if (!program) return { ok: false, error: 'Not a school in the state' };
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
  const nationalTitles = b.nationalTitles ?? 0;
  if (!isCount(nationalTitles, seasons)) return { ok: false, error: 'Bad nationalTitles' };
  const startingPrestige = b.startingPrestige ?? 99;
  if (!isCount(startingPrestige, 99) || startingPrestige < MIN_PRESTIGE) return { ok: false, error: 'Bad startingPrestige' };
  if (!isCount(b.collegeSignees, seasons * MAX_SIGNEES)) return { ok: false, error: 'Bad collegeSignees' };
  const base =
    (b.wins - b.playoffWins) * POINTS.win +
    b.losses * POINTS.loss +
    b.playoffWins * POINTS.playoffWin +
    b.titles * POINTS.stateTitle +
    nationalTitles * POINTS.nationalTitle +
    b.collegeSignees * POINTS.collegeSignee;
  const expected = Math.round(base * prestigeMultiplier(startingPrestige));
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
      nationalTitles,
      startingPrestige,
      collegeSignees: b.collegeSignees,
      points: expected
    }
  };
}
