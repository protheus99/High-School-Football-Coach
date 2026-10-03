import React, { useState } from 'react';
import { StateAndNationalPolls, RankedTeamEntry } from '../types/game';
import { DataList } from './ui/DataList';

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
      return <span style={{ background: '#2563EB', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>NEW</span>;
    }
    return <span style={{ color: '#94A3B8', fontSize: '12px' }}>—</span>;
  };

  const title = selectedView === 'NATIONAL' ? 'National Super 25' : `${selectedView} Top 25`;

  return (
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{title}</h3>
      <p className="ui-muted" style={{ margin: '0 0 10px 0' }}>
        Week {polls.week} rankings · composite strength and quality wins
      </p>

      <div className="ui-chips" role="group" aria-label="Poll" style={{ marginBottom: '12px' }}>
        <button className="ui-chip" aria-pressed={selectedView === 'NATIONAL'} onClick={() => setSelectedView('NATIONAL')}>
          National
        </button>
        {availableStates.map((st) => (
          <button key={st} className="ui-chip" aria-pressed={selectedView === st} onClick={() => setSelectedView(st)}>
            {st}
          </button>
        ))}
      </div>

      {/* Phones: one compact row per team */}
      <div className="ui-standings">
        {activeEntries.map((entry) => {
          const isUserTeam = entry.teamId === userTeamId;
          return (
            <div key={entry.teamId} className="ui-standings-row" style={{ background: isUserTeam ? '#EFF6FF' : undefined, fontWeight: isUserTeam ? 'bold' : undefined }}>
              <span style={{ flex: '0 0 auto', width: '34px', textAlign: 'center', lineHeight: 1.1 }}>
                <strong style={{ color: entry.rank <= 5 ? '#D97706' : '#1E293B', fontSize: '15px' }}>{entry.rank}</strong>
                <br />
                {renderMovementBadge(entry)}
              </span>
              <span className="ui-standings-name">
                {entry.teamName}
                {entry.firstPlaceVotes > 0 && <span style={{ color: '#D97706', fontSize: '12px' }}> ({entry.firstPlaceVotes})</span>}
                <br />
                <small style={{ color: '#64748B', fontWeight: 'normal', fontSize: '12px' }}>
                  {entry.mascot} · {entry.state}
                </small>
              </span>
              <span className="ui-standings-record">
                <strong>
                  {entry.record.wins}-{entry.record.losses}
                </strong>
                <small>{entry.pollPoints} pts</small>
              </span>
            </div>
          );
        })}
      </div>

      {/* Desktop: full table */}
      <div className="ui-desktop-only">
        <DataList
          rows={activeEntries}
          rowKey={(e) => e.teamId}
          rowTone={(e) => (e.teamId === userTeamId ? '#EFF6FF' : undefined)}
          columns={[
            { key: 'rank', label: 'Rank', render: (e) => <strong style={{ color: e.rank <= 5 ? '#D97706' : '#1E293B' }}>#{e.rank}</strong> },
            { key: 'move', label: 'Move', render: renderMovementBadge },
            {
              key: 'school',
              label: 'School',
              primary: true,
              render: (e) => (
                <strong>
                  {e.teamName} {e.mascot}
                  {e.firstPlaceVotes > 0 && <span style={{ color: '#D97706', fontSize: '12px' }}> ({e.firstPlaceVotes})</span>}
                </strong>
              )
            },
            { key: 'state', label: 'State / Class', render: (e) => `${e.state} (${e.classification})` },
            { key: 'record', label: 'Record', align: 'center', render: (e) => `${e.record.wins}-${e.record.losses}` },
            { key: 'points', label: 'Points', align: 'center', render: (e) => <strong style={{ color: '#2563EB' }}>{e.pollPoints}</strong> },
            { key: 'sos', label: 'SoS', align: 'center', render: (e) => e.strengthOfSchedule },
            { key: 'qwins', label: 'Q-Wins', align: 'center', render: (e) => e.qualityWinsCount }
          ]}
        />
      </div>

      {selectedView === 'NATIONAL' && polls.bubbleTeams.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#334155' }}>Others receiving votes</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '13px' }}>
            {polls.bubbleTeams.map((team) => (
              <span
                key={team.teamId}
                style={{
                  background: team.teamId === userTeamId ? '#DBEAFE' : '#fff',
                  border: '1px solid #CBD5E1',
                  padding: '6px 10px',
                  borderRadius: '999px',
                  color: team.teamId === userTeamId ? '#1D4ED8' : '#475569',
                  fontWeight: team.teamId === userTeamId ? 'bold' : 'normal'
                }}
              >
                {team.teamName} ({team.record.wins}-{team.record.losses}) · {team.pollPoints} pts
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
