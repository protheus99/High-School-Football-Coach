import React, { useMemo, useRef, useState } from 'react';
import { feederEventsOpen, useGameStore } from '../store/gameStore';
import { FEEDER_SIGNING_WEEK } from '../sim/scheduleEngine';
import { feederEventCost, weeklyCpIncome } from '../sim/coachPoints';
import { FeederOutcomeType, FeederProspect, Player, Position, ProspectSource } from '../types/game';
import { PositionNeed, priorityNeeds, seniorsStillHere, teamNeeds } from '../sim/teamNeeds';
import { PageHeader } from './ui/PageHeader';
import { rulesForState } from '../sim/stateRules';
import {
  FEEDER_EVENTS,
  FeederEventType,
  MAX_POOL_SIZE,
  CONTACT_ACTIONS,
  CONTACT_ORDER,
  ContactAction,
  contactGain,
  SOURCE_LABELS,
  COMMIT_THRESHOLD,
  currentCommitment,
  EVALUATION_INTEREST,
  isEvaluated,
  scoutProspect,
  topTenLists,
  interestLabel,
  prospectRankScore,
  schoolInterest,
  userJoinProbability
} from '../sim/feederEngine';
import { FACTOR_LABELS, buildRecruitingContext, onProbation, restrictedOnProbation, topPriority } from '../sim/feederCompetition';
import { wideJoinProbability } from '../sim/widePool';
import { staffBonuses } from '../sim/coachingStaff';

const SOURCE_COLORS: Record<ProspectSource, string> = {
  FEEDER_MIDDLE_SCHOOL: '#2563EB',
  SEVEN_ON_SEVEN: '#7C3AED',
  MOVE_IN: '#0F766E',
  STAR_RECRUIT: '#D97706',
  OUT_OF_DISTRICT: '#BE123C',
  TRYOUT: '#64748B'
};

const OUTCOME_LABELS: Record<FeederOutcomeType, string> = {
  JOINED: 'Joined the program',
  NOT_PLAYING: 'Chose not to play',
  LEFT_AREA: 'Moved away',
  OTHER_SCHOOL: 'Enrolled elsewhere',
  JV_TEAM: 'Playing JV'
};

function outlook(chance: number): { label: string; color: string } {
  if (chance >= 0.65) return { label: 'Likely', color: '#15803D' };
  if (chance >= 0.4) return { label: 'Possible', color: '#2563EB' };
  if (chance >= 0.15) return { label: 'Unlikely', color: '#B45309' };
  return { label: 'Long shot', color: '#DC2626' };
}

export type FeederSection = 'STUDENTS' | 'PROGRAMS' | 'NEEDS';
type PoolScope = 'DISTRICT' | 'REGION' | 'STATE' | 'NATIONAL';
type PoolFilter = 'ALL' | 'TOP10' | 'COMMITTED';
const PAGE_SIZE = 20; // prospect cards shown at a time (the State and National lists run to 100+)

/** Position tabs above the prospect list (lines and the secondary grouped). */
// Two rows in the sticky bar: everyone and the offense, then the defense and the specialists
const OFFENSE_GROUPS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL'];
const POSITION_GROUPS: { id: string; label: string; positions?: Position[] }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'QB', label: 'QB', positions: ['QB'] },
  { id: 'RB', label: 'RB', positions: ['RB'] },
  { id: 'WR', label: 'WR', positions: ['WR'] },
  { id: 'TE', label: 'TE', positions: ['TE'] },
  { id: 'OL', label: 'OL', positions: ['OT', 'OG', 'C'] },
  { id: 'DL', label: 'DL', positions: ['DE', 'DT'] },
  { id: 'LB', label: 'LB', positions: ['LB'] },
  { id: 'DB', label: 'DB', positions: ['CB', 'S'] },
  { id: 'K', label: 'K/P', positions: ['K', 'P'] }
];

const FEEDER_SUBTITLES: Record<FeederSection, string> = {
  STUDENTS: 'Every student who could join a program next year',
  PROGRAMS: 'Off-season events that find and win over prospects',
  NEEDS: "Holes in next season's roster by position"
};

