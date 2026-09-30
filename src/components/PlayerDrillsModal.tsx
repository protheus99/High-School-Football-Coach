import React, { useState } from 'react';
import { Player } from '../types/game';
import { DrillType, executePositionDrill, DrillResult } from '../sim/drillEngine';

interface PlayerDrillsModalProps {
  roster: Player[];
  onClose: () => void;
}

export const PlayerDrillsModal: React.FC<PlayerDrillsModalProps> = ({ roster, onClose }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(roster[0]?.id || '');
  const [drillResult, setDrillResult] = useState<DrillResult | null>(null);

  const player = roster.find((p) => p.id === selectedPlayerId);

  const handleRunDrill = (drill: DrillType) => {
    if (player) {
      const res = executePositionDrill(player, drill);
      setDrillResult(res);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>🏋️ WEEKLY POSITION FOCUS DRILLS</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Target individual student-athletes for extra development reps</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {drillResult && (
          <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534', padding: '10px 14px', borderRadius: '6px', margin: '14px 0', fontSize: '13px' }}>
            ✓ {drillResult.message}
          </div>
        )}

        {/* Athlete Selection Dropdown */}
        <div style={{ margin: '14px 0' }}>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>Select Student-Athlete:</label>
          <select
            value={selectedPlayerId}
            onChange={(e) => {
              setSelectedPlayerId(e.target.value);
              setDrillResult(null);
            }}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
          >
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.position} {p.firstName} {p.lastName} (OVR: {p.overallRating}, {p.classYear})
              </option>
            ))}
          </select>
        </div>

        {/* Available Drills Grid */}
        <h4 style={{ margin: '14px 0 8px 0', color: '#334155' }}>Select Training Circuit:</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          <button onClick={() => handleRunDrill('QB_FILM_AND_READS')} style={drillBtn}>
            🧠 QB Film & Reads (+IQ, +Accuracy)
          </button>
          <button onClick={() => handleRunDrill('RB_BALL_SECURITY')} style={drillBtn}>
            🏈 RB Gauntlet (+Carrying, -Fumbles)
          </button>
          <button onClick={() => handleRunDrill('WR_CONTESTED_CATCH')} style={drillBtn}>
            🎯 WR Red Zone Catches (+Catching)
          </button>
          <button onClick={() => handleRunDrill('TRENCH_BLOCK_SHEDDING')} style={drillBtn}>
            💥 Trench Hand Combat (+Strength)
          </button>
          <button onClick={() => handleRunDrill('DB_BALL_HAWK_COVERAGE')} style={drillBtn}>
            🛡️ DB Hip Turn & Coverage (+Coverage)
          </button>
          <button onClick={() => handleRunDrill('SPEED_AND_AGILITY_CONES')} style={drillBtn}>
            ⚡ Cone & Ladder Drills (+Speed, +Agility)
          </button>
        </div>

        <button onClick={onClose} style={closeBtnStyle}>Finished Training Session</button>
      </div>
    </div>
  );
};

const drillBtn: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  background: '#F8FAFC',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#1E293B',
  cursor: 'pointer'
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1350
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '580px'
};

const closeBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  marginTop: '16px',
  cursor: 'pointer'
};
