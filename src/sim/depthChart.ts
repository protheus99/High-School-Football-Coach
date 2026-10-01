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

/** Field slots per position, left to right (one column per starter). */
export const SLOT_LABELS: Record<Position, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR', 'WR'],
  TE: ['TE'],
  OT: ['LT', 'RT'],
  OG: ['LG', 'RG'],
  C: ['C'],
  DE: ['LDE', 'RDE'],
  DT: ['DT', 'NT'],
  LB: ['WLB', 'MLB', 'SLB'],
  CB: ['LCB', 'RCB'],
  S: ['FS', 'SS'],
  K: ['K'],
  P: ['P']
};

/** Depth chart label, "J, Leconte (99)": first initial, last name, overall rating. */
export const depthChartName = (p: Player) => `${p.firstName.charAt(0)}, ${p.lastName} (${p.overallRating})`;

/** Strings shown on the depth chart for each slot (starter, 2nd, 3rd). */
export const DEPTH_ROWS = 3;

/**
 * Depth order: within a position, `depthOrder` 0..k-1 are the starters (k = starters at the position),
 * k..2k-1 the second string, and so on. Slot column = order % k, row = floor(order / k).
 * Older saves without an order fall back to tier, then rating.
 */
export function compareDepth(a: Player, b: Player): number {
  return a.depthChartTier - b.depthChartTier || (a.depthOrder ?? 999) - (b.depthOrder ?? 999) || b.overallRating - a.overallRating;
}

/** A position's players in depth order. */
export function depthGroup(roster: Player[], position: Position): Player[] {
  return roster.filter((p) => p.position === position).sort(compareDepth);
}

/** Writes order and tier (1st / 2nd / 3rd string) from the group's sequence. */
function applyOrder(group: Player[], position: Position): void {
  const starters = DEPTH_TEMPLATE[position].starters;
  group.forEach((p, i) => {
    p.depthOrder = i;
    p.depthChartTier = Math.min(3, Math.floor(i / starters) + 1) as Player['depthChartTier'];
  });
}

/** Best players at each position start; the rest fill the second and third strings by rating. */
export function rebuildDepthChart(roster: Player[]): void {
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    applyOrder(
      roster.filter((p) => p.position === pos).sort((a, b) => b.overallRating - a.overallRating),
      pos
    );
  });
}

/** Moves a player up (-1) or down (+1) one string in his slot column, swapping with that player. */
export function moveInDepthChart(roster: Player[], playerId: string, direction: -1 | 1): boolean {
  const player = roster.find((p) => p.id === playerId);
  if (!player) return false;
  const group = depthGroup(roster, player.position);
  const i = group.indexOf(player);
  const j = i + direction * DEPTH_TEMPLATE[player.position].starters;
  if (j < 0 || j >= group.length) return false;
  [group[i], group[j]] = [group[j], group[i]];
  applyOrder(group, player.position);
  return true;
}

/** Puts a player in the starting lineup in place of the weakest starter at his position. */
export function promoteToStarter(roster: Player[], playerId: string): void {
  const player = roster.find((p) => p.id === playerId);
  if (!player || player.depthChartTier === 1) return;
  const group = depthGroup(roster, player.position);
  const starters = group.slice(0, DEPTH_TEMPLATE[player.position].starters);
  const weakest = starters.reduce((w, p) => (p.overallRating < w.overallRating ? p : w), starters[0]);
  const i = group.indexOf(player);
  const j = weakest ? group.indexOf(weakest) : 0;
  [group[i], group[j]] = [group[j], group[i]];
  applyOrder(group, player.position);
}

/** Moves a player to the top of a string (1st, 2nd or 3rd), shifting the others down. */
export function setDepthTier(roster: Player[], playerId: string, tier: Player['depthChartTier']): void {
  const player = roster.find((p) => p.id === playerId);
  if (!player) return;
  const group = depthGroup(roster, player.position).filter((p) => p !== player);
  group.splice(Math.min(group.length, (tier - 1) * DEPTH_TEMPLATE[player.position].starters), 0, player);
  applyOrder(group, player.position);
}
