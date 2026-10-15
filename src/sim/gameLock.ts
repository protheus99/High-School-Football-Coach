import type { GameSimulationState, PlayerStats, Team } from '../types/game';

// ---------------------------------------------------------------------------
// A game counts once it kicks off (balance review 21, 2026-10-14). The coach's games are written down outside the
// save files: where a live game stands while it's played, and its final once it's over (live or simmed). Loading
// an older save of the same career doesn't offer the game again: a game in progress resumes where it left off, and
// a played game's final, box score and stat lines come back as they were. Everything else can still be redone.
// ---------------------------------------------------------------------------

export interface PlayedGame {
  key: string;
  careerKey: string;
  year: number;
  week: number;
  opponentId: string;
  status: 'LIVE' | 'FINAL';
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  quarter?: GameSimulationState['currentQuarter']; // LIVE: where the game stands
  clockSeconds?: number;
  lines?: Record<string, Partial<PlayerStats>>; // FINAL: each player's line from the game
  updated: number;
}

/** One game of one career: the season, the week and the opponent (a playoff bracket that comes out differently is a new game). */
export const lockKey = (careerKey: string, year: number, week: number, opponentId: string) => `${careerKey}|${year}|${week}|${opponentId}`;

export const newCareerKey = () => `ck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** The game's record at kickoff or as it's played. */
export function liveRecord(careerKey: string, year: number, week: number, userTeamId: string, state: GameSimulationState): PlayedGame {
  const opponentId = state.homeTeam.id === userTeamId ? state.awayTeam.id : state.homeTeam.id;
  return {
    key: lockKey(careerKey, year, week, opponentId),
    careerKey,
    year,
    week,
    opponentId,
    status: 'LIVE',
    homeId: state.homeTeam.id,
    awayId: state.awayTeam.id,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    quarter: state.currentQuarter,
    clockSeconds: state.clockSecondsRemaining,
    updated: Date.now()
  };
}

/** The game's final, with the players' lines. */
export function finalRecord(
  careerKey: string,
  year: number,
  week: number,
  userTeamId: string,
  game: { homeId: string; awayId: string; homeScore: number; awayScore: number; lines: Record<string, Partial<PlayerStats>> }
): PlayedGame {
  const opponentId = game.homeId === userTeamId ? game.awayId : game.homeId;
  return { key: lockKey(careerKey, year, week, opponentId), careerKey, year, week, opponentId, status: 'FINAL', ...game, updated: Date.now() };
}

type StatSnapshot = Map<string, PlayerStats>;

/** Every player's season stats on these teams, copied (before a simmed game). */
export function snapshotStats(teams: Team[]): StatSnapshot {
  return new Map(teams.flatMap((t) => t.roster.map((p) => [p.id, { ...p.stats }] as const)));
}

/** What each player added since the snapshot: his line from the game (games played is counted when it's applied). */
export function statLines(teams: Team[], before: StatSnapshot): Record<string, Partial<PlayerStats>> {
  const lines: Record<string, Partial<PlayerStats>> = {};
  teams.forEach((t) =>
    t.roster.forEach((p) => {
      const was = before.get(p.id);
      if (!was) return;
      const line: Partial<PlayerStats> = {};
      (Object.keys(p.stats) as (keyof PlayerStats)[]).forEach((k) => {
        if (k === 'gamesPlayed') return;
        const d = p.stats[k] - (was[k] ?? 0);
        if (d !== 0) line[k] = d;
      });
      if (Object.keys(line).length > 0) lines[p.id] = line;
    })
  );
  return lines;
}

/**
 * This device's record and the account's, merged: a final beats a game in progress, the first final stands (the
 * account's, if both have one), and between two games in progress the newer wins.
 */
export function mergePlayedGames(local: PlayedGame[], cloud: PlayedGame[]): PlayedGame[] {
  const merged = new Map(local.map((g) => [g.key, g]));
  cloud.forEach((c) => {
    const l = merged.get(c.key);
    if (!l || (c.status === 'FINAL' && (l.status === 'LIVE' || l.updated >= c.updated)) || (c.status === 'LIVE' && l.status === 'LIVE' && c.updated > l.updated)) merged.set(c.key, c);
  });
  return [...merged.values()];
}

/** Played games of a career from a save's point on (a season and week): what loading that save can't replay. */
export function gamesSince(games: Iterable<PlayedGame>, careerKey: string, year: number, week: number): PlayedGame[] {
  return [...games].filter((g) => g.careerKey === careerKey && (g.year > year || (g.year === year && g.week >= week)));
}

/** A clock for the Hub: "3rd Qtr · 8:42", "Overtime", "Final". */
export function liveClockLabel(g: Pick<PlayedGame, 'quarter' | 'clockSeconds'>): string {
  if (g.quarter === 'OT') return 'Overtime';
  const q = Number(g.quarter ?? 1);
  const s = g.clockSeconds ?? 0;
  return `${['1st', '2nd', '3rd', '4th'][q - 1] ?? `${q}th`} Qtr · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
