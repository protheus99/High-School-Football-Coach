import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { DepthChartBoard } from './DepthChartBoard';
import { DataList } from './ui/DataList';
import { DEFENSE_POSITIONS, OFFENSE_POSITIONS, starterRatings } from '../sim/depthChart';

export const RosterDepthChartView: React.FC = () => {
  const { districtTeams, userTeamId, moveDepthChartPlayer, openPlayerCard } = useGameStore();
  const [view, setView] = useState<'CHART' | 'ROSTER'>('CHART');
  const [filter, setFilter] = useState<'ALL' | 'OFF' | 'DEF'>('ALL');

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const filtered = userTeam.roster.filter((p) => {
    if (filter === 'OFF') return OFFENSE_POSITIONS.includes(p.position);
    if (filter === 'DEF') return DEFENSE_POSITIONS.includes(p.position);
    return true;
  });
  const ratings = starterRatings(userTeam.roster);

  const STRING_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;

  return (
    <div className="ui-screen">
      {/* The starters' ratings */}
      <div aria-label="Starter ratings" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <RatingTile label="Team" value={ratings.team.rating} help={`${ratings.team.starters} starters`} strong />
        <RatingTile label="Offense" value={ratings.offense.rating} help={`${ratings.offense.starters} starters`} />
        <RatingTile label="Defense" value={ratings.defense.rating} help={`${ratings.defense.starters} starters`} />
      </div>

      <div className="ui-chips" aria-label="Roster view" style={{ marginBottom: '14px' }}>
        <button className="ui-chip" aria-pressed={view === 'CHART'} onClick={() => setView('CHART')}>
          Depth Chart
        </button>
        <button className="ui-chip" aria-pressed={view === 'ROSTER'} onClick={() => setView('ROSTER')}>
          Full Roster
        </button>
      </div>

      {view === 'CHART' && <DepthChartBoard team={userTeam} onMove={moveDepthChartPlayer} onSelect={(p) => openPlayerCard(p.id)} />}

      {view === 'ROSTER' && (
        <>
          <div className="ui-chips" role="group" aria-label="Filter" style={{ marginBottom: '10px' }}>
            <button className="ui-chip" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>
              All ({userTeam.roster.length})
            </button>
            <button className="ui-chip" aria-pressed={filter === 'OFF'} onClick={() => setFilter('OFF')}>
              Offense
            </button>
            <button className="ui-chip" aria-pressed={filter === 'DEF'} onClick={() => setFilter('DEF')}>
              Defense
            </button>
          </div>
          <p className="ui-muted" style={{ margin: '0 0 10px 0' }}>
            Tap a player for his card: stats, grades, recruiting and his depth chart string.
          </p>
          <DataList
            rows={filtered}
            rowKey={(p) => p.id}
            onRowClick={(p) => openPlayerCard(p.id)}
            rowTone={(p) => (!p.academics.isEligible || p.condition.injuryStatus !== 'HEALTHY' ? '#FEF2F2' : undefined)}
            columns={[
              {
                key: 'name',
                label: 'Name',
                primary: true,
                render: (p) => (
                  <>
                    {p.firstName} {p.lastName} <span style={{ color: '#64748B', fontWeight: 'normal', fontSize: '13px' }}>{p.position}</span>
                  </>
                )
              },
              { key: 'ovr', label: 'OVR', badge: true, render: (p) => p.overallRating },
              { key: 'pos', label: 'Pos', desktopOnly: true, render: (p) => p.position },
              { key: 'class', label: 'Class', render: (p) => p.classYear },
              { key: 'string', label: 'String', render: (p) => STRING_LABEL[p.depthChartTier] },
              { key: 'stamina', label: 'Stamina', desktopOnly: true, render: (p) => `${p.condition.inGameStamina}%` },
              {
                key: 'status',
                label: 'Status',
                render: (p) =>
                  p.condition.injuryStatus !== 'HEALTHY' ? (
                    <span style={{ color: '#DC2626' }}>Injured ({p.condition.injuryWeeksRemaining} wk)</span>
                  ) : (
                    `Wear ${p.condition.seasonWear}%`
                  )
              },
              { key: 'gpa', label: 'GPA', render: (p) => <span style={{ color: p.academics.isEligible ? '#059669' : '#DC2626' }}>{p.academics.gpa.toFixed(2)}</span> },
              { key: 'offers', label: 'Offers', desktopOnly: true, render: (p) => p.recruiting.offers.length }
            ]}
          />
        </>
      )}
    </div>
  );
};

const RatingTile: React.FC<{ label: string; value: number; help: string; strong?: boolean }> = ({ label, value, help, strong }) => (
  <div style={{ background: strong ? '#0F172A' : '#fff', color: strong ? '#fff' : '#0F172A', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
    <div style={{ fontSize: '12px', fontWeight: 'bold', color: strong ? '#CBD5E1' : '#64748B' }}>{label} OVR</div>
    <div style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.2 }}>{value}</div>
    <div style={{ fontSize: '12px', color: '#94A3B8' }}>{help}</div>
  </div>
);
