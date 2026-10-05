import React from 'react';
import { Player, Position, Team } from '../types/game';
import { DESKTOP_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { DEPTH_ROWS, DEPTH_TEMPLATE, SLOT_LABELS, depthChartName, depthGroup } from '../sim/depthChart';

/** A slot on the board: a position and which starter column it is (e.g. OT column 0 = LT). */
type Slot = [Position, number];

/** A formation row: slots pinned to the left edge, centered, and pinned to the right edge. Rows never wrap. */
interface FormationRow {
  left?: Slot[];
  center?: Slot[];
  right?: Slot[];
}

// Formation rows, like a printed depth chart
const DEFENSE: FormationRow[] = [
  {
    center: [
      ['S', 0],
      ['S', 1]
    ]
  },
  {
    left: [['CB', 0]],
    center: [
      ['LB', 0],
      ['LB', 1],
      ['LB', 2]
    ],
    right: [['CB', 1]]
  },
  {
    center: [
      ['DE', 0],
      ['DT', 0],
      ['DT', 1],
      ['DE', 1]
    ]
  }
];
const OFFENSE: FormationRow[] = [
  {
    center: [
      ['OT', 0],
      ['OG', 0],
      ['C', 0],
      ['OG', 1],
      ['OT', 1]
    ]
  },
  {
    left: [['WR', 0]],
    right: [
      ['TE', 0],
      ['WR', 1]
    ]
  },
  {
    center: [
      ['QB', 0],
      ['RB', 0]
    ]
  }
];
const SPECIALISTS: FormationRow[] = [
  {
    center: [
      ['K', 0],
      ['P', 0]
    ]
  }
];

const CARD_WIDTH = 150;
const GAP = 8;
const BOARD_MIN_WIDTH = CARD_WIDTH * 5 + GAP * 4; // the offensive line, the widest row

const unavailable = (p: Player) => p.condition.injuryStatus !== 'HEALTHY' || !p.academics.isEligible;

export const DepthChartBoard: React.FC<{
  team: Team;
  onMove: (playerId: string, direction: -1 | 1) => void;
  onSelect?: (player: Player) => void;
}> = ({ team, onMove, onSelect }) => {
  const isPhone = !useMediaQuery(DESKTOP_QUERY); // mobile-first: the grid is the default layout
  const groups = new Map((Object.keys(DEPTH_TEMPLATE) as Position[]).map((pos) => [pos, depthGroup(team.roster, pos)]));

  const card = ([position, column]: Slot) => {
    const group = groups.get(position)!;
    const k = DEPTH_TEMPLATE[position].starters;
    const indexes = group.map((_, i) => i).filter((i) => i % k === column);
    const rows = Array.from({ length: DEPTH_ROWS }, (_, r) => indexes[r]);
    const reserves = indexes.slice(DEPTH_ROWS);
    const line = (i: number | undefined, row: number) => {
      if (i === undefined)
        return (
          <div key={`empty_${row}`} style={{ ...lineStyle, color: '#CBD5E1' }}>
            —
          </div>
        );
      const p = group[i];
      const out = unavailable(p);
      return (
        <div key={p.id} style={{ ...lineStyle, minHeight: isPhone ? '44px' : '22px', fontWeight: row === 0 ? 'bold' : 'normal', fontSize: isPhone ? '14px' : row === 0 ? '13px' : '12px' }}>
          <button
            onClick={() => onSelect?.(p)}
            style={{ ...nameBtn, color: out ? '#B91C1C' : row === 0 ? '#0F172A' : '#475569', ...(isPhone && { alignSelf: 'stretch' }) }}
            title={`${p.firstName} ${p.lastName} · ${p.classYear}${out ? ' · unavailable (injured or ineligible)' : ''}`}
          >
            {depthChartName(p)}
            {out && '*'}
          </button>
          <span style={{ display: 'flex', gap: isPhone ? '6px' : '2px' }}>
            <button onClick={() => onMove(p.id, -1)} disabled={i - k < 0} style={arrowBtn(i - k < 0, isPhone)} aria-label={`Move ${p.lastName} up`}>
              ▲
            </button>
            <button
              onClick={() => onMove(p.id, 1)}
              disabled={i + k >= group.length}
              style={arrowBtn(i + k >= group.length, isPhone)}
              aria-label={`Move ${p.lastName} down`}
            >
              ▼
            </button>
          </span>
        </div>
      );
    };
    return (
      <div key={`${position}_${column}`} style={isPhone ? { ...cardStyle, width: '100%' } : cardStyle}>
        <div style={cardHeader}>{SLOT_LABELS[position][column]}</div>
        <div style={{ padding: '4px 6px' }}>
          {rows.map((i, r) => line(i, r))}
          {reserves.length > 0 && (
            <div style={{ borderTop: '1px dashed #E2E8F0', marginTop: '2px', paddingTop: '2px' }}>
              <div style={{ fontSize: '12px', color: '#64748B' }}>Reserves</div>
              {reserves.map((i) => line(i, DEPTH_ROWS))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const group = (slots: Slot[] | undefined, justify: 'flex-start' | 'center' | 'flex-end') => (
    <div style={{ display: 'flex', gap: `${GAP}px`, justifyContent: justify }}>{slots?.map(card)}</div>
  );

  const section = (title: string, rows: FormationRow[]) => (
    <div id={`depth-${title.toLowerCase()}`} style={{ marginBottom: '18px', scrollMarginTop: isPhone ? '64px' : undefined }}>
      <h3 style={sectionTitle}>{title.charAt(0) + title.slice(1).toLowerCase()}</h3>
      {isPhone ? (
        // Phones: one slot card per row (two on larger phones), in formation order, with thumb-sized arrows
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: `${GAP}px` }}>
          {rows.flatMap((row) => [...(row.left ?? []), ...(row.center ?? []), ...(row.right ?? [])]).map(card)}
        </div>
      ) : (
        rows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: `${GAP}px`, marginBottom: `${GAP}px` }}>
            {group(row.left, 'flex-start')}
            {group(row.center, 'center')}
            {group(row.right, 'flex-end')}
          </div>
        ))
      )}
    </div>
  );

  return (
    // Mid-size screens scroll the formation sideways rather than breaking it; phones get the grid above
    // (phones skip the sideways scroller: it would keep the jump bar from sticking)
    <div style={{ overflowX: isPhone ? 'visible' : 'auto' }}>
      <div style={{ minWidth: isPhone ? undefined : `${BOARD_MIN_WIDTH}px` }}>
        {isPhone ? (
          <>
            {/* Phones: offense first, with a jump bar that stays on screen down the long chart */}
            <div className="ui-chips" role="navigation" aria-label="Depth chart sections" style={jumpBar}>
              {['OFFENSE', 'DEFENSE', 'SPECIALISTS'].map((s) => (
                <button key={s} className="ui-chip" onClick={() => document.getElementById(`depth-${s.toLowerCase()}`)?.scrollIntoView()}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {section('OFFENSE', OFFENSE)}
            {section('DEFENSE', DEFENSE)}
          </>
        ) : (
          <>
            {section('DEFENSE', DEFENSE)}
            {section('OFFENSE', OFFENSE)}
          </>
        )}
        {section('SPECIALISTS', SPECIALISTS)}
        <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center' }}>
          Bold = starter. ▲▼ swaps a player with the one above or below him in that slot. <span style={{ color: '#B91C1C' }}>*</span> injured or
          ineligible (the next man up plays).
        </div>
      </div>
    </div>
  );
};

const jumpBar: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  background: '#F8FAFC',
  padding: '8px 0',
  marginBottom: '8px',
  flexWrap: 'nowrap'
};

const sectionTitle: React.CSSProperties = { margin: '0 0 8px 0' };

const cardStyle: React.CSSProperties = {
  width: `${CARD_WIDTH}px`,
  flexShrink: 0,
  background: '#fff',
  border: '1px solid #CBD5E1',
  borderRadius: '4px',
  overflow: 'hidden'
};

const cardHeader: React.CSSProperties = {
  background: '#0F172A',
  color: '#fff',
  textAlign: 'center',
  fontWeight: 'bold',
  fontSize: '13px',
  padding: '3px 0',
  letterSpacing: '0.5px'
};

const lineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '4px',
  minHeight: '22px'
};

const nameBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
  flex: 1
};

/** Arrow buttons: thumb-sized on phones, compact in the desktop formation view. */
const arrowBtn = (disabled: boolean, phone: boolean): React.CSSProperties => ({
  width: phone ? '40px' : '22px',
  height: phone ? '40px' : '22px',
  padding: 0,
  fontSize: phone ? '14px' : '12px',
  lineHeight: 1,
  border: '1px solid #CBD5E1',
  borderRadius: '3px',
  background: disabled ? '#F8FAFC' : '#EFF6FF',
  color: disabled ? '#CBD5E1' : '#1D4ED8',
  cursor: disabled ? 'default' : 'pointer'
});
