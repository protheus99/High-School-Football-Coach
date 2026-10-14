import React from 'react';
import { GameSimulationState } from '../types/game';
import { Sheet } from './ui/Sheet';
import { GamePlanBar } from './GamePlanSheet';
import { DefensiveFocus } from '../sim/gamePlan';
import { HalftimeTalk, OffensiveScheme } from '../types/game';
import { HALFTIME_TALKS } from '../sim/halftime';

interface HalftimeSpeechModalProps {
  gameState: GameSimulationState;
  userTeamId: string;
  onApplySpeech: (talk: HalftimeTalk) => void;
  plan?: { offense: OffensiveScheme; focus: DefensiveFocus }; // the game plan, adjustable for the second half
  onUpdatePlan?: () => void;
}

export const HalftimeSpeechModal: React.FC<HalftimeSpeechModalProps> = ({
  gameState,
  userTeamId,
  onApplySpeech,
  plan,
  onUpdatePlan
}) => {
  const isUserHome = gameState.homeTeam.id === userTeamId;
  const userScore = isUserHome ? gameState.homeScore : gameState.awayScore;
  const oppScore = isUserHome ? gameState.awayScore : gameState.homeScore;
  const margin = userScore - oppScore;

  return (
    <Sheet
      title="⏱️ Halftime Locker Room"
      subtitle={`${userScore}-${oppScore} · ${margin > 0 ? `Leading by ${margin}` : margin < 0 ? `Trailing by ${Math.abs(margin)}` : 'Tied'}`}
      dismissible={false}
    >
      <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 12px 0' }}>Meet with the team to discuss 2nd half priorities.</p>
      {/* Every talk helps and costs: the gain in green, the cost in red (sim/halftime.ts) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {HALFTIME_TALKS.map((t) => (
          <button key={t.id} onClick={() => onApplySpeech(t.id)} style={speechBtnStyle(t.color)} aria-label={`${t.header} ${[...t.gains, ...t.costs].join(', ')}`}>
            <div style={{ fontWeight: 900, fontSize: '17px', fontStyle: 'italic' }}>&ldquo;{t.header}&rdquo;</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
              {t.gains.map((g) => (
                <span key={g} style={chip('#DCFCE7', '#166534')}>
                  {g}
                </span>
              ))}
              {t.costs.map((c) => (
                <span key={c} style={chip('#FEE2E2', '#991B1B')}>
                  {c}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {plan && onUpdatePlan && (
        <div style={{ marginTop: '14px' }}>
          <GamePlanBar offense={plan.offense} focus={plan.focus} onUpdate={onUpdatePlan} />
        </div>
      )}
    </Sheet>
  );
};

const chip = (background: string, color: string): React.CSSProperties => ({ background, color, borderRadius: '999px', padding: '2px 9px', fontSize: '12px', fontWeight: 800 });

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
