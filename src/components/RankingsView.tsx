import React, { useState } from 'react';
import { StateAndNationalPolls, RankedTeamEntry } from '../types/game';

interface RankingsViewProps {
  polls: StateAndNationalPolls;
  userTeamId: string;
}

export const RankingsView: React.FC<RankingsViewProps> = ({ polls, userTeamId }) => {
  const [selectedView, setSelectedView] = useState<'NATIONAL' | string>('NATIONAL');

  const availableStates = Object.keys(polls.stateRankings);
  const activeEntries =
    selectedView === 'NATIONAL'
      ? polls.nationalTop25
      : polls.stateRankings[selectedView] || [];

  const renderMovementBadge = (entry: RankedTeamEntry) => {
    if (entry.movement === 'UP') {
      return <span style={{ color: '#16A34A', fontWeight: 'bold', fontSize: '12px' }}>▲ {entry.movementDelta}</span>;
    }
    if (entry.movement === 'DOWN') {
      return <span style={{ color: '#DC2626', fontWeight: 'bold', fontSize: '12px' }}>▼ {entry.movementDelta}</span>;
    }
    if (entry.movement === 'NEW_ENTRY') {
      return <span style={{ background: '#2563EB', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>NEW</span>;
    }
    return <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {/* Poll Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0F172A' }}>
            🏆 {selectedView === 'NATIONAL' ? 'NATIONAL SUPER 25 POLL' : `${selectedView.toUpperCase()} STATE TOP 25`}
          </h2>
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            Week {polls.week} Official Rankings | Composite Strength & Quality Wins
          </div>
        </div>

        {/* View Switcher Dropdown */}
        <select
          value={selectedView}
          onChange={(e) => setSelectedView(e.target.value)}
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
          <option value="NATIONAL">🇺🇸 National Super 25</option>
          {availableStates.map((st) => (
            <option key={st} value={st}>
              📍 {st} Top 25
            </option>
          ))}
        </select>
      </div>

      {/* Rankings Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569' }}>
              <th style={{ padding: '12px 10px', width: '60px' }}>Rank</th>
              <th style={{ padding: '12px 10px', width: '50px' }}>Move</th>
              <th style={{ padding: '12px 10px' }}>School & Mascot</th>
              <th style={{ padding: '12px 10px' }}>State / Class</th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>Record</th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>Points</th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>SoS</th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>Q-Wins</th>
            </tr>
          </thead>
          <tbody>
            {activeEntries.map((entry) => {
              const isUserTeam = entry.teamId === userTeamId;
              return (
                <tr
                  key={entry.teamId}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    background: isUserTeam ? '#EFF6FF' : 'transparent',
                    borderLeft: isUserTeam ? '4px solid #2563EB' : 'none'
                  }}
                >
                  <td style={{ padding: '10px', fontWeight: 'bold', fontSize: '14px', color: entry.rank <= 5 ? '#D97706' : '#1E293B' }}>
                    #{entry.rank}
                  </td>
                  <td style={{ padding: '10px' }}>{renderMovementBadge(entry)}</td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 'bold', color: isUserTeam ? '#1D4ED8' : '#0F172A' }}>
                      {entry.teamName} {entry.mascot}
                      {entry.firstPlaceVotes > 0 && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: '#D97706', fontWeight: 'bold' }}>
                          ({entry.firstPlaceVotes})
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px', color: '#64748B' }}>
                    {entry.state} ({entry.classification})
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                    {entry.record.wins}-{entry.record.losses}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#2563EB' }}>
                    {entry.pollPoints}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#475569' }}>
                    {entry.strengthOfSchedule}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#16A34A' }}>
                    {entry.qualityWinsCount}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Others Receiving Votes (Bubble Teams) */}
      {selectedView === 'NATIONAL' && polls.bubbleTeams.length > 0 && (
        <div style={{ marginTop: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Others Receiving Votes (Bubble Teams):</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
            {polls.bubbleTeams.map((team) => (
              <span
                key={team.teamId}
                style={{
                  background: team.teamId === userTeamId ? '#DBEAFE' : '#fff',
                  border: '1px solid #CBD5E1',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  color: team.teamId === userTeamId ? '#1D4ED8' : '#475569',
                  fontWeight: team.teamId === userTeamId ? 'bold' : 'normal'
                }}
              >
                #{team.rank} {team.teamName} ({team.record.wins}-{team.record.losses}) — {team.pollPoints} pts
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
