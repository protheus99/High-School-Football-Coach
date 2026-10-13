import { Career, careerNationalTitles, careerPoints, careerTitles } from '../sim/careerScore';
import { accountState } from './account';

// ---------------------------------------------------------------------------
// The Hall of Fame: one board per career length (3, 5 and 10 years), every program on it. Every career on this
// device is kept locally; on the live game (or with VITE_LEADERBOARD_URL set), a signed-in player's completed seasons
// are also submitted to the server and its boards are shown alongside, so coaches on different devices compete together.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'hsfhc_careers_v1';

export interface LeaderboardEntry {
  careerId: string;
  coachName: string;
  scenario: Career['scenario'];
  state: string;
  startingSchool: string;
  startingProgram: string;
  length: Career['length']; // seasons in the career (careers compete with others of the same length)
  seasons: number;
  wins: number;
  losses: number;
  playoffWins: number;
  titles: number;
  nationalTitles?: number;
  startingPrestige?: number; // the program's prestige when the contract began (sets the score's bonus)
  collegeSignees: number;
  points: number;
  updatedAt: number;
  isLocal?: boolean; // played on this device
}

export function toEntry(career: Career): LeaderboardEntry {
  const sum = (key: 'wins' | 'losses' | 'playoffWins' | 'collegeSignees') => career.seasons.reduce((n, s) => n + s[key], 0);
  return {
    careerId: career.id,
    coachName: career.coachName,
    scenario: career.scenario,
    state: career.state,
    startingSchool: career.startingSchool,
    startingProgram: career.startingProgram,
    length: career.length,
    seasons: career.seasons.length,
    wins: sum('wins') + sum('playoffWins'),
    losses: sum('losses'),
    playoffWins: sum('playoffWins'),
    titles: careerTitles(career),
    nationalTitles: careerNationalTitles(career),
    ...(career.startingPrestige !== undefined && { startingPrestige: career.startingPrestige }),
    collegeSignees: sum('collegeSignees'),
    points: careerPoints(career),
    updatedAt: Date.now(),
    isLocal: true
  };
}

/** Every career played on this device (empty when storage is unavailable). */
export function loadLocalCareers(): Career[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Career[]) : [];
  } catch {
    return [];
  }
}

/** Records a career's latest state on this device and, if a server is configured, submits it. */
export function recordCareer(career: Career): void {
  try {
    const careers = loadLocalCareers().filter((c) => c.id !== career.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...careers, career]));
  } catch {
    // Storage unavailable (private window): the career still lives in the save
  }
  void submitRemote(career);
}

/** Ranks entries: points, then titles, then fewer seasons (the faster climb wins ties). */
export const rankEntries = (entries: LeaderboardEntry[]) =>
  [...entries].sort((a, b) => b.points - a.points || b.titles - a.titles || a.seasons - b.seasons);

/** This device's Hall of Fame board for a career length (or every length). */
export function localLeaderboard(length?: Career['length']): LeaderboardEntry[] {
  return rankEntries(
    loadLocalCareers()
      .filter((c) => c.seasons.length > 0 && (!length || c.length === length))
      .map(toEntry)
  );
}

// The live game ranks careers on the Hall of Fame server (leaderboard-worker/); the dev server keeps them on the
// device unless VITE_LEADERBOARD_URL points somewhere
// (the live game reads it through its own domain, /api/hof, the same place it posts)
const REMOTE_URL: string | undefined = import.meta.env.VITE_LEADERBOARD_URL ?? (import.meta.env.PROD ? '/api/hof' : undefined);
export const hasRemoteLeaderboard = () => !!REMOTE_URL;

// Posting needs a signed-in player: it goes through the game's own domain (/api/hof), where the sign-in cookie is sent.
// Signed out, careers stay on this device.
async function submitRemote(career: Career): Promise<void> {
  if (!REMOTE_URL || !career.token || career.seasons.length === 0 || !accountState().user) return;
  try {
    const entry = { ...toEntry(career), isLocal: undefined, updatedAt: undefined, token: career.token };
    await fetch('/api/hof/careers', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  } catch {
    // Offline: the next season's submission carries the whole career
  }
}

/** The shared Hall of Fame board for a career length from the server. Null without a server or when offline. */
export async function fetchRemoteLeaderboard(length?: Career['length']): Promise<LeaderboardEntry[] | null> {
  if (!REMOTE_URL) return null;
  const query = length ? `?length=${length}` : '';
  try {
    const res = await fetch(`${REMOTE_URL}/leaderboard${query}`);
    if (!res.ok) return null;
    return rankEntries((await res.json()) as LeaderboardEntry[]);
  } catch {
    return null;
  }
}
