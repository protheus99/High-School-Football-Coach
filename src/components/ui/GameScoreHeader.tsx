import React from 'react';
import { GameSimulationState, Team } from '../../types/game';
import { lineScore, teamAbbreviation } from '../../sim/lineScore';
import { DESKTOP_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';

/**
 * The final score, ESPN style: the away team on the left and the home team on the right, each with its record, the
 * winner's score dark with an arrow pointing at it, and the points by quarter in the middle. Both sides get the same
 * space; long school names are trimmed (the full name shows on hover and to screen readers).
 */
export const GameScoreHeader: React.FC<{ game: GameSimulationState; awayRecord?: string; homeRecord?: string }> = ({ game, awayRecord, homeRecord }) => {
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

  const teamBlock = (team: Team, record: string | undefined, side: 'home' | 'away') => (
    <div style={{ minWidth: 0, textAlign: side === 'away' ? 'left' : 'right' }}>
      <div title={team.name} style={{ fontWeight: 800, fontSize: '15px', lineHeight: 1.3, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {team.name}
      </div>
      {record && <div style={{ fontSize: '12px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{record}</div>}
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

  return desktop ? (
    // One row: away team, away score, the line score, home score, home team (fixed score columns, equal team columns)
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 84px auto 84px minmax(0, 1fr)', alignItems: 'center', gap: '12px', padding: '14px 12px', background: '#F8FAFC', borderRadius: '10px', marginBottom: '14px' }}>
      {teamBlock(away, awayRecord, 'away')}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
        <span style={scoreStyle('away')}>{awayScore}</span>
        {arrow('away')}
      </div>
      {table}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {arrow('home')}
        <span style={scoreStyle('home')}>{homeScore}</span>
      </div>
      {teamBlock(home, homeRecord, 'home')}
    </div>
  ) : (
    // Phones: the two teams and their scores in equal halves, the line score underneath
    <div style={{ padding: '12px 10px', background: '#F8FAFC', borderRadius: '10px', marginBottom: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start', gap: '4px 16px' }}>
        {teamBlock(away, awayRecord, 'away')}
        {teamBlock(home, homeRecord, 'home')}
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
