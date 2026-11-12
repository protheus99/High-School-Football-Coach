import React from 'react';
import { useGameStore } from '../store/gameStore';
import { Team } from '../types/game';
import { recordText } from '../sim/seasonRecord';

/** A school color mixed with white: pct of the color (8 = a pale wash). Falls back to slate for a color it can't read. */
function tint(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [51, 65, 85];
  const mix = rgb.map((c) => Math.round(255 + (c - 255) * (pct / 100)));
  return `rgb(${mix.join(', ')})`;
}

/**
 * The top of the Hub: one card washed in the school's color with the full name and the season's record, and the
 * national rank in front when the team is in the national top 25 ("#17 Lakewood St. Edward (2-0)").
 */
export const HubTeamBanner: React.FC<{ team: Team }> = ({ team }) => {
  const { polls, playoffBracket } = useGameStore();
  const national = polls?.nationalTop25?.find((e) => e.teamId === team.id)?.rank;
  return (
    <div
      style={{
        background: tint(team.primaryColor, 8),
        border: `1px solid ${tint(team.primaryColor, 22)}`,
        borderRadius: '12px',
        padding: '9px 12px',
        marginBottom: '14px',
        boxShadow: '0 2px 8px rgba(15,23,42,.06)'
      }}
    >
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900, lineHeight: 1.2, color: '#0F172A', overflowWrap: 'anywhere', textWrap: 'balance' }}>
        {national !== undefined && <span style={{ color: '#64748B', fontWeight: 800, fontSize: '0.82em', marginRight: '3px' }}>#{national}</span>}
        {team.name} <span style={{ fontVariantNumeric: 'tabular-nums' }}>({recordText(team, playoffBracket)})</span>
      </h1>
    </div>
  );
};
