import React from 'react';
import { useGameStore } from '../store/gameStore';
import { ASSISTANT_DRILLS_PER_WEEK, DRILL_FOCUS_OPTIONS } from '../sim/drillEngine';

const INTENSITY: { id: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT'; label: string; help: string }[] = [
  { id: 'WALKTHROUGH', label: 'Walkthrough', help: 'Fresh legs, less wear.' },
  { id: 'STANDARD', label: 'Standard', help: 'Balanced reps and fatigue.' },
  { id: 'CONTACT', label: 'Full Contact', help: 'Tougher team, more wear and injury risk.' }
];

/**
 * Practice plan: the head coach sets the week's development focus and intensity; the assistant coaches
 * pick the players and run the position drills automatically when the week advances.
 */
export const PlayerDrillsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { drillFocus, setDrillFocus, practiceIntensity, setPracticeIntensity, lastDrillReport } = useGameStore();

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="practice-plan-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 id="practice-plan-title" style={{ margin: 0, color: '#0F172A' }}>
              🏋️ Practice Plan
            </h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              Your assistants run position drills with {ASSISTANT_DRILLS_PER_WEEK} players every week. You set the focus.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <h4 style={sectionTitle}>Development focus</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {DRILL_FOCUS_OPTIONS.map((o) => (
            <button key={o.id} onClick={() => setDrillFocus(o.id)} style={choiceBtn(drillFocus === o.id)}>
              <div style={{ fontWeight: 'bold' }}>{o.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{o.help}</div>
            </button>
          ))}
        </div>

        <h4 style={sectionTitle}>Practice intensity</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {INTENSITY.map((o) => (
            <button key={o.id} onClick={() => setPracticeIntensity(o.id)} style={choiceBtn(practiceIntensity === o.id)}>
              <div style={{ fontWeight: 'bold' }}>{o.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{o.help}</div>
            </button>
          ))}
        </div>

        <h4 style={sectionTitle}>Last week&apos;s drill report</h4>
        {lastDrillReport.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#334155' }}>
            {lastDrillReport.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <div style={{ fontSize: '13px', color: '#64748B' }}>No drills yet. Your assistants report after the week advances.</div>
        )}

        <button onClick={onClose} style={doneBtn}>
          Done
        </button>
      </div>
    </div>
  );
};

const sectionTitle: React.CSSProperties = { margin: '16px 0 8px 0', color: '#334155' };

const choiceBtn = (active: boolean): React.CSSProperties => ({
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: '6px',
  border: active ? '2px solid #2563EB' : '1px solid #CBD5E1',
  background: active ? '#EFF6FF' : '#fff',
  color: '#0F172A',
  cursor: 'pointer',
  fontSize: '13px'
});

const doneBtn: React.CSSProperties = {
  width: '100%',
  marginTop: '18px',
  padding: '12px',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer'
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1200,
  padding: '16px'
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '20px',
  width: '100%',
  maxWidth: '560px',
  maxHeight: '90vh',
  overflowY: 'auto'
};
