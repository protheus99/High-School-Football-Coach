import React, { useState } from 'react';
import {
  PlayerRankingsAndStatsState,
  StatCategory,
  Position,
  RankedPlayerEntry
} from '../types/game';

interface PlayerLeaderboardProps {
  rankingsState: PlayerRankingsAndStatsState;
  userTeamId: string;
  onSelectPlayer: (entry: RankedPlayerEntry) => void;
}

export const PlayerLeaderboardView: React.FC<PlayerLeaderboardProps> = ({
  rankingsState,
  userTeamId,
  onSelectPlayer
}) => {
  const [activeTab, setActiveTab] = useState<'PROSPECT_RANKINGS' | 'STAT_LEADERS'>('PROSPECT_RANKINGS');
  const [scope, setScope] = useState<'NATIONAL' | string>('NATIONAL');
  const [selectedPosition, setSelectedPosition] = useState<Position | 'OVERALL_TOP_100'>('QB');
  const [selectedStatCat, setSelectedStatCat] = useState<StatCategory>('PASS_YARDS');

  const availableStates = Object.keys(rankingsState.stateStatLeaders);

  // 1. Resolve Active Prospect Rankings List
  let activeProspectEntries: RankedPlayerEntry[] = [];
  if (selectedPosition === 'OVERALL_TOP_100') {
    activeProspectEntries = rankingsState.nationalOverallTop100;
  } else {
    const posGroup = rankingsState.positionalProspects[selectedPosition];
    if (posGroup) {
      activeProspectEntries =
        scope === 'NATIONAL'
          ? posGroup.nationalRankings
          : posGroup.stateRankings[scope] || [];
    }
  }

  // 2. Resolve Active Statistical Leaders List
  let activeStatEntries: RankedPlayerEntry[] = [];
  if (scope === 'NATIONAL') {
    activeStatEntries = rankingsState.nationalStatLeaders[selectedStatCat] || [];
  } else {
    activeStatEntries = rankingsState.stateStatLeaders[scope]?.[selectedStatCat] || [];
  }

  const renderStarBadges = (stars: number) => {
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Top Header & Mode Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0F172A' }}>
            🌟 {activeTab === 'PROSPECT_RANKINGS' ? 'HIGH SCHOOL PROSPECT RANKINGS' : 'STATISTICAL LEADERBOARDS'}
          </h2>
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            Week {rankingsState.week} Official Player Scouting Database
          </div>
        </div>

        {/* State / National Scope Selector */}
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            background: '#fff',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          <option value="NATIONAL">🇺🇸 Nationwide</option>
          {availableStates.map((st) => (
            <option key={st} value={st}>
              📍 {st}
            </option>
          ))}
        </select>
      </div>

      {/* Mode Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('PROSPECT_RANKINGS')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'PROSPECT_RANKINGS' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'PROSPECT_RANKINGS' ? '#fff' : '#475569',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          🎓 Positional Prospect Rankings (Scouting Board)
        </button>
        <button
          onClick={() => setActiveTab('STAT_LEADERS')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'STAT_LEADERS' ? '#2563EB' : '#F1F5F9',
            color: activeTab === 'STAT_LEADERS' ? '#fff' : '#475569',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          📊 Stat Leaders (Yards / TDs / Tackles / Sacks)
        </button>
      </div>

      {/* Tab 1: Positional Prospect Filter Bar */}
      {activeTab === 'PROSPECT_RANKINGS' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          <button
            onClick={() => setSelectedPosition('OVERALL_TOP_100')}
            style={pillBtnStyle(selectedPosition === 'OVERALL_TOP_100')}
          >
            🔥 Top 100 (Overall)
          </button>
          {(['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'] as Position[]).map((pos) => (
            <button
              key={pos}
              onClick={() => setSelectedPosition(pos)}
              style={pillBtnStyle(selectedPosition === pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      )}

      {/* Tab 2: Statistical Category Filter Bar */}
      {activeTab === 'STAT_LEADERS' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {[
            { cat: 'PASS_YARDS', label: 'Passing Yds' },
            { cat: 'PASS_TDS', label: 'Passing TDs' },
            { cat: 'RUSH_YARDS', label: 'Rushing Yds' },
            { cat: 'RUSH_TDS', label: 'Rushing TDs' },
            { cat: 'REC_YARDS', label: 'Receiving Yds' },
            { cat: 'TACKLES', label: 'Total Tackles' },
            { cat: 'SACKS', label: 'Sacks' },
            { cat: 'INTERCEPTIONS', label: 'Interceptions' }
          ].map((item) => (
            <button
              key={item.cat}
              onClick={() => setSelectedStatCat(item.cat as StatCategory)}
              style={pillBtnStyle(selectedStatCat === item.cat)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Leaderboard Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
              <th style={{ padding: '12px 10px', width: '50px' }}>Rank</th>
              <th style={{ padding: '12px 10px' }}>Student-Athlete</th>
              <th style={{ padding: '12px 10px' }}>Pos / Class</th>
              <th style={{ padding: '12px 10px' }}>High School</th>
              <th style={{ padding: '12px 10px' }}>State / Class</th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>
                {activeTab === 'PROSPECT_RANKINGS' ? 'Stars' : 'Season Production'}
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>
                {activeTab === 'PROSPECT_RANKINGS' ? 'Recruit Grade' : 'OVR'}
              </th>
            </tr>
          </thead>
          <tbody>
            {(activeTab === 'PROSPECT_RANKINGS' ? activeProspectEntries : activeStatEntries).map((entry) => {
              const isUserTeam = entry.teamId === userTeamId;
              return (
                <tr
                  key={entry.player.id}
                  onClick={() => onSelectPlayer(entry)}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    background: isUserTeam ? '#EFF6FF' : 'transparent',
                    borderLeft: isUserTeam ? '4px solid #2563EB' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  <td style={{ padding: '10px', fontWeight: 'bold', fontSize: '14px', color: entry.rank <= 3 ? '#D97706' : '#1E293B' }}>
                    #{entry.rank}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 'bold', color: isUserTeam ? '#1D4ED8' : '#0F172A' }}>
                      {entry.player.firstName} {entry.player.lastName}
                    </div>
                  </td>
                  <td style={{ padding: '10px', color: '#475569' }}>
                    #{entry.player.position} ({entry.player.classYear})
                  </td>
                  <td style={{ padding: '10px', fontWeight: '500' }}>
                    {entry.teamName}
                  </td>
                  <td style={{ padding: '10px', color: '#64748B' }}>
                    {entry.state} ({entry.classification})
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    {activeTab === 'PROSPECT_RANKINGS' ? (
                      <span style={{ color: '#D97706', fontSize: '12px' }}>
                        {renderStarBadges(entry.player.recruiting.starRating)}
                      </span>
                    ) : (
                      <span style={{ fontWeight: 'bold', color: '#0F172A' }}>
                        {entry.primaryStatLine}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#2563EB' }}>
                    {activeTab === 'PROSPECT_RANKINGS' ? `${entry.compositeRecruitScore} pts` : `${entry.player.overallRating}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const pillBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  background: active ? '#0F172A' : '#F1F5F9',
  color: active ? '#fff' : '#334155',
  border: '1px solid #CBD5E1',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: 'pointer'
});
