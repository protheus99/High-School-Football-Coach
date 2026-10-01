import React from 'react';
import { Player, Team } from '../types/game';
import { TIER_LABELS, isDivisionOne, tierRank } from '../sim/collegeRecruitingEngine';

interface BanquetProps {
  userTeam: Team;
  graduatingSeniors: Player[];
  onStartNextYear: () => void;
}

export const OffSeasonBanquetView: React.FC<BanquetProps> = ({
  userTeam,
  graduatingSeniors,
  onStartNextYear
}) => {
  // Signing day already ran for every senior in the state when the banquet opened
  const signees = graduatingSeniors
    .filter((p) => p.recruiting.isNationalLetterOfIntentSigned && p.recruiting.signedTier)
    .sort((a, b) => tierRank(b.recruiting.signedTier!) - tierRank(a.recruiting.signedTier!) || b.overallRating - a.overallRating);
  const d1Count = signees.filter((p) => isDivisionOne(p.recruiting.signedTier)).length;

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Banquet Header */}
      <div style={{ background: '#0F172A', color: '#fff', padding: '24px', borderRadius: '12px', textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: '#F59E0B' }}>🎓 ANNUAL FOOTBALL BANQUET</h1>
        <p style={{ margin: '8px 0 0 0', color: '#94A3B8' }}>
          Celebrating the graduating senior class of {userTeam.name} and looking ahead to next season
        </p>
      </div>

      {/* National Signing Day (NLI) Showcase */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 4px 0', color: '#1E293B' }}>✍️ National Signing Day (NLI)</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748B' }}>
          {signees.length} senior{signees.length === 1 ? '' : 's'} signed to play in college ({d1Count} Division I). Every Division I signee builds the
          program&apos;s alumni prestige.
        </p>
        {signees.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
            {signees.map((senior) => {
              const tier = senior.recruiting.signedTier!;
              const d1 = isDivisionOne(tier);
              return (
                <div
                  key={senior.id}
                  style={{ background: d1 ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${d1 ? '#93C5FD' : '#CBD5E1'}`, borderRadius: '6px', padding: '12px' }}
                >
                  <div style={{ fontWeight: 'bold' }}>{senior.firstName} {senior.lastName} ({senior.position})</div>
                  <div style={{ color: '#2563EB', fontSize: '13px', fontWeight: 'bold' }}>
                    Signed with: {senior.recruiting.committedCollege}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569' }}>{TIER_LABELS[tier]}</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    Rating: {senior.overallRating} OVR ({senior.recruiting.starRating}★)
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#64748B', fontSize: '14px' }}>No seniors signed with a college this season.</div>
        )}
      </div>

      {/* Graduating Senior Class Farewells */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#1E293B' }}>Graduating Senior Class ({graduatingSeniors.length})</h3>
        <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '13px' }}>
          {graduatingSeniors.map((s) => (
            <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>{s.firstName} {s.lastName}</strong> ({s.position})</span>
              <span style={{ color: '#64748B' }}>Peak Overall: {s.overallRating} OVR</span>
            </div>
          ))}
        </div>
      </div>

      {/* Begin Next Season Action Button */}
      <button
        onClick={onStartNextYear}
        style={{
          width: '100%',
          padding: '14px',
          background: '#10B981',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 'bold',
          fontSize: '16px',
          cursor: 'pointer'
        }}
      >
        🚀 Advance to Next Season (Promote Classes & Influx Freshmen)
      </button>
    </div>
  );
};
