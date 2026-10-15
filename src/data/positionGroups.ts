import type { Position } from '../types/game';

/** The position filter chips (New Students, the full roster): each group and the positions it covers. */
export const POSITION_GROUPS: { id: string; label: string; positions?: Position[] }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'QB', label: 'QB', positions: ['QB'] },
  { id: 'RB', label: 'RB', positions: ['RB'] },
  { id: 'WR', label: 'WR', positions: ['WR'] },
  { id: 'TE', label: 'TE', positions: ['TE'] },
  { id: 'OL', label: 'OL', positions: ['OT', 'OG', 'C'] },
  { id: 'DL', label: 'DL', positions: ['DE', 'DT'] },
  { id: 'LB', label: 'LB', positions: ['LB'] },
  { id: 'DB', label: 'DB', positions: ['CB', 'S'] },
  { id: 'K', label: 'K/P', positions: ['K', 'P'] }
];
export const OFFENSE_GROUPS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL'];
export const DEFENSE_GROUPS = ['ALL', 'DL', 'LB', 'DB'];
