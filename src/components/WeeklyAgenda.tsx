import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { FEEDER_EVENTS, FeederEventType } from '../sim/feederEngine';
import { CAMP_WEEKS, COLLEGE_ACTION_COSTS, CollegeAction, collegeActionBlocker, recruitScore } from '../sim/collegeRecruitingEngine';
import { DRILL_FOCUS_OPTIONS } from '../sim/drillEngine';
import { isAcademicallyAtRisk } from '../sim/playerEngine';
import { Player } from '../types/game';

/** Screens the agenda can send the coach to. */
export type AgendaTab = 'ROSTER' | 'PRACTICE' | 'COLLEGE' | 'OFFICE' | 'FEEDERS' | 'DISTRICT';

interface AgendaAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

interface AgendaItem {
  id: string;
  icon: string;
  title: string;
  detail?: string;
  tone: 'urgent' | 'todo' | 'info' | 'done';
  actions?: AgendaAction[];
  link?: { label: string; onClick: () => void };
}

const TONES: Record<AgendaItem['tone'], { border: string; background: string }> = {
  urgent: { border: '#F59E0B', background: '#FFFBEB' },
  todo: { border: '#3B82F6', background: '#EFF6FF' },
  info: { border: '#CBD5E1', background: '#fff' },
  done: { border: '#86EFAC', background: '#F0FDF4' }
};

const TOP_PROSPECTS = 3;

const shortName = (p: Player) => `${p.firstName.charAt(0)}. ${p.lastName}`;

/**
 * "This Week": everything that needs the coach's attention, with quick decisions inline and links to the
 * right screen, ending with Advance Week. Built from the week's state, so it changes as the season moves.
 */
