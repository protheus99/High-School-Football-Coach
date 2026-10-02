import React from 'react';
import { Player, DepthChartTier } from '../types/game';
import { Sheet } from './ui/Sheet';

interface DepthChartEditorProps {
  player: Player;
  onUpdateTier: (playerId: string, tier: DepthChartTier) => void;
  onClose: () => void;
}

const TIER_LABELS: Record<DepthChartTier, string> = { 1: '1st String', 2: '2nd String', 3: '3rd String' };

export const DepthChartEditorModal: React.FC<DepthChartEditorProps> = ({ player, onUpdateTier, onClose }) => (
  <Sheet
    title={`${player.firstName} ${player.lastName}`}
    subtitle={`${player.position} · ${player.classYear} · ${player.overallRating} OVR · Potential ${player.potential}`}
    onClose={onClose}
    footer={
      <button className="ui-btn ui-btn-primary ui-btn-block" onClick={onClose}>
        Done
      </button>
    }
  >
    <dl className="ui-card-pairs" style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', marginTop: 0, marginBottom: '16px' }}>
      <div>
        <dt>Stamina</dt>
        <dd>{player.condition.inGameStamina}%</dd>
      </div>
      <div>
        <dt>Season wear</dt>
        <dd>{player.condition.seasonWear}%</dd>
      </div>
      <div>
        <dt>GPA</dt>
        <dd>{player.academics.gpa.toFixed(2)}</dd>
      </div>
      <div>
        <dt>Eligibility</dt>
        <dd style={{ color: player.academics.isEligible ? '#16A34A' : '#DC2626' }}>{player.academics.isEligible ? 'Eligible' : 'Ineligible'}</dd>
      </div>
    </dl>

    <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Depth chart</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '16px' }}>
      {([1, 2, 3] as const).map((tier) => (
        <button
          key={tier}
          className={`ui-btn${player.depthChartTier === tier ? ' ui-btn-primary' : ''}`}
          onClick={() => onUpdateTier(player.id, tier)}
          aria-pressed={player.depthChartTier === tier}
        >
          {TIER_LABELS[tier]}
        </button>
      ))}
    </div>

  </Sheet>
);
