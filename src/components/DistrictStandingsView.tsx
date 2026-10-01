import React from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';

export const DistrictStandingsView: React.FC = () => {
  const { districtTeams } = useGameStore();
  const standings = calculateDistrictStandings(districtTeams);

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>District 26-6A Standings</h2>
      <p style={{ color: '#6B7280', fontSize: '13px' }}>Top 4 teams qualify for the 16-Team Regional State Tournament. Tiebreakers cap point differentials at &plusmn;17 per game.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
        <thead>
          <tr style={{ background: '#F3F4F6', borderBottom: '2px solid #E5E7EB' }}>
            <th style={{ padding: '10px' }}>Seed</th>
            <th style={{ padding: '10px' }}>School</th>
            <th style={{ padding: '10px' }}>District</th>
            <th style={{ padding: '10px' }}>Overall</th>
            <th style={{ padding: '10px' }}>Diff (Capped)</th>
            <th style={{ padding: '10px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.teamId} style={{ borderBottom: '1px solid #E5E7EB', background: row.isPlayoffBound ? '#F0FDF4' : 'transparent' }}>
              <td style={{ padding: '10px', fontWeight: 'bold' }}>#{row.rank}</td>
              <td style={{ padding: '10px', fontWeight: 'bold' }}>{row.name}</td>
              <td style={{ padding: '10px' }}>{row.districtRecord}</td>
              <td style={{ padding: '10px' }}>{row.overallRecord}</td>
              <td style={{ padding: '10px', color: row.pointDifferential >= 0 ? '#059669' : '#DC2626' }}>
                {row.pointDifferential > 0 ? `+${row.pointDifferential}` : row.pointDifferential}
              </td>
              <td style={{ padding: '10px', fontSize: '12px', fontWeight: 'bold', color: row.isPlayoffBound ? '#16A34A' : '#9CA3AF' }}>
                {row.isPlayoffBound ? '🏆 PLAYOFF SPOT' : 'ELIMINATED'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
