import { PlayerStats } from '../types/game';

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
