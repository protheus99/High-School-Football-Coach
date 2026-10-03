import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  COACH_ROLES,
  CoachRole,
  coachGameDayEdge,
  coachTier,
  effectStrength,
  generateCandidates,
  HiredCoach,
  staffBonuses,
  STAFF_DEVELOPMENT_CAP,
  staffGameDayEdge
} from '../sim/coachingStaff';
import { randomPlayerName } from '../generators/names';

const TIER_COLORS: Record<ReturnType<typeof coachTier>, string> = { Bronze: '#B45309', Silver: '#64748B', Gold: '#CA8A04', Elite: '#7C3AED' };
const MAX_EDGE = 2;

/**
 * The paid coaching staff: what the staff adds (game-day edge out of the +2.0 cap, Coach Points, development,
 * injuries), every role with its coach and effects, and candidates to hire. Hiring is a placeholder until
 * purchases exist.
 */
export const StaffView: React.FC = () => {
  const { coachingStaff, setCoachingStaff } = useGameStore();
  const [openRole, setOpenRole] = useState<CoachRole | null>(null);
  const [candidates, setCandidates] = useState<Partial<Record<CoachRole, HiredCoach[]>>>({});
  const edge = staffGameDayEdge(coachingStaff);
  const bonus = staffBonuses(coachingStaff);
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
  // A player's extra growth a season: his position coach, the strength program and the JV staff, at most +0.5
  const devTotal = Math.min(STAFF_DEVELOPMENT_CAP, Math.max(0, ...Object.values(bonus.developmentByPosition).map((v) => v ?? 0)) + bonus.allPlayersDevelopment + bonus.freshmanDevelopment);

  return (
    <div className="ui-screen" style={{ maxWidth: '900px' }}>
      {/* What the staff adds */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
          <span>Game-day edge</span>
          <span style={{ color: '#4F46E5' }}>
            +{edge.toFixed(2)} of +{MAX_EDGE.toFixed(1)}
          </span>
        </div>
        <div style={{ background: '#E2E8F0', height: '8px', borderRadius: '4px' }} aria-hidden="true">
          <div style={{ width: `${(edge / MAX_EDGE) * 100}%`, background: '#4F46E5', height: '100%', borderRadius: '4px' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '10px', fontSize: '12px', color: '#334155' }}>
          <span>₡ +{bonus.weeklyCoachPoints}/week{bonus.coachPointMultiplier > 1 ? ` · +${Math.round((bonus.coachPointMultiplier - 1) * 100)}% income` : ''}</span>
          <span>📈 Development up to +{devTotal.toFixed(1)}/season</span>
          <span>🩹 Injuries −{Math.round(bonus.injuryReduction * 100)}%</span>
          <span>🧑‍🏫 {coachingStaff.length} of {COACH_ROLES.length} hired</span>
        </div>
        <p className="ui-muted" style={{ margin: '8px 0 0', fontSize: '12px' }}>
          Coaches help but never decide games: the whole staff adds at most +2.0 on game day (about 73% against an equal team).
        </p>
      </div>

      {/* Every role */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {COACH_ROLES.map((info) => {
          const coach = coachingStaff.find((c) => c.role === info.role);
          const open = openRole === info.role;
          return (
            <div key={info.role} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</strong>
                {coach ? <RatingBadge rating={coach.rating} /> : <span style={{ color: '#94A3B8', fontSize: '12px' }}>Vacant</span>}
              </div>
              {coach && (
                <>
                  <div style={{ color: '#475569', margin: '2px 0 6px' }}>
                    {coach.name}
                    {coachGameDayEdge(coach) > 0 && <span style={{ color: '#4F46E5' }}> · +{coachGameDayEdge(coach).toFixed(2)} game day</span>}
                  </div>
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
                    <div key={c.name} style={{ background: '#fff', border: `1px solid ${TIER_COLORS[coachTier(c.rating)]}`, borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <RatingBadge rating={c.rating} />
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 6px' }}>
                        {coachTier(c.rating)} tier{coachGameDayEdge(c) > 0 ? ` · +${coachGameDayEdge(c).toFixed(2)} game day` : ''} · price to be set
                      </div>
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

const RatingBadge: React.FC<{ rating: number }> = ({ rating }) => (
  <span style={{ flex: '0 0 auto', background: TIER_COLORS[coachTier(rating)], color: '#fff', borderRadius: '999px', padding: '1px 8px', fontSize: '12px', fontWeight: 'bold' }}>
    {rating}
  </span>
);

/** A coach's effects, each at the strength the coach's rating delivers. */
const EffectList: React.FC<{ coach: HiredCoach }> = ({ coach }) => {
  const info = COACH_ROLES.find((r) => r.role === coach.role)!;
  const k = effectStrength(coach.rating);
  return (
    <ul style={{ margin: 0, paddingLeft: '18px', color: '#334155', fontSize: '12px' }}>
      {info.effects
        .filter((e) => coach.effectIds.includes(e.id))
        .map((e) => (
          <li key={e.id}>
            <strong>{e.name}</strong>: {e.description}
            {e.kind === 'GAME_DAY' && e.gameDayEdge ? ` (+${(e.gameDayEdge * k).toFixed(2)})` : ''}
          </li>
        ))}
    </ul>
  );
};
