import React, { useState } from 'react';
import { FeederOutcome, Player, PotentialGrade, ProspectSource } from '../types/game';
import { POTENTIAL_COLORS } from './DepthChartBoard';

// ---------------------------------------------------------------------------
// Prospects › Students: the last signing day as a moment. Four count tiles, the newcomers as cards (rating and
// potential, a tap opens the player), and the prospects lost to rivals grouped by school, each with the potential
// the coach had seen in brackets ("Gabriel Rios (A)"; none when he was never evaluated).
// ---------------------------------------------------------------------------

const SHOWN_NEWCOMERS = 3;

/** Where one newcomer came from. */
const SOURCE: Record<ProspectSource, string> = {
  FEEDER_MIDDLE_SCHOOL: 'Middle school',
  SEVEN_ON_SEVEN: '7-on-7 athlete',
  MOVE_IN: 'Move-in',
  STAR_RECRUIT: 'Out-of-area star',
  OUT_OF_DISTRICT: 'Zoned elsewhere',
  TRYOUT: 'Walk-on'
};

const potentialTag = (grade: PotentialGrade) => (
  <span style={{ ...POTENTIAL_COLORS[grade], borderRadius: '5px', padding: '0 5px', fontWeight: 800, fontSize: '11px' }}>{grade}</span>
);

export const SigningDayBoard: React.FC<{
  year: number;
  results: FeederOutcome[];
  roster: Player[];
  onOpenPlayer: (player: Player) => void;
}> = ({ year, results, roster, onOpenPlayer }) => {
  const [allNewcomers, setAllNewcomers] = useState(false);
  const joined = results
    .filter((r) => r.outcome === 'JOINED' || r.outcome === 'JV_TEAM')
    .map((r) => ({ r, player: roster.find((p) => p.id === r.playerId) }))
    .sort((a, b) => (b.player?.overallRating ?? b.r.overall ?? 0) - (a.player?.overallRating ?? a.r.overall ?? 0));
  const toRivals = results.filter((r) => r.outcome === 'OTHER_SCHOOL');
  const tiles = [
    { label: 'JOINED', count: joined.length, background: '#DCFCE7', color: '#166534' },
    { label: 'TO RIVALS', count: toRivals.length, background: '#FFE4E6', color: '#9F1239' },
    { label: 'MOVED AWAY', count: results.filter((r) => r.outcome === 'LEFT_AREA').length, background: '#F1F5F9', color: '#475569' },
    { label: 'NOT PLAYING', count: results.filter((r) => r.outcome === 'NOT_PLAYING').length, background: '#F1F5F9', color: '#475569' }
  ];
  // Rival schools, the ones that took the most first
  const bySchool = new Map<string, FeederOutcome[]>();
  toRivals.forEach((r) => {
    const school = r.destinationName ?? 'Another school';
    bySchool.set(school, [...(bySchool.get(school) ?? []), r]);
  });
  const schools = [...bySchool.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const shown = allNewcomers ? joined : joined.slice(0, SHOWN_NEWCOMERS);

  return (
    <div style={board}>
      <div style={{ fontWeight: 800, fontSize: '15px' }}>✍️ Signing Day {year}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ background: t.background, color: t.color, borderRadius: '8px', padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{t.count}</div>
            <div style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.03em' }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={heading}>Your newcomers</div>
      {joined.length === 0 && <div style={muted}>Nobody joined from this class.</div>}
      {shown.map(({ r, player }) => {
        const potential = player?.potential ?? r.potential;
        const card = (
          <>
            <span style={posChip}>{r.position}</span>
            <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <b style={{ fontSize: '13.5px' }}>{r.prospectName}</b>
              <br />
              <span style={muted}>
                {SOURCE[r.source]}
                {r.outcome === 'JV_TEAM' ? ' · JV' : ''}
              </span>
            </span>
            <span style={{ textAlign: 'right', flex: '0 0 auto' }}>
              <b style={{ fontSize: '17px', fontVariantNumeric: 'tabular-nums' }}>{player?.overallRating ?? r.overall ?? '—'}</b>
              {potential && (
                <>
                  <br />
                  <span style={{ fontSize: '11px', color: '#64748B' }}>{potential} potential</span>
                </>
              )}
            </span>
          </>
        );
        return player ? (
          <button key={r.prospectId} onClick={() => onOpenPlayer(player)} style={{ ...newcomer, cursor: 'pointer' }} aria-label={`${r.prospectName}, open player card`}>
            {card}
          </button>
        ) : (
          <div key={r.prospectId} style={newcomer}>
            {card}
          </div>
        );
      })}
      {joined.length > SHOWN_NEWCOMERS && (
        <button onClick={() => setAllNewcomers(!allNewcomers)} style={moreBtn}>
          {allNewcomers ? 'Show fewer' : `+ ${joined.length - SHOWN_NEWCOMERS} more ›`}
        </button>
      )}

      {schools.length > 0 && (
        <>
          <div style={heading}>Lost to rivals</div>
          {schools.map(([school, lost]) => (
            <div key={school} style={lostRow}>
              <b>
                {school} ({lost.length})
              </b>
              :{' '}
              {lost.map((r, i) => (
                <React.Fragment key={r.prospectId}>
                  {i > 0 && ', '}
                  {r.prospectName}
                  {r.potential && <> ({potentialTag(r.potential)})</>}
                </React.Fragment>
              ))}
            </div>
          ))}
          <div style={muted}>A letter is the potential you had seen; prospects you never evaluated show none.</div>
        </>
      )}
    </div>
  );
};

const board: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  borderLeft: '5px solid #16A34A',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)',
  padding: '12px',
  marginBottom: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};
const heading: React.CSSProperties = { fontWeight: 800, fontSize: '13px', color: '#0F172A', marginTop: '2px' };
const muted: React.CSSProperties = { fontSize: '12px', color: '#64748B' };
const posChip: React.CSSProperties = {
  flex: '0 0 auto',
  minWidth: '34px',
  textAlign: 'center',
  background: '#0F172A',
  color: '#fff',
  borderRadius: '6px',
  padding: '3px 4px',
  fontWeight: 800,
  fontSize: '11.5px'
};
const newcomer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  padding: '8px 10px',
  font: 'inherit',
  color: 'inherit'
};
const moreBtn: React.CSSProperties = {
  alignSelf: 'center',
  minHeight: '36px',
  background: 'none',
  border: 'none',
  color: '#1D4ED8',
  fontWeight: 700,
  fontSize: '13px',
  cursor: 'pointer'
};
const lostRow: React.CSSProperties = { fontSize: '12.5px', color: '#881337', background: '#FFF1F2', borderRadius: '8px', padding: '7px 9px', lineHeight: 1.5 };
