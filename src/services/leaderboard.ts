import { Career, careerPoints, careerTitles } from '../sim/careerScore';

// ---------------------------------------------------------------------------
// Leaderboards: one per starting program. Every career on this device is kept locally; when a leaderboard
// server is configured (VITE_LEADERBOARD_URL), each completed season is also submitted there and its boards
// are shown alongside, so coaches on different devices compete on the same program.
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

/** This device's leaderboard for a starting program and career length (or every program and length). */
export function localLeaderboard(startingSchool?: string, state?: string, length?: Career['length']): LeaderboardEntry[] {
  return rankEntries(
    loadLocalCareers()
      .filter((c) => c.seasons.length > 0 && (!startingSchool || (c.startingSchool === startingSchool && c.state === state)) && (!length || c.length === length))
      .map(toEntry)
  );
}

const REMOTE_URL: string | undefined = import.meta.env.VITE_LEADERBOARD_URL;
export const hasRemoteLeaderboard = () => !!REMOTE_URL;

async function submitRemote(career: Career): Promise<void> {
  if (!REMOTE_URL || !career.token || career.seasons.length === 0) return;
  try {
    const entry = { ...toEntry(career), isLocal: undefined, updatedAt: undefined, token: career.token };
    await fetch(`${REMOTE_URL}/careers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  } catch {
    // Offline: the next season's submission carries the whole career
  }
}

/**
 * The shared leaderboard from the server: one starting program at one career length, or (without a program)
 * the top careers across every program. Null without a server or when offline.
 */
export async function fetchRemoteLeaderboard(program?: { startingSchool: string; state: string; length: Career['length'] }): Promise<LeaderboardEntry[] | null> {
  if (!REMOTE_URL) return null;
  const query = program ? `?state=${encodeURIComponent(program.state)}&school=${encodeURIComponent(program.startingSchool)}&length=${program.length}` : '';
  try {
    const res = await fetch(`${REMOTE_URL}/leaderboard${query}`);
    if (!res.ok) return null;
    return rankEntries((await res.json()) as LeaderboardEntry[]);
  } catch {
    return null;
  }
}
