import React, { useState } from 'react';
import { AwardWinner, SeasonAwardsRecord, TopPerformer } from '../sim/awardsEngine';
import { Team } from '../types/game';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const CLASS_SHORT: Record<string, string> = { Freshman: 'Fr.', Sophomore: 'So.', Junior: 'Jr.', Senior: 'Sr.' };

/**
 * The end of the season, step 1 of 2: the state's All-State honors on a page of its own. The coach's team summary,
 * his top performers (with where they ranked at their position), the major awards, Coach of the Year and the
 * full All-State 1st Team. The coach's players are marked by a highlighted row or card, nothing more.
 */
export const AllStateHonorsPage: React.FC<{
  awards: SeasonAwardsRecord;
  userTeam: Team;
  stateName: string; // "Texas 6A"
  performers: TopPerformer[];
  onContinue: () => void;
}> = ({ awards, userTeam, stateName, performers, onContinue }) => {
  const [side, setSide] = useState<'OFFENSE' | 'DEFENSE'>('OFFENSE');
  const mine = (w: { teamId: string }) => w.teamId === userTeam.id;
  const majors = [awards.mrFootballStateMVP, awards.offensivePlayerOfTheYear, awards.defensivePlayerOfTheYear];
  const allStateCount = new Set(awards.allStateFirstTeam.filter(mine).map((w) => w.player.id)).size;
  const myMajors = majors.filter(mine).map((w) => w.awardTitle);
  const coachIsMine = awards.coachOfTheYear.teamId === userTeam.id;
  const extras = [...myMajors.map((t) => `the ${t}`), ...(coachIsMine ? ['Coach of the Year'] : [])];
  const record = `${userTeam.record.wins}-${userTeam.record.losses}`;
  const honored = allStateCount > 0 || extras.length > 0;
  const returning = performers.filter((p) => p.player.classYear !== 'Senior').length;
  const list = side === 'OFFENSE' ? awards.allStateOffense : awards.allStateDefense;

  return (
    <div className="ui-screen" style={{ maxWidth: '800px', paddingBottom: '96px' }}>
      <div style={hero}>
        <div style={{ fontSize: '34px' }} aria-hidden="true">
          🏅
        </div>
        <h1 className="ui-page-title" style={{ color: '#F59E0B' }}>
          {awards.year} All-State Honors
        </h1>
        <div style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>{stateName} · the season&apos;s best</div>
        <Steps step={1} />
      </div>

      {/* The coach's team, first */}
      {honored ? (
        <div style={{ ...card, background: '#0F172A', color: '#fff', borderLeft: '5px solid #F59E0B' }}>
          🎉{' '}
          <b>
            {userTeam.name}: {allStateCount} All-State player{allStateCount === 1 ? '' : 's'}
          </b>
          {extras.length > 0 && <div style={{ fontSize: '13px', color: '#CBD5E1', marginTop: '2px' }}>plus {joinList(extras)}</div>}
        </div>
      ) : (
        <div style={{ ...card, borderLeft: '5px solid #94A3B8' }}>
          <b>
            {userTeam.name} ({record}): no All-State selections
          </b>
          <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>A tough year. Here&apos;s where your best players finished across {stateName}.</div>
        </div>
      )}

      {performers.length > 0 && (
        <>
          <h2 style={section}>Your top performers</h2>
          <div style={{ ...card, padding: '6px 12px' }}>
            {performers.map((p, i) => (
              <div key={p.player.id} style={{ ...performerRow, borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
                <span style={pos}>{p.player.position}</span>
                <span style={{ minWidth: 0 }}>
                  <b>
                    {p.player.firstName} {p.player.lastName}
                  </b>{' '}
                  · {CLASS_SHORT[p.player.classYear] ?? p.player.classYear}
                  <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700 }}>{p.statHeadline}</div>
                </span>
                <span style={rankPill}>
                  {ordinal(p.positionRank)} of {p.player.position}s
                </span>
              </div>
            ))}
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              {returning === 0 ? 'All of them are seniors.' : returning === performers.length ? 'All of them return next season.' : `${returning === 1 ? 'One' : returning === 2 ? 'Two' : returning} of them return${returning === 1 ? 's' : ''} next season.`}
            </div>
          </div>
        </>
      )}

      <h2 style={section}>Major awards</h2>
      <AwardCard icon="👑" label="MR. FOOTBALL · STATE MVP" w={awards.mrFootballStateMVP} mine={mine(awards.mrFootballStateMVP)} />
      <AwardCard icon="⚡" label="OFFENSIVE PLAYER OF THE YEAR" w={awards.offensivePlayerOfTheYear} mine={mine(awards.offensivePlayerOfTheYear)} />
      <AwardCard icon="🛡️" label="DEFENSIVE PLAYER OF THE YEAR" w={awards.defensivePlayerOfTheYear} mine={mine(awards.defensivePlayerOfTheYear)} />
      <div style={{ ...award, borderLeftColor: '#2563EB', ...(coachIsMine && highlight) }}>
        <span aria-hidden="true" style={{ ...awardIcon, background: '#DBEAFE' }}>
          🏆
        </span>
        <span style={{ minWidth: 0 }}>
          <div style={{ fontSize: '11.5px', color: '#1E40AF', fontWeight: 800 }}>STATE COACH OF THE YEAR</div>
          <div style={{ fontWeight: 800 }}>{awards.coachOfTheYear.coachName}</div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {awards.coachOfTheYear.teamName} · {awards.coachOfTheYear.record}
            {awards.coachOfTheYear.note && ` · ${awards.coachOfTheYear.note}`}
          </div>
        </span>
      </div>

      <h2 style={section}>All-State 1st Team</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }} role="tablist" aria-label="All-State 1st Team">
        <button role="tab" aria-selected={side === 'OFFENSE'} onClick={() => setSide('OFFENSE')} style={tab(side === 'OFFENSE')}>
          Offense ({awards.allStateOffense.length})
        </button>
        <button role="tab" aria-selected={side === 'DEFENSE'} onClick={() => setSide('DEFENSE')} style={tab(side === 'DEFENSE')}>
          Defense &amp; specialists ({awards.allStateDefense.length})
        </button>
      </div>
      <div style={{ ...card, padding: '4px 2px' }}>
        {list.map((w, i) => (
          <div key={`${w.player.id}_${i}`} style={{ ...teamRow, borderTop: i === 0 || mine(w) ? '1px solid transparent' : '1px solid #F1F5F9', ...(mine(w) && { ...highlight, borderRadius: '8px', margin: '2px' }) }}>
            <span style={pos}>{w.player.position}</span>
            <span style={{ minWidth: 0 }}>
              <b>
                {w.player.firstName} {w.player.lastName}
              </b>
              <div style={{ fontSize: '12px', color: '#64748B' }}>{w.teamName}</div>
            </span>
            <span style={{ color: '#2563EB', fontWeight: 700, fontSize: '12px', textAlign: 'right' }}>{w.statHeadline}</span>
          </div>
        ))}
      </div>

      <div style={pinned}>
        <button className="ui-btn ui-btn-block" style={{ background: '#047857', borderColor: '#047857', color: '#fff', minHeight: '50px', fontSize: '16px', maxWidth: '800px', margin: '0 auto', display: 'block' }} onClick={onContinue}>
          🎓 Continue to team banquet
        </button>
      </div>
    </div>
  );
};

