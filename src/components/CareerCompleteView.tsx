import React, { useState } from 'react';
import { coachTitle, useGameStore } from '../store/gameStore';
import { CareerLength, CONTRACT_LENGTHS, careerPoints } from '../sim/careerScore';
import { OFFER_NOTES, OfferTier } from '../sim/jobMarket';
import { findDistrict } from '../sim/league';
import { ordinal } from '../utils/format';
import { useHallOfFame } from '../utils/useHallOfFame';
import { CoachCareerView } from './CoachCareerView';

const TIER_COLORS: Record<OfferTier, string> = { POWERHOUSE: '#7C3AED', TRADITION: '#2563EB', REBUILD: '#16A34A' };

/**
 * A contract is done: the final Hall of Fame score, then what's next. Extend at the same school, take a job at
 * another school in this world (each contract is its own Hall of Fame entry), look back over the coach's
 * career, or leave the world for the main menu.
 */
export const CareerCompleteView: React.FC<{ onMainMenu: () => void }> = ({ onMainMenu }) => {
  const { career, careerHistory, jobOffers, contractRenewable, extendContract, acceptJob, leagueTeams, userTeamId, league } = useGameStore();
  const [view, setView] = useState<'DONE' | 'OFFERS' | 'CAREER'>('DONE');
  const [extension, setExtension] = useState<CareerLength>(3);
  const [lengths, setLengths] = useState<Record<string, CareerLength>>({});
  const board = useHallOfFame(career?.length ?? 3, career);
  if (!career) return null;
  const place = board.findIndex((e) => e.careerId === career.id) + 1;
  const team = leagueTeams.find((t) => t.id === userTeamId);
  const last = career.seasons[career.seasons.length - 1]?.year ?? career.startedYear;
  const top = () => document.getElementById('root')?.scrollTo({ top: 0 });

  if (view === 'CAREER') {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="ui-screen" style={{ paddingBottom: 0 }}>
          <button className="ui-btn" onClick={() => setView('DONE')}>
            ‹ Back
          </button>
        </div>
        <CoachCareerView />
      </div>
    );
  }

  if (view === 'OFFERS') {
    return (
      <div className="ui-screen" style={{ maxWidth: '640px', margin: '0 auto' }}>
        <button className="ui-btn" onClick={() => setView('DONE')} style={{ marginBottom: '10px' }}>
          ‹ Back
        </button>
        <div style={{ ...card, borderTop: '5px solid #2563EB' }}>
          <div style={{ fontSize: '17px', fontWeight: 900 }}>💼 Job offers</div>
          <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>
            Better programs call coaches who win. Pick the contract length: it decides which Hall of Fame board the new entry goes on.
          </div>
        </div>
        {jobOffers.map((o) => {
          const length = lengths[o.teamId] ?? 3;
          const district = league ? findDistrict(league, o.teamId)?.name : undefined;
          return (
            <div key={o.teamId} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: '15px' }}>{o.name}</div>
                  {district && <div style={{ fontSize: '12px', color: '#64748B' }}>{district}</div>}
                </div>
                <span style={{ ...pill, background: TIER_COLORS[o.tier] }}>Prestige {o.prestige}</span>
              </div>
              <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '4px' }}>{OFFER_NOTES[o.tier]}</div>
              <LengthPicker value={length} onChange={(n) => setLengths({ ...lengths, [o.teamId]: n })} />
              <button className="ui-btn ui-btn-primary ui-btn-block" style={{ marginTop: '8px', minHeight: '44px' }} onClick={() => (acceptJob(o.teamId, length), top())}>
                Accept · {length} years at {o.name}
              </button>
            </div>
          );
        })}
        <p className="ui-muted" style={{ margin: '4px 2px 16px' }}>
          You arrive for next season with that school&apos;s roster. Your Hall of Fame score for {career.startingProgram} stays as it is.
        </p>
      </div>
    );
  }

  return (
    <div className="ui-screen" style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', margin: '4px 0 12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.08em', color: '#475569' }}>{career.length}-YEAR CONTRACT COMPLETE</div>
        <div style={{ fontSize: '24px', fontWeight: 900 }}>🏁 {coachTitle(career.coachName)}</div>
        <div style={{ fontSize: '13px', color: '#475569' }}>
          {career.startingProgram} · {career.startedYear}
          {last > career.startedYear ? `–${last}` : ''}
        </div>
      </div>
      <div style={arcade}>
        <div style={{ fontSize: '11px', letterSpacing: '0.18em', color: '#22D3EE' }}>HALL OF FAME ENTRY</div>
        <div style={{ fontSize: '34px', fontWeight: 900, color: '#FACC15', textShadow: '0 0 6px rgba(250,204,21,.6)' }}>{careerPoints(career)}</div>
        {place > 0 && (
          <div style={{ fontSize: '12px', letterSpacing: '0.1em' }}>
            {ordinal(place).toUpperCase()} OF {board.length} · {career.length}-YEAR BOARD
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.06em', color: '#475569', margin: '14px 2px 6px' }}>WHAT&apos;S NEXT?</div>
      <div style={{ ...card, borderTop: '5px solid #16A34A' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ ...iconBox, background: '#DCFCE7' }}>✍️</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900 }}>Extend at {team?.name ?? career.startingProgram}</div>
            <div style={{ fontSize: '12.5px', color: '#475569' }}>
              {contractRenewable ? 'Same roster. A new contract is a new Hall of Fame entry.' : "The school board won't renew your contract."}
            </div>
          </div>
        </div>
        {contractRenewable && (
          <>
            <LengthPicker value={extension} onChange={setExtension} />
            <button className="ui-btn ui-btn-primary ui-btn-block" style={{ marginTop: '8px', minHeight: '44px' }} onClick={() => (extendContract(extension), top())}>
              Sign {extension}-year extension
            </button>
          </>
        )}
      </div>
      <Option icon="💼" tint="#DBEAFE" edge="#2563EB" title="See job offers" badge={`${jobOffers.length} offers`} text="Other schools in this world. Each contract is a new Hall of Fame entry." onClick={() => (setView('OFFERS'), top())} />
      <Option icon="📇" tint="#EDE9FE" title="Coach career" text={`Every school you have coached${careerHistory.length ? ` (${careerHistory.length + 1})` : ''}, side by side.`} onClick={() => (setView('CAREER'), top())} />
      <Option icon="🏁" tint="#FEF3C7" title="Leave this world" text="Back to the main menu: a new coach, a new world." onClick={onMainMenu} />
    </div>
  );
};

