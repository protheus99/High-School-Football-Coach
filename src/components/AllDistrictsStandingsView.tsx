import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { leagueRegionTeams } from '../sim/league';
import { districtPlayoffSpots, playoffQualifyText, rulesForState } from '../sim/stateRules';

/** Standings for every district in the league, grouped by region. */
export const AllDistrictsStandingsView: React.FC<{ onBack: () => void; hideBackButton?: boolean }> = ({ onBack, hideBackButton }) => {
  const { league, leagueTeams, userTeamId } = useGameStore();
  const [regionIndex, setRegionIndex] = useState<number | 'ALL'>('ALL');
  // Picking a region from far down the list starts it from the top
  const pickRegion = (i: number | 'ALL') => {
    setRegionIndex(i);
    window.scrollTo({ top: 0 });
  };
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
        standings: calculateDistrictStandings(teamsByRegion[r][d], districtPlayoffSpots(rulesForState(league.state)))
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
    <div className="ui-screen">
      {!hideBackButton && (
        <button onClick={onBack} className="ui-btn" style={{ marginBottom: '10px' }}>
          ← My {rulesForState(league.state).districtLabel.toLowerCase()}
        </button>
      )}
      {!hideBackButton && <h2 className="ui-section-title">All {rulesForState(league.state).districtLabel} Standings</h2>}
      <p className="ui-muted" style={{ margin: '0 0 12px 0' }}>
        {league.name}. {playoffQualifyText(rulesForState(league.state))}
      </p>

      <div className="ui-sticky-nav" style={{ margin: '0 -16px 14px', padding: '8px 16px' }}>
      <input
        className="ui-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Find a school…"
        aria-label="Find a school"
        style={{ marginBottom: '8px' }}
      />
      <div className="ui-chips-scroll" role="group" aria-label="Region">
        <button className="ui-chip" aria-pressed={regionIndex === 'ALL'} onClick={() => pickRegion('ALL')}>
          All regions
        </button>
        {regions.map((region, i) => (
          <button key={region.name} className="ui-chip" aria-pressed={regionIndex === i} onClick={() => pickRegion(i)}>
            {region.name}
          </button>
        ))}
      </div>
      </div>

      {shownRegions.length === 0 && <p className="ui-muted">No school matches &quot;{search}&quot;.</p>}

      {shownRegions.map((region) => (
        <div key={region.name} style={{ marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', borderBottom: '2px solid #0F172A', paddingBottom: '3px' }}>{region.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {region.districts.map((district) => (
              <div key={district.id}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 2px', color: district.isUser ? '#2563EB' : '#0F172A' }}>
                  {district.name}
                  {district.isUser && ' (yours)'}
                </div>
                <div style={{ borderRadius: '10px', boxShadow: district.isUser ? '0 0 0 2px #2563EB' : undefined }}>
                  <CompactStandings rows={district.standings} userTeamId={userTeamId} query={query} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Dense standings rows (all screen sizes): seed, school, then overall record, district record and differential on one line. */
const CompactStandings: React.FC<{ rows: ReturnType<typeof calculateDistrictStandings>; userTeamId: string; query: string }> = ({ rows, userTeamId, query }) => (
  <div className="ui-standings" style={{ display: 'flex' }}>
    {rows.map((row) => {
      const match = query && row.name.toLowerCase().includes(query);
      return (
        <div
          key={row.teamId}
          className="ui-standings-row"
          style={{
            minHeight: '40px',
            background: match ? '#FEF9C3' : row.isPlayoffBound ? '#F0FDF4' : undefined,
            fontWeight: row.teamId === userTeamId ? 'bold' : undefined
          }}
        >
          <span className="ui-standings-seed" style={{ background: row.isPlayoffBound ? '#15803D' : '#E2E8F0', color: row.isPlayoffBound ? '#fff' : '#334155' }}>
            {row.rank}
          </span>
          <span className="ui-standings-name">
            <button onClick={() => useGameStore.getState().openTeamProfile(row.teamId)} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left', minHeight: '40px', minWidth: '44px', display: 'inline-flex', alignItems: 'center' }}>
              {row.name}
            </button>
          </span>
          <span className="ui-standings-line">
            <strong>{row.overallRecord}</strong>
            <small>({row.districtRecord})</small>
            <span className="ui-standings-diff" style={{ color: row.pointDifferential >= 0 ? '#047857' : '#DC2626' }}>
              {row.pointDifferential > 0 ? `+${row.pointDifferential}` : row.pointDifferential}
            </span>
          </span>
        </div>
      );
    })}
  </div>
);
