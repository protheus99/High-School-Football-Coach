import React from 'react';
import { coachTitle, useGameStore } from '../store/gameStore';
import { Career, careerNationalTitles, careerPoints, careerTitles } from '../sim/careerScore';
import { ordinal } from '../utils/format';
import { useHallOfFame } from '../utils/useHallOfFame';
import { stateSchool } from '../sim/league';
import { TitleCounts } from './HallOfFameBoard';
import { StatePennant, UsFlag } from './ui/TitleMarks';

const record = (c: Career) => {
  const wins = c.seasons.reduce((n, s) => n + s.wins + s.playoffWins, 0);
  const losses = c.seasons.reduce((n, s) => n + s.losses, 0);
  return { wins, losses };
};

/**
 * Team › Career: the coach's whole career in this save, one card per contract (school, years, record, titles,
 * starting prestige, score and Hall of Fame place), newest first, with lifetime totals on top.
 */
export const CoachCareerView: React.FC = () => {
  const { career, careerHistory } = useGameStore();
  if (!career) {
    return (
      <div className="ui-screen">
        <p className="ui-muted">Classic games don&apos;t keep a coaching career. Start a career from New Game to track every school you coach.</p>
      </div>
    );
  }
  const contracts = [...careerHistory, career];
  const totals = contracts.reduce(
    (t, c) => {
      const r = record(c);
      return {
        wins: t.wins + r.wins,
        losses: t.losses + r.losses,
        titles: t.titles + careerTitles(c),
        national: t.national + careerNationalTitles(c),
        signed: t.signed + c.seasons.reduce((n, s) => n + s.collegeSignees, 0),
        seasons: t.seasons + c.seasons.length
      };
    },
    { wins: 0, losses: 0, titles: 0, national: 0, signed: 0, seasons: 0 }
  );
  const schools = new Set(contracts.map((c) => c.startingSchool)).size;
  const firstYear = contracts[0].startedYear;
  const lastYear = Math.max(career.startedYear, ...contracts.flatMap((c) => c.seasons.map((s) => s.year)));

  return (
    <div className="ui-screen" style={{ maxWidth: '640px' }}>
      <section aria-label="Coach career" style={{ ...card, background: 'linear-gradient(135deg, #1E3A8A, #4C1D95)', color: '#fff', border: 'none' }}>
        <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', opacity: 0.85 }}>COACH CAREER</div>
        <div style={{ fontSize: '22px', fontWeight: 900 }}>📇 {coachTitle(career.coachName)}</div>
        <div style={{ fontSize: '13px', opacity: 0.9 }}>
          {schools} {schools === 1 ? 'school' : 'schools'} · {totals.seasons} {totals.seasons === 1 ? 'season' : 'seasons'} · {firstYear}
          {lastYear > firstYear ? `–${lastYear}` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginTop: '10px' }}>
          <Tile label="RECORD" value={`${totals.wins}-${totals.losses}`} />
          <Tile
            label="TITLES"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <StatePennant state={career.state} /> {totals.titles}
              </span>
            }
          />
          <Tile
            label="NATIONAL"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <UsFlag width={17} /> {totals.national}
              </span>
            }
          />
          <Tile label="SIGNED" value={String(totals.signed)} />
        </div>
      </section>
      {[...contracts].reverse().map((c) => (
        <ContractCard key={c.id} contract={c} current={c.id === career.id} />
      ))}
    </div>
  );
};

const ContractCard: React.FC<{ contract: Career; current: boolean }> = ({ contract: c, current }) => {
  const board = useHallOfFame(c.length, c);
  const place = board.findIndex((e) => e.careerId === c.id) + 1;
  const { wins, losses } = record(c);
  const color = stateSchool(c.state, c.startingSchool)?.primaryColor ?? '#2563EB';
  const last = c.seasons[c.seasons.length - 1]?.year;
  const years = `${c.startedYear}${last && last > c.startedYear ? `–${last}` : ''}`;
  return (
    <section aria-label={c.startingProgram} style={{ ...card, borderLeft: `6px solid ${color}`, ...(current ? { background: '#F8FAFF' } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
        <div style={{ fontWeight: 900, fontSize: '15px', minWidth: 0 }}>{c.startingProgram}</div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', whiteSpace: 'nowrap' }}>Start prestige {c.startingPrestige ?? '—'}</div>
      </div>
      <div style={{ fontSize: '12.5px', color: '#475569' }}>
        {years} · {c.length}-year contract{current ? ' · coaching now' : ''}
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '20px', fontWeight: 900 }}>{c.seasons.length ? `${wins}-${losses}` : 'First season'}</span>
        <TitleCounts state={c.state} titles={careerTitles(c)} nationalTitles={careerNationalTitles(c)} />
        <span style={{ marginLeft: 'auto', background: '#05060F', color: '#FACC15', fontFamily: "ui-monospace, 'Courier New', monospace", fontWeight: 900, borderRadius: '8px', padding: '4px 8px', fontSize: '13px', whiteSpace: 'nowrap' }}>
          {careerPoints(c)}
          {place > 0 && c.seasons.length >= c.length ? (
            <span style={{ color: '#22D3EE' }}>
              {' '}
              · {ordinal(place).toUpperCase()} {c.length}-YEAR
            </span>
          ) : (
            <span style={{ color: '#94A3B8' }}> · {c.seasons.length} OF {c.length}</span>
          )}
        </span>
      </div>
    </section>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ background: 'rgba(255,255,255,.14)', borderRadius: '10px', padding: '7px 4px', textAlign: 'center' }}>
    <div style={{ fontSize: '9.5px', fontWeight: 800, opacity: 0.85 }}>{label}</div>
    <div style={{ fontSize: '15px', fontWeight: 900, whiteSpace: 'nowrap' }}>{value}</div>
  </div>
);

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)',
  padding: '12px',
  marginBottom: '10px'
};
