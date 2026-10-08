import React from 'react';
import { Player, Team } from '../types/game';
import { getPlayerPrimaryStatLine } from '../sim/playerRankingEngine';
import { DEFENSE_NAMES } from '../sim/gamePlan';

/**
 * The opponent on film, right on the Hub's game card (it used to be a separate Study film pop-up): their tendencies
 * and the three players to watch.
 */
export const ScoutingReport: React.FC<{ opponent: Team }> = ({ opponent }) => {
  const starter = (positions: string[]) => opponent.roster.find((p) => positions.includes(p.position) && p.depthChartTier === 1);
  const passThreat = starter(['QB']) ?? opponent.roster[0];
  const groundThreat = starter(['RB']) ?? opponent.roster[1];
  const disruptor = starter(['LB', 'DE']) ?? opponent.roster[2];
  const passHeavy = opponent.schemeOffense === 'AIR_RAID' || opponent.schemeOffense === 'SPREAD';

  const tendencies = [
    passHeavy ? 'Pass 68% · Run 32%' : 'Run 74% · Pass 26%',
    `3rd and short: ${passHeavy ? 'quick slant / RPO' : 'power run'}`,
    `${DEFENSE_NAMES[opponent.schemeDefense]} defense`,
    opponent.staff.defensiveCoordinator.schemeDiscipline > 75 ? 'Blitzes on 3rd down' : 'Plays it safe in coverage'
  ];
  const watch = (label: string, color: string, p: Player | undefined) =>
    p && (
      <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
        <span style={{ fontWeight: 700, color }}>{label}:</span>{' '}
        <b>
          {p.position} {p.firstName[0]}. {p.lastName}
        </b>{' '}
        <span style={{ color: '#475569' }}>
          ({p.classYear}) · {p.stats.gamesPlayed > 0 ? getPlayerPrimaryStatLine(p) : p.recruiting.starRating > 0 ? `${'★'.repeat(p.recruiting.starRating)} recruit, no film yet this season` : 'no film yet this season'}
        </span>
      </div>
    );

  return (
    <div style={{ background: '#fff', border: '1px solid #DBEAFE', borderRadius: '8px', padding: '8px 10px', marginTop: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A', marginBottom: '4px' }}>🎥 On film</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
        {tendencies.map((t) => (
          <span key={t} style={{ fontSize: '12px', background: '#F1F5F9', color: '#334155', borderRadius: '999px', padding: '2px 8px' }}>
            {t}
          </span>
        ))}
      </div>
      {watch('Pass threat', '#1E40AF', passThreat)}
      {watch('Ground threat', '#166534', groundThreat)}
      {watch('Disruptor', '#991B1B', disruptor)}
    </div>
  );
};
