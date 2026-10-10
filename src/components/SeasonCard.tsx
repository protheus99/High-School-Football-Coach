import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Team } from '../types/game';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** A rank's change since last week: "▲ 3 this week" (green), "▼ 2 this week" (red), or nothing to compare yet. */
function movement(now: number, before: number | undefined): { text: string; color: string } {
  if (before === undefined) return { text: '', color: '#64748B' };
  const delta = before - now;
  if (delta === 0) return { text: 'No change', color: '#64748B' };
  return delta > 0 ? { text: `▲ ${delta} this week`, color: '#15803D' } : { text: `▼ ${-delta} this week`, color: '#B91C1C' };
}

/**
 * The Hub's season at a glance: the record (district record in parentheses) and district standing, then the
 * state and national ranks with this week's movement.
 */
export const SeasonCard: React.FC<{ team: Team; standingRank?: number; districtName: string }> = ({ team, standingRank, districtName }) => {
  const { polls, league } = useGameStore();
  const state = league?.state ?? 'Texas';
  const ranks = polls?.teamRanks?.[team.id];
  const before = polls?.previousTeamRanks?.[team.id];
  const { wins, losses, districtWins, districtLosses } = team.record;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <b style={{ fontSize: '22px', fontWeight: 800 }}>
          {wins}-{losses} ({districtWins}-{districtLosses})
        </b>
        {standingRank !== undefined && (
          <span style={{ fontSize: '13px', color: '#475569' }}>
            {ordinal(standingRank)} in {districtName}
          </span>
        )}
      </div>
      {ranks && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
          <RankTile label={state.toUpperCase()} rank={ranks.state} move={movement(ranks.state, before?.state)} background="#EFF6FF" color="#1E40AF" />
          <RankTile label="NATIONAL" rank={ranks.national} move={movement(ranks.national, before?.national)} background="#F5F3FF" color="#5B21B6" />
        </div>
      )}
    </div>
  );
};

const RankTile: React.FC<{ label: string; rank: number; move: { text: string; color: string }; background: string; color: string }> = ({ label, rank, move, background, color }) => (
  <div style={{ background, borderRadius: '10px', padding: '8px 10px' }}>
    <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.02em', color }}>{label}</div>
    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>#{rank}</div>
    {move.text && <div style={{ fontSize: '12px', fontWeight: 700, color: move.color }}>{move.text}</div>}
  </div>
);

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '12px',
  marginTop: '8px',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)'
};
