import React from 'react';
import { Player, DepthChartTier } from '../types/game';

interface DepthChartEditorProps {
  player: Player;
  onUpdateTier: (playerId: string, tier: DepthChartTier) => void;
  onToggleStudyHall: (playerId: string) => void;
  onClose: () => void;
}

export const DepthChartEditorModal: React.FC<DepthChartEditorProps> = ({
  player,
  onUpdateTier,
  onToggleStudyHall,
  onClose
}) => {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>
            {player.firstName} {player.lastName} (#{player.position})
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Player Snapshot */}
        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
          <div><strong>Class:</strong> {player.classYear} | <strong>Overall:</strong> {player.overallRating} | <strong>Potential:</strong> {player.potential}</div>
          <div><strong>Stamina:</strong> {player.condition.inGameStamina}% | <strong>Season Wear:</strong> {player.condition.seasonWear}%</div>
          <div><strong>GPA:</strong> {player.academics.gpa.toFixed(2)} ({player.academics.isEligible ? 'Eligible' : 'Failing / Ineligible'})</div>
        </div>

        {/* Depth Chart Slot Selection */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '13px' }}>Depth Chart Assignment:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([1, 2, 3] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => onUpdateTier(player.id, tier)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: player.depthChartTier === tier ? '#2563EB' : '#F1F5F9',
                  color: player.depthChartTier === tier ? '#fff' : '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {tier === 1 ? '1st String' : tier === 2 ? '2nd String' : 'Reserve'}
              </button>
            ))}
          </div>
        </div>

        {/* Academic Study Hall Toggle */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={player.academics.studyHallAssigned}
              onChange={() => onToggleStudyHall(player.id)}
            />
            <span><strong>Assign Mandatory Study Hall</strong> (+GPA recovery, -5% practice growth)</span>
          </label>
        </div>

        <button onClick={onClose} style={doneBtnStyle}>Done</button>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1100
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '8px',
  padding: '20px',
  width: '90%',
  maxWidth: '440px'
};

const doneBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#10B981',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer'
};
