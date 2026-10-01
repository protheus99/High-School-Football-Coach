import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict } from '../sim/league';
import { AllDistrictsStandingsView } from './AllDistrictsStandingsView';

export const DistrictStandingsView: React.FC = () => {
  const { districtTeams, league, userTeamId } = useGameStore();
  const [showAll, setShowAll] = useState(false);
  const standings = calculateDistrictStandings(districtTeams);
  const districtName = (league && findDistrict(league, userTeamId)?.name) ?? 'District';
  const districtCount = league?.regions.reduce((n, r) => n + r.districts.length, 0) ?? 4;
  const bracketSize = districtCount * (league?.splitDivisions ? 2 : 4);
  const qualifyText = league?.splitDivisions
    ? `Top 4 teams qualify; they are split by enrollment into the Division 1 and Division 2 ${bracketSize}-team state brackets.`
    : `Top 4 teams qualify for the ${bracketSize}-team state tournament.`;

  if (showAll) return <AllDistrictsStandingsView onBack={() => setShowAll(false)} />;

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: '16px 0 8px 0' }}>{districtName} Standings</h2>
        {league && league.regions.some((r) => r.districts.length > 1) && (
          <button
            onClick={() => setShowAll(true)}
            style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', padding: 0 }}
          >
            View all district standings →
          </button>
        )}
      </div>
      <p style={{ color: '#6B7280', fontSize: '13px' }}>{qualifyText} Tiebreakers cap point differentials at &plusmn;17 per game.</p>
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
