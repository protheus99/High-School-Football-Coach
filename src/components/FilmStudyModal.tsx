import React from 'react';
import { Player, Team } from '../types/game';
import { getPlayerPrimaryStatLine } from '../sim/playerRankingEngine';
import { Sheet } from './ui/Sheet';

interface FilmStudyModalProps {
  opponent: Team;
  onClose: () => void;
}

export const FilmStudyModal: React.FC<FilmStudyModalProps> = ({ opponent, onClose }) => {
  const topQB = opponent.roster.find((p) => p.position === 'QB' && p.depthChartTier === 1) || opponent.roster[0];
  const topRB = opponent.roster.find((p) => p.position === 'RB' && p.depthChartTier === 1) || opponent.roster[1];
  const topDefender = opponent.roster.find((p) => ['LB', 'DE'].includes(p.position)) || opponent.roster[2];

  const isPassHeavy = opponent.schemeOffense === 'AIR_RAID' || opponent.schemeOffense === 'SPREAD';

  const threat = (label: string, color: string, background: string, border: string, p: Player) => (
    <div style={{ background, border: `1px solid ${border}`, padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
      <div style={{ fontWeight: 'bold', color }}>{label}</div>
      <div style={{ fontWeight: 'bold' }}>
        {p.firstName} {p.lastName} ({p.position}, {p.classYear})
      </div>
      <div style={{ color: '#475569' }}>{getPlayerPrimaryStatLine(p)}</div>
    </div>
  );

  return (
    <Sheet
      title="🎥 Opponent Film Study"
      subtitle={`${opponent.name} ${opponent.mascot} (${opponent.record.wins}-${opponent.record.losses})`}
      onClose={onClose}
      footer={
        <button className="ui-btn ui-btn-primary ui-btn-block" onClick={onClose}>
          Back to game plan
        </button>
      }
    >
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#1E293B' }}>Tendencies</h3>
        <dl className="ui-card-pairs" style={{ marginTop: 0 }}>
          <div>
            <dt>Run / pass</dt>
            <dd>{isPassHeavy ? '32% run / 68% pass' : '74% run / 26% pass'}</dd>
          </div>
          <div>
            <dt>3rd and short</dt>
            <dd>{isPassHeavy ? 'Quick slant / RPO' : 'Power iso run'}</dd>
          </div>
          <div>
            <dt>Base defense</dt>
            <dd>{opponent.schemeDefense.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt>Blitzing</dt>
            <dd>{opponent.staff.defensiveCoordinator.schemeDiscipline > 75 ? 'Heavy 3rd-down blitz' : 'Conservative coverage'}</dd>
          </div>
        </dl>
      </div>

      <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155' }}>Key players to shadow</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        {threat('Pass threat', '#1E40AF', '#EFF6FF', '#BFDBFE', topQB)}
        {threat('Ground threat', '#166534', '#F0FDF4', '#BBF7D0', topRB)}
        {threat('Defensive disruptor', '#991B1B', '#FEF2F2', '#FECACA', topDefender)}
      </div>
    </Sheet>
  );
};
