import React from 'react';
import { Chevrons } from './Chevrons';
import type { ChevronLevel, ChoiceEffects as Effects } from '../../sim/dilemmaEngine';

/**
 * What a choice does, as the coach sees it (dilemmas and press answers alike): the combined Rating change, Coach
 * Points outside the pills, the Friday edge, then gains (green) and losses (red).
 */
export const ChoiceEffects: React.FC<{ fx: Effects }> = ({ fx }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 6px', marginTop: '6px' }}>
    <span style={ratingPill}>
      Rating <Chevrons level={fx.ratingLevel} />
    </span>
    {fx.coachPoints !== 0 && (
      <span style={{ fontSize: '13px', fontWeight: 'bold', color: fx.coachPoints > 0 ? '#15803D' : '#B91C1C' }}>
        {fx.coachPoints > 0 ? '+' : '−'}₡{Math.abs(fx.coachPoints)}
      </span>
    )}
    {fx.fridayEdge !== 0 && (
      <span style={{ ...effectChip, display: 'inline-flex', alignItems: 'center', gap: '4px', ...(fx.fridayEdge > 0 ? GAIN : LOSS) }}>
        Friday edge <Chevrons level={Math.max(-3, Math.min(3, fx.fridayEdge)) as ChevronLevel} />
      </span>
    )}
    {fx.gains.map((g) => (
      <span key={g} style={{ ...effectChip, ...GAIN }}>
        {g}
      </span>
    ))}
    {fx.losses.map((l) => (
      <span key={l} style={{ ...effectChip, ...LOSS }}>
        {l}
      </span>
    ))}
  </div>
);

const GAIN: React.CSSProperties = { background: '#DCFCE7', color: '#166534' };
const LOSS: React.CSSProperties = { background: '#FEE2E2', color: '#991B1B' };
const ratingPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#334155',
  border: '1px solid #CBD5E1',
  borderRadius: '999px',
  padding: '1px 8px'
};
const effectChip: React.CSSProperties = { fontSize: '12px', fontWeight: 'bold', borderRadius: '999px', padding: '2px 8px' };