export const WeeklyAgenda: React.FC<{
  game: { opponentName: string; isHome: boolean; isPlayed: boolean; result?: string } | null;
  onPlayGame: () => void;
  onAutoSim: () => void;
  onAdvanceWeek: () => void;
  onNavigate: (tab: AgendaTab) => void;
}> = ({ game, onPlayGame, onAutoSim, onAdvanceWeek, onNavigate }) => {
  const {
    leagueTeams,
    userTeamId,
    currentWeek,
    currentYear,
    coachingAP,
    activeDilemma,
    feederEventsThisWeek,
    runFeederEvent,
    collegeRecruitAction,
    assignStudyHallToAtRisk,
    drillFocus,
    setDrillFocus,
    lastDrillReport
  } = useGameStore();
  // Confirmation for the last quick action; it belongs to the week it happened in
  const [flashState, setFlashState] = useState<{ text: string; week: number } | null>(null);
  const flash = flashState?.week === currentWeek ? flashState.text : null;
  const setFlash = (text: string) => setFlashState({ text, week: currentWeek });
  const team = leagueTeams.find((t) => t.id === userTeamId);
  if (!team) return null;

  const items: AgendaItem[] = [];

  // 1. The week's decision
  if (activeDilemma) {
    items.push({
      id: 'dilemma',
      icon: '⚠️',
      title: `Decision needed: ${activeDilemma.title}`,
      tone: 'urgent',
      actions: [
        { label: 'Decide now', primary: true, onClick: () => document.getElementById('weekly-dilemma')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
      ]
    });
  }

  // 2. This week's game
  if (game && !game.isPlayed) {
    items.push({
      id: 'game',
      icon: '🏈',
      title: `Game ${game.isHome ? 'vs' : 'at'} ${game.opponentName}`,
      detail: 'Coach it live, or let it simulate when you advance the week.',
      tone: 'todo',
      actions: [
        { label: 'Play the game', primary: true, onClick: onPlayGame },
        { label: 'Auto-sim & advance', onClick: onAutoSim }
      ]
    });
  } else if (game?.isPlayed && game.result) {
    items.push({ id: 'game', icon: '✅', title: game.result, tone: 'done' });
  }

  // 3. Starters who can't play
  const unavailable = team.roster.filter((p) => p.depthChartTier === 1 && (p.condition.injuryStatus !== 'HEALTHY' || !p.academics.isEligible));
  if (unavailable.length > 0) {
    items.push({
      id: 'starters',
      icon: '🩹',
      title: `${unavailable.length} starter${unavailable.length === 1 ? '' : 's'} unavailable`,
      detail: `${unavailable
        .slice(0, 4)
        .map((p) => `${p.position} ${shortName(p)} (${p.condition.injuryStatus !== 'HEALTHY' ? 'injured' : 'ineligible'})`)
        .join(', ')}${unavailable.length > 4 ? '…' : ''}. The next man up plays unless you change the depth chart.`,
      tone: 'urgent',
      link: { label: 'Review depth chart', onClick: () => onNavigate('ROSTER') }
    });
  }

  // 4. Grades
  const atRisk = team.roster.filter((p) => isAcademicallyAtRisk(p) && !p.academics.studyHallAssigned);
  if (atRisk.length > 0) {
    items.push({
      id: 'grades',
      icon: '📚',
      title: `${atRisk.length} player${atRisk.length === 1 ? '' : 's'} at academic risk`,
      detail: atRisk
        .slice(0, 4)
        .map((p) => `${shortName(p)} (${p.academics.gpa.toFixed(1)})`)
        .join(', '),
      tone: 'todo',
      actions: [
        {
          label: `Assign study hall (${atRisk.length})`,
          primary: true,
          onClick: () => setFlash(`Study hall assigned to ${assignStudyHallToAtRisk()} players.`)
        }
      ]
    });
  }

  // 5. Feeder program events (once each per week, paid with AP)
  const events = (Object.keys(FEEDER_EVENTS) as FeederEventType[]).filter((e) => !feederEventsThisWeek.includes(e));
  if (events.length > 0 && events.some((e) => coachingAP >= FEEDER_EVENTS[e].cost)) {
    items.push({
      id: 'feeders',
      icon: '🔍',
      title: 'Grow your feeder pipeline',
      detail: 'Clinics and events bring in and win over next year’s players.',
      tone: 'todo',
      actions: events.map((e) => ({
        label: `${FEEDER_EVENTS[e].label} (${FEEDER_EVENTS[e].cost} AP)`,
        disabled: coachingAP < FEEDER_EVENTS[e].cost,
        onClick: () => {
          const found = runFeederEvent(e);
          setFlash(`${FEEDER_EVENTS[e].label}: ${found.length} new prospect${found.length === 1 ? '' : 's'} discovered.`);
        }
      })),
      link: { label: 'Feeders', onClick: () => onNavigate('FEEDERS') }
    });
  }

  // 6. College exposure for the top juniors and seniors
  const prospects = team.roster
    .filter((p) => (p.classYear === 'Senior' || p.classYear === 'Junior') && !p.recruiting.isNationalLetterOfIntentSigned)
    .sort((a, b) => recruitScore(b) - recruitScore(a))
    .slice(0, TOP_PROSPECTS);
  const collegeBatch = (action: CollegeAction) => {
    const ready = prospects.filter((p) => !collegeActionBlocker(p, action, currentWeek, currentYear));
    return { ready, cost: ready.length * COLLEGE_ACTION_COSTS[action] };
  };
  const runBatch = (action: CollegeAction, verb: string) => {
    let offers = 0;
    let done = 0;
    collegeBatch(action).ready.forEach((p) => {
      const result = collegeRecruitAction(p.id, action);
      if (result.ok) done++;
      if (result.offer) offers++;
    });
    setFlash(`${verb} ${done} prospect${done === 1 ? '' : 's'}${offers ? `: ${offers} new offer${offers === 1 ? '' : 's'}!` : '.'}`);
  };
  const camp = collegeBatch('CAMP');
  const film = collegeBatch('FILM');
  const collegeActions: AgendaAction[] = [];
  if (currentWeek <= CAMP_WEEKS && camp.ready.length > 0)
    collegeActions.push({ label: `Camp for top ${camp.ready.length} (${camp.cost} AP)`, disabled: coachingAP < camp.cost, onClick: () => runBatch('CAMP', 'Took') });
  if (film.ready.length > 0)
    collegeActions.push({ label: `Send film for top ${film.ready.length} (${film.cost} AP)`, disabled: coachingAP < film.cost, onClick: () => runBatch('FILM', 'Sent film for') });
  if (collegeActions.length > 0) {
    items.push({
      id: 'college',
      icon: '🎓',
      title: 'Get your top prospects seen by colleges',
      detail: prospects.map((p) => `${p.position} ${shortName(p)} (${p.recruiting.starRating}★)`).join(', '),
      tone: 'todo',
      actions: collegeActions,
      link: { label: 'College', onClick: () => onNavigate('COLLEGE') }
    });
  }

  // 7. Practice plan (assistants run the drills)
  items.push({
    id: 'practice',
    icon: '🏋️',
    title: `Practice focus: ${DRILL_FOCUS_OPTIONS.find((o) => o.id === drillFocus)?.label}`,
    detail:
      lastDrillReport.length > 0
        ? `Last week your assistants drilled ${lastDrillReport.length} players.`
        : 'Your assistants run position drills each week with this focus.',
    tone: 'info',
    actions: DRILL_FOCUS_OPTIONS.map((o) => ({ label: o.label, primary: o.id === drillFocus, onClick: () => setDrillFocus(o.id) })),
    link: { label: 'Practice plan', onClick: () => onNavigate('PRACTICE') }
  });

  return (
    <section aria-labelledby="this-week-title" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="this-week-title" style={{ margin: '0 0 4px 0' }}>
          This Week
        </h2>
        <span style={{ fontSize: '13px', color: '#64748B' }}>
          {coachingAP} AP left <span style={{ color: '#94A3B8' }}>(resets next week)</span>
        </span>
      </div>
      {flash && (
        <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', margin: '6px 0' }}>
          {flash}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{ border: `1px solid ${TONES[item.tone].border}`, borderLeft: `4px solid ${TONES[item.tone].border}`, background: TONES[item.tone].background, borderRadius: '6px', padding: '10px 12px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                {item.icon} {item.title}
              </div>
              {item.link && (
                <button onClick={item.link.onClick} style={linkBtn}>
                  {item.link.label} →
                </button>
              )}
            </div>
            {item.detail && <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{item.detail}</div>}
            {item.actions && item.actions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {item.actions.map((a) => (
                  <button key={a.label} onClick={a.onClick} disabled={a.disabled} style={actionBtn(!!a.primary, !!a.disabled)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onAdvanceWeek} style={advanceBtn}>
        {activeDilemma ? 'Advance Week (decision still open)' : 'All set: Advance Week ⏭️'}
      </button>
    </section>
  );
};

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#2563EB',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer',
  padding: 0,
  whiteSpace: 'nowrap'
};

const actionBtn = (primary: boolean, disabled: boolean): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  borderRadius: '5px',
  border: primary ? 'none' : '1px solid #CBD5E1',
  background: disabled ? '#E2E8F0' : primary ? '#2563EB' : '#fff',
  color: disabled ? '#94A3B8' : primary ? '#fff' : '#1E293B',
  fontWeight: 'bold',
  fontSize: '12px',
  cursor: disabled ? 'default' : 'pointer'
});

const advanceBtn: React.CSSProperties = {
  width: '100%',
  marginTop: '10px',
  padding: '12px',
  background: '#0F172A',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  fontSize: '14px',
  cursor: 'pointer'
};
