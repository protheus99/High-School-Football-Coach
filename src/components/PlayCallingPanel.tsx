import React from 'react';
import { PlayConcept } from '../types/game';

interface PlayCallingPanelProps {
  onCallPlay: (concept: PlayConcept) => void;
  disabled: boolean;
}

export const PlayCallingPanel: React.FC<PlayCallingPanelProps> = ({ onCallPlay, disabled }) => {
  return (
    <div style={{ background: '#1E293B', borderRadius: '8px', padding: '12px', margin: '12px 0' }}>
      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>
        Tactical Play-Calling Panel
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        <button onClick={() => onCallPlay('INSIDE_RUN')} disabled={disabled} style={playBtnStyle('#3B82F6')}>
          🏈 Inside Power
        </button>
        <button onClick={() => onCallPlay('OUTSIDE_RUN')} disabled={disabled} style={playBtnStyle('#06B6D4')}>
          💨 Outside Sweep
        </button>
        <button onClick={() => onCallPlay('SHORT_PASS')} disabled={disabled} style={playBtnStyle('#10B981')}>
          🎯 Quick Slant
        </button>
        <button onClick={() => onCallPlay('DEEP_PASS')} disabled={disabled} style={playBtnStyle('#8B5CF6')}>
          🚀 Deep Shot
        </button>
      </div>
    </div>
  );
};

const playBtnStyle = (accentColor: string): React.CSSProperties => ({
  padding: '8px 4px',
  background: '#334155',
  borderLeft: `4px solid ${accentColor}`,
  borderTop: 'none',
  borderRight: 'none',
  borderBottom: 'none',
  color: '#fff',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold',
  cursor: 'pointer'
});
