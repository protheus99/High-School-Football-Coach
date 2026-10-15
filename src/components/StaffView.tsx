import React, { useEffect, useState } from 'react';
import { getSeasonPhase } from '../sim/scheduleEngine';
import { useGameStore } from '../store/gameStore';
import {
  COACH_ROLES,
  CoachGrade,
  coachGameDayEdge,
  coachGrade,
  effectLevel,
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
  coachPrice,
  CONTRACT_YEARS,
  ContractYears,
  FIRST_OFF_SEASON_WEEK,
  firstContractSeason,
  formatCost,
  formatPrice,
  needsSettling,
  seasonCost,
  settleKind,
  STAFF_LOCK_WEEK,
  staffWindowOpen
} from '../sim/staffContracts';
import { formatDucats } from '../data/ducats';
import { useAccount } from '../services/account';
import { spendDucats, useDucats } from '../services/ducats';
import { DucatBalanceCard, DucatSheetKind, DucatSheets } from './DucatStore';

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
 * the grades show only in development builds. Coaches graded B and up are paid in ducats, from the player's account.
 */
export const StaffView: React.FC = () => {
  const { coachingStaff, currentWeek, currentYear, coachPoints, hireCoach, releaseCoach } = useGameStore();
  const [openRole, setOpenRole] = useState<CoachRole | null>(null);
  // Candidates stay put for the week, even across a trip to the ducat store (which reloads the page)
  const candidatesKey = `staff-candidates:${useGameStore.getState().userTeamId}:${currentYear}:${currentWeek}`;
  const [candidates, setCandidates] = useState<Partial<Record<CoachRole, HiredCoach[]>>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(candidatesKey) ?? '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(candidatesKey, JSON.stringify(candidates));
    } catch {
      // private browsing: the list just won't survive a reload
    }
  }, [candidatesKey, candidates]);
  const [picked, setPicked] = useState<{ name: string; years: ContractYears } | null>(null);
  const [sheet, setSheet] = useState<DucatSheetKind>(null);
  const [paying, setPaying] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);
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
    setHireError(null);
    setOpenRole(role);
  };
  const hire = async (coach: HiredCoach, years: ContractYears) => {
    const ducats = coachPrice(coach.rating).currency === 'DUCATS';
    if (ducats) {
      // The first season comes off the account's ducats before the coach joins
      setPaying(true);
      setHireError(null);
      const problem = await spendDucats([coachGrade(coach.rating)]);
      setPaying(false);
      if (problem) return setHireError(problem);
    }
    if (hireCoach(coach, years, ducats)) return;
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
      <DucatSheets sheet={sheet} onChange={setSheet} />
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
      <DucatBalanceCard onOpen={setSheet} />
      <StaffWindowBanner week={currentWeek} />
      {due.length > 0 && <SettlePanel due={due} onOpen={setSheet} />}
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
                      paying={paying}
                      error={picked?.name === c.name ? hireError : null}
                      onSelect={() => {
                        if (picked?.name !== c.name) setHireError(null);
                        setPicked({ name: c.name, years: picked?.name === c.name ? picked.years : 1 });
                      }}
                      onYears={(years) => setPicked({ name: c.name, years })}
                      onHire={(years) => hire(c, years)}
                      onOpen={setSheet}
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

/** A coach's effects: each at its level (+1 to +5, with a meter); game-day effects stop at +2. */
const EffectList: React.FC<{ coach: HiredCoach }> = ({ coach }) => {
  const info = COACH_ROLES.find((r) => r.role === coach.role)!;
  const color = GRADE_COLORS[coachGrade(coach.rating)];
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: '#334155', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {info.effects
        .filter((e) => coach.effectIds.includes(e.id))
        .map((e) => {
          const level = effectLevel(e, coach.rating);
          return (
            <li key={e.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span>
                  <strong>{e.name}</strong>{' '}
                  <span style={{ display: 'inline-block', minWidth: '22px', textAlign: 'center', borderRadius: '5px', padding: '0 5px', fontWeight: 900, fontSize: '11px', color: '#fff', background: color }}>+{level}</span>
                </span>
                <span aria-label={`Level ${level} of 5`} style={{ display: 'flex', gap: '2px', flex: '0 0 auto' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} style={{ width: '9px', height: '9px', borderRadius: '2px', background: n <= level ? color : '#E2E8F0' }} />
                  ))}
                </span>
              </div>
              <div style={{ color: '#64748B' }}>
                {e.description}
                {e.kind === 'GAME_DAY' && ' · game day, max +2'}
              </div>
            </li>
          );
        })}
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
  paying: boolean;
  error: string | null;
  onSelect: () => void;
  onYears: (years: ContractYears) => void;
  onHire: (years: ContractYears) => void;
  onOpen: (sheet: DucatSheetKind) => void;
}> = ({ coach, selected, years, coachPoints, startSeason, paying, error, onSelect, onYears, onHire, onOpen }) => {
  const price = coachPrice(coach.rating);
  const g = coachGrade(coach.rating);
  const ducats = price.currency === 'DUCATS';
  const { user } = useAccount();
  const { balance } = useDucats();
  const surname = coach.name.split(' ')[1] ?? coach.name;
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  // What the hire button does: pay in Coach Points or ducats, or what's missing first
  const action = (() => {
    if (!ducats)
      return coachPoints < price.amount ? (
        <button className="ui-btn ui-btn-block" disabled style={{ marginTop: '8px' }}>
          Needs {formatCP(price.amount - coachPoints)} more
        </button>
      ) : (
        <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }} onClick={stop(() => onHire(years))}>
          Hire {surname} · pay {formatPrice(price)} now
        </button>
      );
    if (!user)
      return (
        <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#2563EB', borderColor: '#2563EB', color: '#fff' }} onClick={stop(() => onOpen('SIGN_IN'))}>
          Sign in to hire
        </button>
      );
    if (balance === null)
      return (
        <button className="ui-btn ui-btn-block" disabled style={{ marginTop: '8px' }}>
          Checking your ducats…
        </button>
      );
    if (balance < price.amount)
      return (
        <>
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '8px 10px', marginTop: '8px', fontSize: '13px' }}>
            You have {formatDucats(balance)}: <strong>{formatDucats(price.amount - balance)} short</strong> for the first season.
          </div>
          <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#F59E0B', borderColor: '#F59E0B', color: '#451A03', fontWeight: 800 }} onClick={stop(() => onOpen('STORE'))}>
            Get ducats
          </button>
        </>
      );
    return (
      <>
        <button className="ui-btn ui-btn-block" disabled={paying} style={{ marginTop: '8px', background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }} onClick={stop(() => onHire(years))}>
          {paying ? 'Paying…' : `Hire ${surname} · pay ${formatPrice(price)} now`}
        </button>
        <div style={{ textAlign: 'center', fontSize: '12px', color: '#64748B', marginTop: '4px' }}>Leaves you {formatDucats(balance - price.amount)}</div>
      </>
    );
  })();
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
      {selected && (
        <>
          <div role="group" aria-label="Contract length" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '8px' }}>
            {CONTRACT_YEARS.map((n) => (
              <button
                key={n}
                aria-pressed={years === n}
                onClick={stop(() => onYears(n))}
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
              {years > 1 ? `–${startSeason + years - 1}` : ''} · {formatPrice({ ...price, amount: price.amount * years })} in all, a season at a time
            </span>
          </div>
          {action}
          {error && <p style={{ color: '#B91C1C', fontSize: '12.5px', margin: '6px 0 0' }}>{error}</p>}
        </>
      )}
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
const SettlePanel: React.FC<{ due: HiredCoach[]; onOpen: (sheet: DucatSheetKind) => void }> = ({ due, onOpen }) => {
  const { currentYear, coachPoints, settleStaff } = useGameStore();
  const { user } = useAccount();
  const { balance } = useDucats();
  const [letGo, setLetGo] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keep = due.filter((c) => !letGo.has(c.role));
  const cost = seasonCost(keep);
  const short = cost.cp - coachPoints;
  const ducatsShort = cost.ducats > 0 && balance !== null ? cost.ducats - balance : 0;
  const confirm = async () => {
    setError(null);
    if (cost.ducats > 0) {
      setPaying(true);
      const problem = await spendDucats(keep.filter((c) => coachPrice(c.rating).currency === 'DUCATS').map((c) => coachGrade(c.rating)));
      setPaying(false);
      if (problem) return setError(problem);
    }
    settleStaff(
      keep.map((c) => c.role),
      [...letGo] as CoachRole[],
      cost.ducats > 0
    );
  };
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
                {formatPrice(price)}
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
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
        <span>Total</span>
        <strong>{formatCost(cost)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
        <span>You have</span>
        <strong>
          {formatCP(coachPoints)}
          {cost.ducats > 0 && ` · ${user && balance !== null ? formatDucats(balance) : '₾ –'}`}
        </strong>
      </div>
      {short > 0 ? (
        <p style={{ color: '#B91C1C', fontSize: '12.5px', margin: '6px 0 0' }}>
          {formatCP(short)} short. You earn Coach Points every week: sign them before the off-season ends, or let some go.
        </p>
      ) : cost.ducats > 0 && !user ? (
        <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#2563EB', borderColor: '#2563EB', color: '#fff' }} onClick={() => onOpen('SIGN_IN')}>
          Sign in to pay in ducats
        </button>
      ) : ducatsShort > 0 ? (
        <>
          <p style={{ color: '#B45309', fontSize: '12.5px', margin: '6px 0 0' }}>{formatDucats(ducatsShort)} short. Get ducats, or let some coaches go.</p>
          <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#F59E0B', borderColor: '#F59E0B', color: '#451A03', fontWeight: 800 }} onClick={() => onOpen('STORE')}>
            Get ducats
          </button>
        </>
      ) : (
        <button
          className="ui-btn ui-btn-block"
          disabled={paying || (cost.ducats > 0 && balance === null)}
          style={{ marginTop: '8px', background: '#16A34A', borderColor: '#16A34A', color: '#fff' }}
          onClick={confirm}
        >
          {paying ? 'Paying…' : keep.length === 0 ? 'Let them go' : cost.cp + cost.ducats === 0 ? 'Confirm' : `Confirm · pay ${formatCost(cost)}`}
        </button>
      )}
      {error && <p style={{ color: '#B91C1C', fontSize: '12.5px', margin: '6px 0 0' }}>{error}</p>}
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
