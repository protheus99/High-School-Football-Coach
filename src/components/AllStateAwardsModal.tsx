import React from 'react';
import { SeasonAwardsRecord } from '../sim/awardsEngine';
import { Sheet } from './ui/Sheet';

interface AllStateAwardsModalProps {
  awards: SeasonAwardsRecord;
  onClose: () => void;
}

export const AllStateAwardsModal: React.FC<AllStateAwardsModalProps> = ({ awards, onClose }) => (
  <Sheet
    title={`🏅 ${awards.year} All-State Honors`}
    subtitle="The state's most dominant high school players"
    onClose={onClose}
    footer={
      <button className="ui-btn ui-btn-primary ui-btn-block" onClick={onClose}>
        Close
      </button>
    }
  >
    {/* Major awards: one per row on phones, side by side on wider screens */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
      <MajorAwardCard title="👑 Mr. Football (MVP)" winner={awards.mrFootballStateMVP} />
      <MajorAwardCard title="⚡ Offensive Player of the Year" winner={awards.offensivePlayerOfTheYear} />
      <MajorAwardCard title="🛡️ Defensive Player of the Year" winner={awards.defensivePlayerOfTheYear} />
    </div>

    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
      <div style={{ fontWeight: 'bold', color: '#1E40AF', fontSize: '13px' }}>🏆 State Coach of the Year</div>
      <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{awards.coachOfTheYear.coachName}</div>
      <div style={{ fontSize: '13px', color: '#1D4ED8' }}>
        {awards.coachOfTheYear.teamName} ({awards.coachOfTheYear.record})
      </div>
    </div>

    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#334155' }}>All-State 1st Team</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {awards.allStateFirstTeam.map((award, i) => (
        <div key={i} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', fontSize: '13px' }}>
          <div>
            <strong>{award.awardTitle}:</strong> {award.player.firstName} {award.player.lastName}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#64748B', fontSize: '12px' }}>
            <span>{award.teamName}</span>
            <span style={{ color: '#2563EB', fontWeight: 'bold' }}>{award.statHeadline}</span>
          </div>
        </div>
      ))}
    </div>
  </Sheet>
);

const MajorAwardCard: React.FC<{ title: string; winner: SeasonAwardsRecord['mrFootballStateMVP'] }> = ({ title, winner }) => (
  <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px' }}>
    <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 'bold' }}>{title}</div>
    <div style={{ fontSize: '15px', fontWeight: 'bold', margin: '4px 0 2px' }}>
      {winner.player.firstName} {winner.player.lastName}
    </div>
    <div style={{ fontSize: '12px', color: '#64748B' }}>{winner.teamName}</div>
    <div style={{ fontSize: '12px', color: '#2563EB', marginTop: '4px' }}>{winner.statHeadline}</div>
  </div>
);
