import type { FatigueLevel } from '../../sim/training';

/** Fatigue level colors, Fresh (green) to Exhausted (red). */
export const FATIGUE_COLORS: Record<FatigueLevel, { background: string; color: string }> = {
  Fresh: { background: '#DCFCE7', color: '#166534' },
  Good: { background: '#ECFCCB', color: '#3F6212' },
  Worn: { background: '#FEF3C7', color: '#92400E' },
  Tired: { background: '#FFEDD5', color: '#9A3412' },
  Exhausted: { background: '#FEE2E2', color: '#991B1B' }
};
