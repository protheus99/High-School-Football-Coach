import React from 'react';
import { useGameStore } from '../store/gameStore';
import { InjurySeverity, Player } from '../types/game';
import { formatPercent } from '../utils/format';

const SEVERITY: Record<Exclude<InjurySeverity, 'HEALTHY'>, { label: string; background: string; color: string }> = {
  DINGED: { label: 'Minor', background: '#FEF3C7', color: '#92400E' },
  MODERATE: { label: 'Moderate', background: '#FFEDD5', color: '#9A3412' },
  SEASON_ENDING: { label: 'Season-ending', background: '#FEE2E2', color: '#991B1B' }
};
const STRING_NAMES: Record<Player['depthChartTier'], string> = { 1: 'Starter', 2: '2nd string', 3: '3rd string' };
/** Wear at which players are flagged: tired players get hurt more. */
const WEAR_WATCH = 60;

/**
 * Team › Injuries: who's out and for how long (starters first), and the healthy players worn down enough to be at risk.
 * Tapping a player opens his card.
 */
export const InjuryReportView: React.FC = () => {
  const { districtTeams, userTeamId, openPlayerCard } = useGameStore();
  const team = districtTeams.find((t) => t.id === userTeamId);
  if (!team) return null;
  const injured = team.roster
    .filter((p) => p.condition.injuryStatus !== 'HEALTHY')
    .sort((a, b) => a.depthChartTier - b.depthChartTier || b.condition.injuryWeeksRemaining - a.condition.injuryWeeksRemaining);
  const worn = team.roster
    .filter((p) => p.condition.injuryStatus === 'HEALTHY' && p.condition.seasonWear >= WEAR_WATCH)
    .sort((a, b) => b.condition.seasonWear - a.condition.seasonWear);
  const startersOut = injured.filter((p) => p.depthChartTier === 1).length;

  return (
    <div className="ui-screen" style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        <span style={summaryChip}>
          Out: <b>{injured.length}</b>
          {injured.length > 0 && ` (${startersOut} ${startersOut === 1 ? 'starter' : 'starters'})`}
        </span>
        <span style={summaryChip}>
          Wear watch: <b>{worn.length}</b>
        </span>
      </div>

      <h3 className="ui-subsection-title" style={{ margin: '0 0 6px' }}>
        Out
      </h3>
      {injured.length === 0 ? (
        <p style={emptyNote}>No injuries. Everyone is available.</p>
      ) : (
        <div style={list}>
          {injured.map((p) => {
            const severity = SEVERITY[p.condition.injuryStatus as Exclude<InjurySeverity, 'HEALTHY'>];
            const weeks = p.condition.injuryWeeksRemaining;
            return (
              <button key={p.id} onClick={() => openPlayerCard(p.id)} style={row}>
                <span style={{ minWidth: 0 }}>
                  <span style={playerName}>
                    {p.position} {p.firstName[0]}. {p.lastName}
                  </span>
                  <span style={detail}>
                    {p.classYear} · {STRING_NAMES[p.depthChartTier]} · {p.overallRating} OVR
                  </span>
                </span>
                <span style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  <span style={{ ...chip, background: severity.background, color: severity.color }}>{severity.label}</span>
                  <span style={{ ...detail, fontWeight: 700, color: '#334155' }}>
                    {p.condition.injuryStatus === 'SEASON_ENDING' ? 'Out for the season' : `Out ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <h3 className="ui-subsection-title" style={{ margin: '18px 0 2px' }}>
        Wear watch
      </h3>
      <p style={{ ...emptyNote, margin: '0 0 6px' }}>Healthy players at {WEAR_WATCH}% season wear or more get hurt more often. A Walkthrough practice week lets legs recover.</p>
      {worn.length === 0 ? (
        <p style={emptyNote}>Nobody is worn down.</p>
      ) : (
        <div style={list}>
          {worn.map((p) => (
            <button key={p.id} onClick={() => openPlayerCard(p.id)} style={row}>
              <span style={{ minWidth: 0 }}>
                <span style={playerName}>
                  {p.position} {p.firstName[0]}. {p.lastName}
                </span>
                <span style={detail}>
                  {p.classYear} · {STRING_NAMES[p.depthChartTier]}
                </span>
              </span>
              <span style={{ ...chip, background: '#FEF3C7', color: '#92400E', flex: '0 0 auto' }}>Wear {formatPercent(p.condition.seasonWear)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const summaryChip: React.CSSProperties = { fontSize: '13px', background: '#F1F5F9', color: '#334155', borderRadius: '999px', padding: '4px 10px' };
const list: React.CSSProperties = { display: 'grid', gap: '6px' };
const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  minHeight: '52px',
  padding: '8px 12px',
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  textAlign: 'left',
  font: 'inherit',
  color: '#0F172A',
  cursor: 'pointer'
};
const playerName: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const detail: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#475569', marginTop: '2px' };
const chip: React.CSSProperties = { display: 'inline-block', fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '2px 8px' };
const emptyNote: React.CSSProperties = { fontSize: '13px', color: '#475569', margin: '0 0 6px' };
