import { Player, Position, Team } from '../types/game';
import type { PlayoffBracketState } from './playoffEngine';

// ---------------------------------------------------------------------------
// End-of-season honors for the state: Mr. Football, the Offensive and Defensive Players of the Year (three
// different players), Coach of the Year (the best season against expectations, playoffs included), the full
// All-State 1st Team, and the coach's own top performers with where they ranked at their position.
// ---------------------------------------------------------------------------

export interface AwardWinner {
  awardTitle: string;
  player: Player;
  teamId: string;
  teamName: string;
  teamRecord: string; // the full season, playoffs included
  statHeadline: string;
}

export interface TopPerformer {
  player: Player;
  statHeadline: string;
  positionRank: number; // where he ranked among the state's players at his position
  allState: boolean;
}

export interface SeasonAwardsRecord {
  year: number;
  mrFootballStateMVP: AwardWinner;
  offensivePlayerOfTheYear: AwardWinner;
  defensivePlayerOfTheYear: AwardWinner;
  coachOfTheYear: { coachName: string; teamId: string; teamName: string; record: string; note: string };
  allStateOffense: AwardWinner[];
  allStateDefense: AwardWinner[];
  allStateFirstTeam: AwardWinner[]; // offense then defense
}

/** The All-State 1st Team's spots. */
export const ALL_STATE_OFFENSE: [Position, number][] = [['QB', 1], ['RB', 1], ['WR', 2], ['TE', 1], ['OT', 2], ['OG', 2], ['C', 1], ['K', 1]];
export const ALL_STATE_DEFENSE: [Position, number][] = [['DE', 2], ['DT', 2], ['LB', 3], ['CB', 2], ['S', 2], ['P', 1]];
const OFFENSE = new Set<Position>(['QB', 'RB', 'WR', 'TE']);
const DEFENSE = new Set<Position>(['DE', 'DT', 'LB', 'CB', 'S']);
// Linemen and punters have no box score: they're judged on their play (rating) and a little on the team's season
const NO_STATS = new Set<Position>(['OT', 'OG', 'C', 'P']);

interface Candidate {
  player: Player;
  team: Team;
  impact: number;
}

/** Wins for the whole season: the regular season plus playoff wins on the field. */
function playoffWins(team: Team, bracket?: PlayoffBracketState | null): { wins: number; losses: number; champion: boolean } {
  const games = (bracket?.divisions ?? []).flatMap((d) => d.rounds.flat()).filter((n) => !n.isBye && n.winnerTeamId && (n.team1.id === team.id || n.team2.id === team.id));
  const wins = games.filter((n) => n.winnerTeamId === team.id).length;
  return { wins, losses: games.length - wins, champion: !!bracket?.divisions.some((d) => d.championTeamId === team.id) };
}

const fullRecord = (team: Team, bracket?: PlayoffBracketState | null) => {
  const p = playoffWins(team, bracket);
  return `${team.record.wins + p.wins}-${team.record.losses + p.losses}`;
};

/** How much a player did this season, on one scale across positions. */
export function seasonImpact(p: Player, teamWins: number): number {
  const s = p.stats;
  switch (p.position) {
    case 'QB':
      return s.passYards / 25 + s.passTDs * 4 - s.interceptionsThrown * 3 + s.rushYards / 10 + s.rushTDs * 6;
    case 'RB':
      return s.rushYards / 10 + s.rushTDs * 6 + s.receivingYards / 10 + s.receivingTDs * 6 - s.fumblesLost * 3;
    case 'WR':
    case 'TE':
      return s.receivingYards / 10 + s.receivingTDs * 6 + s.receptions * 0.5;
    case 'K':
      return s.fieldGoalsMade * 3 + (s.fieldGoalsAttempted > 0 ? (s.fieldGoalsMade / s.fieldGoalsAttempted) * 10 : 0);
    case 'OT':
    case 'OG':
    case 'C':
    case 'P':
      return p.overallRating + teamWins * 0.5;
    default:
      return s.tackles + s.tacklesForLoss * 2 + s.sacks * 4 + s.interceptionsCaught * 6;
  }
}

/** A player's line for the honors page ("1,988 rush yds · 24 TD"). */
export function statHeadline(p: Player): string {
  const s = p.stats;
  const n = (v: number) => v.toLocaleString('en-US');
  switch (p.position) {
    case 'QB':
      return `${n(s.passYards)} yds · ${s.passTDs} TD · ${s.interceptionsThrown} INT`;
    case 'RB':
      return `${n(s.rushYards)} rush yds · ${s.rushTDs} TD`;
    case 'WR':
    case 'TE':
      return `${n(s.receivingYards)} yds · ${s.receivingTDs} TD`;
    case 'K':
      return `${s.fieldGoalsMade}/${s.fieldGoalsAttempted} FG`;
    case 'OT':
    case 'OG':
    case 'C':
    case 'P':
      return `${p.overallRating} OVR`;
    default:
      return [s.tackles ? `${s.tackles} tkl` : '', s.sacks ? `${s.sacks} sacks` : '', s.interceptionsCaught ? `${s.interceptionsCaught} INT` : ''].filter(Boolean).join(' · ') || `${p.overallRating} OVR`;
  }
}

