import { GameSimulationState, ScheduledGame, Team } from '../types/game';
import type { PlayoffBracketState } from './playoffEngine';
import { WinLoss, fullRecord } from './seasonRecord';

export interface LineScore {
  periods: string[]; // '1'-'4', then 'OT' when the game went to overtime
  away: number[];
  home: number[];
}

/**
 * Points by quarter from the play log: each play records the score after it and the period it was snapped in. The
 * last period takes whatever the log missed, so the line always adds up to the final score.
 */
export function lineScore(game: GameSimulationState): LineScore {
  const hadOvertime = !!game.overtime || game.eventLog.some((e) => (e.snapQuarter ?? e.quarter) === 'OT');
  const periods: (1 | 2 | 3 | 4 | 'OT')[] = hadOvertime ? [1, 2, 3, 4, 'OT'] : [1, 2, 3, 4];
  const endOf = periods.map(() => ({ away: 0, home: 0 }));
  let running = { away: 0, home: 0 };
  let index = 0;
  game.eventLog.forEach((e) => {
    const at = periods.indexOf(e.snapQuarter ?? e.quarter);
    if (at < 0) return;
    // Periods without a scoring change keep the running score
    for (; index < at; index++) endOf[index] = { ...running };
    if (e.homeScoreAfter !== undefined && e.awayScoreAfter !== undefined) running = { away: e.awayScoreAfter, home: e.homeScoreAfter };
  });
  for (; index < periods.length; index++) endOf[index] = { ...running };
  endOf[periods.length - 1] = { away: game.awayScore, home: game.homeScore };
  const by = (side: 'away' | 'home') => endOf.map((end, i) => end[side] - (i === 0 ? 0 : endOf[i - 1][side]));
  return { periods: periods.map(String), away: by('away'), home: by('home') };
}

/** A short label for a school in a line score: its initials ("Catholic-Baton Rouge" is CBR), or the first four letters. */
export function teamAbbreviation(name: string): string {
  const words = name.split(/[\s-]+/).filter((w) => /[A-Za-z]/.test(w));
  return (words.length >= 2 ? words.map((w) => w.replace(/[^A-Za-z]/g, '')[0]).join('').slice(0, 4) : name.replace(/[^A-Za-z]/g, '').slice(0, 4)).toUpperCase();
}

/** Whether this game is still to be put on the books (a playoff game: until its bracket game has a winner). */
function notRecordedYet(game: GameSimulationState, schedule: ScheduledGame[], bracket?: PlayoffBracketState | null): boolean {
  if (game.gameId.startsWith('po_')) {
    const node = bracket?.divisions.flatMap((d) => d.rounds.flat()).find((n) => `po_${n.matchupId}` === game.gameId);
    return !node?.winnerTeamId;
  }
  const scheduled = schedule.find((g) => g.gameId === game.gameId);
  return scheduled !== undefined && scheduled.homeScore === undefined;
}

/** A team's season after this game, playoffs included: its record plus this game when it isn't on the books yet. */
export function recordAfter(team: Team, side: 'home' | 'away', game: GameSimulationState, schedule: ScheduledGame[], bracket?: PlayoffBracketState | null): WinLoss {
  const counts = notRecordedYet(game, schedule, bracket);
  const won = side === 'home' ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
  const full = fullRecord(team, bracket);
  return { wins: full.wins + (counts && won ? 1 : 0), losses: full.losses + (counts && !won ? 1 : 0) };
}

/**
 * A team's record after this game, the way the box score shows it: the season (playoffs included), then the
 * district record in brackets ("2-3 (1-1)"). It starts from the team's own record (which already counts forfeits)
 * and adds this game when it isn't on the books yet (playoff games move only the season). Schools from another
 * state show their season only.
 */
export function recordLine(team: Team, side: 'home' | 'away', game: GameSimulationState, schedule: ScheduledGame[], bracket?: PlayoffBracketState | null): string {
  const { wins, losses } = recordAfter(team, side, game, schedule, bracket);
  if (!schedule.some((g) => g.homeTeamId === team.id || g.awayTeamId === team.id)) return `${wins}-${losses}`;
  const scheduled = schedule.find((g) => g.gameId === game.gameId);
  const won = side === 'home' ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
  const district = !game.gameId.startsWith('po_') && notRecordedYet(game, schedule, bracket) && !!scheduled?.isDistrictGame;
  const districtWins = team.record.districtWins + (district && won ? 1 : 0);
  const districtLosses = team.record.districtLosses + (district && !won ? 1 : 0);
  return `${wins}-${losses} (${districtWins}-${districtLosses})`;
}
