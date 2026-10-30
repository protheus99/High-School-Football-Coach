import React, { useState } from 'react';
import { useScrollTopOnScreenChange } from '../utils/pageScroll';
import { PageHeader } from './ui/PageHeader';
import { DataList } from './ui/DataList';
import {
  PlayerRankingsAndStatsState,
  StatCategory,
  Position,
  RankedPlayerEntry
} from '../types/game';
import { DESKTOP_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { CLASS_SHORT, fullName, starsLabel } from '../utils/playerFormat';
import { PlayerRow, PosChip } from './ui/PlayerRow';
import { playerRowProps } from './ui/playerRowProps';

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
  useScrollTopOnScreenChange(activeTab);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
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

  const isProspects = activeTab === 'PROSPECT_RANKINGS';
  const entries = isProspects ? activeProspectEntries : activeStatEntries;
  const STAT_CATEGORIES: { cat: StatCategory; label: string }[] = [
    { cat: 'PASS_YARDS', label: 'Pass yds' },
    { cat: 'PASS_TDS', label: 'Pass TD' },
    { cat: 'RUSH_YARDS', label: 'Rush yds' },
    { cat: 'RUSH_TDS', label: 'Rush TD' },
    { cat: 'REC_YARDS', label: 'Rec yds' },
    { cat: 'TACKLES', label: 'Tackles' },
    { cat: 'SACKS', label: 'Sacks' },
    { cat: 'INTERCEPTIONS', label: 'INT' }
  ];

  return (
    <>
    <PageHeader
      title="Leaders"
      subtitle={`${isProspects ? 'Recruit rankings' : 'Stat leaders'} · week ${rankingsState.week} · tap a player for his profile`}
      tabs={[
        { id: 'PROSPECT_RANKINGS' as const, label: '🎓 Recruits' },
        { id: 'STAT_LEADERS' as const, label: '📊 Stat Leaders' }
      ]}
      active={activeTab}
      onTab={setActiveTab}
    />
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>

      <div className="ui-chips" role="group" aria-label="Scope" style={{ marginBottom: '6px' }}>
        <button className="ui-chip" aria-pressed={scope === 'NATIONAL'} onClick={() => setScope('NATIONAL')}>
          Nationwide
        </button>
        {availableStates.map((st) => (
          <button key={st} className="ui-chip" aria-pressed={scope === st} onClick={() => setScope(st)}>
            {st}
          </button>
        ))}
      </div>

      {isProspects ? (
        <div className="ui-chip-grid" role="group" aria-label="Position" style={{ marginBottom: '12px' }}>
          <button className="ui-chip" style={{ gridColumn: 'span 2' }} aria-pressed={selectedPosition === 'OVERALL_TOP_100'} onClick={() => setSelectedPosition('OVERALL_TOP_100')}>
            🔥 Top 100
          </button>
          {(['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S', 'K', 'P'] as Position[]).map((pos) => (
            <button key={pos} className="ui-chip" aria-pressed={selectedPosition === pos} onClick={() => setSelectedPosition(pos)}>
              {pos}
            </button>
          ))}
        </div>
      ) : (
        <div className="ui-chips" role="group" aria-label="Stat" style={{ marginBottom: '12px' }}>
          {STAT_CATEGORIES.map((item) => (
            <button key={item.cat} className="ui-chip" aria-pressed={selectedStatCat === item.cat} onClick={() => setSelectedStatCat(item.cat)}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {isDesktop ? (
        <DataList
          rows={entries}
          rowKey={(e) => e.player.id}
          onRowClick={onSelectPlayer}
          rowTone={(e) => (e.teamId === userTeamId ? '#EFF6FF' : undefined)}
          empty="No players in this list yet."
          columns={[
            { key: 'rank', label: 'Rank', render: (e) => <strong style={{ color: e.rank <= 3 ? '#B45309' : '#1E293B' }}>#{e.rank}</strong> },
            {
              key: 'name',
              label: 'Player',
              render: (e) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <PosChip pos={e.player.position} />
                  <strong>{fullName(e.player)}</strong>
                  {e.player.recruiting.starRating > 0 && <span className="pl-stars">{starsLabel(e.player.recruiting.starRating)}</span>}
                </span>
              )
            },
            { key: 'class', label: 'Class', render: (e) => CLASS_SHORT[e.player.classYear] },
            { key: 'school', label: 'School', render: (e) => e.teamName },
            { key: 'state', label: 'State', render: (e) => `${e.state} (${e.classification})` },
            isProspects
              ? { key: 'grade', label: 'Recruit grade', render: (e) => <strong>{e.compositeRecruitScore} pts</strong> }
              : { key: 'stat', label: 'Production', render: (e) => <strong>{e.primaryStatLine}</strong> },
            ...(isProspects ? [] : [{ key: 'ovr', label: 'OVR', render: (e: RankedPlayerEntry) => (e.teamId === userTeamId ? e.player.overallRating : '—') }])
          ]}
        />
      ) : entries.length === 0 ? (
        <div className="ui-muted">No players in this list yet.</div>
      ) : (
        <div className="pl-list">
          {entries.map((e) => (
            <PlayerRow
              key={e.player.id}
              {...playerRowProps(e.player, { own: false, extra: [e.teamName] })}
              rank={e.rank}
              tone={e.teamId === userTeamId ? 'mine' : undefined}
              onClick={() => onSelectPlayer(e)}
              right={<span className="pl-stat">{isProspects ? `${e.compositeRecruitScore} pts` : e.primaryStatLine}</span>}
            />
          ))}
        </div>
      )}
    </div>
    </>
  );
};
