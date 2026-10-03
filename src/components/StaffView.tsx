import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  COACH_ROLES,
  CoachGrade,
  coachGameDayEdge,
  coachGrade,
  CoachRole,
  generateCandidates,
  HiredCoach,
  staffBonuses,
  staffGameDayEdge,
  staffGrade
} from '../sim/coachingStaff';
import { randomPlayerName } from '../generators/names';

const GRADE_COLORS: Record<CoachGrade, string> = {
  'S+': '#7C3AED',
  S: '#8B5CF6',
  'A+': '#B45309',
  A: '#CA8A04',
  'B+': '#2563EB',
  B: '#3B82F6',
  'C+': '#059669',
  C: '#10B981',
  'D+': '#64748B',
  D: '#94A3B8'
};

/**
 * The coaching staff, in the players' terms: each coach's letter grade (S+ down to D) and what their effects do,
 * the staff's overall grade and the benefits it brings. The numbers behind them (the game-day edge out of its
 * +2.0 cap, every multiplier) show only in development builds. Hiring is a placeholder until purchases exist.
 */
export const StaffView: React.FC = () => {
  const { coachingStaff, setCoachingStaff } = useGameStore();
  const [openRole, setOpenRole] = useState<CoachRole | null>(null);
  const [candidates, setCandidates] = useState<Partial<Record<CoachRole, HiredCoach[]>>>({});
  const bonus = staffBonuses(coachingStaff);
  const grade = staffGrade(coachingStaff);
  const name = () => {
    const n = randomPlayerName();
    return `${n.firstName} ${n.lastName}`;
  };

  const browse = (role: CoachRole) => {
    if (openRole === role) return setOpenRole(null);
    if (!candidates[role]) setCandidates({ ...candidates, [role]: generateCandidates(role, name) });
    setOpenRole(role);
  };
  const hire = (coach: HiredCoach) => {
    setCoachingStaff([...coachingStaff.filter((c) => c.role !== coach.role), coach]);
    setCandidates({ ...candidates, [coach.role]: undefined });
    setOpenRole(null);
  };
  const release = (role: CoachRole) => setCoachingStaff(coachingStaff.filter((c) => c.role !== role));

  // What the staff brings, in words
  const benefits = [
    staffGameDayEdge(coachingStaff) > 0 && 'Sharper on game day',
    bonus.weeklyCoachPoints > 0 && 'More Coach Points every week',
    (Object.values(bonus.developmentByPosition).some((v) => (v ?? 0) > 0) || bonus.allPlayersDevelopment > 0 || bonus.freshmanDevelopment > 0) && 'Faster player development',
    bonus.injuryReduction > 0 && 'Fewer injuries',
    bonus.boosterDrift > 0 && 'Happier boosters',
    bonus.complianceDrift > 0 && 'A cleaner program',
    bonus.feederInterest > 0 && 'Stronger recruiting contacts'
  ].filter((b): b is string => !!b);

  return (
    <div className="ui-screen" style={{ maxWidth: '900px' }}>
      {/* The staff at a glance */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {grade ? <GradeBadge grade={grade} large /> : <span style={badgeStyle('#CBD5E1', true)}>–</span>}
        <div style={{ minWidth: 0, fontSize: '13px' }}>
          <div style={{ fontWeight: 'bold' }}>
            Staff grade · {coachingStaff.length} of {COACH_ROLES.length} roles filled
          </div>
          <div style={{ color: '#475569', marginTop: '2px' }}>{benefits.length > 0 ? benefits.join(' · ') : 'Hire assistants to give the program an edge.'}</div>
        </div>
      </div>
      {import.meta.env.DEV && <DebugPanel staff={coachingStaff} />}

      {/* Every role */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {COACH_ROLES.map((info) => {
          const coach = coachingStaff.find((c) => c.role === info.role);
          const open = openRole === info.role;
          return (
            <div key={info.role} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</strong>
                {coach ? <GradeBadge grade={coachGrade(coach.rating)} /> : <span style={{ color: '#94A3B8', fontSize: '12px' }}>Vacant</span>}
              </div>
              {coach && (
                <>
                  <div style={{ color: '#475569', margin: '2px 0 6px' }}>{coach.name}</div>
                  <EffectList coach={coach} />
                </>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button className="ui-btn" style={{ flex: '1 1 120px' }} aria-expanded={open} onClick={() => browse(info.role)}>
                  {open ? 'Close' : coach ? 'Find a replacement' : 'Find candidates'}
                </button>
                {coach && (
                  <button className="ui-btn" style={{ flex: '0 0 auto' }} onClick={() => release(info.role)}>
                    Release
                  </button>
                )}
              </div>
              {open && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  {(candidates[info.role] ?? []).map((c) => (
                    <div key={c.name} style={{ background: '#fff', border: `1px solid ${GRADE_COLORS[coachGrade(c.rating)]}`, borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <GradeBadge grade={coachGrade(c.rating)} />
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 6px' }}>Grade {coachGrade(c.rating)} · price to be set</div>
                      <EffectList coach={c} />
                      <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }} onClick={() => hire(c)}>
                        Hire {c.name.split(' ')[1] ?? c.name} (purchases coming soon)
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const badgeStyle = (color: string, large = false): React.CSSProperties => ({
  flex: '0 0 auto',
  background: color,
  color: '#fff',
  borderRadius: large ? '10px' : '999px',
  padding: large ? '6px 10px' : '1px 9px',
  fontSize: large ? '20px' : '12px',
  fontWeight: 'bold',
  minWidth: large ? '44px' : undefined,
  textAlign: 'center'
});

const GradeBadge: React.FC<{ grade: CoachGrade; large?: boolean }> = ({ grade, large }) => (
  <span style={badgeStyle(GRADE_COLORS[grade], large)} aria-label={`Grade ${grade}`}>
    {grade}
  </span>
);

/** A coach's effects, in words. */
const EffectList: React.FC<{ coach: HiredCoach }> = ({ coach }) => {
  const info = COACH_ROLES.find((r) => r.role === coach.role)!;
  return (
    <ul style={{ margin: 0, paddingLeft: '18px', color: '#334155', fontSize: '12px' }}>
      {info.effects
        .filter((e) => coach.effectIds.includes(e.id))
        .map((e) => (
          <li key={e.id}>
            <strong>{e.name}</strong>: {e.description}
          </li>
        ))}
    </ul>
  );
};

/** Development builds only: the numbers behind the grades (game-day edge out of the +2.0 cap, every bonus). */
const DebugPanel: React.FC<{ staff: HiredCoach[] }> = ({ staff }) => {
  const edge = staffGameDayEdge(staff);
  const bonus = staffBonuses(staff);
  return (
    <details style={{ background: '#FEFCE8', border: '1px dashed #CA8A04', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Debug: staff numbers</summary>
      <div>
        Game-day edge +{edge.toFixed(2)} of +2.00 · CP +{bonus.weeklyCoachPoints}/week ×{bonus.coachPointMultiplier.toFixed(2)} · injuries −{Math.round(bonus.injuryReduction * 100)}% ·
        boosters +{bonus.boosterDrift.toFixed(2)}/wk · compliance +{bonus.complianceDrift.toFixed(2)}/wk · contacts +{Math.round(bonus.feederInterest * 100)}%
      </div>
      <div style={{ marginTop: '4px' }}>{staff.map((c) => `${c.role.toLowerCase().replace(/_/g, ' ')} ${c.rating} (+${coachGameDayEdge(c).toFixed(2)})`).join(' · ') || 'No coaches hired'}</div>
    </details>
  );
};
