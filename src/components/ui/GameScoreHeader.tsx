import React from 'react';
import { GameSimulationState, Team } from '../../types/game';
import { lineScore, teamAbbreviation } from '../../sim/lineScore';
import { luminance } from '../../utils/color';
import { DESKTOP_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';

/** A logo stand-in: the school's initials on its primary color. */
const TeamBadge: React.FC<{ team: Team; label: string; size: number }> = ({ team, label, size }) => {
  const light = (luminance(team.primaryColor) ?? 0) > 0.55;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: '50%',
        background: team.primaryColor,
        border: `2px solid ${team.secondaryColor || '#CBD5E1'}`,
        color: light ? '#0F172A' : '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size >= 44 ? '13px' : '11px',
        fontWeight: 800,
        letterSpacing: '0.5px'
      }}
    >
      {label}
    </span>
  );
};

/**
 * The final score, ESPN style: the away team on the left and the home team on the right, each with its record, the
 * winner's score dark with an arrow pointing at it, and the points by quarter in the middle.
 */
export const GameScoreHeader: React.FC<{ game: GameSimulationState; status: string; awayRecord?: string; homeRecord?: string }> = ({
  game,
  status,
  awayRecord,
  homeRecord
}) => {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { awayTeam: away, homeTeam: home, awayScore, homeScore } = game;
  const line = lineScore(game);
  // Initials can collide ("St. Mary's" and "Santa Monica"): fall back to the first letters of each name
  let awayLabel = teamAbbreviation(away.name);
  let homeLabel = teamAbbreviation(home.name);
  if (awayLabel === homeLabel) {
    awayLabel = away.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
    homeLabel = home.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  }
  const winner = homeScore === awayScore ? null : homeScore > awayScore ? 'home' : 'away';
  const scoreStyle = (side: 'home' | 'away'): React.CSSProperties => ({
    fontSize: desktop ? '44px' : '36px',
    fontWeight: 800,
    lineHeight: 1,
    color: winner && winner !== side ? '#64748B' : '#0F172A'
  });
  const arrow = (side: 'home' | 'away') =>
    winner === side ? (
      // A solid triangle pointing at the winning score (text arrows render tiny in some fonts)
      <svg width="12" height="16" viewBox="0 0 12 16" role="img" aria-label="winner" style={{ flex: '0 0 auto' }}>
        <path d={side === 'home' ? 'M1 1 L11 8 L1 15 Z' : 'M11 1 L1 8 L11 15 Z'} fill="#0F172A" />
      </svg>
    ) : null;

  const teamBlock = (team: Team, label: string, record: string | undefined, side: 'home' | 'away') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: side === 'away' ? 'row' : 'row-reverse', minWidth: 0 }}>
      <TeamBadge team={team} label={label} size={desktop ? 48 : 40} />
      <div style={{ minWidth: 0, textAlign: side === 'away' ? 'left' : 'right' }}>
        <div style={{ fontWeight: 800, fontSize: '15px', lineHeight: 1.2, color: '#0F172A', overflowWrap: 'anywhere' }}>{team.name}</div>
        {record && <div style={{ fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>{record}</div>}
      </div>
    </div>
  );

  const table = (
    <table style={{ borderCollapse: 'collapse', fontSize: '13px', margin: '0 auto' }} aria-label="Points by quarter">
      <thead>
        <tr>
          <th style={{ ...cell, textAlign: 'left' }} />
          {line.periods.map((p) => (
            <th key={p} style={{ ...cell, color: '#475569', fontWeight: 600 }}>
              {p}
            </th>
          ))}
          <th style={{ ...cell, color: '#475569', fontWeight: 600 }}>T</th>
        </tr>
      </thead>
      <tbody>
        {(
          [
            [awayLabel, line.away, awayScore],
            [homeLabel, line.home, homeScore]
          ] as const
        ).map(([label, points, total], row) => (
          <tr key={label} style={{ borderTop: row === 1 ? '1px solid #E2E8F0' : undefined }}>
            <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 700, color: '#0F172A' }}>
              {label}
            </th>
            {points.map((p, i) => (
              <td key={i} style={{ ...cell, color: '#334155' }}>
                {p}
              </td>
            ))}
            <td style={{ ...cell, fontWeight: 800, color: '#0F172A' }}>{total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const center = (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>{status}</div>
      {desktop && table}
    </div>
  );

  return desktop ? (
    // One row: away team, away score, the line score, home score, home team
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto minmax(0, 1fr)', alignItems: 'center', gap: '16px', padding: '14px 12px', background: '#F8FAFC', borderRadius: '10px', marginBottom: '14px' }}>
      {teamBlock(away, awayLabel, awayRecord, 'away')}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={scoreStyle('away')}>{awayScore}</span>
        {arrow('away')}
      </div>
      {center}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {arrow('home')}
        <span style={scoreStyle('home')}>{homeScore}</span>
      </div>
      {teamBlock(home, homeLabel, homeRecord, 'home')}
    </div>
  ) : (
    // Phones: the status on top, the two teams and their scores side by side, the line score underneath
    <div style={{ padding: '12px 10px', background: '#F8FAFC', borderRadius: '10px', marginBottom: '14px' }}>
      {center}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start', gap: '8px 12px' }}>
        {teamBlock(away, awayLabel, awayRecord, 'away')}
        {teamBlock(home, homeLabel, homeRecord, 'home')}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={scoreStyle('away')}>{awayScore}</span>
          {arrow('away')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
          {arrow('home')}
          <span style={scoreStyle('home')}>{homeScore}</span>
        </div>
      </div>
      <div style={{ marginTop: '10px', overflowX: 'auto' }}>{table}</div>
    </div>
  );
};

const cell: React.CSSProperties = { padding: '4px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };
