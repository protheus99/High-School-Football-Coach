import React from 'react';
import { GameSimulationState } from '../types/game';
import { Sheet } from './ui/Sheet';

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

  const speech = (type: Parameters<typeof onApplySpeech>[0], color: string, title: string, detail: string) => (
    <button onClick={() => onApplySpeech(type)} style={speechBtnStyle(color)}>
      <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{title}</div>
      <div style={{ fontSize: '13px', opacity: 0.92, marginTop: '2px' }}>{detail}</div>
    </button>
  );

  return (
    <Sheet
      title="⏱️ Halftime Locker Room"
      subtitle={`${userScore}-${oppScore} · ${margin > 0 ? `Leading by ${margin}` : margin < 0 ? `Trailing by ${Math.abs(margin)}` : 'Tied'}`}
      dismissible={false}
    >
      <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 12px 0' }}>Pick your halftime message for the second half:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {speech('FIRED_UP', '#B91C1C', '🔥 Passionate rally speech', '+1 momentum and more 3rd-quarter effort (slightly more penalties).')}
        {speech('TACTICAL_CALM', '#2563EB', '📐 Tactical adjustments', 'Better scheme execution and fewer blown assignments.')}
        {speech('DISCIPLINE_CHEW', '#B45309', '⚡ Demand focus and ball security', 'Half the fumble and drop risk, fewer explosive plays.')}
        {speech('REST_TIRED', '#047857', '🧊 Hydrate and recover', '+12 stamina for every starter for the finish.')}
      </div>
    </Sheet>
  );
};

const speechBtnStyle = (bgColor: string): React.CSSProperties => ({
  textAlign: 'left',
  minHeight: '64px',
  padding: '12px 14px',
  background: bgColor,
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer'
});
