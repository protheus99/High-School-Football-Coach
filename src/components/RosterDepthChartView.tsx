import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Position, Player } from '../types/game';
import { DepthChartEditorModal } from './DepthChartEditorModal';
import { DepthChartBoard } from './DepthChartBoard';

export const RosterDepthChartView: React.FC = () => {
  const { districtTeams, userTeamId, updatePlayerTier, togglePlayerStudyHall, moveDepthChartPlayer } = useGameStore();
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

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {selectedPlayer && (
        <DepthChartEditorModal
          player={selectedPlayer}
          onUpdateTier={(id, tier) => {
            updatePlayerTier(id, tier);
            setSelectedPlayer(null);
          }}
          onToggleStudyHall={(id) => {
            togglePlayerStudyHall(id);
            setSelectedPlayer(null);
          }}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <h2>Varsity Roster & Depth Chart</h2>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setView('CHART')} style={tabBtn(view === 'CHART')}>
          Depth Chart
        </button>
        <button onClick={() => setView('ROSTER')} style={tabBtn(view === 'ROSTER')}>
          Full Roster
        </button>
      </div>

      {view === 'CHART' && <DepthChartBoard team={userTeam} onMove={moveDepthChartPlayer} onSelect={setSelectedPlayer} />}

      {view === 'ROSTER' && (
        <>
          <p style={{ fontSize: '13px', color: '#6B7280' }}>
            Click any athlete to adjust their depth chart slot (1st/2nd/3rd string) or assign mandatory study hall.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button onClick={() => setFilter('ALL')} style={tabBtn(filter === 'ALL')}>
              All ({userTeam.roster.length})
            </button>
            <button onClick={() => setFilter('OFF')} style={tabBtn(filter === 'OFF')}>
              Offense
            </button>
            <button onClick={() => setFilter('DEF')} style={tabBtn(filter === 'DEF')}>
              Defense
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F3F4F6', borderBottom: '2px solid #E5E7EB' }}>
                  <th style={{ padding: '8px' }}>Name</th>
                  <th style={{ padding: '8px' }}>Pos</th>
                  <th style={{ padding: '8px' }}>Class</th>
                  <th style={{ padding: '8px' }}>OVR</th>
                  <th style={{ padding: '8px' }}>Slot</th>
                  <th style={{ padding: '8px' }}>Stamina</th>
                  <th style={{ padding: '8px' }}>Wear</th>
                  <th style={{ padding: '8px' }}>GPA</th>
                  <th style={{ padding: '8px' }}>Offers</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} onClick={() => setSelectedPlayer(p)} style={{ borderBottom: '1px solid #E5E7EB', cursor: 'pointer' }}>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>
                      {p.firstName} {p.lastName}
                    </td>
                    <td style={{ padding: '8px' }}>{p.position}</td>
                    <td style={{ padding: '8px' }}>{p.classYear}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold', color: '#2563EB' }}>{p.overallRating}</td>
                    <td style={{ padding: '8px' }}>{p.depthChartTier === 1 ? '1st String' : p.depthChartTier === 2 ? '2nd String' : '3rd String'}</td>
                    <td style={{ padding: '8px' }}>{p.condition.inGameStamina}%</td>
                    <td style={{ padding: '8px' }}>{p.condition.seasonWear}%</td>
                    <td style={{ padding: '8px', color: p.academics.isEligible ? '#059669' : '#DC2626' }}>{p.academics.gpa.toFixed(2)}</td>
                    <td style={{ padding: '8px' }}>{p.recruiting.offers.length} Offers</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  background: active ? '#2563EB' : '#E5E7EB',
  color: active ? '#fff' : '#374151',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
});
