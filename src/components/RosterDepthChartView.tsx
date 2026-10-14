import React, { useState } from 'react';
import { useScrollTopOnScreenChange } from '../utils/pageScroll';
import { formatPercent } from '../utils/format';
import { useGameStore } from '../store/gameStore';
import { DepthChartBoard } from './DepthChartBoard';
import { DataList } from './ui/DataList';
import { DEFENSE_POSITIONS, OFFENSE_POSITIONS, starterRatings } from '../sim/depthChart';
import { FatigueChip } from './ui/FatigueChip';
import type { Player } from '../types/game';

export const RosterDepthChartView: React.FC = () => {
  const { districtTeams, userTeamId, moveDepthChartPlayer, openPlayerCard, currentYear } = useGameStore();
  const [view, setView] = useState<'CHART' | 'ROSTER'>('CHART');
  useScrollTopOnScreenChange(view);
  const [filter, setFilter] = useState<'ALL' | 'OFF' | 'DEF' | 'NEW'>('ALL');

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  // Newcomers: players who joined the program this year (signing day or a transfer)
  const isNew = (p: Player) => p.joinedYear !== undefined && p.joinedYear === currentYear;
  const newcomers = userTeam.roster.filter(isNew).length;
  const filtered = userTeam.roster.filter((p) => {
    if (filter === 'OFF') return OFFENSE_POSITIONS.includes(p.position);
    if (filter === 'DEF') return DEFENSE_POSITIONS.includes(p.position);
    if (filter === 'NEW') return isNew(p);
    return true;
  });
  const ratings = starterRatings(userTeam.roster);

  const STRING_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;

  return (
    <div className="ui-screen">
      {/* The starters' ratings */}
      <div aria-label="Starter ratings" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <RatingTile label="Team" value={ratings.team.rating} strong />
        <RatingTile label="Offense" value={ratings.offense.rating} />
        <RatingTile label="Defense" value={ratings.defense.rating} />
      </div>

      <div className="ui-chips" aria-label="Roster view" style={{ marginBottom: view === 'CHART' ? '4px' : '14px' }}>
        <button className="ui-chip" aria-pressed={view === 'CHART'} onClick={() => setView('CHART')}>
          Depth Chart
        </button>
        <button className="ui-chip" aria-pressed={view === 'ROSTER'} onClick={() => setView('ROSTER')}>
          Full Roster
        </button>
      </div>

      {view === 'CHART' && <DepthChartBoard team={userTeam} onMove={moveDepthChartPlayer} onSelect={(p) => openPlayerCard(p.id)} currentYear={currentYear} />}

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
            <button className="ui-chip" aria-pressed={filter === 'NEW'} onClick={() => setFilter('NEW')}>
              New ({newcomers})
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
                    {/* Star rating, when colleges have rated him */}
                    {p.recruiting.starRating > 0 && (
                      <span aria-label={`${p.recruiting.starRating}-star recruit`} style={{ color: '#B45309', fontSize: '13px', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                        {'★'.repeat(p.recruiting.starRating)}
                      </span>
                    )}
                    {isNew(p) && (
                      <span className="depth-tag depth-new" style={{ marginLeft: '6px' }}>
                        NEW
                      </span>
                    )}
                  </>
                )
              },
              { key: 'ovr', label: 'OVR', badge: true, render: (p) => p.overallRating },
              { key: 'pos', label: 'Pos', desktopOnly: true, render: (p) => p.position },
              { key: 'class', label: 'Class', render: (p) => p.classYear },
              { key: 'string', label: 'String', render: (p) => STRING_LABEL[p.depthChartTier] },
              { key: 'stamina', label: 'Stamina', desktopOnly: true, render: (p) => formatPercent(p.condition.inGameStamina) },
              {
                key: 'status',
                label: 'Status',
                render: (p) =>
                  p.condition.injuryStatus !== 'HEALTHY' ? (
                    <span style={{ color: '#DC2626' }}>Injured ({p.condition.injuryWeeksRemaining} wk)</span>
                  ) : (
                    <FatigueChip fatigue={p.condition.seasonWear} />
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

const RatingTile: React.FC<{ label: string; value: number; strong?: boolean }> = ({ label, value, strong }) => (
  <div style={{ background: strong ? '#0F172A' : '#fff', color: strong ? '#fff' : '#0F172A', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
    <div style={{ fontSize: '12px', fontWeight: 'bold', color: strong ? '#CBD5E1' : '#64748B' }}>{label} OVR</div>
    <div style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.2 }}>{value}</div>
  </div>
);
