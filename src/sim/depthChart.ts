import { Player, Position } from '../types/game';

/**
 * Roster size and number of first-string starters per position (30-man roster,
 * 11-on-11 starters plus a kicker and punter). Shared by the roster generator and
 * the off-season so depth charts always have the same shape.
 */
export const DEPTH_TEMPLATE: Record<Position, { roster: number; starters: number }> = {
  QB: { roster: 2, starters: 1 },
  RB: { roster: 3, starters: 1 },
  WR: { roster: 4, starters: 2 },
  TE: { roster: 2, starters: 1 },
  OT: { roster: 2, starters: 2 },
  OG: { roster: 2, starters: 2 },
  C: { roster: 1, starters: 1 },
  DE: { roster: 2, starters: 2 },
  DT: { roster: 2, starters: 2 },
  LB: { roster: 3, starters: 3 },
  CB: { roster: 3, starters: 2 },
  S: { roster: 2, starters: 2 },
  K: { roster: 1, starters: 1 },
  P: { roster: 1, starters: 1 }
};

/** Best players at each position start (tier 1); the rest are second string. */
export function rebuildDepthChart(roster: Player[]): void {
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    roster
      .filter((p) => p.position === pos)
      .sort((a, b) => b.overallRating - a.overallRating)
      .forEach((p, i) => {
        p.depthChartTier = i < DEPTH_TEMPLATE[pos].starters ? 1 : 2;
      });
  });
}
