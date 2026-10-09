import React from 'react';
import { playsThisWeek, useGameStore, userTrainingBoosts } from '../store/gameStore';
import { PHASE_TRAINING, PRACTICE_OPTIONS, PracticeIntensity, PracticePreview, previewPractice } from '../sim/training';
import { SEASON_PHASE_LABELS, getSeasonPhase } from '../sim/scheduleEngine';

const formatMultiplier = (m: number) => `${m}×`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}%`;
const riskPercent = (risk: number) => `${Math.round(risk * 100)}%`;

/**
 * The week's practice: one decision, how hard the team works. Four options on one line; under them, what
 * each would do this week (skill gain across the roster, a starter's fatigue change, the chance someone gets
 * hurt in practice), worked out before the coach advances. Compact (the Hub): the chosen option's effects
 * only. Full (Team › Practice): all four side by side, plus the coaches' boosts.
 */
export const PracticePicker: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const state = useGameStore();
  const { practiceIntensity, setPracticeIntensity, currentWeek, districtTeams, userTeamId } = state;
  const team = districtTeams.find((t) => t.id === userTeamId);
  if (!team) return null;
  const phase = getSeasonPhase(currentWeek);
  const multiplier = PHASE_TRAINING[phase];
  const hasGame = playsThisWeek(state, userTeamId);
  const boosts = userTrainingBoosts(state, team);
  const previews = PRACTICE_OPTIONS.map((o) => previewPractice(team, o.id, phase, hasGame, boosts));
  const chosen = previews.find((p) => p.intensity === practiceIntensity) ?? previews[1];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: '#475569' }}>
          {SEASON_PHASE_LABELS[phase]} · {hasGame ? 'game this week' : 'no game this week'}
        </span>
        <span style={multiplierPill(multiplier)}>{multiplier > 0 ? `${formatMultiplier(multiplier)} training` : 'No training'}</span>
      </div>
      {multiplier === 0 ? (
        <p style={{ fontSize: '13px', color: '#475569', margin: '8px 0 0' }}>No practice in the post season. Training picks up again in the off season.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px', marginTop: '8px' }}>
            {PRACTICE_OPTIONS.map((o) => (
              <button key={o.id} onClick={() => setPracticeIntensity(o.id)} aria-pressed={practiceIntensity === o.id} title={o.help} style={optionBtn(practiceIntensity === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          {compact ? <ChosenEffects preview={chosen} /> : <CompareTable previews={previews} chosen={practiceIntensity} />}
          {!compact && (
            <>
              <p style={{ fontSize: '12px', color: '#475569', margin: '8px 0 0' }}>
                {PRACTICE_OPTIONS.find((o) => o.id === practiceIntensity)?.help} Skill points are shared across every healthy player. Injury risk is the chance at least one player
                gets hurt in practice.
              </p>
              {boosts.sources.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                  {boosts.sources.map((s) => (
                    <span key={s} style={{ ...chip, background: '#DCFCE7', color: '#166534' }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

/** The chosen option in one line of chips (the Hub card). */
const ChosenEffects: React.FC<{ preview: PracticePreview }> = ({ preview }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
    <span style={{ ...chip, ...(preview.skillPoints >= 0.5 ? GAIN : NEUTRAL) }}>
      {preview.skillPoints >= 0.5 ? `+${Math.round(preview.skillPoints)} skill pts` : 'No skill gain'}
    </span>
    <span style={{ ...chip, ...(preview.starterFatigue > 0 ? LOSS : GAIN) }}>Starter fatigue {signed(preview.starterFatigue)}</span>
    <span style={{ ...chip, ...(preview.injuryRisk > 0 ? LOSS : NEUTRAL) }}>Injury risk {riskPercent(preview.injuryRisk)}</span>
  </div>
);

/** All four options side by side (Team › Practice). */
const CompareTable: React.FC<{ previews: PracticePreview[]; chosen: PracticeIntensity }> = ({ previews, chosen }) => {
  const cell = (p: PracticePreview): React.CSSProperties => ({ ...td, ...(p.intensity === chosen ? { background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700 } : {}) });
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '12px', marginTop: '8px' }}>
      <tbody>
        <tr>
          <td style={{ ...td, ...labelTd }}>Skill gain</td>
          {previews.map((p) => (
            <td key={p.intensity} style={cell(p)}>
              {p.skillPoints >= 0.5 ? <span style={{ color: '#15803D' }}>+{Math.round(p.skillPoints)} pts</span> : '—'}
            </td>
          ))}
        </tr>
        <tr>
          <td style={{ ...td, ...labelTd }}>Starter fatigue</td>
          {previews.map((p) => (
            <td key={p.intensity} style={cell(p)}>
              <span style={{ color: p.starterFatigue > 0 ? '#B91C1C' : '#15803D' }}>{signed(p.starterFatigue)}</span>
            </td>
          ))}
        </tr>
        <tr>
          <td style={{ ...td, ...labelTd }}>Injury risk</td>
          {previews.map((p) => (
            <td key={p.intensity} style={cell(p)}>
              <span style={{ color: p.injuryRisk > 0 ? '#B91C1C' : undefined }}>{riskPercent(p.injuryRisk)}</span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
};

const GAIN: React.CSSProperties = { background: '#DCFCE7', color: '#166534' };
const LOSS: React.CSSProperties = { background: '#FEE2E2', color: '#991B1B' };
const NEUTRAL: React.CSSProperties = { background: '#F1F5F9', color: '#475569' };
const chip: React.CSSProperties = { fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '2px 8px' };
const td: React.CSSProperties = { padding: '6px 2px', textAlign: 'center', borderTop: '1px solid #E2E8F0' };
const labelTd: React.CSSProperties = { textAlign: 'left', color: '#475569', width: '68px', lineHeight: 1.2 };

const multiplierPill = (multiplier: number): React.CSSProperties => ({
  ...chip,
  flex: '0 0 auto',
  ...(multiplier >= 2 ? { background: '#FEF3C7', color: '#92400E' } : multiplier > 0 ? NEUTRAL : { background: '#F1F5F9', color: '#94A3B8' })
});

const optionBtn = (active: boolean): React.CSSProperties => ({
  minHeight: '44px',
  padding: '4px 2px',
  borderRadius: '8px',
  border: active ? '2px solid #2563EB' : '1px solid #CBD5E1',
  background: active ? '#EFF6FF' : '#fff',
  color: active ? '#1D4ED8' : '#0F172A',
  fontWeight: 700,
  fontSize: '12px',
  lineHeight: 1.15,
  cursor: 'pointer'
});
