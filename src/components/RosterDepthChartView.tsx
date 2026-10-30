import React, { useState } from 'react';
import { useScrollTopOnScreenChange } from '../utils/pageScroll';
import { formatPercent } from '../utils/format';
import { useGameStore } from '../store/gameStore';
import { DepthChartBoard } from './DepthChartBoard';
import { DataList } from './ui/DataList';
import { DEFENSE_POSITIONS, OFFENSE_POSITIONS, starterRatings } from '../sim/depthChart';
import type { Player } from '../types/game';
import { DESKTOP_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { CLASS_SHORT, STRING_LABELS, fullName, isNewcomer, playerTrouble, showNewTag } from '../utils/playerFormat';
import { rulesForState } from '../sim/stateRules';
import { FatigueNote, PlayerRow, PosChip, PotentialGrade, TroubleChip } from './ui/PlayerRow';
import { playerRowProps } from './ui/playerRowProps';
import { DEFENSE_GROUPS, OFFENSE_GROUPS, POSITION_GROUPS } from '../data/positionGroups';

export const RosterDepthChartView: React.FC = () => {
  const { districtTeams, userTeamId, moveDepthChartPlayer, openPlayerCard, currentYear, currentWeek } = useGameStore();
  const [view, setView] = useState<'CHART' | 'ROSTER'>('CHART');
  useScrollTopOnScreenChange(view);
  const [filter, setFilterState] = useState<'ALL' | 'OFF' | 'DEF' | 'NEW'>('ALL');
  const [positionGroup, setPositionGroup] = useState('ALL');
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Offense and Defense keep only their own position chips (a group from the other side goes back to All)
  const groupsFor = (f: typeof filter) => POSITION_GROUPS.filter((g) => (f === 'OFF' ? OFFENSE_GROUPS : f === 'DEF' ? DEFENSE_GROUPS : [g.id]).includes(g.id));
  const setFilter = (f: typeof filter) => {
    setFilterState(f);
    if (!groupsFor(f).some((g) => g.id === positionGroup)) setPositionGroup('ALL');
  };

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  // Newcomers: players who joined the program this year (signing day or a transfer)
  const isNew = (p: Player) => isNewcomer(p, currentYear);
  const newTag = (p: Player) => showNewTag(p, currentYear, currentWeek);
  const newcomers = userTeam.roster.filter(isNew).length;
  const bySide = userTeam.roster.filter((p) => {
    if (filter === 'OFF') return OFFENSE_POSITIONS.includes(p.position);
    if (filter === 'DEF') return DEFENSE_POSITIONS.includes(p.position);
    if (filter === 'NEW') return isNew(p);
    return true;
  });
  const inGroup = (p: Player, positions?: Player['position'][]) => !positions || positions.includes(p.position);
  const groupPositions = POSITION_GROUPS.find((g) => g.id === positionGroup)?.positions;
  const filtered = bySide.filter((p) => inGroup(p, groupPositions));
  const ratings = starterRatings(userTeam.roster);

  const atRiskGpa = rulesForState(userTeam.state).academics.atRiskGpa;

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

      {view === 'CHART' && <DepthChartBoard team={userTeam} onMove={moveDepthChartPlayer} onSelect={(p) => openPlayerCard(p.id)} currentYear={currentYear} currentWeek={currentWeek} />}

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
          <div className="ui-chips" role="group" aria-label="Position" style={{ marginBottom: '10px' }}>
            {groupsFor(filter).map((g) => (
              <button key={g.id} className="ui-chip" aria-pressed={positionGroup === g.id} onClick={() => setPositionGroup(g.id)}>
                {g.label}
                <span className="ui-chip-count">{bySide.filter((p) => inGroup(p, g.positions)).length}</span>
              </button>
            ))}
          </div>
          <p className="ui-muted" style={{ margin: '0 0 10px 0' }}>
            Tap a player for his card: stats, grades, recruiting and his depth chart string.
          </p>
          {isDesktop ? (
            <DataList
              rows={filtered}
              rowKey={(p) => p.id}
              onRowClick={(p) => openPlayerCard(p.id)}
              rowTone={(p) => (playerTrouble(p)?.tone === 'out' ? '#FFF7F7' : undefined)}
              columns={[
                { key: 'ovr', label: 'OVR', render: (p) => <strong>{p.overallRating}</strong> },
                {
                  key: 'name',
                  label: 'Player',
                  render: (p) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <PosChip pos={p.position} />
                      <strong>{fullName(p)}</strong>
                      {p.recruiting.starRating > 0 && <span className="pl-stars">({p.recruiting.starRating}★)</span>}
                      {newTag(p) && <span className="pl-new">NEW</span>}
                    </span>
                  )
                },
                { key: 'pot', label: 'Pot', render: (p) => <PotentialGrade grade={p.potential} /> },
                { key: 'class', label: 'Class', render: (p) => CLASS_SHORT[p.classYear] },
                { key: 'string', label: 'String', render: (p) => STRING_LABELS[p.depthChartTier] },
                { key: 'stamina', label: 'Stamina', render: (p) => formatPercent(p.condition.inGameStamina) },
                {
                  key: 'status',
                  label: 'Status',
                  render: (p) => {
                    const trouble = playerTrouble(p, atRiskGpa);
                    return trouble ? <TroubleChip trouble={trouble} /> : <FatigueNote fatigue={p.condition.seasonWear} />;
                  }
                },
                { key: 'gpa', label: 'GPA', render: (p) => p.academics.gpa.toFixed(2) },
                { key: 'offers', label: 'Offers', render: (p) => p.recruiting.offers.length }
              ]}
            />
          ) : filtered.length === 0 ? (
            <div className="ui-muted">Nothing to show.</div>
          ) : (
            <div className="pl-list">
              {filtered.map((p) => (
                <PlayerRow
                  key={p.id}
                  {...playerRowProps(p, { atRiskGpa, isNew: newTag(p) })}
                  onClick={() => openPlayerCard(p.id)}
                  right={<FatigueNote fatigue={p.condition.seasonWear} />}
                />
              ))}
            </div>
          )}
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
