import React from 'react';
import { PlayConcept, DefensiveCall } from '../types/game';

interface PlayCallingPanelProps {
  side: 'OFFENSE' | 'DEFENSE';
  onCallPlay: (concept: PlayConcept) => void;
  onCallDefense: (call: DefensiveCall) => void;
  disabled: boolean;
}

export const PlayCallingPanel: React.FC<PlayCallingPanelProps> = ({ side, onCallPlay, onCallDefense, disabled }) => {
  if (side === 'DEFENSE') {
    return (
      <div style={{ background: '#3B1D1D', borderRadius: '8px', padding: '12px', margin: '12px 0' }}>
        <div style={{ color: '#FCA5A5', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>
          Call the defense
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          <button onClick={() => onCallDefense('BASE')} disabled={disabled} style={playBtnStyle('#94A3B8')}>
            🛡️ Base
            <span style={hintStyle}>Balanced front</span>
          </button>
          <button onClick={() => onCallDefense('RUN_BLITZ')} disabled={disabled} style={playBtnStyle('#F97316')}>
            🧱 Run Blitz
            <span style={hintStyle}>Stops runs, weak vs. pass</span>
          </button>
          <button onClick={() => onCallDefense('PASS_COVERAGE')} disabled={disabled} style={playBtnStyle('#3B82F6')}>
            🕸️ Pass Coverage
            <span style={hintStyle}>Stops passes, weak vs. run</span>
          </button>
          <button onClick={() => onCallDefense('BLITZ')} disabled={disabled} style={playBtnStyle('#EF4444')}>
            ⚡ All-Out Blitz
            <span style={hintStyle}>Sacks and turnovers, risky</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#1E293B', borderRadius: '8px', padding: '12px', margin: '12px 0' }}>
      <div style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>
        Call the play
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
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

const hintStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: 'normal', color: '#CBD5E1', marginTop: '2px' };

const playBtnStyle = (accentColor: string): React.CSSProperties => ({
  minHeight: '56px', // big, thumb-friendly targets: this panel is tapped every snap
  padding: '8px 10px',
  textAlign: 'left',
  background: '#334155',
  borderLeft: `4px solid ${accentColor}`,
  borderTop: 'none',
  borderRight: 'none',
  borderBottom: 'none',
  color: '#fff',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 'bold',
  cursor: 'pointer'
});