const winner = (c: Candidate, awardTitle: string, bracket?: PlayoffBracketState | null): AwardWinner => ({
  awardTitle,
  player: c.player,
  teamId: c.team.id,
  teamName: c.team.name,
  teamRecord: fullRecord(c.team, bracket),
  statHeadline: statHeadline(c.player)
});

/**
 * The season's honors across the state (call it once the state finals are played). Pass the bracket so
 * playoff wins count toward the records and Coach of the Year.
 */
export function calculateSeasonAwards(year: number, allTeams: Team[], bracket?: PlayoffBracketState | null): SeasonAwardsRecord {
  const teamWins = new Map(allTeams.map((t) => [t.id, t.record.wins + playoffWins(t, bracket).wins]));
  const candidates: Candidate[] = allTeams.flatMap((team) => team.roster.map((player) => ({ player, team, impact: seasonImpact(player, teamWins.get(team.id) ?? 0) })));
  const best = (filter: (c: Candidate) => boolean) => candidates.filter(filter).sort((a, b) => b.impact - a.impact || b.player.overallRating - a.player.overallRating);
  // The big awards weigh in the team's season a little: the MVP of a 14-win team over a similar line on a 4-win team
  const award = (c: Candidate) => c.impact * (1 + (teamWins.get(c.team.id) ?? 0) / 40);
  const ranked = (filter: (c: Candidate) => boolean) => candidates.filter(filter).sort((a, b) => award(b) - award(a));

  const mvp = ranked((c) => OFFENSE.has(c.player.position) || DEFENSE.has(c.player.position))[0];
  const opoy = ranked((c) => OFFENSE.has(c.player.position) && c !== mvp)[0];
  const dpoy = ranked((c) => DEFENSE.has(c.player.position) && c !== mvp)[0];

  const team = (spots: [Position, number][]) => spots.flatMap(([position, count]) => best((c) => c.player.position === position).slice(0, count).map((c) => winner(c, `All-State ${position}`, bracket)));
  const allStateOffense = team(ALL_STATE_OFFENSE);
  const allStateDefense = team(ALL_STATE_DEFENSE);

  // Coach of the Year: wins (playoffs included), a title, and how far the season beat the program's prestige
  const coachScore = (t: Team) => {
    const p = playoffWins(t, bracket);
    const games = t.record.wins + t.record.losses + p.wins + p.losses;
    const winPct = games > 0 ? (t.record.wins + p.wins) / games : 0;
    const expected = Math.max(0.1, Math.min(0.95, (t.prestige - 40) / 60));
    return t.record.wins + p.wins + (p.champion ? 5 : 0) + (winPct - expected) * 10;
  };
  const coachTeam = [...allTeams].sort((a, b) => coachScore(b) - coachScore(a))[0];
  const coachPlayoffs = playoffWins(coachTeam, bracket);

  return {
    year,
    mrFootballStateMVP: winner(mvp, 'Mr. Football', bracket),
    offensivePlayerOfTheYear: winner(opoy, 'Offensive Player of the Year', bracket),
    defensivePlayerOfTheYear: winner(dpoy, 'Defensive Player of the Year', bracket),
    coachOfTheYear: {
      coachName: coachTeam.staff.headCoachName,
      teamId: coachTeam.id,
      teamName: coachTeam.name,
      record: fullRecord(coachTeam, bracket),
      note: coachPlayoffs.champion ? 'state champions' : coachPlayoffs.wins > 0 ? `${coachPlayoffs.wins} playoff win${coachPlayoffs.wins === 1 ? '' : 's'}` : ''
    },
    allStateOffense,
    allStateDefense,
    allStateFirstTeam: [...allStateOffense, ...allStateDefense]
  };
}

/** Everyone honored: the All-State team and the major award winners (each once). */
export function honoredPlayers(awards: SeasonAwardsRecord): Player[] {
  const all = [awards.mrFootballStateMVP, awards.offensivePlayerOfTheYear, awards.defensivePlayerOfTheYear, ...awards.allStateFirstTeam].map((w) => w.player);
  return [...new Set(all)];
}

/**
 * The coach's three best performers this season, with where each ranked among the state's players at his position
 * (statewide, by the same measure the honors use).
 */
export function topPerformers(team: Team, allTeams: Team[], awards: SeasonAwardsRecord, count = 3): TopPerformer[] {
  const honored = new Set(awards.allStateFirstTeam.map((w) => w.player.id));
  const winsOf = (t: Team) => t.record.wins;
  const mine = team.roster
    .filter((p) => !NO_STATS.has(p.position) && p.stats.gamesPlayed > 0)
    .map((p) => ({ p, impact: seasonImpact(p, winsOf(team)) }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, count);
  return mine.map(({ p, impact }) => {
    const better = allTeams.reduce((n, t) => n + t.roster.filter((o) => o.position === p.position && seasonImpact(o, winsOf(t)) > impact).length, 0);
    return { player: p, statHeadline: statHeadline(p), positionRank: better + 1, allState: honored.has(p.id) };
  });
}