const SECTIONS: { id: FeederSection; label: string; short: string }[] = [
  { id: 'STUDENTS', label: '🧑‍🎓 New Students', short: '🧑‍🎓 Students' },
  { id: 'PROGRAMS', label: '🏟️ Off Season Programs', short: '🏟️ Programs' },
  { id: 'NEEDS', label: '📋 Team Needs', short: '📋 Needs' }
];

/** Feeders: next year's students, the off-season programs that find and win them, and the roster's needs. */
export const FeedersScoutingView: React.FC<{ section: FeederSection; onSection: (section: FeederSection) => void; onOpenPlayer: (player: Player) => void }> = ({
  section,
  onSection,
  onOpenPlayer
}) => {
  const {
    scoutingPool,
    coachPoints,
    coachTalents,
    currentWeek,
    districtTeams,
    userTeamId,
    feederEventsThisWeek,
    lastFeederResults,
    runFeederEvent,
    contactFeederProspect,
    removeFeederProspect,
    widePool,
    coachingStaff,
    league,
    leagueTeams,
    currentYear,
    feederClassYear,
    userProbationUntil
  } = useGameStore();
  const probation = onProbation(userProbationUntil, currentYear);
  const ctx = useMemo(() => (league ? buildRecruitingContext(league, leagueTeams, userTeamId) : undefined), [league, leagueTeams, userTeamId]);
  // The pool scopes in the state's words; a one-region league's "region" pool is the whole state class
  const districtWord = rulesForState(league?.state).districtLabel;
  const interestBonus = staffBonuses(coachingStaff).feederInterest;
  const multiRegion = !!league && league.regions.length > 1;
  const regionWord = !multiRegion ? 'State' : districtWord === 'Region' ? 'Area' : 'Region';
  const [scope, setScopeState] = useState<PoolScope>('DISTRICT');
  const [filter, setFilterState] = useState<PoolFilter>('ALL');
  const [positionGroup, setPositionGroupState] = useState<string>('ALL');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const navRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Any change of list starts again at the first page; from further down the page, back to the list's top
  const showListTop = () =>
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      // The sticky bars above the list: the app's top bar and this page's navigation
      const navHeight = (navRef.current?.offsetHeight ?? 0) + ((document.querySelector('.app-topbar') as HTMLElement | null)?.offsetHeight ?? 0);
      const top = list.getBoundingClientRect().top + window.scrollY - navHeight - 8;
      if (window.scrollY > top) window.scrollTo({ top });
    });
  const setScope = (s: PoolScope) => {
    setScopeState(s);
    setVisible(PAGE_SIZE);
    showListTop();
  };
  const setFilter = (f: PoolFilter) => {
    setFilterState(f);
    setVisible(PAGE_SIZE);
    showListTop();
  };
  const setPositionGroup = (g: string) => {
    setPositionGroupState(g);
    setVisible(PAGE_SIZE);
    showListTop();
  };
  const [feedback, setFeedback] = useState<string | null>(null);
  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const weeklyIncome = weeklyCpIncome(currentWeek, coachTalents, userTeam.programMeters.schoolBoardTrust);
  const eventCost = (type: FeederEventType) => feederEventCost(FEEDER_EVENTS[type].cost, coachTalents);
  const eventsOpen = feederEventsOpen({ currentWeek, league });
  const pipelineFull = scoutingPool.filter((p) => !p.homeTeamId).length >= MAX_POOL_SIZE;
  const needs = teamNeeds(userTeam, scoutingPool, seniorsStillHere(currentYear, feederClassYear, currentWeek));
  const topNeeds = priorityNeeds(needs).slice(0, 4);
  // The pool is shared by every program in the region: views by district, region, the top 10s and commitments
  const userDistrict = ctx?.districtOf.get(userTeamId);
  const inDistrict = (p: FeederProspect) => !p.homeTeamId || ctx?.districtOf.get(p.homeTeamId) === userDistrict;
  const ranked = (list: FeederProspect[]) => [...list].sort((a, b) => prospectRankScore(b) - prospectRankScore(a));
  const districtPool = scoutingPool.filter(inDistrict);
  // Top 10 in Region: A-level prospects only; Top 10 in District: five A-level and five B-level
  const tops = ctx ? topTenLists(scoutingPool, ctx) : { region: [], district: [] };
  const topDistrict = tops.district;
  const topRegion = tops.region;
  // Scopes widen out: district, region (Texas only), the whole state, the nation. A one-region state's region
  // pool is already the whole state.
  const statePool = multiRegion ? [...scoutingPool, ...widePool.filter((p) => p.scope === 'STATE')] : scoutingPool;
  const scopes: { id: PoolScope; label: string; list: FeederProspect[] }[] = [
    { id: 'DISTRICT', label: districtWord, list: districtPool },
    ...(multiRegion ? [{ id: 'REGION' as const, label: regionWord, list: scoutingPool }] : []),
    { id: 'STATE', label: 'State', list: statePool },
    { id: 'NATIONAL', label: 'National', list: [...scoutingPool, ...widePool] }
  ];
  const scopeList = ranked((scopes.find((s) => s.id === scope) ?? scopes[0]).list);
  const scopeName = (scopes.find((s) => s.id === scope) ?? scopes[0]).label;
  const isA = (p: FeederProspect) => p.truePotential === 'A' || p.truePotential === 'A+';
  // Top 10: the district's five best A-level and five best B-level; wider scopes their ten best A-level
  const top10 = scope === 'DISTRICT' ? topDistrict : scope === 'REGION' ? topRegion : scopeList.filter(isA).slice(0, 10);
  const committedToMe = scopeList.filter((p) => currentCommitment(p, userTeamId)?.teamId === userTeamId);
  const filters: { id: PoolFilter; label: string; count?: number }[] = [
    { id: 'ALL', label: 'All', count: scopeList.length },
    { id: 'TOP10', label: 'Top 10' },
    { id: 'COMMITTED', label: 'Committed', count: committedToMe.length }
  ];
  const shown = filter === 'TOP10' ? top10 : filter === 'COMMITTED' ? committedToMe : scopeList;
  const groupPositions = POSITION_GROUPS.find((g) => g.id === positionGroup)?.positions;
  const byPosition = groupPositions ? shown.filter((p) => groupPositions.includes(p.projectedPosition)) : shown;
  const page = byPosition.slice(0, visible);
  const rankLabel = (p: FeederProspect) => {
    if (filter === 'TOP10') return `#${top10.indexOf(p) + 1} in ${scopeName}`;
    if (p.scope) return p.scope === 'NATIONAL' ? `${p.homeState} prospect` : 'Elsewhere in the state';
    const r = topRegion.indexOf(p);
    if (r >= 0) return `#${r + 1} in ${regionWord}`;
    const d = topDistrict.indexOf(p);
    return d >= 0 ? `#${d + 1} in ${districtWord}` : undefined;
  };
  // Schools by name: league programs from the context, faraway ones from the prospect's suitor list
  const schoolName = (id: string, p?: FeederProspect) =>
    id === userTeamId ? 'You' : (ctx?.teamsById.get(id)?.name ?? p?.suitors.find((s) => s.teamId === id)?.teamName ?? 'Rival');

  const handleEvent = (type: FeederEventType) => {
    const discovered = runFeederEvent(type);
    setFeedback(
      discovered.length > 0
        ? `${FEEDER_EVENTS[type].label}: ${discovered.map((p) => `${p.name} (${p.projectedPosition})`).join(', ')} joined the pipeline.`
        : `${FEEDER_EVENTS[type].label} held. Prospects in the pipeline warmed to the program.`
    );
  };

  return (
    <>
    <PageHeader title="Feeders" subtitle={FEEDER_SUBTITLES[section]} />
    {/* Sticky navigation: the page is long, so its sections and the Students list controls stay on screen */}
    <div ref={navRef} className="ui-sticky-nav">
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 16px', display: 'grid', gap: '6px' }}>
        <div className="ui-chip-row ui-chip-row-3" role="tablist" aria-label="Feeders sections">
          {SECTIONS.map((t) => (
            <button key={t.id} role="tab" className="ui-chip" aria-selected={section === t.id} aria-pressed={section === t.id} onClick={() => onSection(t.id)}>
              <span className="hide-sm">{t.label}</span>
              <span className="show-sm">{t.short}</span>
            </button>
          ))}
        </div>
        {section === 'STUDENTS' && (
          <>
            {/* Pool and list as two dropdowns: one row on a phone, nothing cut off */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
              <label className="ui-nav-select">
                <span>Pool</span>
                <select value={scope} onChange={(e) => setScope(e.target.value as PoolScope)}>
                  {scopes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ui-nav-select">
                <span>List</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as PoolFilter)}>
                  {filters.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                      {f.count !== undefined ? ` (${f.count})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {[
              { label: 'Offense', groups: POSITION_GROUPS.filter((g) => OFFENSE_GROUPS.includes(g.id)) },
              { label: 'Defense and specialists', groups: POSITION_GROUPS.filter((g) => !OFFENSE_GROUPS.includes(g.id)) }
            ].map((row) => (
              <div key={row.label} className="ui-chip-row ui-chip-row-6" aria-label={`Positions: ${row.label}`}>
                {row.groups.map((g) => {
                  const count = g.positions ? shown.filter((p) => g.positions!.includes(p.projectedPosition)).length : shown.length;
                  return (
                    <button key={g.id} className="ui-chip" aria-pressed={positionGroup === g.id} onClick={() => setPositionGroup(g.id)}>
                      {g.label}
                      <span className="ui-chip-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>

      {feedback && <div style={{ background: '#EEF2FF', color: '#3730A3', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>{feedback}</div>}

      {/* Signing day */}
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginBottom: '14px' }}>
        ✍️ <strong>Signing day:</strong>{' '}
        {currentYear >= feederClassYear && currentWeek <= FEEDER_SIGNING_WEEK
          ? currentWeek === FEEDER_SIGNING_WEEK
            ? 'this week is the last chance. Prospects pick their school when the week ends.'
            : `pre season week ${FEEDER_SIGNING_WEEK}, next week.`
          : `pre season week ${FEEDER_SIGNING_WEEK} of ${feederClassYear}. Visits and pitches count until then.`}
      </div>

      {section === 'NEEDS' && <TeamNeedsPanel needs={needs} onPrograms={() => onSection('PROGRAMS')} />}

      {section === 'PROGRAMS' && (
        <>
          {/* Programs can't add anyone once the user's own pipeline is at its limit */}
          {pipelineFull && (
            <div role="status" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '10px' }}>
              <strong>Your pipeline is full ({MAX_POOL_SIZE}).</strong> Programs can still warm up your prospects, but they won&apos;t find new ones until you
              remove some.{' '}
              <button onClick={() => onSection('STUDENTS')} style={{ background: 'none', border: 'none', padding: 0, color: '#1D4ED8', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>
                New Students →
              </button>
            </div>
          )}
          <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748B' }}>
            Each program can run once a week during the four off-season weeks after the banquet.
            {topNeeds.length > 0 && ` Your biggest needs: ${topNeeds.map((n) => n.position).join(', ')}.`}
          </p>
          {!eventsOpen && (
            <p className="ui-muted" style={{ margin: '0 0 8px 0', fontSize: '13px' }}>
              Programs open in the off season (after the banquet).
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            {(Object.keys(FEEDER_EVENTS) as FeederEventType[]).map((type) => {
              const event = FEEDER_EVENTS[type];
              const done = feederEventsThisWeek.includes(type);
              return (
                <div key={type} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{event.label}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 8px' }}>{event.description}</div>
                  <button
                    onClick={() => handleEvent(type)}
                    disabled={!eventsOpen || done || coachPoints < eventCost(type)}
                    style={actionBtn('#0F766E', !eventsOpen || done || coachPoints < eventCost(type))}
                  >
                    {!eventsOpen ? 'Off season only' : done ? 'Held this week' : `Host (₡${eventCost(type)})`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === 'STUDENTS' && (
        <>
          <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748B' }}>
            Every student who could join the team next year. Not everyone will come out: your programs and personal visits decide who does.{' '}
            {weeklyIncome < 100 && 'During the season you earn fewer Coach Points; the off season is the time to build the pipeline.'}
          </p>

          {/* Last year's class */}
          {lastFeederResults && lastFeederResults.length > 0 && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px' }}>
              <strong>Last year&apos;s pipeline:</strong>{' '}
              {(Object.keys(OUTCOME_LABELS) as FeederOutcomeType[])
                .map((o) => ({ o, count: lastFeederResults.filter((r) => r.outcome === o).length }))
                .filter(({ count }) => count > 0)
                .map(({ o, count }) => `${count} ${OUTCOME_LABELS[o].toLowerCase().replace('jv', 'JV')}`)
                .join(' · ')}
              <div style={{ marginTop: '6px', color: '#166534' }}>
                Newcomers:{' '}
                {lastFeederResults.some((r) => r.outcome === 'JOINED')
                  ? lastFeederResults
                      .filter((r) => r.outcome === 'JOINED')
                      .map((r, i) => {
                        // Link to the player's profile while he is on the team
                        const player = userTeam.roster.find((pl) => pl.id === r.playerId);
                        const label = `${r.prospectName} (${r.position}, ${player?.overallRating ?? r.overall})`;
                        return (
                          <React.Fragment key={r.prospectId}>
                            {i > 0 && ', '}
                            {player ? (
                              <button onClick={() => onOpenPlayer(player)} style={playerLink}>
                                {label}
                              </button>
                            ) : (
                              label
                            )}
                          </React.Fragment>
                        );
                      })
                  : 'none'}
              </div>
              {lastFeederResults.some((r) => r.destinationTeamId) && (
                <div style={{ marginTop: '4px', color: '#9F1239' }}>
                  Lost to rivals:{' '}
                  {lastFeederResults
                    .filter((r) => r.destinationTeamId)
                    .map((r) => `${r.prospectName} → ${r.destinationName}`)
                    .join(', ')}
                </div>
              )}
            </div>
          )}

          {probation && (
            <div role="status" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', marginBottom: '8px' }}>
              🚫 Recruiting probation through {userProbationUntil}: no recruiting out-of-area stars, rivals&apos; zoned players or the State and
              National lists, and walk-on freshmen arrive weaker.
            </div>
          )}

          <p className="ui-muted" style={{ margin: '0 0 10px 0', fontSize: '12px' }}>
            {scope === 'NATIONAL' || (scope === 'STATE' && multiRegion)
              ? `Faraway prospects are long shots: contacts earn ${scope === 'NATIONAL' ? 'half' : 'three quarters of'} the usual interest, and even with his commitment his family has to agree to move. His zoned school is working him too.`
              : `Every program in the ${(scope === 'DISTRICT' ? regionWord : scopeName).toLowerCase()} recruits this pool. At ${COMMIT_THRESHOLD}+ interest a prospect commits; on signing day the school with the highest interest signs him, and a tie at the top is a coin flip.`}
          </p>

          {/* Prospects */}
          <div ref={listRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' }}>
            {page.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                chance={p.scope ? wideJoinProbability(p, userTeamId) : userJoinProbability(p, userTeam.prestige, ctx)}
                coachPoints={coachPoints}
                onContact={(action) => contactFeederProspect(p.id, action)}
                locked={probation && restrictedOnProbation(p)}
                interestBonus={interestBonus}
                rank={rankLabel(p)}
                schools={schoolInterest(p, userTeamId).slice(0, 3).map((e) => ({ name: schoolName(e.teamId, p), interest: e.interest, isYou: e.teamId === userTeamId }))}
                commitment={(() => {
                  const c = currentCommitment(p, userTeamId);
                  return c ? { name: schoolName(c.teamId, p), interest: c.interest, isYou: c.teamId === userTeamId, tied: c.tied } : null;
                })()}
                positionFilled={(needs.find((n) => n.position === p.projectedPosition)?.need ?? 1) === 0}
                onRemove={() => {
                  removeFeederProspect(p.id);
                  setFeedback(`${p.name} was removed from your list.`);
                }}
              />
            ))}
            {byPosition.length === 0 && <div style={{ color: '#64748B', fontSize: '13px' }}>No prospects in this group.</div>}
          </div>
          {byPosition.length > page.length && (
            <button className="ui-btn ui-btn-block" style={{ marginTop: '10px' }} onClick={() => setVisible(visible + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, byPosition.length - page.length)} more ({byPosition.length - page.length} left)
            </button>
          )}

        </>
      )}
    </div>
    </>
  );
};

const ProspectCard: React.FC<{
  prospect: FeederProspect;
  chance: number;
  coachPoints: number;
  onContact: (action: ContactAction) => void;
  positionFilled: boolean;
  onRemove: () => void;
  rank?: string;
  schools: { name: string; interest: number; isYou: boolean }[];
  commitment: { name: string; interest: number; isYou: boolean; tied: boolean } | null;
  interestBonus: number; // the staff's Feeder Pipeline
  locked?: boolean; // off limits while the program is on recruiting probation
}> = ({ prospect: p, chance, coachPoints, onContact, positionFilled, onRemove, rank, schools, commitment, interestBonus, locked }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Evaluated once scouted or at 50+ interest: his potential, speed and strength show
  const scouted = isEvaluated(p);
  const seen = scouted ? scoutProspect(p) : p;
  const look = outlook(chance);
  const notes: string[] = [];
  if (p.source === 'SEVEN_ON_SEVEN') notes.push("Doesn't play tackle yet");
  if (p.source === 'STAR_RECRUIT') notes.push('Long shot: elite talent from out of area');
  if (p.source === 'TRYOUT') notes.push('General student trying out');
  if (p.source === 'OUT_OF_DISTRICT') notes.push('Zoned to another school: out-recruit them to sign him');
  if (p.isTransferRisk) notes.push('Family may relocate');
  if (positionFilled) notes.push(`${p.projectedPosition} is already filled for next season`);

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderLeft: `4px solid ${SOURCE_COLORS[p.source]}`, borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <strong style={{ fontSize: '14px' }}>
          {p.name}
          {rank && <span style={{ marginLeft: '6px', fontSize: '12px', color: '#B45309' }}>{rank}</span>}
        </strong>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold' }}>{p.projectedPosition}</span>
          {!confirmRemove && (
            <button onClick={() => setConfirmRemove(true)} aria-label={`Remove ${p.name} from the list`} title="Remove from the list" style={removeBtn}>
              ✕
            </button>
          )}
        </span>
      </div>
      {confirmRemove && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', margin: '6px 0', padding: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '12px' }}>
          <span style={{ flex: '1 1 140px' }}>Remove {p.name} from your list? He won&apos;t come back.</span>
          <button onClick={onRemove} style={actionBtn('#B91C1C', false)}>
            Remove
          </button>
          <button onClick={() => setConfirmRemove(false)} style={actionBtn('#64748B', false)}>
            Keep
          </button>
        </div>
      )}
      <div style={{ color: '#6B7280', fontSize: '12px' }}>
        {SOURCE_LABELS[p.source]} · {p.middleSchool} · Incoming {p.incomingClass}
      </div>
      <div style={{ margin: '6px 0', fontSize: '12px' }}>
        {scouted ? (
          <>Potential <strong>{seen.revealedPotential}</strong> · Speed {seen.scoutedSpeed} · Strength {seen.scoutedStrength}</>
        ) : (
          <span style={{ color: '#64748B' }}>Not evaluated · evaluated at {EVALUATION_INTEREST} interest</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <div style={{ flex: 1, background: '#E5E7EB', height: '6px', borderRadius: '3px' }}>
          <div style={{ width: `${p.interestScore}%`, background: SOURCE_COLORS[p.source], height: '100%', borderRadius: '3px' }} />
        </div>
        <span>Interest: {interestLabel(p.interestScore)} ({p.interestScore})</span>
        <span style={{ color: look.color, fontWeight: 'bold' }}>{look.label}</span>
      </div>
      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>Cares most about: {FACTOR_LABELS[topPriority(p)]}</div>
      {commitment && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 'bold',
            marginTop: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            background: commitment.isYou ? '#DCFCE7' : '#FEE2E2',
            color: commitment.isYou ? '#166534' : '#991B1B'
          }}
        >
          {commitment.isYou ? '✅ Committed to you' : `🔒 Committed to ${commitment.name}`} ({commitment.interest})
          {commitment.tied ? ' · tied at the top: a coin flip on signing day' : !commitment.isYou ? ` · pass ${commitment.interest} to win him` : ''}
        </div>
      )}
      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
        Interested schools:{' '}
        {schools.map((s, i) => (
          <span key={s.name} style={{ fontWeight: s.isYou ? 'bold' : 'normal', color: s.interest >= COMMIT_THRESHOLD ? '#B45309' : undefined }}>
            {i > 0 && ' · '}
            {s.name} {s.interest}
          </span>
        ))}
        {p.suitors.some((s) => s.inducement) && <span style={{ color: '#9F1239' }}> · 🚩 rumored booster money</span>}
      </div>
      {notes.length > 0 && <div style={{ fontSize: '12px', color: '#92400E', marginTop: '4px' }}>{notes.join(' · ')}</div>}
      {/* Recruiting contacts: each once a week */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', marginTop: '8px' }}>
        {CONTACT_ORDER.map((action) => {
          const { label, cost } = CONTACT_ACTIONS[action];
          const done = p.actionsThisWeek?.includes(action);
          const disabled = done || coachPoints < cost || !!locked;
          return (
            <button key={action} onClick={() => onContact(action)} disabled={disabled} style={{ ...actionBtn('#2563EB', disabled), padding: '6px 4px', lineHeight: 1.2 }}>
              {done ? `✓ ${label}` : label}
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                {locked ? 'probation' : done ? 'this week' : `₡${cost} · +${contactGain(p, action, interestBonus)}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const actionBtn = (color: string, disabled: boolean): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  background: disabled ? '#E2E8F0' : color,
  color: disabled ? '#475569' : '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '12px',
  fontWeight: 'bold'
});

const playerLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#166534',
  fontWeight: 'bold',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 'inherit',
  // A finger-sized tap area around the text
  minHeight: '40px',
  display: 'inline-flex',
  alignItems: 'center'
};

/** Holes in the roster by position, most urgent first, with how many prospects the pipeline has there. */
const TeamNeedsPanel: React.FC<{ needs: PositionNeed[]; onPrograms: () => void }> = ({ needs, onPrograms }) => {
  const priority = priorityNeeds(needs);
  const rest = needs.filter((n) => !priority.includes(n));
  const row = (n: PositionNeed, urgent: boolean) => (
    <div
      key={n.position}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        background: urgent ? '#FFFBEB' : '#fff',
        border: `1px solid ${urgent ? '#FCD34D' : '#E2E8F0'}`,
        borderRadius: '8px'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {n.position}
          {n.need > 0 ? ` · need ${n.need}` : ' · set'}
          {n.starterHoles > 0 && <span style={{ color: '#B91C1C' }}> ({n.starterHoles} starting job{n.starterHoles === 1 ? '' : 's'} open)</span>}
        </div>
        <div style={{ fontSize: '12px', color: '#64748B' }}>
          {n.leaving > 0 ? `${n.leaving} senior${n.leaving === 1 ? '' : 's'} leaving${n.leavingStarters ? ` (${n.leavingStarters} starting)` : ''} · ` : ''}
          {n.returning} of {n.target} spots filled
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: '12px', color: n.pipeline >= n.need ? '#15803D' : '#B45309', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        {n.pipeline} in pipeline
      </div>
    </div>
  );
  return (
    <div>
      <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748B' }}>
        Holes in next season&apos;s roster by position, after the seniors leave. Target these positions with visits and programs: Big Man Camp
        brings in linemen, the QB &amp; Skills Academy skill players.{' '}
        <button onClick={onPrograms} style={{ ...playerLink, color: '#1D4ED8' }}>
          Off Season Programs →
        </button>
      </p>
      {priority.length > 0 ? (
        <>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Needs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>{priority.map((n) => row(n, true))}</div>
        </>
      ) : (
        <p style={{ fontSize: '13px', color: '#15803D', fontWeight: 'bold' }}>No urgent needs: the pipeline covers every position.</p>
      )}
      <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Covered</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{rest.map((n) => row(n, false))}</div>
    </div>
  );
};

const removeBtn: React.CSSProperties = {
  minWidth: '40px',
  minHeight: '40px',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  background: '#fff',
  color: '#64748B',
  fontWeight: 'bold',
  cursor: 'pointer'
};
