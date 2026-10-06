import React, { useState } from 'react';
import { Player, Team } from '../types/game';
import { TIER_LABELS, isDivisionOne, tierRank } from '../sim/collegeRecruitingEngine';
import { PlayerDetailModal } from './PlayerDetailModal';
import { BackToTop } from './ui/BackToTop';

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
  // The banquet replaces the app's screens, so it opens the shared player card itself
  const [viewed, setViewed] = useState<Player | null>(null);

  return (
    <div className="ui-screen" style={{ maxWidth: '800px', paddingBottom: '96px' }}>
      {viewed && <PlayerDetailModal player={viewed} isOwnPlayer teamName={userTeam.name} onClose={() => setViewed(null)} />}
      {/* Banquet Header */}
      <div style={{ background: '#0F172A', color: '#fff', padding: '20px 16px', borderRadius: '12px', textAlign: 'center', marginBottom: '16px' }}>
        <h1 className="ui-page-title" style={{ color: '#F59E0B' }}>🎓 Football Banquet</h1>
        <p style={{ margin: '8px 0 0 0', color: '#94A3B8' }}>
          Celebrating the graduating senior class of {userTeam.name} and looking ahead to next season
        </p>
      </div>

      {/* National Signing Day (NLI) Showcase */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
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
                <button
                  key={senior.id}
                  onClick={() => setViewed(senior)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', background: d1 ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${d1 ? '#93C5FD' : '#CBD5E1'}`, borderRadius: '6px', padding: '12px' }}
                >
                  <div style={{ fontWeight: 'bold' }}>{senior.firstName} {senior.lastName} ({senior.position})</div>
                  <div style={{ color: '#2563EB', fontSize: '13px', fontWeight: 'bold' }}>
                    Signed with: {senior.recruiting.committedCollege}
                  </div>
                  <div style={{ fontSize: '13px', color: '#475569' }}>{TIER_LABELS[tier]}</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    Rating: {senior.overallRating} OVR ({senior.recruiting.starRating}★)
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#64748B', fontSize: '14px' }}>No seniors signed with a college this season.</div>
        )}
      </div>

      {/* Graduating Senior Class Farewells */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#1E293B' }}>Graduating Senior Class ({graduatingSeniors.length})</h3>
        <div style={{ fontSize: '14px' }}>
          {graduatingSeniors.map((s) => (
            <button
              key={s.id}
              onClick={() => setViewed(s)}
              style={{ width: '100%', minHeight: '44px', padding: '8px 0', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'nowrap' }}
            >
              <span><strong>{s.firstName} {s.lastName}</strong> ({s.position})</span>
              <span style={{ color: '#64748B', flex: '0 0 auto' }}>{s.overallRating} OVR ›</span>
            </button>
          ))}
        </div>
      </div>

      {/* Next season: pinned to the bottom of the screen on phones */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', background: '#fff', borderTop: '1px solid #E2E8F0', zIndex: 50 }}>
        <button className="ui-btn ui-btn-block" style={{ background: '#047857', borderColor: '#047857', color: '#fff', minHeight: '50px', fontSize: '16px', maxWidth: '800px', margin: '0 auto', display: 'block' }} onClick={onStartNextYear}>
          ➡️ Continue to Off Season
        </button>
      </div>
      <BackToTop />
    </div>
  );
};