const AwardCard: React.FC<{ icon: string; label: string; w: AwardWinner; mine: boolean }> = ({ icon, label, w, mine }) => (
  <div style={{ ...award, ...(mine && highlight) }}>
    <span aria-hidden="true" style={awardIcon}>
      {icon}
    </span>
    <span style={{ minWidth: 0 }}>
      <div style={{ fontSize: '11.5px', color: '#B45309', fontWeight: 800 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>
        {w.player.firstName} {w.player.lastName} · {w.player.position}
      </div>
      <div style={{ fontSize: '12px', color: '#64748B' }}>
        {w.teamName} · {w.teamRecord} · <span style={{ color: '#2563EB' }}>{w.statHeadline}</span>
      </div>
    </span>
  </div>
);

/** The season wrap-up's two steps: the honors, then the banquet. */
export const Steps: React.FC<{ step: 1 | 2 }> = ({ step }) => (
  <>
    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }} aria-hidden="true">
      {[1, 2].map((s) => (
        <span key={s} style={{ width: '26px', height: '4px', borderRadius: '2px', background: s === step ? '#F59E0B' : '#334155' }} />
      ))}
    </div>
    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', letterSpacing: '0.06em' }}>SEASON WRAP-UP · {step} OF 2</div>
  </>
);

const joinList = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const hero: React.CSSProperties = { background: '#0F172A', color: '#fff', padding: '20px 16px', borderRadius: '14px', textAlign: 'center', marginBottom: '12px' };
const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)', padding: '12px', marginBottom: '10px' };
const section: React.CSSProperties = { fontSize: '16px', fontWeight: 900, margin: '16px 2px 8px' };
const award: React.CSSProperties = { display: 'flex', gap: '10px', alignItems: 'center', background: '#fff', borderRadius: '12px', padding: '10px 12px', marginBottom: '8px', boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)', borderLeft: '5px solid #F59E0B' };
const awardIcon: React.CSSProperties = { flex: '0 0 40px', height: '40px', borderRadius: '10px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' };
// The coach's players: a soft blue fill and edge, no label
const highlight: React.CSSProperties = { background: '#EFF6FF', boxShadow: 'inset 0 0 0 2px #93C5FD' };
const pos: React.CSSProperties = { fontWeight: 900, color: '#475569' };
const performerRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) auto', gap: '6px', alignItems: 'center', padding: '8px 2px', fontSize: '13px' };
const teamRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '38px minmax(0,1fr) auto', gap: '6px', alignItems: 'center', padding: '8px 10px', fontSize: '13px' };
const rankPill: React.CSSProperties = { fontSize: '11.5px', fontWeight: 800, borderRadius: '999px', padding: '2px 8px', background: '#F1F5F9', color: '#334155', whiteSpace: 'nowrap' };
const tab = (on: boolean): React.CSSProperties => ({
  minHeight: '40px',
  borderRadius: '10px',
  border: on ? '1px solid #0F172A' : '1px solid #CBD5E1',
  background: on ? '#0F172A' : '#fff',
  color: on ? '#fff' : '#0F172A',
  fontWeight: 800,
  fontSize: '13px',
  cursor: 'pointer'
});
const pinned: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  padding: '12px 16px',
  paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
  background: '#fff',
  borderTop: '1px solid #E2E8F0',
  zIndex: 50
};
