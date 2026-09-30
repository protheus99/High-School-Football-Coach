import React from 'react';
import { GameSimulationState } from '../types/game';

interface HalftimeSpeechModalProps {
  gameState: GameSimulationState;
  userTeamId: string;
  onApplySpeech: (speechType: 'FIRED_UP' | 'TACTICAL_CALM' | 'DISCIPLINE_CHEW' | 'REST_TIRED') => void;
}

export const HalftimeSpeechModal: React.FC<HalftimeSpeechModalProps> = ({
  gameState,
  userTeamId,
  onApplySpeech
}) => {
  const isUserHome = gameState.homeTeam.id === userTeamId;
  const userScore = isUserHome ? gameState.homeScore : gameState.awayScore;
  const oppScore = isUserHome ? gameState.awayScore : gameState.homeScore;
  const margin = userScore - oppScore;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ textAlign: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <h2 style={{ margin: 0, color: '#0F172A' }}>⏱️ HALFTIME LOCKER ROOM</h2>
          <div style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            Score: {userScore} - {oppScore} ({margin > 0 ? `Leading by ${margin}` : margin < 0 ? `Trailing by ${Math.abs(margin)}` : 'Tied'})
          </div>
        </div>

        <p style={{ fontSize: '13px', color: '#475569', margin: '14px 0' }}>
          Choose your halftime message to rally the team and adjust energy for the 2nd half:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => onApplySpeech('FIRED_UP')} style={speechBtnStyle('#DC2626')}>
            <div style={{ fontWeight: 'bold' }}>🔥 Passionate Rally Speech</div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>+1 Team Momentum, +8 3rd-Quarter Effort (Slightly increased penalty risk)</div>
          </button>

          <button onClick={() => onApplySpeech('TACTICAL_CALM')} style={speechBtnStyle('#2563EB')}>
            <div style={{ fontWeight: 'bold' }}>📐 Tactical & Scheme Adjustment</div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>+5 Scheme Execution, +3 Football IQ (Reduces 2nd-half blown assignments)</div>
          </button>

          <button onClick={() => onApplySpeech('DISCIPLINE_CHEW')} style={speechBtnStyle('#D97706')}>
            <div style={{ fontWeight: 'bold' }}>⚡ Demand Strict Focus & Ball Security</div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>-50% 2nd-Half Fumble/Drop chance (Reduces explosive play aggression)</div>
          </button>

          <button onClick={() => onApplySpeech('REST_TIRED')} style={speechBtnStyle('#059669')}>
            <div style={{ fontWeight: 'bold' }}>🧊 Hydrate & Physical Recovery</div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>+12 Stamina Recovery to all starters for the 4th-quarter finish</div>
          </button>
        </div>
      </div>
    </div>
  );
};

const speechBtnStyle = (bgColor: string): React.CSSProperties => ({
  textAlign: 'left',
  padding: '12px 14px',
  background: bgColor,
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer'
});

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.8)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1400
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '520px'
};
