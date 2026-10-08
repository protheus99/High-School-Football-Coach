import React from 'react';
import type { ChevronLevel } from '../../sim/dilemmaEngine';

const LABELS: Record<number, string> = { 1: 'gain', 2: 'high gain', 3: 'very high gain', [-1]: 'loss', [-2]: 'high loss', [-3]: 'very high loss' };

/**
 * A change shown as stacked chevrons in one narrow column: one, two or three, pointing up (green) for a gain and
 * down (red) for a loss; a dash for no change.
 */
export const Chevrons: React.FC<{ level: ChevronLevel }> = ({ level }) => {
  if (level === 0)
    return (
      <span aria-label="no change" style={{ color: '#64748B', fontWeight: 'bold' }}>
        –
      </span>
    );
  const count = Math.abs(level);
  const up = level > 0;
  const width = 10;
  const height = 16;
  const step = 4.5;
  const top = (height - (count - 1) * step - 4) / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={LABELS[level]} style={{ verticalAlign: 'middle', flexShrink: 0 }}>
      <g fill="none" stroke={up ? '#15803D' : '#B91C1C'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: count }, (_, i) => {
          const y = top + i * step;
          const points = up ? `2,${y + 4} ${width / 2},${y} ${width - 2},${y + 4}` : `2,${y} ${width / 2},${y + 4} ${width - 2},${y}`;
          return <polyline key={i} points={points} />;
        })}
      </g>
    </svg>
  );
};