const LengthPicker: React.FC<{ value: CareerLength; onChange: (n: CareerLength) => void }> = ({ value, onChange }) => (
  <div role="group" aria-label="Contract length" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
    {CONTRACT_LENGTHS.map((n) => (
      <button
        key={n}
        aria-pressed={value === n}
        onClick={() => onChange(n)}
        style={{
          minHeight: '40px',
          borderRadius: '10px',
          fontWeight: 800,
          fontSize: '13px',
          cursor: 'pointer',
          border: `2px solid ${value === n ? '#2563EB' : '#CBD5E1'}`,
          background: value === n ? '#EFF6FF' : '#fff',
          color: value === n ? '#1D4ED8' : '#0F172A'
        }}
      >
        {n}-year contract
      </button>
    ))}
  </div>
);

const Option: React.FC<{ icon: string; tint: string; edge?: string; title: string; badge?: string; text: string; onClick: () => void }> = ({ icon, tint, edge, title, badge, text, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      width: '100%',
      textAlign: 'left',
      borderRadius: '12px',
      padding: '12px',
      marginBottom: '8px',
      cursor: 'pointer',
      border: `1px solid ${edge ?? '#CBD5E1'}`,
      background: '#fff',
      color: '#0F172A',
      boxShadow: `0 2px 0 ${edge ?? '#CBD5E1'}`
    }}
  >
    <span style={{ ...iconBox, background: tint }}>{icon}</span>
    <span>
      <span style={{ display: 'block', fontSize: '15px', fontWeight: 900 }}>
        {title} {badge && <span style={{ ...pill, background: edge ?? '#2563EB' }}>{badge}</span>}
      </span>
      <span style={{ fontSize: '12.5px', color: '#475569' }}>{text}</span>
    </span>
  </button>
);

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)',
  padding: '12px',
  marginBottom: '10px'
};
const iconBox: React.CSSProperties = { fontSize: '24px', width: '40px', height: '40px', display: 'grid', placeItems: 'center', borderRadius: '10px', flex: 'none' };
const pill: React.CSSProperties = { display: 'inline-block', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '999px', color: '#fff', whiteSpace: 'nowrap' };
const arcade: React.CSSProperties = {
  background: '#05060F',
  color: '#E2E8F0',
  borderRadius: '12px',
  padding: '14px 12px',
  fontFamily: "ui-monospace, 'Courier New', monospace",
  textAlign: 'center'
};
