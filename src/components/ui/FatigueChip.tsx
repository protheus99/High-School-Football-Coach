import React from 'react';
import { fatigueLevel } from '../../sim/training';
import { FATIGUE_COLORS } from './fatigueColors';
import { formatPercent } from '../../utils/format';

/** A player's fatigue as a level pill, e.g. "Tired 61%". */
export const FatigueChip: React.FC<{ fatigue: number; showPercent?: boolean }> = ({ fatigue, showPercent = true }) => {
  const level = fatigueLevel(fatigue);
  return (
    <span style={{ display: 'inline-block', fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '2px 8px', whiteSpace: 'nowrap', ...FATIGUE_COLORS[level] }}>
      {level}
      {showPercent ? ` ${formatPercent(fatigue)}` : ''}
    </span>
  );
};
