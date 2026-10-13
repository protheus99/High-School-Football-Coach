import React from 'react';
import { useGameStore } from '../store/gameStore';
import { COACH_ROLES, staffGrade } from '../sim/coachingStaff';
import { FIRST_OFF_SEASON_WEEK, formatCost, needsSettling, seasonCost, STAFF_LOCK_WEEK, staffWindowOpen } from '../sim/staffContracts';
import { getSeasonPhase } from '../sim/scheduleEngine';

/**
 * The Hub's word on the coaching staff: when it can change (open in the off-season and pre-season, locked from the
 * season opener) and, in the off-season, the coaches who still need signing for next season.
 */
export const StaffWindowCard: React.FC<{ onOpenStaff: () => void }> = ({ onOpenStaff }) => {
  const { coachingStaff, currentWeek, currentYear } = useGameStore();
  const open = staffWindowOpen(currentWeek);
  const due = coachingStaff.filter((c) => needsSettling(c, currentWeek, currentYear));
  const grade = staffGrade(coachingStaff);
  const yearly = seasonCost(coachingStaff);
  const summary = `Staff: ${coachingStaff.length} of ${COACH_ROLES.length} roles${grade ? ` · grade ${grade}` : ''}${yearly.cp + yearly.ducats > 0 ? ` · ${formatCost(yearly)} a season` : ''}`;

  if (due.length > 0) {
    const cost = seasonCost(due);
    return (
      <Card edge="#F59E0B" background="#FFFBEB">
        <strong style={{ fontSize: '15px' }}>
          ⏳ {due.length} {due.length === 1 ? 'coach needs' : 'coaches need'} signing for next season
        </strong>
        <div style={line}>
          {cost.cp + cost.ducats > 0 ? `${formatCost(cost)} to keep everyone. ` : ''}Renew, pay or let go before the off-season ends (after Week {FIRST_OFF_SEASON_WEEK + 3}); anyone not signed leaves.
        </div>
        <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#F59E0B', borderColor: '#F59E0B', color: '#0F172A' }} onClick={onOpenStaff}>
          Sign your staff ›
        </button>
      </Card>
    );
  }
  if (open) {
    const offSeason = getSeasonPhase(currentWeek) === 'OFF_SEASON';
    const weeksLeft = STAFF_LOCK_WEEK - currentWeek;
    return (
      <Card edge="#16A34A">
        <strong style={{ fontSize: '15px' }}>🧑‍🏫 Staff hiring is open</strong>
        <div style={line}>
          {offSeason
            ? `Hire and release through the off-season and pre-season. The staff locks at the season opener (Week ${STAFF_LOCK_WEEK}).`
            : `The staff locks at the season opener (Week ${STAFF_LOCK_WEEK}): ${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left.`}
        </div>
        <div style={{ ...line, color: '#0F172A' }}>{summary}</div>
        <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#4F46E5', borderColor: '#4F46E5', color: '#fff' }} onClick={onOpenStaff}>
          Manage staff ›
        </button>
      </Card>
    );
  }
  return (
    <Card edge="#94A3B8" background="#F8FAFC">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <strong>🔒 Staff locked for the season</strong>
          <div style={line}>
            Hiring reopens in the off-season (Week {FIRST_OFF_SEASON_WEEK}). {summary}
          </div>
        </div>
        <button className="ui-btn" style={{ flex: '0 0 auto' }} onClick={onOpenStaff}>
          View ›
        </button>
      </div>
    </Card>
  );
};

const line: React.CSSProperties = { fontSize: '12.5px', color: '#475569', marginTop: '3px' };

const Card: React.FC<{ edge: string; background?: string; children: React.ReactNode }> = ({ edge, background = '#fff', children }) => (
  <section
    aria-label="Coaching staff"
    style={{
      background,
      border: '1px solid #E2E8F0',
      borderLeft: `6px solid ${edge}`,
      borderRadius: '12px',
      boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)',
      padding: '12px',
      margin: '12px 0'
    }}
  >
    {children}
  </section>
);
