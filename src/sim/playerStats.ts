import { PlayerStats, Position } from '../types/game';

export function createEmptyPlayerStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    passAttempts: 0,
    passCompletions: 0,
    passYards: 0,
    passTDs: 0,
    interceptionsThrown: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTDs: 0,
    fumblesLost: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTDs: 0,
    tackles: 0,
    tacklesForLoss: 0,
    sacks: 0,
    interceptionsCaught: 0,
    fieldGoalsAttempted: 0,
    fieldGoalsMade: 0
  };
}

/** Adds each field of `delta` onto `target` in place. */
export function addPlayerStats(target: PlayerStats, delta: Partial<PlayerStats>): void {
  for (const key of Object.keys(delta) as (keyof PlayerStats)[]) {
    target[key] += delta[key] ?? 0;
  }
}

/** Career totals as of today: previous seasons plus this one. */
export function careerTotals(player: { stats: PlayerStats; careerStats?: PlayerStats }): PlayerStats {
  const total = createEmptyPlayerStats();
  if (player.careerStats) addPlayerStats(total, player.careerStats);
  addPlayerStats(total, player.stats);
  return total;
}

/**
 * The stat lines that matter for a position, always shown for its own categories (zeros included) plus anything
 * else he recorded (a receiver's carries, a linebacker's interception return). Linemen are judged on film: games only.
 */
export function positionStatLines(position: Position, s: PlayerStats): [string, string][] {
  const passing = (): [string, string] => ['Passing', `${s.passCompletions}/${s.passAttempts}, ${s.passYards} yds, ${s.passTDs} TD, ${s.interceptionsThrown} INT`];
  const rushing = (): [string, string] => ['Rushing', `${s.rushAttempts} car, ${s.rushYards} yds, ${s.rushTDs} TD`];
  const receiving = (): [string, string] => ['Receiving', `${s.receptions} rec, ${s.receivingYards} yds, ${s.receivingTDs} TD`];
  const defense = (): [string, string] => ['Defense', `${s.tackles} tkl, ${s.tacklesForLoss} TFL, ${s.sacks} sacks, ${s.interceptionsCaught} INT`];
  const kicking = (): [string, string] => ['Kicking', `${s.fieldGoalsMade}/${s.fieldGoalsAttempted} FG`];
  const own: Record<Position, (() => [string, string])[]> = {
    QB: [passing, rushing],
    RB: [rushing, receiving],
    WR: [receiving],
    TE: [receiving],
    OT: [],
    OG: [],
    C: [],
    DE: [defense],
    DT: [defense],
    LB: [defense],
    CB: [defense],
    S: [defense],
    K: [kicking],
    P: []
  };
  const extra: [boolean, () => [string, string]][] = [
    [s.passAttempts > 0, passing],
    [s.rushAttempts > 0, rushing],
    [s.receptions > 0, receiving],
    [s.tackles + s.sacks + s.interceptionsCaught > 0, defense],
    [s.fieldGoalsAttempted > 0, kicking]
  ];
  const lines = [...own[position]];
  extra.forEach(([recorded, line]) => recorded && !lines.includes(line) && lines.push(line));
  return [['Games', `${s.gamesPlayed}`], ...lines.map((line) => line()), ...(s.fumblesLost > 0 ? [['Fumbles lost', `${s.fumblesLost}`] as [string, string]] : [])];
}
