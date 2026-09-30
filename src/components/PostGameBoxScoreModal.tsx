import React from 'react';
import { GameSimulationState } from '../types/game';

interface BoxScoreProps {
  gameState: GameSimulationState;
  onClose: () => void;
}

export const PostGameBoxScoreModal: React.FC<BoxScoreProps> = ({ gameState, onClose }) => {
  const { homeTeam, awayTeam, homeScore, awayScore, eventLog } = gameState;

  // Calculate box score metrics from event log
  const homePlays = eventLog.filter((e) => e.possessionTeamId === homeTeam.id);
  const awayPlays = eventLog.filter((e) => e.possessionTeamId === awayTeam.id);

  const calcTotalYards = (plays: typeof eventLog) => plays.reduce((sum, p) => sum + (p.yardsGained > 0 ? p.yardsGained : 0), 0);
  const calcPassYards = (plays: typeof eventLog) => plays.filter((p) => p.playConcept === 'SHORT_PASS' || p.playConcept === 'DEEP_PASS').reduce((sum, p) => sum + p.yardsGained, 0);
  const calcRushYards = (plays: typeof eventLog) => plays.filter((p) => p.playConcept === 'INSIDE_RUN' || p.playConcept === 'OUTSIDE_RUN').reduce((sum, p) => sum + p.yardsGained, 0);
  const calcTurnovers = (plays: typeof eventLog) => plays.filter((p) => p.isTurnover).length;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <h2 style={{ margin: 0, color: '#0F172A' }}>FINAL BOX SCORE</h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Final Score Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: '#F8FAFC', padding: '16px', borderRadius: '8px', margin: '16px 0' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: 0, color: homeTeam.primaryColor }}>{homeTeam.name}</h3>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{homeScore}</div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#94A3B8' }}>FINAL</div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: 0, color: awayTeam.primaryColor }}>{awayTeam.name}</h3>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{awayScore}</div>
          </div>
        </div>

        {/* Team Comparison Matrix */}
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
              <th style={{ padding: '8px', textAlign: 'left' }}>Team Metric</th>
              <th style={{ padding: '8px' }}>{homeTeam.name}</th>
              <th style={{ padding: '8px' }}>{awayTeam.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Total Yards</td>
              <td>{calcTotalYards(homePlays)}</td>
              <td>{calcTotalYards(awayPlays)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Passing Yards</td>
              <td>{calcPassYards(homePlays)}</td>
              <td>{calcPassYards(awayPlays)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Rushing Yards</td>
              <td>{calcRushYards(homePlays)}</td>
              <td>{calcRushYards(awayPlays)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Turnovers Lost</td>
              <td style={{ color: calcTurnovers(homePlays) > 0 ? '#DC2626' : '#059669' }}>{calcTurnovers(homePlays)}</td>
              <td style={{ color: calcTurnovers(awayPlays) > 0 ? '#DC2626' : '#059669' }}>{calcTurnovers(awayPlays)}</td>
            </tr>
          </tbody>
        </table>

        <button onClick={onClose} style={confirmBtnStyle}>Return to Team Dashboard</button>
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
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '600px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  cursor: 'pointer',
  color: '#64748B'
};

const confirmBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer'
};
