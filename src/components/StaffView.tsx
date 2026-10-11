import React, { useState } from 'react';
import { getSeasonPhase } from '../sim/scheduleEngine';
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
import { formatCP } from '../sim/coachPoints';
import {
  amountDue,
  coachPrice,
  CONTRACT_YEARS,
  ContractYears,
  DUCATS_LIVE,
  FIRST_OFF_SEASON_WEEK,
  firstContractSeason,
  formatPrice,
  needsSettling,
  settleKind,
  STAFF_LOCK_WEEK,
  staffWindowOpen
} from '../sim/staffContracts';

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
 * The coaching staff, in the players' terms: each coach's letter grade (S+ down to D), what their effects do, what
 * they cost a season and how long their contract runs. Hiring and releasing are open in the off-season and
 * pre-season only; in the off-season every coach needs next season paid (renew, pay or let go). The numbers behind
 * the grades show only in development builds.
 */
export const StaffView: React.FC = () => {
  const { coachingStaff, currentWeek, currentYear, coachPoints, hireCoach, releaseCoach } = useGameStore();
  const [openRole, setOpenRole] = useState<CoachRole | null>(null);
  const [candidates, setCandidates] = useState<Partial<Record<CoachRole, HiredCoach[]>>>({});
  const [picked, setPicked] = useState<{ name: string; years: ContractYears } | null>(null);
  const bonus = staffBonuses(coachingStaff);
  const grade = staffGrade(coachingStaff);
  const open = staffWindowOpen(currentWeek);
  const due = coachingStaff.filter((c) => needsSettling(c, currentWeek, currentYear));
  const name = () => {
    const n = randomPlayerName();
    return `${n.firstName} ${n.lastName}`;
  };

  const browse = (role: CoachRole) => {
    if (openRole === role) return setOpenRole(null);
    if (!candidates[role]) setCandidates({ ...candidates, [role]: generateCandidates(role, name) });
    setPicked(null);
    setOpenRole(role);
  };
  const hire = (coach: HiredCoach, years: ContractYears) => {
    if (hireCoach(coach, years)) return;
    setCandidates({ ...candidates, [coach.role]: undefined });
    setOpenRole(null);
    setPicked(null);
  };

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
      <StaffWindowBanner week={currentWeek} />
      {due.length > 0 && <SettlePanel due={due} />}
      {import.meta.env.DEV && <DebugPanel staff={coachingStaff} />}

      {/* Every role */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
        {COACH_ROLES.map((info) => {
          const coach = coachingStaff.find((c) => c.role === info.role);
          const browsing = open && openRole === info.role;
          return (
            <div key={info.role} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.title}</strong>
                {coach ? <GradeBadge grade={coachGrade(coach.rating)} /> : <span style={{ color: '#64748B', fontSize: '12px' }}>Vacant</span>}
              </div>
              {coach && (
                <>
                  <div style={{ color: '#475569', margin: '2px 0 2px' }}>{coach.name}</div>
                  <div style={{ color: '#64748B', fontSize: '12px', marginBottom: '6px' }}>
                    {formatPrice(coachPrice(coach.rating))} a season{coach.contractEndSeason !== undefined ? ` · signed through ${coach.contractEndSeason}` : ''}
                  </div>
                  <EffectList coach={coach} />
                </>
              )}
              {open ? (
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button className="ui-btn" style={{ flex: '1 1 120px' }} aria-expanded={browsing} onClick={() => browse(info.role)}>
                    {browsing ? 'Close' : coach ? 'Find a replacement' : 'Find candidates'}
                  </button>
                  {coach && (
                    <button className="ui-btn" style={{ flex: '0 0 auto' }} onClick={() => releaseCoach(info.role)}>
                      Release
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}>🔒 Locked until the off-season</div>
              )}
              {browsing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  {(candidates[info.role] ?? []).map((c) => (
                    <CandidateCard
                      key={c.name}
                      coach={c}
                      selected={picked?.name === c.name}
                      years={picked?.name === c.name ? picked.years : 1}
                      coachPoints={coachPoints}
                      startSeason={firstContractSeason(currentWeek, currentYear)}
                      onSelect={() => setPicked({ name: c.name, years: picked?.name === c.name ? picked.years : 1 })}
                      onYears={(years) => setPicked({ name: c.name, years })}
                      onHire={(years) => hire(c, years)}
                    />
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

/** One candidate: grade, price a season, effects; tap to pick a contract length and hire. */
const CandidateCard: React.FC<{
  coach: HiredCoach;
  selected: boolean;
  years: ContractYears;
  coachPoints: number;
  startSeason: number;
  onSelect: () => void;
  onYears: (years: ContractYears) => void;
  onHire: (years: ContractYears) => void;
}> = ({ coach, selected, years, coachPoints, startSeason, onSelect, onYears, onHire }) => {
  const price = coachPrice(coach.rating);
  const g = coachGrade(coach.rating);
  const ducats = price.currency === 'DUCATS';
  return (
    <div
      onClick={onSelect}
      style={{ background: '#fff', border: selected ? '2px solid #4F46E5' : `1px solid ${GRADE_COLORS[g]}`, borderRadius: '8px', padding: '10px', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 'bold', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{coach.name}</span>
        <GradeBadge grade={g} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', margin: '2px 0 6px' }}>
        <span style={{ color: '#64748B' }}>A season</span>
        <strong style={{ color: ducats ? '#B45309' : '#1D4ED8' }}>{formatPrice(price)}</strong>
      </div>
      <EffectList coach={coach} />
      {selected &&
        (ducats && !DUCATS_LIVE ? (
          <button className="ui-btn ui-btn-block" disabled style={{ marginTop: '8px' }}>
            Coming soon: coaches paid in ducats
          </button>
        ) : (
          <>
            <div role="group" aria-label="Contract length" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '8px' }}>
              {CONTRACT_YEARS.map((n) => (
                <button
                  key={n}
                  aria-pressed={years === n}
                  onClick={(e) => {
                    e.stopPropagation();
                    onYears(n);
                  }}
                  style={{
                    minHeight: '40px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    border: `2px solid ${years === n ? '#4F46E5' : '#CBD5E1'}`,
                    background: years === n ? '#EEF2FF' : '#fff',
                    color: years === n ? '#3730A3' : '#0F172A'
                  }}
                >
                  {n} {n === 1 ? 'season' : 'seasons'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginTop: '6px' }}>
              <span style={{ color: '#64748B' }}>
                {startSeason}
                {years > 1 ? `–${startSeason + years - 1}` : ''} · {formatPrice({ ...price, amount: price.amount * years })} in all
              </span>
            </div>
            {coachPoints < price.amount ? (
              <button className="ui-btn ui-btn-block" disabled style={{ marginTop: '8px' }}>
                Needs {formatCP(price.amount - coachPoints)} more
              </button>
            ) : (
              <button
                className="ui-btn ui-btn-block"
                style={{ marginTop: '8px', background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onHire(years);
                }}
              >
                Hire {coach.name.split(' ')[1] ?? coach.name} · pay {formatPrice(price)} now
              </button>
            )}
          </>
        ))}
    </div>
  );
};

/** When the staff can change: open in the off-season and pre-season, locked from the season opener. */
const StaffWindowBanner: React.FC<{ week: number }> = ({ week }) => {
  const open = staffWindowOpen(week);
  const offSeason = getSeasonPhase(week) === 'OFF_SEASON';
  const weeksLeft = STAFF_LOCK_WEEK - week;
  return (
    <div
      style={{
        borderRadius: '10px',
        padding: '10px 12px',
        marginBottom: '12px',
        fontSize: '13px',
        ...(open ? { background: '#F0FDF4', border: '1px solid #86EFAC', borderLeft: '6px solid #16A34A' } : { background: '#F1F5F9', border: '1px dashed #94A3B8' })
      }}
    >
      <strong>{open ? '🧑‍🏫 Staff hiring is open' : '🔒 The staff is locked for the season'}</strong>
      <div style={{ color: '#475569', marginTop: '2px' }}>
        {open
          ? offSeason
            ? `Hire and release through the off-season and pre-season. The staff locks at the season opener (Week ${STAFF_LOCK_WEEK}).`
            : `The staff locks at the season opener (Week ${STAFF_LOCK_WEEK}): ${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left.`
          : `No hires or releases until the off-season (Week ${FIRST_OFF_SEASON_WEEK}), when next season's contracts come up.`}
      </div>
    </div>
  );
};

/** The off-season: coaches whose next season isn't paid yet. Renew or pay to keep them; the rest leave when the off-season ends. */
const SettlePanel: React.FC<{ due: HiredCoach[] }> = ({ due }) => {
  const { currentYear, coachPoints, settleStaff } = useGameStore();
  const [letGo, setLetGo] = useState<Set<string>>(new Set());
  const keep = due.filter((c) => !letGo.has(c.role));
  const cost = keep.reduce((n, c) => n + amountDue(coachPrice(c.rating)), 0);
  const short = cost - coachPoints;
  const toggle = (role: string, go: boolean) => setLetGo((s) => {
    const next = new Set(s);
    if (go) next.add(role);
    else next.delete(role);
    return next;
  });
  return (
    <section aria-label="Contracts due" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderLeft: '6px solid #F59E0B', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
      <div style={{ fontWeight: 900, fontSize: '15px' }}>⏳ Next season: {due.length} {due.length === 1 ? 'coach needs' : 'coaches need'} signing</div>
      <div style={{ fontSize: '12.5px', color: '#475569', margin: '2px 0 8px' }}>
        Renew or pay to keep them, or let them go. Anyone not signed when the off-season ends (after Week {FIRST_OFF_SEASON_WEEK + 3}) leaves.
      </div>
      {due.map((c) => {
        const price = coachPrice(c.rating);
        const going = letGo.has(c.role);
        const renewal = settleKind(c, currentYear) === 'RENEWAL';
        return (
          <div key={c.role} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <strong>{c.name}</strong> <GradeBadge grade={coachGrade(c.rating)} />
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {COACH_ROLES.find((r) => r.role === c.role)?.title} · {renewal ? 'contract is up' : `signed through ${c.contractEndSeason}`}
                </div>
              </div>
              <strong style={{ color: price.currency === 'DUCATS' ? '#B45309' : '#1D4ED8', whiteSpace: 'nowrap' }}>
                {amountDue(price) === 0 ? 'Free' : formatPrice(price)}
              </strong>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
              {[false, true].map((go) => (
                <button
                  key={String(go)}
                  aria-pressed={going === go}
                  onClick={() => toggle(c.role, go)}
                  style={{
                    minHeight: '38px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    border: `2px solid ${going === go ? (go ? '#DC2626' : '#16A34A') : '#CBD5E1'}`,
                    background: going === go ? (go ? '#FEF2F2' : '#F0FDF4') : '#fff',
                    color: '#0F172A'
                  }}
                >
                  {go ? 'Let go' : renewal ? 'Renew 1 season' : 'Pay next season'}
                </button>
              ))}
            </div>
            {price.currency === 'DUCATS' && !DUCATS_LIVE && <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>Free to keep until ducats go on sale.</div>}
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
        <span>Total</span>
        <strong>{formatCP(cost)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
        <span>Your Coach Points</span>
        <strong>{formatCP(coachPoints)}</strong>
      </div>
      {short > 0 ? (
        <p style={{ color: '#B91C1C', fontSize: '12.5px', margin: '6px 0 0' }}>
          {formatCP(short)} short. You earn Coach Points every week: sign them before the off-season ends, or let some go.
        </p>
      ) : (
        <button
          className="ui-btn ui-btn-block"
          style={{ marginTop: '8px', background: '#16A34A', borderColor: '#16A34A', color: '#fff' }}
          onClick={() => settleStaff(keep.map((c) => c.role), [...letGo] as CoachRole[])}
        >
          {keep.length === 0 ? 'Let them go' : cost === 0 ? 'Confirm' : `Confirm · pay ${formatCP(cost)}`}
        </button>
      )}
    </section>
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
