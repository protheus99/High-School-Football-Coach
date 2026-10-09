import React from 'react';
import { useGameStore } from '../store/gameStore';
import { InjurySeverity, Player } from '../types/game';
import { formatPercent } from '../utils/format';
import { FATIGUE_LEVELS, fatigueLevel, staminaFromFatigue } from '../sim/training';
import { FatigueChip } from './ui/FatigueChip';
import { FATIGUE_COLORS } from './ui/fatigueColors';

const SEVERITY: Record<Exclude<InjurySeverity, 'HEALTHY'>, { label: string; background: string; color: string }> = {
  DINGED: { label: 'Minor', background: '#FEF3C7', color: '#92400E' },
  MODERATE: { label: 'Moderate', background: '#FFEDD5', color: '#9A3412' },
  SEASON_ENDING: { label: 'Season-ending', background: '#FEE2E2', color: '#991B1B' }
};
const STRING_NAMES: Record<Player['depthChartTier'], string> = { 1: 'Starter', 2: '2nd string', 3: '3rd string' };
/** Fatigue at which players are flagged (Tired and Exhausted): they get hurt more and tire sooner in games. */
const FATIGUE_WATCH = 55;

/**
 * Team › Health: the team's fatigue at a glance (how many players at each level, who needs rest), then who's out
 * and for how long (starters first). Tapping a player opens his card.
 */
export const InjuryReportView: React.FC = () => {
  const { districtTeams, userTeamId, openPlayerCard } = useGameStore();
  const team = districtTeams.find((t) => t.id === userTeamId);
  if (!team) return null;
  const injured = team.roster
    .filter((p) => p.condition.injuryStatus !== 'HEALTHY')
    .sort((a, b) => a.depthChartTier - b.depthChartTier || b.condition.injuryWeeksRemaining - a.condition.injuryWeeksRemaining);
  const healthy = team.roster.filter((p) => p.condition.injuryStatus === 'HEALTHY');
  const tired = healthy.filter((p) => p.condition.seasonWear >= FATIGUE_WATCH).sort((a, b) => b.condition.seasonWear - a.condition.seasonWear);
  const startersOut = injured.filter((p) => p.depthChartTier === 1).length;
  const counts = FATIGUE_LEVELS.map((l) => ({ ...l, count: healthy.filter((p) => fatigueLevel(p.condition.seasonWear) === l.level).length }));
  const healthyStarters = healthy.filter((p) => p.depthChartTier === 1);
  const starterAverage = healthyStarters.length ? healthyStarters.reduce((sum, p) => sum + p.condition.seasonWear, 0) / healthyStarters.length : 0;

  return (
    <div className="ui-screen" style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        <span style={summaryChip}>
          Out: <b>{injured.length}</b>
          {injured.length > 0 && ` (${startersOut} ${startersOut === 1 ? 'starter' : 'starters'})`}
        </span>
        <span style={summaryChip}>
          Tired or worse: <b>{tired.length}</b>
        </span>
      </div>

      <h3 className="ui-subsection-title" style={{ margin: '0 0 6px' }}>
        Fatigue
      </h3>
      <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', fontSize: '12px', fontWeight: 700 }} aria-label="Healthy players by fatigue level">
        {counts
          .filter((c) => c.count > 0)
          .map((c) => (
            <div key={c.level} title={`${c.level}: ${c.count}`} style={{ flex: c.count, display: 'flex', alignItems: 'center', justifyContent: 'center', ...FATIGUE_COLORS[c.level] }}>
              {c.count}
            </div>
          ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginTop: '3px' }}>
        {counts.map((c) => (
          <span key={c.level}>
            {c.level} {c.count}
          </span>
        ))}
      </div>
      <p style={{ ...emptyNote, margin: '6px 0 0' }}>
        Starters average <FatigueChip fatigue={starterAverage} />. Games and hard practice tire players; Limited, No practice and Week off let them recover.
      </p>

      <h3 className="ui-subsection-title" style={{ margin: '18px 0 6px' }}>
        Needs rest
      </h3>
      {tired.length === 0 ? (
        <p style={emptyNote}>Nobody is tired.</p>
      ) : (
        <div style={list}>
          {tired.map((p) => (
            <button key={p.id} onClick={() => openPlayerCard(p.id)} style={row}>
              <span style={{ minWidth: 0 }}>
                <span style={playerName}>
                  {p.position} {p.firstName[0]}. {p.lastName}
                </span>
                <span style={detail}>
                  {p.classYear} · {STRING_NAMES[p.depthChartTier]} · starts games at {formatPercent(staminaFromFatigue(p.condition.seasonWear))} stamina
                </span>
              </span>
              <FatigueChip fatigue={p.condition.seasonWear} />
            </button>
          ))}
        </div>
      )}

      <h3 className="ui-subsection-title" style={{ margin: '18px 0 6px' }}>
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

      <h3 className="ui-subsection-title" style={{ margin: '18px 0 6px' }}>
        What fatigue does
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', color: '#334155' }}>
        <tbody>
          {FATIGUE_LEVELS.map((l, i) => (
            <tr key={l.level}>
              <td style={legendTd}>
                <FatigueChip fatigue={l.min} showPercent={false} />
              </td>
              <td style={legendTd}>
                {formatPercent(l.min)}
                {i < FATIGUE_LEVELS.length - 1 ? `–${FATIGUE_LEVELS[i + 1].min - 1}%` : '+'}
              </td>
              <td style={legendTd}>{l.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
const legendTd: React.CSSProperties = { padding: '5px 4px 5px 0', borderTop: '1px solid #E2E8F0' };
const emptyNote: React.CSSProperties = { fontSize: '13px', color: '#475569', margin: '0 0 6px' };
