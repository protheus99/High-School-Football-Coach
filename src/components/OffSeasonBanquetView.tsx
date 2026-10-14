import React, { useState } from 'react';
import { CollegeTier, Player, Team } from '../types/game';
import { TIER_LABELS, isDivisionOne, tierRank } from '../sim/collegeRecruitingEngine';
import { PlayerDetailModal } from './PlayerDetailModal';
import { BackToTop } from './ui/BackToTop';
import { SeasonScorecard } from './SeasonScorecard';
import { Steps } from './AllStateHonorsPage';

/** Each college level's chip color in the graduating class list. */
const TIER_COLORS: Record<CollegeTier, string> = {
  POWER_4: '#1D4ED8',
  GROUP_OF_5: '#4338CA',
  FCS: '#7C3AED',
  DIVISION_2: '#0F766E',
  DIVISION_3: '#047857',
  PWO: '#64748B'
};

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
  // The class list: the seniors going on to college first (by level), then everyone else
  const signedTier = (p: Player) => (p.recruiting.isNationalLetterOfIntentSigned ? p.recruiting.signedTier : undefined);
  const graduates = [...graduatingSeniors].sort((a, b) => {
    const ta = signedTier(a);
    const tb = signedTier(b);
    if (!!ta !== !!tb) return ta ? -1 : 1;
    return (ta && tb ? tierRank(tb) - tierRank(ta) : 0) || b.overallRating - a.overallRating;
  });
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
        <Steps step={2} />
      </div>

      {/* National Signing Day (NLI) Showcase */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 4px 0', color: '#1E293B' }}>✍️ College Signing Day (NLI)</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748B' }}>
          {signees.length} senior{signees.length === 1 ? '' : 's'} signed to play in college ({d1Count} Division I). Every signee adds a point to your Hall of Fame
          score, and Division I signees also build the program&apos;s alumni prestige.
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
          {graduates.map((s) => (
            <button
              key={s.id}
              onClick={() => setViewed(s)}
              style={{ width: '100%', minHeight: '44px', padding: '8px 0', background: 'none', border: 'none', borderBottom: '1px solid #F1F5F9', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'nowrap' }}
            >
              <span style={{ minWidth: 0 }}>
                <strong>
                  {s.firstName} {s.lastName}
                </strong>{' '}
                ({s.position})
                {signedTier(s) && (
                  <>
                    {' '}
                    <span style={{ background: TIER_COLORS[signedTier(s)!], color: '#fff', borderRadius: '5px', padding: '1px 6px', fontSize: '10.5px', fontWeight: 900, whiteSpace: 'nowrap', verticalAlign: '1px' }}>
                      {TIER_LABELS[signedTier(s)!].toUpperCase()}
                    </span>
                    <span style={{ display: 'block', color: '#64748B', fontSize: '12.5px' }}>Signed with {s.recruiting.committedCollege}</span>
                  </>
                )}
              </span>
              <span style={{ color: '#64748B', flex: '0 0 auto' }}>{s.overallRating} OVR ›</span>
            </button>
          ))}
        </div>
      </div>

      {/* How the year went and what it scored, at the end of the night */}
      <SeasonScorecard team={userTeam} />

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
