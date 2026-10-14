import React, { useState } from 'react';
import { userTrainingBoosts, useGameStore } from '../store/gameStore';
import { coachBoosted } from '../sim/training';
import { Player, Position } from '../types/game';
import { POTENTIAL_COLORS } from './DepthChartBoard';

// ---------------------------------------------------------------------------
// Team › Practice: what practice has added up to this year. The team's totals on top, then one row per position
// group with its overall gain; a tap opens the group's players, biggest gain first, with what explains the gains:
// his potential (higher potential learns faster), whether he starts, and whether a coach adds to his training.
// ---------------------------------------------------------------------------

const GROUPS: { label: string; positions: Position[] }[] = [
  { label: 'QB', positions: ['QB'] },
  { label: 'RB', positions: ['RB'] },
  { label: 'WR / TE', positions: ['WR', 'TE'] },
  { label: 'OL', positions: ['OT', 'OG', 'C'] },
  { label: 'DL', positions: ['DE', 'DT'] },
  { label: 'LB', positions: ['LB'] },
  { label: 'DB', positions: ['CB', 'S'] },
  { label: 'K / P', positions: ['K', 'P'] }
];

export const PracticeSeasonCard: React.FC = () => {
  const state = useGameStore();
  const { practiceSeason: season, currentYear, districtTeams, userTeamId, openPlayerCard } = state;
  const [open, setOpen] = useState<string | null>(null);
  const team = districtTeams.find((t) => t.id === userTeamId);
  if (!team) return null;
  const thisYear = season?.year === currentYear ? season : null;
  const boosts = userTrainingBoosts(state, team);
  const gainOf = (p: Player) => thisYear?.players[p.id];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: '15px' }}>📈 This season&apos;s practice</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
          <Tile value={`+${thisYear?.points ?? 0}`} label="ATTRIBUTE PTS" background="#DBEAFE" color="#1E40AF" />
          <Tile value={`+${thisYear?.overall ?? 0}`} label="OVERALL" background="#DCFCE7" color="#166534" />
          <Tile value={`${thisYear?.weeks ?? 0}`} label="WEEKS" background="#F1F5F9" color="#475569" />
        </div>
        <div style={muted}>
          {thisYear ? 'Gains stay all season. Fatigue and injury risk are week to week.' : 'Nothing yet this year: the totals start with the first week of practice.'}
        </div>
      </div>

      {GROUPS.map((g) => {
        const players = team.roster.filter((p) => g.positions.includes(p.position));
        if (players.length === 0) return null;
        const overall = players.reduce((n, p) => n + (gainOf(p)?.overall ?? 0), 0);
        const gained = players
          .filter((p) => (gainOf(p)?.points ?? 0) > 0)
          .sort((a, b) => (gainOf(b)!.overall - gainOf(a)!.overall) || (gainOf(b)!.points - gainOf(a)!.points));
        const isOpen = open === g.label;
        return (
          <div key={g.label} style={{ ...group, ...(isOpen && { border: '2px solid #2563EB' }) }}>
            <button onClick={() => setOpen(isOpen ? null : g.label)} aria-expanded={isOpen} style={groupHead}>
              <b style={{ fontSize: '13.5px' }}>
                {g.label} · {players.length} {players.length === 1 ? 'player' : 'players'}
              </b>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ ...chip, ...(overall > 0 ? up : flat) }}>+{overall} overall</span>
                <span aria-hidden="true">{isOpen ? '▾' : '›'}</span>
              </span>
            </button>
            {isOpen && (
              <>
                {gained.map((p) => {
                  const gain = gainOf(p)!;
                  return (
                    <button key={p.id} onClick={() => openPlayerCard(p.id)} style={playerRow}>
                      <span style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', textAlign: 'left' }}>
                        <span>
                          {p.position} {p.firstName.charAt(0)}. {p.lastName}
                        </span>
                        <span style={{ ...tag, ...POTENTIAL_COLORS[p.potential] }} title={`Potential ${p.potential}: higher potential learns faster`}>
                          {p.potential}
                        </span>
                        {p.depthChartTier === 1 && <span style={{ ...tag, background: '#E0E7FF', color: '#3730A3' }}>Starter</span>}
                        {coachBoosted(p, boosts) && (
                          <span style={{ ...tag, background: '#F3E8FF', color: '#6B21A8' }} title="A coach adds to his training">
                            🧑‍🏫 Coach
                          </span>
                        )}
                      </span>
                      <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
                        <b style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {gain.start} → {gain.start + gain.overall}
                        </b>{' '}
                        <span style={{ ...chip, ...(gain.overall > 0 ? up : flat) }}>{gain.overall > 0 ? `+${gain.overall}` : `+${gain.points} pts`}</span>
                      </span>
                    </button>
                  );
                })}
                {players.length > gained.length && (
                  <div style={{ ...muted, padding: '4px 0', borderTop: '1px solid #F1F5F9' }}>
                    {gained.length === 0 ? 'No gains yet' : `${players.length - gained.length} more, no change yet`}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      <div style={muted}>
        Higher potential learns faster (A+ the most, D the least). Starters train like everyone else; position coaches and the JV staff add to their
        players&apos; gains.
      </div>
    </div>
  );
};

const Tile: React.FC<{ value: string; label: string; background: string; color: string }> = ({ value, label, background, color }) => (
  <div style={{ background, color, borderRadius: '8px', padding: '6px 4px', textAlign: 'center' }}>
    <div style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.03em' }}>{label}</div>
  </div>
);

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  borderLeft: '5px solid #2563EB',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};
const group: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '4px 10px', display: 'flex', flexDirection: 'column' };
const groupHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  minHeight: '40px',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: '#0F172A',
  cursor: 'pointer',
  width: '100%'
};
const playerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  minHeight: '36px',
  padding: '4px 0',
  borderTop: '1px solid #F1F5F9',
  background: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  borderBottom: 'none',
  font: 'inherit',
  fontSize: '12.5px',
  color: '#0F172A',
  cursor: 'pointer',
  width: '100%'
};
const chip: React.CSSProperties = { borderRadius: '999px', padding: '1px 8px', fontWeight: 800, fontSize: '11.5px', whiteSpace: 'nowrap' };
const up: React.CSSProperties = { background: '#DCFCE7', color: '#166534' };
const flat: React.CSSProperties = { background: '#F1F5F9', color: '#475569' };
const tag: React.CSSProperties = { borderRadius: '5px', padding: '0 5px', fontWeight: 800, fontSize: '10.5px' };
const muted: React.CSSProperties = { fontSize: '12px', color: '#64748B' };
