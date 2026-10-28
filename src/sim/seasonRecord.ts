import { Team } from '../types/game';
import type { PlayoffBracketState } from './playoffEngine';

// ---------------------------------------------------------------------------
// A team's record for the whole season: the regular season (team.record) plus the playoff games played on the
// field (byes don't count). Every record the game shows uses it; the league standings and the league record keep
// the regular season alone.
// ---------------------------------------------------------------------------

export interface WinLoss {
  wins: number;
  losses: number;
}

/** A team's playoff games in a bracket: wins, losses, and whether it won its division's title. */
export function playoffRecord(teamId: string, bracket?: PlayoffBracketState | null): WinLoss & { champion: boolean } {
  const games = (bracket?.divisions ?? [])
    .flatMap((d) => d.rounds.flat())
    .filter((n) => !n.isBye && n.winnerTeamId && (n.team1.id === teamId || n.team2.id === teamId));
  const wins = games.filter((n) => n.winnerTeamId === teamId).length;
  return { wins, losses: games.length - wins, champion: !!bracket?.divisions.some((d) => d.championTeamId === teamId) };
}

/** Every team's playoff games in these brackets (the coach's state and the others), by team id. */
export function playoffRecords(brackets: (PlayoffBracketState | null | undefined)[]): Map<string, WinLoss> {
  const records = new Map<string, WinLoss>();
  const add = (id: string, won: boolean) => {
    const r = records.get(id) ?? { wins: 0, losses: 0 };
    if (won) r.wins++;
    else r.losses++;
    records.set(id, r);
  };
  for (const bracket of brackets) {
    for (const n of (bracket?.divisions ?? []).flatMap((d) => d.rounds.flat())) {
      if (n.isBye || !n.winnerTeamId) continue;
      add(n.team1.id, n.winnerTeamId === n.team1.id);
      add(n.team2.id, n.winnerTeamId === n.team2.id);
    }
  }
  return records;
}

/** The brackets a game's teams can play in: the coach's state and every other state. */
export const allBrackets = (game: { playoffBracket: PlayoffBracketState | null; nationalLeagues: { bracket: PlayoffBracketState | null }[] }) => [
  game.playoffBracket,
  ...game.nationalLeagues.map((l) => l.bracket)
];

/** The season so far, playoffs included. `playoffs` is a bracket or the records from playoffRecords. */
export function fullRecord(team: Team, playoffs?: PlayoffBracketState | Map<string, WinLoss> | null): WinLoss {
  const p = playoffs instanceof Map ? playoffs.get(team.id) : playoffRecord(team.id, playoffs);
  return { wins: team.record.wins + (p?.wins ?? 0), losses: team.record.losses + (p?.losses ?? 0) };
}

/** "14-0": the season so far, playoffs included. */
export function recordText(team: Team, playoffs?: PlayoffBracketState | Map<string, WinLoss> | null): string {
  const r = fullRecord(team, playoffs);
  return `${r.wins}-${r.losses}`;
}
