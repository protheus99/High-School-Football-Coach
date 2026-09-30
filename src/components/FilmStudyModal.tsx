import React from 'react';
import { Team } from '../types/game';

interface FilmStudyModalProps {
  opponent: Team;
  onClose: () => void;
}

export const FilmStudyModal: React.FC<FilmStudyModalProps> = ({ opponent, onClose }) => {
  const topQB = opponent.roster.find((p) => p.position === 'QB' && p.depthChartTier === 1) || opponent.roster[0];
  const topRB = opponent.roster.find((p) => p.position === 'RB' && p.depthChartTier === 1) || opponent.roster[1];
  const topDefender = opponent.roster.find((p) => ['LB', 'DE'].includes(p.position)) || opponent.roster[2];

  const isPassHeavy = opponent.schemeOffense === 'AIR_RAID' || opponent.schemeOffense === 'SPREAD';

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>🎥 OPPONENT FILM STUDY & TENDENCIES</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Scouting Dossier: {opponent.name} {opponent.mascot} ({opponent.classification})</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Schematic Run/Pass Tendencies */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', margin: '16px 0' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1E293B' }}>Offensive Play-Calling Tendencies</h4>
          <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
            <div style={{ flex: 1 }}>
              <div><strong>Run vs. Pass Ratio:</strong> {isPassHeavy ? '32% Run / 68% Pass' : '74% Run / 26% Pass'}</div>
              <div><strong>3rd & Short Tendency:</strong> {isPassHeavy ? 'Quick Slant / RPO' : 'Power ISO Run'}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div><strong>Base Defensive Front:</strong> {opponent.schemeDefense.replace('_', ' ')}</div>
              <div><strong>Blitz Frequency:</strong> {opponent.staff.defensiveCoordinator.schemeDiscipline > 75 ? 'Heavy 3rd-Down Blitz' : 'Conservative Coverage'}</div>
            </div>
          </div>
        </div>

        {/* Key Playmaker Threat Warnings */}
        <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Key Players to Shadow</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px', borderRadius: '6px', fontSize: '12px' }}>
            <div style={{ fontWeight: 'bold', color: '#1E40AF' }}>Pass Threat</div>
            <div>{topQB.firstName} {topQB.lastName} (QB)</div>
            <div style={{ color: '#2563EB', fontWeight: 'bold' }}>{topQB.overallRating} OVR ({topQB.classYear})</div>
          </div>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px', borderRadius: '6px', fontSize: '12px' }}>
            <div style={{ fontWeight: 'bold', color: '#166534' }}>Ground Threat</div>
            <div>{topRB.firstName} {topRB.lastName} (RB)</div>
            <div style={{ color: '#16A34A', fontWeight: 'bold' }}>{topRB.overallRating} OVR ({topRB.classYear})</div>
          </div>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px', borderRadius: '6px', fontSize: '12px' }}>
            <div style={{ fontWeight: 'bold', color: '#991B1B' }}>Defensive Disruptor</div>
            <div>{topDefender.firstName} {topDefender.lastName} ({topDefender.position})</div>
            <div style={{ color: '#DC2626', fontWeight: 'bold' }}>{topDefender.overallRating} OVR ({topDefender.classYear})</div>
          </div>
        </div>

        <button onClick={onClose} style={closeBtnStyle}>Return to Gameplan</button>
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
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1300
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '600px'
};

const closeBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer'
};
