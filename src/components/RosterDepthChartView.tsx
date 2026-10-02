import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Position, Player } from '../types/game';
import { DepthChartEditorModal } from './DepthChartEditorModal';
import { DepthChartBoard } from './DepthChartBoard';
import { DataList } from './ui/DataList';

export const RosterDepthChartView: React.FC = () => {
  const { districtTeams, userTeamId, updatePlayerTier, moveDepthChartPlayer } = useGameStore();
  const [view, setView] = useState<'CHART' | 'ROSTER'>('CHART');
  const [filter, setFilter] = useState<'ALL' | 'OFF' | 'DEF'>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const offPos: Position[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C'];
  const defPos: Position[] = ['DE', 'DT', 'LB', 'CB', 'S'];

  const filtered = userTeam.roster.filter((p) => {
    if (filter === 'OFF') return offPos.includes(p.position);
    if (filter === 'DEF') return defPos.includes(p.position);
    return true;
  });

  const STRING_LABEL = { 1: '1st', 2: '2nd', 3: '3rd' } as const;

  return (
    <div className="ui-screen">
      {selectedPlayer && (
        <DepthChartEditorModal
          player={selectedPlayer}
          onUpdateTier={(id, tier) => {
            updatePlayerTier(id, tier);
            setSelectedPlayer(null);
          }}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <h2 style={{ margin: '0 0 10px 0' }}>Roster</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        <button className={`ui-btn${view === 'CHART' ? ' ui-btn-primary' : ''}`} aria-pressed={view === 'CHART'} onClick={() => setView('CHART')}>
          Depth Chart
        </button>
        <button className={`ui-btn${view === 'ROSTER' ? ' ui-btn-primary' : ''}`} aria-pressed={view === 'ROSTER'} onClick={() => setView('ROSTER')}>
          Full Roster
        </button>
      </div>

      {view === 'CHART' && <DepthChartBoard team={userTeam} onMove={moveDepthChartPlayer} onSelect={setSelectedPlayer} />}

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
            Tap a player to change his string or assign study hall.
          </p>
          <DataList
            rows={filtered}
            rowKey={(p) => p.id}
            onRowClick={setSelectedPlayer}
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
