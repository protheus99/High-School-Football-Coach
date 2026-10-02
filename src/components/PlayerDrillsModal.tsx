import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Sheet } from './ui/Sheet';
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
    <Sheet
      title="🏋️ Practice Plan"
      subtitle={`Your assistants run position drills with ${ASSISTANT_DRILLS_PER_WEEK} players every week. You set the focus.`}
      onClose={onClose}
      footer={
        <button className="ui-btn ui-btn-primary ui-btn-block" onClick={onClose}>
          Done
        </button>
      }
    >
      <h3 style={{ ...sectionTitle, marginTop: 0 }}>Development focus</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
        {DRILL_FOCUS_OPTIONS.map((o) => (
          <button key={o.id} onClick={() => setDrillFocus(o.id)} style={choiceBtn(drillFocus === o.id)}>
            <div style={{ fontWeight: 'bold' }}>{o.label}</div>
            <div style={{ fontSize: '12px', opacity: 0.85 }}>{o.help}</div>
          </button>
        ))}
      </div>

      <h3 style={sectionTitle}>Practice intensity</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
        {INTENSITY.map((o) => (
          <button key={o.id} onClick={() => setPracticeIntensity(o.id)} style={choiceBtn(practiceIntensity === o.id)}>
            <div style={{ fontWeight: 'bold' }}>{o.label}</div>
            <div style={{ fontSize: '12px', opacity: 0.85 }}>{o.help}</div>
          </button>
        ))}
      </div>

      <h3 style={sectionTitle}>Last week&apos;s drill report</h3>
      {lastDrillReport.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#334155' }}>
          {lastDrillReport.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: '13px', color: '#64748B' }}>No drills yet. Your assistants report after the week advances.</div>
      )}
    </Sheet>
  );
};

const sectionTitle: React.CSSProperties = { margin: '16px 0 8px 0', color: '#334155', fontSize: '15px' };

const choiceBtn = (active: boolean): React.CSSProperties => ({
  textAlign: 'left',
  minHeight: '56px',
  padding: '10px 12px',
  borderRadius: '10px',
  border: active ? '2px solid #2563EB' : '1px solid #CBD5E1',
  background: active ? '#EFF6FF' : '#fff',
  color: '#0F172A',
  cursor: 'pointer',
  fontSize: '13px'
});
