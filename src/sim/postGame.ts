import { GameSimulationState, Player, PlayerStats, Team } from '../types/game';
import { POSITION_KEY_SKILLS } from './playerEngine';

/** Game balls that add college exposure in one season (more still earn the skill point and the headline). */
export const GAME_BALL_EXPOSURE_CAP = 3;

const ATTRIBUTE_LABELS: Partial<Record<keyof Player['attributes'], string>> = {
  passingAccuracy: 'Accuracy',
  armStrength: 'Arm strength',
  vision: 'Vision',
  carrying: 'Ball security',
  routeRunning: 'Route running',
  catching: 'Hands',
  runBlocking: 'Run blocking',
  passBlocking: 'Pass blocking',
  passRush: 'Pass rush',
  tackling: 'Tackling',
  coverage: 'Coverage',
  kickingPower: 'Kick power',
  kickingAccuracy: 'Kick accuracy'
};
export const attributeLabel = (key: keyof Player['attributes']) => ATTRIBUTE_LABELS[key] ?? key;

/** A rough game score for picking the Player of the Game: production on both sides of the ball. */
export function gameImpact(s: PlayerStats): number {
  return (
    s.passYards / 25 +
    s.passTDs * 4 -
    s.interceptionsThrown * 3 +
    s.rushYards / 10 +
    s.rushTDs * 6 +
    s.receivingYards / 10 +
    s.receivingTDs * 6 -
    s.fumblesLost * 3 +
    s.tackles +
    s.tacklesForLoss +
    s.sacks * 3 +
    s.interceptionsCaught * 5 +
    s.fieldGoalsMade * 3
  );
}

/** The game's line for a player, by what he did most: "27 car, 183 yds, 2 TD". */
export function gameLine(s: PlayerStats): string {
  const td = (n: number) => (n ? `, ${n} TD` : '');
  if (s.passAttempts >= 5) return `${s.passCompletions}/${s.passAttempts}, ${s.passYards} yds${td(s.passTDs)}${s.interceptionsThrown ? `, ${s.interceptionsThrown} INT` : ''}`;
  if (s.rushAttempts >= Math.max(3, s.receptions)) return `${s.rushAttempts} car, ${s.rushYards} yds${td(s.rushTDs)}`;
  if (s.receptions > 0) return `${s.receptions} rec, ${s.receivingYards} yds${td(s.receivingTDs)}`;
  if (s.fieldGoalsAttempted > 0) return `${s.fieldGoalsMade}/${s.fieldGoalsAttempted} FG`;
  const parts = [`${s.tackles} tkl`];
  if (s.sacks) parts.push(`${s.sacks} sack`);
  if (s.interceptionsCaught) parts.push(`${s.interceptionsCaught} INT`);
  return parts.join(', ');
}

export interface GameBallCandidate {
  player: Player;
  line: string;
  impact: number;
}

/** Everyone on the coach's team who did something this game, best performance first. */
export function gameBallCandidates(game: GameSimulationState, team: Team): GameBallCandidate[] {
  const stats = game.playerGameStats ?? {};
  return team.roster
    .filter((p) => stats[p.id] && gameImpact(stats[p.id]) > 0)
    .map((p) => ({ player: p, line: gameLine(stats[p.id]), impact: gameImpact(stats[p.id]) }))
    .sort((a, b) => b.impact - a.impact);
}

/** The skill a game ball improves: the weakest of the position's key skills (where a point helps most). */
export function gameBallSkill(player: Player): keyof Player['attributes'] {
  return [...POSITION_KEY_SKILLS[player.position]].sort((a, b) => (player.attributes[a] as number) - (player.attributes[b] as number))[0];
}

/**
 * The game ball: +1 to a key skill and +1 college exposure (up to three a season), counted on the player. It never
 * changes the overall rating directly.
 */
export function awardGameBall(player: Player, year: number): { skill: keyof Player['attributes']; exposure: boolean } {
  const skill = gameBallSkill(player);
  player.attributes[skill] = Math.min(99, player.attributes[skill] + 1);
  const thisSeason = player.gameBallYear === year ? player.gameBallsThisSeason ?? 0 : 0;
  const exposure = thisSeason < GAME_BALL_EXPOSURE_CAP;
  if (exposure) player.recruiting.exposure = (player.recruiting.exposure ?? 0) + 1;
  player.gameBallYear = year;
  player.gameBallsThisSeason = thisSeason + 1;
  player.gameBalls = (player.gameBalls ?? 0) + 1;
  return { skill, exposure };
}
