import React from 'react';
import { SeasonAwardsRecord } from '../sim/awardsEngine';

interface AllStateAwardsModalProps {
  awards: SeasonAwardsRecord;
  onClose: () => void;
}

export const AllStateAwardsModal: React.FC<AllStateAwardsModalProps> = ({ awards, onClose }) => {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>🏅 {awards.year} ALL-STATE HONORS & AWARDS</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Recognizing the state's most dominant high school student-athletes</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Major Awards Spotlight */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', margin: '16px 0' }}>
          <MajorAwardCard title="👑 Mr. Football (MVP)" winner={awards.mrFootballStateMVP} />
          <MajorAwardCard title="⚡ Offensive POY" winner={awards.offensivePlayerOfTheYear} />
          <MajorAwardCard title="🛡️ Defensive POY" winner={awards.defensivePlayerOfTheYear} />
        </div>

        {/* Coach of the Year Banner */}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 'bold', color: '#1E40AF', fontSize: '13px' }}>🏆 State Coach of the Year</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{awards.coachOfTheYear.coachName}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#3B82F6' }}>
            {awards.coachOfTheYear.teamName} ({awards.coachOfTheYear.record})
          </div>
        </div>

        {/* 1st Team All-State Roster */}
        <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>All-State 1st Team Selections</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
          {awards.allStateFirstTeam.map((award, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: '4px', fontSize: '12px' }}>
              <span><strong>{award.awardTitle}:</strong> {award.player.firstName} {award.player.lastName} ({award.teamName})</span>
              <span style={{ color: '#2563EB', fontWeight: 'bold' }}>{award.statHeadline}</span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={closeBtnStyle}>Close Awards Showcase</button>
      </div>
    </div>
  );
};

const MajorAwardCard: React.FC<{ title: string; winner: SeasonAwardsRecord['mrFootballStateMVP'] }> = ({ title, winner }) => (
  <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
    <div style={{ fontSize: '11px', color: '#B45309', fontWeight: 'bold' }}>{title}</div>
    <div style={{ fontSize: '13px', fontWeight: 'bold', margin: '4px 0' }}>{winner.player.firstName} {winner.player.lastName}</div>
    <div style={{ fontSize: '11px', color: '#64748B' }}>{winner.teamName}</div>
    <div style={{ fontSize: '10px', color: '#2563EB', marginTop: '4px' }}>{winner.statHeadline}</div>
  </div>
);

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
  maxWidth: '640px'
};

const closeBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: '#334155',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  marginTop: '16px',
  cursor: 'pointer'
};
