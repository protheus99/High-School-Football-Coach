import React, { useState } from 'react';
import { DataList } from './ui/DataList';
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
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
      <h2 style={{ margin: '0 0 4px 0' }}>🌟 {isProspects ? 'Prospect Rankings' : 'Stat Leaders'}</h2>
      <p className="ui-muted" style={{ margin: '0 0 12px 0' }}>
        Week {rankingsState.week} · tap a player for his profile
      </p>

      {/* Mode switch */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
        <button className={`ui-btn${isProspects ? ' ui-btn-primary' : ''}`} aria-pressed={isProspects} onClick={() => setActiveTab('PROSPECT_RANKINGS')}>
          🎓 Prospects
        </button>
        <button className={`ui-btn${!isProspects ? ' ui-btn-primary' : ''}`} aria-pressed={!isProspects} onClick={() => setActiveTab('STAT_LEADERS')}>
          📊 Stat leaders
        </button>
      </div>

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
        <div className="ui-chips" role="group" aria-label="Position" style={{ marginBottom: '12px' }}>
          <button className="ui-chip" aria-pressed={selectedPosition === 'OVERALL_TOP_100'} onClick={() => setSelectedPosition('OVERALL_TOP_100')}>
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

      <DataList
        rows={entries}
        rowKey={(e) => e.player.id}
        onRowClick={onSelectPlayer}
        rowTone={(e) => (e.teamId === userTeamId ? '#EFF6FF' : undefined)}
        empty="No players in this list yet."
        columns={[
          { key: 'rank', label: 'Rank', badge: true, render: (e) => <span style={{ color: e.rank <= 3 ? '#D97706' : '#1E293B' }}>#{e.rank}</span> },
          {
            key: 'name',
            label: 'Player',
            primary: true,
            render: (e) => (
              <span style={{ color: e.teamId === userTeamId ? '#1D4ED8' : '#0F172A' }}>
                {e.player.firstName} {e.player.lastName}
              </span>
            )
          },
          { key: 'pos', label: 'Pos / Class', render: (e) => `${e.player.position} · ${e.player.classYear}` },
          { key: 'school', label: 'School', render: (e) => e.teamName },
          { key: 'state', label: 'State', desktopOnly: true, render: (e) => `${e.state} (${e.classification})` },
          isProspects
            ? { key: 'stars', label: 'Stars', render: (e) => <span style={{ color: '#D97706' }}>{renderStarBadges(e.player.recruiting.starRating)}</span> }
            : { key: 'stat', label: 'Production', render: (e) => <strong>{e.primaryStatLine}</strong> },
          isProspects
            ? { key: 'grade', label: 'Recruit grade', render: (e) => <strong style={{ color: '#2563EB' }}>{e.compositeRecruitScore} pts</strong> }
            : { key: 'ovr', label: 'OVR', desktopOnly: true, render: (e) => (e.teamId === userTeamId ? e.player.overallRating : '—') }
        ]}
      />
    </div>
  );
};
