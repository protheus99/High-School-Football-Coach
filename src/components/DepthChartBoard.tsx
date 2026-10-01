import React from 'react';
import { Player, Position, Team } from '../types/game';
import { DEPTH_ROWS, DEPTH_TEMPLATE, SLOT_LABELS, depthChartName, depthGroup } from '../sim/depthChart';

/** A slot on the board: a position and which starter column it is (e.g. OT column 0 = LT). */
type Slot = [Position, number];

// Formation rows, left to right, like a printed depth chart
const DEFENSE: Slot[][] = [
  [['S', 0], ['S', 1]],
  [['CB', 0], ['LB', 0], ['LB', 1], ['LB', 2], ['CB', 1]],
  [['DE', 0], ['DT', 0], ['DT', 1], ['DE', 1]]
];
const OFFENSE: Slot[][] = [
  [['WR', 0], ['OT', 0], ['OG', 0], ['C', 0], ['OG', 1], ['OT', 1], ['WR', 1]],
  [['QB', 0], ['RB', 0], ['TE', 0]]
];
const SPECIALISTS: Slot[][] = [[['K', 0], ['P', 0]]];

const unavailable = (p: Player) => p.condition.injuryStatus !== 'HEALTHY' || !p.academics.isEligible;

export const DepthChartBoard: React.FC<{
  team: Team;
  onMove: (playerId: string, direction: -1 | 1) => void;
  onSelect?: (player: Player) => void;
}> = ({ team, onMove, onSelect }) => {
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
        <div key={p.id} style={{ ...lineStyle, fontWeight: row === 0 ? 'bold' : 'normal', fontSize: row === 0 ? '13px' : '12px' }}>
          <button
            onClick={() => onSelect?.(p)}
            style={{ ...nameBtn, color: out ? '#B91C1C' : row === 0 ? '#0F172A' : '#475569' }}
            title={`${p.firstName} ${p.lastName} · ${p.classYear}${out ? ' · unavailable (injured or ineligible)' : ''}`}
          >
            {depthChartName(p)}
            {out && '*'}
          </button>
          <span style={{ display: 'flex', gap: '2px' }}>
            <button onClick={() => onMove(p.id, -1)} disabled={i - k < 0} style={arrowBtn(i - k < 0)} aria-label={`Move ${p.lastName} up`}>
              ▲
            </button>
            <button onClick={() => onMove(p.id, 1)} disabled={i + k >= group.length} style={arrowBtn(i + k >= group.length)} aria-label={`Move ${p.lastName} down`}>
              ▼
            </button>
          </span>
        </div>
      );
    };
    return (
      <div key={`${position}_${column}`} style={cardStyle}>
        <div style={cardHeader}>{SLOT_LABELS[position][column]}</div>
        <div style={{ padding: '4px 6px' }}>
          {rows.map((i, r) => line(i, r))}
          {reserves.length > 0 && (
            <div style={{ borderTop: '1px dashed #E2E8F0', marginTop: '2px', paddingTop: '2px' }}>
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>Reserves</div>
              {reserves.map((i) => line(i, DEPTH_ROWS))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const section = (title: string, rows: Slot[][]) => (
    <div style={{ marginBottom: '18px' }}>
      <h3 style={sectionTitle}>{title}</h3>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          {row.map(card)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {section('DEFENSE', DEFENSE)}
      {section('OFFENSE', OFFENSE)}
      {section('SPECIALISTS', SPECIALISTS)}
      <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
        Bold = starter. ▲▼ swaps a player with the one above or below him in that slot. <span style={{ color: '#B91C1C' }}>*</span> injured or
        ineligible (the next man up plays).
      </div>
    </div>
  );
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: '15px',
  fontWeight: 900,
  letterSpacing: '1px',
  color: '#0F172A',
  borderBottom: '2px solid #0F172A',
  paddingBottom: '2px',
  textAlign: 'right'
};

const cardStyle: React.CSSProperties = {
  width: '168px',
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

const arrowBtn = (disabled: boolean): React.CSSProperties => ({
  width: '20px',
  height: '20px',
  padding: 0,
  fontSize: '10px',
  lineHeight: '20px',
  border: '1px solid #CBD5E1',
  borderRadius: '3px',
  background: disabled ? '#F8FAFC' : '#EFF6FF',
  color: disabled ? '#CBD5E1' : '#1D4ED8',
  cursor: disabled ? 'default' : 'pointer'
});
