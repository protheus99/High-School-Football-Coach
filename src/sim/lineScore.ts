import { GameSimulationState, ScheduledGame, Team } from '../types/game';

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

/**
 * A team's record after this game, and at home or away ("4-2, 3-0 Home"): the regular season so far plus this game when
 * it counts (playoff games don't). Schools from another state show their overall record only.
 */
export function recordLine(team: Team, side: 'home' | 'away', game: GameSimulationState, schedule: ScheduledGame[]): string {
  const counts = !game.gameId.startsWith('po_') && schedule.some((g) => g.gameId === game.gameId && g.homeScore === undefined);
  const won = side === 'home' ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
  const wins = team.record.wins + (counts && won ? 1 : 0);
  const losses = team.record.losses + (counts && !won ? 1 : 0);
  const played = schedule.filter((g) => g.homeScore !== undefined && g.awayScore !== undefined && (g.homeTeamId === team.id || g.awayTeamId === team.id));
  if (!schedule.some((g) => g.homeTeamId === team.id || g.awayTeamId === team.id)) return `${wins}-${losses}`;
  const onSide = played.filter((g) => (side === 'home' ? g.homeTeamId : g.awayTeamId) === team.id);
  const sideWinsBefore = onSide.filter((g) => (side === 'home' ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!)).length;
  const sideWins = sideWinsBefore + (counts && won ? 1 : 0);
  const sideLosses = onSide.length - sideWinsBefore + (counts && !won ? 1 : 0);
  return `${wins}-${losses}, ${sideWins}-${sideLosses} ${side === 'home' ? 'Home' : 'Away'}`;
}
