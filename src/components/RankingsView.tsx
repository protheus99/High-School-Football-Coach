import React, { useState } from 'react';
import { StateAndNationalPolls, RankedTeamEntry } from '../types/game';
import { DataList } from './ui/DataList';
import { schoolWithState } from '../utils/format';
import { shortName } from '../utils/shortName';

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

  const national = selectedView === 'NATIONAL';
  // The first poll of the season has nothing to compare with: every team is "new", so no team gets a mark
  const firstPoll = activeEntries.length > 0 && activeEntries.every((e) => e.movement === 'NEW_ENTRY');

  /** The week's move after the name: a green ▲ 3 up, a red ▼ 2 down, "new" for a team that wasn't ranked; nothing if it held. */
  const renderMovementBadge = (entry: RankedTeamEntry) => {
    if (entry.movement === 'UP') return <span style={{ color: '#15803D', fontWeight: 'bold', fontSize: '12px', whiteSpace: 'nowrap' }}>▲ {entry.movementDelta}</span>;
    if (entry.movement === 'DOWN') return <span style={{ color: '#DC2626', fontWeight: 'bold', fontSize: '12px', whiteSpace: 'nowrap' }}>▼ {entry.movementDelta}</span>;
    if (entry.movement === 'NEW_ENTRY' && !firstPoll) return <span style={{ color: '#2563EB', fontWeight: 'bold', fontStyle: 'italic', fontSize: '12px' }}>new</span>;
    return null;
  };

  /** The school as the poll shows it: "St. Thomas Aquinas" and "(FL)" in the national poll, just the school in a state's
   *  poll (every team there is from that state). A name too long for one line on a phone uses the school's short name. */
  const school = (e: RankedTeamEntry, phone: boolean) => {
    const full = national ? schoolWithState(e.teamName, e.state) : e.teamName;
    const cut = national ? full.lastIndexOf(' (') : full.length;
    let name = full.slice(0, cut);
    const extras = (national ? 5 : 0) + (e.movement === 'UP' || e.movement === 'DOWN' ? 4 : e.movement === 'NEW_ENTRY' && !firstPoll ? 4 : 0) + (e.firstPlaceVotes > 0 ? 5 : 0);
    if (phone && name.length + extras > 36) name = shortName({ name: e.teamName, state: e.state });
    return { name, state: national ? full.slice(cut + 1) : '' };
  };
  const votes = (e: RankedTeamEntry) => e.firstPlaceVotes > 0 && <span style={{ color: '#B45309', fontSize: '12px', fontWeight: 'normal' }}>({e.firstPlaceVotes})</span>;

  const title = national ? 'National Top 25' : `${selectedView} Top 25`;
  // Computer rating: points better than an average team; schedule = average opponent rating
  const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

  return (
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
        {title} - Week {polls.week} rankings
      </h3>

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

      {/* Phones: one line per team, "St. Thomas Aquinas (FL) ▲ 1" */}
      <div className="ui-standings">
        {activeEntries.map((entry) => {
          const isUserTeam = entry.teamId === userTeamId;
          const s = school(entry, true);
          return (
            <div key={entry.teamId} className="ui-standings-row" style={{ minHeight: '40px', padding: '4px 12px', background: isUserTeam ? '#EFF6FF' : undefined, fontWeight: isUserTeam ? 'bold' : undefined }}>
              <strong style={{ flex: '0 0 auto', width: '24px', textAlign: 'right', color: entry.rank <= 5 ? '#D97706' : '#1E293B', fontSize: '15px' }}>{entry.rank}</strong>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'baseline', gap: '5px', whiteSpace: 'nowrap' }}>
                  {s.state && <span style={{ color: '#64748B', fontSize: '12.5px', fontWeight: 'bold' }}>{s.state}</span>}
                  {renderMovementBadge(entry)}
                  {votes(entry)}
                </span>
              </span>
              <span className="ui-standings-record">
                <strong>
                  {entry.record.wins}-{entry.record.losses}
                </strong>
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
              render: (e) => {
                const s = school(e, false);
                return (
                  <strong>
                    {s.name}
                    {s.state && <span style={{ color: '#64748B', fontSize: '12.5px' }}> {s.state}</span>} {votes(e)}
                  </strong>
                );
              }
            },
            { key: 'state', label: 'State / Class', render: (e) => `${e.state} (${e.classification})` },
            { key: 'record', label: 'Record', align: 'center', render: (e) => `${e.record.wins}-${e.record.losses}` },
            { key: 'sos', label: 'SoS', align: 'center', render: (e) => signed(e.strengthOfSchedule) },
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
                {team.teamName} ({team.record.wins}-{team.record.losses})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
