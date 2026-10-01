import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { leagueRegionTeams } from '../sim/league';

/** Standings for every district in the league, grouped by region. */
export const AllDistrictsStandingsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { league, leagueTeams, userTeamId } = useGameStore();
  const [regionIndex, setRegionIndex] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  // leagueTeams is replaced after each week, so standings refresh with it
  const regions = useMemo(() => {
    if (!league) return [];
    const teamsByRegion = leagueRegionTeams(league, leagueTeams);
    return league.regions.map((region, r) => ({
      name: region.name,
      districts: region.districts.map((district, d) => ({
        id: district.id,
        name: district.name,
        isUser: district.teamIds.includes(userTeamId),
        standings: calculateDistrictStandings(teamsByRegion[r][d])
      }))
    }));
  }, [league, leagueTeams, userTeamId]);

  if (!league) return null;

  const query = search.trim().toLowerCase();
  const shownRegions = regions
    .map((region, i) => ({ ...region, index: i }))
    .filter((region) => regionIndex === 'ALL' || region.index === regionIndex)
    .map((region) => ({
      ...region,
      districts: query ? region.districts.filter((d) => d.standings.some((row) => row.name.toLowerCase().includes(query))) : region.districts
    }))
    .filter((region) => region.districts.length > 0);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={linkBtn}>
        ← Back to my district
      </button>
      <h2 style={{ margin: '6px 0 4px 0' }}>{league.name}: All District Standings</h2>
      <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 12px 0' }}>
        Top 4 in each district make the playoffs. Your district is highlighted.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <button onClick={() => setRegionIndex('ALL')} style={tabBtn(regionIndex === 'ALL')}>
          All Regions
        </button>
        {regions.map((region, i) => (
          <button key={region.name} onClick={() => setRegionIndex(i)} style={tabBtn(regionIndex === i)}>
            {region.name}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a school…"
          aria-label="Find a school"
          style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '13px', minWidth: '180px' }}
        />
      </div>

      {shownRegions.length === 0 && <p style={{ color: '#64748B' }}>No school matches &quot;{search}&quot;.</p>}

      {shownRegions.map((region) => (
        <div key={region.name} style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', borderBottom: '2px solid #0F172A', paddingBottom: '3px' }}>{region.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {region.districts.map((district) => (
              <div
                key={district.id}
                style={{
                  background: '#fff',
                  border: district.isUser ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  borderRadius: '6px',
                  overflow: 'hidden'
                }}
              >
                <div style={{ background: district.isUser ? '#2563EB' : '#0F172A', color: '#fff', padding: '5px 10px', fontWeight: 'bold', fontSize: '13px' }}>
                  {district.name}
                  {district.isUser && ' (yours)'}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ color: '#64748B', textAlign: 'left' }}>
                      <th style={cell}>#</th>
                      <th style={cell}>School</th>
                      <th style={cell}>Dist</th>
                      <th style={cell}>Ovr</th>
                      <th style={cell}>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {district.standings.map((row) => {
                      const match = query && row.name.toLowerCase().includes(query);
                      return (
                        <tr
                          key={row.teamId}
                          style={{
                            borderTop: '1px solid #F1F5F9',
                            background: match ? '#FEF9C3' : row.isPlayoffBound ? '#F0FDF4' : undefined,
                            fontWeight: row.teamId === userTeamId ? 'bold' : 'normal'
                          }}
                        >
                          <td style={cell}>{row.rank}</td>
                          <td style={{ ...cell, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                            {row.name}
                          </td>
                          <td style={cell}>{row.districtRecord}</td>
                          <td style={cell}>{row.overallRecord}</td>
                          <td style={{ ...cell, color: row.pointDifferential >= 0 ? '#059669' : '#DC2626' }}>
                            {row.pointDifferential > 0 ? `+${row.pointDifferential}` : row.pointDifferential}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const cell: React.CSSProperties = { padding: '4px 8px' };

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#2563EB',
  cursor: 'pointer',
  fontSize: '13px',
  padding: 0,
  fontWeight: 'bold'
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  background: active ? '#0F172A' : '#E5E7EB',
  color: active ? '#fff' : '#374151',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '12px'
});
