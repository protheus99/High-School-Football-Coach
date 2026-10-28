import React, { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Player } from '../types/game';
import { canBookFix, GRADE_FIX_ORDER, GRADE_FIXES, gpaTrend, gradeList, nextReportCardWeek } from '../sim/grades';
import { rulesForState } from '../sim/stateRules';

const CLASS_SHORT: Record<Player['classYear'], string> = { Freshman: 'Fr', Sophomore: 'So', Junior: 'Jr', Senior: 'Sr' };
const STRING_NAMES: Record<Player['depthChartTier'], string> = { 1: 'Starter', 2: '2nd string', 3: '3rd string' };

/**
 * Team › Grades: every player who is ineligible or close to the line (ineligible first, then at risk, starters first),
 * with his GPA trend and three fixes for the next report card, booked in the prospect cards' button style. One fix
 * per player per report card; tapping a booked fix cancels it for a refund. Opening it counts as this week's review.
 */
export const GradesView: React.FC = () => {
  const { districtTeams, userTeamId, league, currentWeek, currentYear, coachPoints, bookGradeFix, markGradesReviewed, openPlayerCard } = useGameStore();
  useEffect(() => markGradesReviewed(), [markGradesReviewed, currentWeek]);
  const team = districtTeams.find((t) => t.id === userTeamId);
  if (!team) return null;
  const rules = rulesForState(league?.state);
  const players = gradeList(team, rules);
  const weeks = nextReportCardWeek(currentWeek) - currentWeek;

  return (
    <div className="ui-screen" style={{ maxWidth: '760px' }}>
      <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569', lineHeight: 1.45 }}>
        {rules.academics.ruleName}: ineligible under {rules.academics.minimumGpa.toFixed(1)}, at risk under {rules.academics.atRiskGpa.toFixed(1)}. Report cards in{' '}
        <b>{weeks === 1 ? '1 week' : `${weeks} weeks`}</b>: book one fix per player, and it counts then. Tap a booked fix to cancel it for a refund.
      </p>
      {players.length === 0 ? (
        <div style={{ ...card, borderLeft: '5px solid #16A34A', fontSize: '13.5px', color: '#166534' }}>✓ Every player is above the line. Nobody is at risk of sitting.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {players.map((p) => {
            const out = !p.academics.isEligible;
            const booked = p.academics.gradeFix;
            return (
              <div key={p.id} style={{ ...card, ...(out ? { background: '#FFEDD5', border: '1px solid #FDBA74', borderLeft: '5px solid #EA580C' } : { borderLeft: '5px solid #FDBA74' }) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={posChip}>{p.position}</span>
                  <button onClick={() => openPlayerCard(p.id)} style={nameBtn}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>
                      {p.firstName} {p.lastName} · {p.overallRating}
                      {out && <span style={tag}>INELIGIBLE</span>}
                    </span>
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#64748B' }}>
                      {CLASS_SHORT[p.classYear]} · {STRING_NAMES[p.depthChartTier]}
                    </span>
                  </button>
                  <span style={{ fontWeight: 900, fontSize: '15px', color: '#9A3412', fontVariantNumeric: 'tabular-nums' }}>{p.academics.gpa.toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#475569', margin: '6px 0' }}>GPA Trend: {gpaTrend(p).map((g) => g.toFixed(2)).join(' → ')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
                  {GRADE_FIX_ORDER.map((fix) => {
                    const { label, cost, gain } = GRADE_FIXES[fix];
                    const on = booked === fix;
                    const usedTeacher = fix === 'TEACHER' && !on && p.academics.teacherYear === currentYear;
                    const disabled = !on && (!canBookFix(p, fix, currentYear) || coachPoints < cost);
                    return (
                      <button
                        key={fix}
                        onClick={() => bookGradeFix(p.id, fix)}
                        disabled={disabled}
                        aria-pressed={on}
                        style={{ ...fixBtn(disabled), ...(on && { background: '#CBD5E1', color: '#334155', boxShadow: 'none' }) }}
                      >
                        {on ? `✓ ${label}` : label}
                        <span style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>{on ? 'this report' : usedTeacher ? 'used this season' : `₡${cost} · +${gain.toFixed(2)}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '10px 12px',
  border: '1px solid #E2E8F0',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)'
};
const posChip: React.CSSProperties = { flex: '0 0 auto', fontWeight: 900, fontSize: '11px', color: '#fff', background: '#334155', borderRadius: '5px', padding: '2px 6px' };
const nameBtn: React.CSSProperties = { flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' };
const tag: React.CSSProperties = { marginLeft: '6px', fontSize: '10.5px', fontWeight: 900, color: '#fff', background: '#EA580C', borderRadius: '4px', padding: '1px 6px', verticalAlign: '1px' };
// The prospect cards' contact buttons (FeedersScoutingView): the fix over its price and gain
const fixBtn = (disabled: boolean): React.CSSProperties => ({
  minHeight: '40px',
  padding: '6px 4px',
  lineHeight: 1.2,
  borderRadius: '8px',
  border: 'none',
  background: disabled ? '#E2E8F0' : '#2563EB',
  color: disabled ? '#475569' : '#fff',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '12px',
  fontWeight: 'bold'
});
