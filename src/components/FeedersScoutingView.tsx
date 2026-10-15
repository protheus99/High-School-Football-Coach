import React, { useMemo, useRef, useState } from 'react';
import { feederEventsOpen, useGameStore } from '../store/gameStore';
import { SigningDayBoard } from './SigningDayBoard';
import { FEEDER_SIGNING_WEEK } from '../sim/scheduleEngine';
import { feederEventCost, weeklyCpIncome } from '../sim/coachPoints';
import { FeederProspect, Player, Position, ProspectSource, Team } from '../types/game';
import { PositionNeed, priorityNeeds, seniorsStillHere, teamNeeds } from '../sim/teamNeeds';
import { PageHeader } from './ui/PageHeader';
import { rulesForState } from '../sim/stateRules';
import {
  FEEDER_EVENTS,
  FeederEventType,
  MAX_POOL_SIZE,
  ProgramGroup,
  CONTACT_ACTIONS,
  CONTACT_ORDER,
  ContactAction,
  contactGain,
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
import { FACTOR_LABELS, buildRecruitingContext, onProbation, factorFit, restrictedOnProbation, topPriorities } from '../sim/feederCompetition';
import { wideJoinProbability } from '../sim/widePool';
import { BOOSTER_OFFERS, BOOSTER_ORDER, BoosterOffer } from '../sim/compliance';
import { staffBonuses } from '../sim/coachingStaff';
import { pageScrollTop, scrollPageTo } from '../utils/pageScroll';
import { OFFENSE_GROUPS, POSITION_GROUPS } from '../data/positionGroups';

function outlook(chance: number): { label: string; color: string; background: string } {
  if (chance >= 0.65) return { label: 'Likely', color: '#166534', background: '#DCFCE7' };
  if (chance >= 0.4) return { label: 'Possible', color: '#1E40AF', background: '#DBEAFE' };
  if (chance >= 0.15) return { label: 'Unlikely', color: '#92400E', background: '#FEF3C7' };
  return { label: 'Long shot', color: '#475569', background: '#F1F5F9' };
}

export type FeederSection = 'STUDENTS' | 'PROGRAMS' | 'NEEDS';
type PoolScope = 'DISTRICT' | 'REGION' | 'STATE' | 'NATIONAL';
type PoolFilter = 'ALL' | 'TOP10' | 'COMMITTED' | 'MY_LIST';
const PAGE_SIZE = 20; // prospect cards shown at a time (the State and National lists run to 100+)

/** The Programs screen's groups, in order. */
const PROGRAM_GROUPS: { id: ProgramGroup; label: string; note: string; color: string }[] = [
  { id: 'DISCOVER', label: 'Find new prospects', note: 'every 4 weeks', color: '#0F766E' },
  { id: 'INTEREST', label: 'Interest for everyone', note: 'your whole pipeline', color: '#7C3AED' },
  { id: 'POSITION', label: 'Position programs', note: '₡40 · every 3 weeks', color: '#EA580C' },
  { id: 'SCOUT', label: 'Scouting', note: 'every 3 weeks', color: '#2563EB' }
];

const FEEDER_SUBTITLES: Record<FeederSection, string> = {
  STUDENTS: 'Every student who could join a program next year',
  PROGRAMS: 'Programs that find, coach up and win over prospects, all year',
  NEEDS: "Holes in next season's roster by position"
};

const SECTIONS: { id: FeederSection; label: string; short: string }[] = [
  { id: 'STUDENTS', label: '🧑‍🎓 New Students', short: '🧑‍🎓 Students' },
  { id: 'PROGRAMS', label: '🏟️ Programs', short: '🏟️ Programs' },
  { id: 'NEEDS', label: '📋 Team Needs', short: '📋 Needs' }
];

/** Prospects (the feeder pipeline): next year's students, the off-season programs that find and win them, and the roster's needs. */
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
    programCooldowns,
    lastFeederResults,
    runFeederEvent,
    contactFeederProspect,
    makeBoosterOffer,
    removeFeederProspect,
    shortlist,
    toggleShortlist,
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
  const staff = staffBonuses(coachingStaff);
  const interestBonus = staff.feederInterest;
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
      const top = list.getBoundingClientRect().top + pageScrollTop() - navHeight - 8;
      if (pageScrollTop() > top) scrollPageTo(top);
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
  const eventCost = (type: FeederEventType) => feederEventCost(FEEDER_EVENTS[type].cost, coachTalents, staff.programDiscount);
  const eventsOpen = feederEventsOpen({ currentWeek, league });
  const pipelineCount = scoutingPool.filter((p) => !p.homeTeamId).length;
  const pipelineFull = pipelineCount >= MAX_POOL_SIZE;
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
  // The coach's own list: every prospect he added, from any pool, whatever the scope
  const listed = new Set(shortlist);
  const myList = ranked([...scoutingPool, ...widePool].filter((p) => listed.has(p.id)));
  const filters: { id: PoolFilter; label: string; count?: number }[] = [
    { id: 'ALL', label: 'All', count: scopeList.length },
    { id: 'TOP10', label: 'Top 10' },
    { id: 'COMMITTED', label: 'Committed', count: committedToMe.length },
    { id: 'MY_LIST', label: 'My List', count: myList.length }
  ];
  const shown = filter === 'TOP10' ? top10 : filter === 'COMMITTED' ? committedToMe : filter === 'MY_LIST' ? myList : scopeList;
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
    <PageHeader title="Prospects" subtitle={FEEDER_SUBTITLES[section]} />
    {/* Sticky navigation: the page is long, so its sections and the Students list controls stay on screen */}
    <div ref={navRef} className="ui-sticky-nav">
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 16px', display: 'grid', gap: '6px' }}>
        <div className="ui-chip-row ui-chip-row-3" role="tablist" aria-label="Prospects sections">
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

      {/* Signing day: the deadline, in one line */}
      <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '10px' }}>
        ✍️ <strong>Signing day:</strong>{' '}
        {currentYear >= feederClassYear && currentWeek <= FEEDER_SIGNING_WEEK
          ? currentWeek === FEEDER_SIGNING_WEEK
            ? 'this week, the last chance. Prospects pick their school when the week ends.'
            : 'next week.'
          : `pre season week ${FEEDER_SIGNING_WEEK}, ${feederClassYear}`}
      </div>

      {section === 'NEEDS' && (
        <TeamNeedsPanel
          needs={needs}
          onPrograms={() => onSection('PROGRAMS')}
          onPick={(position) => {
            setPositionGroup(groupOf(position));
            onSection('STUDENTS');
          }}
        />
      )}

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
          {/* What there is to spend, and room in the pipeline */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ background: '#FACC15', color: '#0F172A', fontWeight: 800, borderRadius: '8px', padding: '3px 9px', fontSize: '13px' }}>₡{coachPoints.toLocaleString('en-US')} to spend</span>
            <span style={{ fontSize: '12.5px', color: '#64748B' }}>
              Pipeline {pipelineCount} / {MAX_POOL_SIZE}
            </span>
          </div>
          {topNeeds.length > 0 && (
            <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: '#64748B' }}>Your biggest needs: {topNeeds.map((n) => n.position).join(', ')}.</p>
          )}
          {!eventsOpen && (
            <p className="ui-muted" style={{ margin: '0 0 8px 0', fontSize: '13px' }}>
              Post season: programs reopen after the banquet.
            </p>
          )}
          {PROGRAM_GROUPS.map((g) => {
            const types = (Object.keys(FEEDER_EVENTS) as FeederEventType[]).filter((t) => FEEDER_EVENTS[t].group === g.id);
            const compact = g.id === 'POSITION';
            return (
              <section key={g.id} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', margin: '0 0 6px' }}>
                  <b style={{ fontSize: '12px', letterSpacing: '0.06em', textTransform: 'uppercase', color: g.color }}>{g.label}</b>
                  <span style={{ fontSize: '11.5px', color: '#64748B' }}>{g.note}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: '7px' }}>
                  {types.map((type) => {
                    const program = FEEDER_EVENTS[type];
                    const cost = eventCost(type);
                    const wait = programCooldowns[type] ?? 0;
                    const blocked = !eventsOpen || wait > 0 || coachPoints < cost;
                    const label = !eventsOpen ? 'After the banquet' : wait > 0 ? `Back in ${wait} week${wait === 1 ? '' : 's'}` : coachPoints < cost ? `₡${cost}: not enough` : `Host ₡${cost}`;
                    return (
                      <div
                        key={type}
                        style={{ background: '#fff', border: '1px solid #E2E8F0', borderLeft: `4px solid ${g.color}`, borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
                      >
                        {/* Name, then its positions on their own line, then the button pinned to the bottom: every card in a row lines up */}
                        <b style={{ fontSize: '13.5px', lineHeight: 1.25 }}>{program.label}</b>
                        {program.positions && (
                          <span style={{ alignSelf: 'flex-start', fontSize: '11px', fontWeight: 800, color: '#475569', background: '#F1F5F9', borderRadius: '5px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
                            {program.positions.join(' ')}
                          </span>
                        )}
                        {!compact && <div style={{ fontSize: '12px', color: '#475569' }}>{program.description}</div>}
                        <button onClick={() => handleEvent(type)} disabled={blocked} style={{ ...actionBtn(g.color, blocked), alignSelf: 'stretch', marginTop: 'auto', borderRadius: '8px' }}>
                          {label}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {compact && <p style={{ fontSize: '12px', color: '#475569', margin: '6px 0 0' }}>{FEEDER_EVENTS.QB_ACADEMY.description}</p>}
              </section>
            );
          })}
        </>
      )}

      {section === 'STUDENTS' && (
        <>
          <NeedsStrip
            needs={needs}
            group={POSITION_GROUPS.find((g) => g.id === positionGroup)}
            onPick={(position) => setPositionGroup(groupOf(position))}
          />

          {/* The last signing day: who joined, who went to rivals */}
          {lastFeederResults && lastFeederResults.length > 0 && (
            <SigningDayBoard year={feederClassYear - 1} results={lastFeederResults} roster={userTeam.roster} onOpenPlayer={onOpenPlayer} />
          )}

          {probation && (
            <div role="status" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', marginBottom: '8px' }}>
              🚫 Recruiting probation through {userProbationUntil}: no recruiting out-of-area stars, rivals&apos; zoned players or the State and
              National lists, and walk-on freshmen arrive weaker.
            </div>
          )}

          <details style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: '#475569' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#1D4ED8', minHeight: '32px', display: 'flex', alignItems: 'center' }}>How recruiting works</summary>
            <p style={{ margin: '4px 0' }}>
              Every student who could join the team next year. Not everyone will come out: your programs and personal visits decide who does.{' '}
              {weeklyIncome < 100 && 'During the season you earn fewer Coach Points; the off season is the time to build the pipeline.'}
            </p>
            <p style={{ margin: '4px 0' }}>
              {scope === 'NATIONAL' || (scope === 'STATE' && multiRegion)
                ? `Faraway prospects are long shots: contacts earn ${scope === 'NATIONAL' ? 'half' : 'three quarters of'} the usual interest, and even with his commitment his family has to agree to move. His zoned school is working him too.`
                : `Every program in the ${(scope === 'DISTRICT' ? regionWord : scopeName).toLowerCase()} recruits this pool. At ${COMMIT_THRESHOLD}+ interest a prospect commits; on Prospect signing day the school with the highest interest signs him, and a tie at the top is a coin flip.`}
            </p>
          </details>
          {/* The interest bar's two marks, explained once for the whole list */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '11.5px', fontWeight: 700, color: '#475569', margin: '0 0 8px 0' }}>
            <span>
              <i style={{ ...legendMark, background: '#334155' }} />
              {EVALUATION_INTEREST} scouted: his potential shows
            </span>
            <span>
              <i style={{ ...legendMark, background: '#B45309' }} />
              {COMMIT_THRESHOLD} commits
            </span>
          </div>

          {/* Prospects */}
          <div ref={listRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' }}>
            {page.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                chance={p.scope ? wideJoinProbability(p, userTeamId, userTeam) : userJoinProbability(p, userTeam.prestige, ctx)}
                coachPoints={coachPoints}
                onContact={(action) => contactFeederProspect(p.id, action)}
                onBooster={(offer) => makeBoosterOffer(p.id, offer)}
                boostersLocked={probation}
                locked={probation && restrictedOnProbation(p)}
                interestBonus={interestBonus + (staff.feederInterestByPosition[p.projectedPosition] ?? 0)}
                rank={rankLabel(p)}
                schools={schoolInterest(p, userTeamId).slice(0, 3).map((e) => ({ name: schoolName(e.teamId, p), interest: e.interest, isYou: e.teamId === userTeamId }))}
                commitment={(() => {
                  const c = currentCommitment(p, userTeamId);
                  return c ? { name: schoolName(c.teamId, p), interest: c.interest, isYou: c.teamId === userTeamId, tied: c.tied } : null;
                })()}
                positionFilled={(needs.find((n) => n.position === p.projectedPosition)?.need ?? 1) === 0}
                onList={listed.has(p.id)}
                userTeam={userTeam}
                homeName={p.homeTeamId && p.homeTeamId !== userTeamId ? schoolName(p.homeTeamId, p) : undefined}
                onToggleList={() => toggleShortlist(p.id)}
                onRemove={() => {
                  removeFeederProspect(p.id);
                  setFeedback(`${p.name} was dropped from your prospects.`);
                }}
              />
            ))}
            {byPosition.length === 0 && (
              <div style={{ color: '#64748B', fontSize: '13px' }}>
                {filter === 'MY_LIST' && myList.length === 0 ? 'Your list is empty. Tap "+ Add to List" on any prospect to follow him here.' : 'No prospects in this group.'}
              </div>
            )}
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

/** Where a prospect lives, and how much harder that makes him to get. */
function whereFrom(p: FeederProspect, userTeamId: string, homeName?: string): { kind: 'HOME' | 'ZONED' | 'STATE' | 'NATIONAL'; text: string } {
  if (p.scope === 'NATIONAL') return { kind: 'NATIONAL', text: `✈️ Out of state (${p.homeState}) · hardest` };
  if (p.scope === 'STATE') return { kind: 'STATE', text: `🚗 Elsewhere in the state${homeName ? ` (${homeName})` : ''} · hard` };
  if (p.source === 'STAR_RECRUIT') return { kind: 'STATE', text: '🚗 Out of area · a long shot' };
  if (!p.homeTeamId || p.homeTeamId === userTeamId) return { kind: 'HOME', text: `🏠 Your district · ${SOURCE_SHORT[p.source] ?? p.middleSchool}` };
  return { kind: 'ZONED', text: `🏫 Zoned to ${homeName ?? 'another school'} · harder` };
}

const WHERE_STYLES: Record<'HOME' | 'ZONED' | 'STATE' | 'NATIONAL', React.CSSProperties> = {
  HOME: { background: '#DCFCE7', color: '#166534' },
  ZONED: { background: '#FEF3C7', color: '#92400E' },
  STATE: { background: '#FFEDD5', color: '#9A3412' },
  NATIONAL: { background: '#E0E7FF', color: '#3730A3' }
};
const WHERE_EDGE: Record<'HOME' | 'ZONED' | 'STATE' | 'NATIONAL', string> = { HOME: '#22C55E', ZONED: '#F59E0B', STATE: '#FB923C', NATIONAL: '#6366F1' };
/** Where a district prospect comes from, when it isn't his middle school. */
const SOURCE_SHORT: Partial<Record<ProspectSource, string>> = { SEVEN_ON_SEVEN: '7-on-7 athlete', MOVE_IN: 'move-in', TRYOUT: 'walk-on' };
/** The interest bar: gray while he's cold, blue once he's warm (50+), green at a commitment (80+). */
const interestFill = (interest: number) => (interest >= COMMIT_THRESHOLD ? '#16A34A' : interest >= EVALUATION_INTEREST ? '#3B82F6' : '#94A3B8');
const whereTag: React.CSSProperties = { display: 'inline-block', alignSelf: 'flex-start', fontSize: '11.5px', fontWeight: 700, borderRadius: '999px', padding: '2px 9px' };
const FIT_COLORS = { good: '#15803D', fair: '#B45309', poor: '#64748B' } as const;
const barMark: React.CSSProperties = { position: 'absolute', top: '-3px', width: '2px', height: '14px', borderRadius: '1px', transform: 'translateX(-1px)' };
const legendMark: React.CSSProperties = { display: 'inline-block', width: '2px', height: '12px', verticalAlign: 'middle', marginRight: '5px', borderRadius: '1px' };

/** Students: the needs of the position group in view (or the biggest needs on All), each a tap away. */
const NeedsStrip: React.FC<{ needs: PositionNeed[]; group?: { id: string; label: string; positions?: Position[] }; onPick: (position: Position) => void }> = ({ needs, group, onPick }) => {
  const rows = group?.positions ? needs.filter((n) => group.positions!.includes(n.position)) : priorityNeeds(needs).slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #FCD34D', borderLeft: '5px solid #F59E0B', borderRadius: '10px', padding: '7px 10px', margin: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12.5px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: '#92400E' }}>
        <span>{group?.positions ? `${group.label} NEEDS` : 'YOUR TOP NEEDS'}</span>
        <span>NEXT SEASON</span>
      </div>
      {rows.map((n) => (
        <button
          key={n.position}
          onClick={() => onPick(n.position)}
          style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', padding: '2px 0', font: 'inherit', color: '#0F172A', cursor: 'pointer', textAlign: 'left', minHeight: '28px', alignItems: 'center' }}
        >
          <span>
            <b>{n.position}</b> · {n.need > 0 ? `need ${n.need}` : 'set'}
            {n.starterHoles > 0 && <span style={{ color: '#B91C1C', fontWeight: 700 }}> ({n.starterHoles} starter{n.starterHoles === 1 ? '' : 's'})</span>}
          </span>
          <span style={{ fontWeight: 800, color: n.pipeline >= n.need ? '#15803D' : '#B45309', whiteSpace: 'nowrap' }}>
            {n.pipeline} {n.pipeline === 1 ? 'prospect' : 'prospects'}
          </span>
        </button>
      ))}
    </div>
  );
};

/** The position-chip group a position belongs to (OT opens OL, S opens DB). */
const groupOf = (position: Position) => POSITION_GROUPS.find((g) => g.positions?.includes(position))?.id ?? 'ALL';

const ProspectCard: React.FC<{
  prospect: FeederProspect;
  chance: number;
  coachPoints: number;
  onContact: (action: ContactAction) => void;
  onBooster: (offer: BoosterOffer) => void;
  boostersLocked?: boolean; // no booster offers at all while on probation
  positionFilled: boolean;
  onRemove: () => void;
  onList: boolean; // on the coach's list
  userTeam: Team; // for how the program measures up on his wants
  homeName?: string; // his zoned school's name, when it isn't yours
  onToggleList: () => void;
  rank?: string;
  schools: { name: string; interest: number; isYou: boolean }[];
  commitment: { name: string; interest: number; isYou: boolean; tied: boolean } | null;
  interestBonus: number; // the staff's Feeder Pipeline
  locked?: boolean; // off limits while the program is on recruiting probation
}> = ({ prospect: p, chance, coachPoints, onContact, onBooster, boostersLocked, positionFilled, onRemove, onList, onToggleList, userTeam, homeName, rank, schools, commitment, interestBonus, locked }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [boosterAsk, setBoosterAsk] = useState<BoosterOffer | null>(null);
  // Evaluated once scouted or at 50+ interest: his potential, speed and strength show
  const scouted = isEvaluated(p);
  const seen = scouted ? scoutProspect(p) : p;
  const look = outlook(chance);
  const wants = topPriorities(p).map((f) => ({ label: FACTOR_LABELS[f], ...factorFit(f, p, userTeam, p.interestScore) }));
  const where = whereFrom(p, userTeam.id, homeName);
  const notes: string[] = [];
  if (p.source === 'SEVEN_ON_SEVEN') notes.push("Doesn't play tackle yet");
  if (p.source === 'TRYOUT') notes.push('General student trying out');
  if (p.isTransferRisk) notes.push('Family may relocate');
  if (positionFilled) notes.push(`${p.projectedPosition} is already filled for next season`);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderLeft: `4px solid ${WHERE_EDGE[where.kind]}`,
        borderRadius: '12px',
        padding: '12px',
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 1px 2px rgba(15,23,42,.05)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '14.5px', lineHeight: 1.25 }}>{p.name}</div>
          {rank && <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#B45309' }}>{rank}</div>}
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {p.projectedPosition} · {p.incomingClass}
          </div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
          <button onClick={onToggleList} aria-pressed={onList} style={listBtn(onList)}>
            {onList ? '✓ On List' : '+ Add to List'}
          </button>
          {!confirmRemove && (
            <button onClick={() => setConfirmRemove(true)} aria-label={`Drop ${p.name} from your prospects`} title="Drop from your prospects" style={removeBtn}>
              ✕
            </button>
          )}
        </span>
      </div>
      {confirmRemove && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', margin: '6px 0', padding: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '12px' }}>
          <span style={{ flex: '1 1 140px' }}>Drop {p.name} from your prospects? He won&apos;t come back.</span>
          <button onClick={onRemove} style={actionBtn('#B91C1C', false)}>
            Drop
          </button>
          <button onClick={() => setConfirmRemove(false)} style={actionBtn('#64748B', false)}>
            Keep
          </button>
        </div>
      )}
      <span style={{ ...whereTag, ...WHERE_STYLES[where.kind] }}>{where.text}</span>
      <div style={{ fontSize: '12px', color: '#475569' }}>
        {scouted ? (
          <>Potential <strong>{seen.revealedPotential}</strong> · Speed {seen.scoutedSpeed} · Strength {seen.scoutedStrength}</>
        ) : (
          <span style={{ color: '#64748B' }}>Not evaluated · evaluated at {EVALUATION_INTEREST} interest</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
        <div style={{ position: 'relative', flex: 1, background: '#E5E7EB', height: '8px', borderRadius: '4px' }}>
          <div style={{ width: `${p.interestScore}%`, background: interestFill(p.interestScore), height: '100%', borderRadius: '4px' }} />
          <i aria-hidden="true" style={{ ...barMark, left: `${EVALUATION_INTEREST}%`, background: '#334155' }} />
          <i aria-hidden="true" style={{ ...barMark, left: `${COMMIT_THRESHOLD}%`, background: '#B45309' }} />
        </div>
        <span style={{ whiteSpace: 'nowrap' }}>
          {interestLabel(p.interestScore)} ({p.interestScore})
        </span>
        <span style={{ color: look.color, background: look.background, fontWeight: 800, fontSize: '11px', borderRadius: '999px', padding: '1px 8px', whiteSpace: 'nowrap' }}>{look.label}</span>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '4px 10px', fontSize: '12px', margin: 0, alignItems: 'baseline' }}>
        <dt style={{ color: '#64748B' }}>Wants</dt>
        <dd style={{ margin: 0, color: '#0F172A' }}>
          {wants.map((w) => (
            <div key={w.label}>
              {w.label} · <b style={{ color: FIT_COLORS[w.tone] }}>{w.text}</b>
            </div>
          ))}
        </dd>
        <dt style={{ color: '#64748B' }}>Schools</dt>
        <dd style={{ margin: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {schools.map((sc) => (
              <span
                key={sc.name}
                style={{
                  fontSize: '11.5px',
                  borderRadius: '6px',
                  padding: '1px 7px',
                  background: sc.isYou ? '#DBEAFE' : '#F1F5F9',
                  color: sc.isYou ? '#1E40AF' : sc.interest >= COMMIT_THRESHOLD ? '#92400E' : '#334155',
                  fontWeight: sc.isYou || sc.interest >= COMMIT_THRESHOLD ? 800 : 500
                }}
              >
                {sc.name} {sc.interest}
              </span>
            ))}
          </div>
          {p.suitors.some((sc) => sc.inducement) && <div style={{ fontSize: '11.5px', color: '#9F1239', marginTop: '2px' }}>🚩 rumored booster money</div>}
        </dd>
      </dl>
      {commitment && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '4px 8px',
            borderRadius: '8px',
            background: commitment.isYou ? '#DCFCE7' : '#FFF1F2',
            color: commitment.isYou ? '#166534' : '#9F1239'
          }}
        >
          {commitment.isYou ? '✅ Committed to you' : `🔒 Committed to ${commitment.name}`} ({commitment.interest})
          {commitment.tied ? ' · tied at the top: a coin flip on Prospect signing day' : !commitment.isYou ? ` · pass ${commitment.interest} to win him` : ''}
        </div>
      )}
      {notes.length > 0 && <div style={{ fontSize: '12px', color: '#92400E' }}>{notes.join(' · ')}</div>}
      {/* The buttons sit at the bottom, so they line up across a row of cards */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Recruiting contacts: each once a week */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
        {CONTACT_ORDER.map((action) => {
          const { label, cost } = CONTACT_ACTIONS[action];
          const done = p.actionsThisWeek?.includes(action);
          const disabled = done || coachPoints < cost || !!locked;
          return (
            <button key={action} onClick={() => onContact(action)} disabled={disabled} style={{ ...actionBtn('#2563EB', disabled), padding: '6px 4px', lineHeight: 1.2, borderRadius: '8px' }}>
              {done ? `✓ ${label}` : label}
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>
                {locked ? 'probation' : done ? 'this week' : `₡${cost} · +${contactGain(p, action, interestBonus)}`}
              </span>
            </button>
          );
        })}
      </div>
      {/* Boosters: free interest now, evidence for later (each offer once per player; not for tryouts or on probation) */}
      {p.source !== 'TRYOUT' && (
        <div style={{ borderTop: '1px dashed #FDA4AF', paddingTop: '7px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#9F1239' }}>🚩 Boosters</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', marginTop: '6px' }}>
            {BOOSTER_ORDER.map((offer) => {
              const made = p.boosterOffers?.includes(offer);
              const disabled = made || !!boostersLocked;
              return (
                <button
                  key={offer}
                  onClick={() => setBoosterAsk(offer)}
                  disabled={disabled}
                  style={{
                    ...actionBtn('#FFF1F2', disabled),
                    padding: '5px 4px',
                    lineHeight: 1.2,
                    borderRadius: '8px',
                    ...(!disabled && { color: '#9F1239', border: '1px solid #FECDD3' })
                  }}
                >
                  {BOOSTER_OFFERS[offer].label}
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 'normal' }}>{boostersLocked ? 'probation' : made ? 'done' : `Free · +${BOOSTER_OFFERS[offer].interest}`}</span>
                </button>
              );
            })}
          </div>
          {boosterAsk && (
            <div role="alert" style={{ marginTop: '8px', padding: '8px', background: '#fff', border: '1px solid #FDA4AF', borderRadius: '6px', fontSize: '12px', lineHeight: 1.5, color: '#7F1D1D' }}>
              <b>
                {BOOSTER_OFFERS[boosterAsk].label} for {p.name}: +{BOOSTER_OFFERS[boosterAsk].interest} interest, {BOOSTER_OFFERS[boosterAsk].risk} evidence.
              </b>
              <br />
              If it comes out, every player signed this way is ruled ineligible, and you get up to 2 seasons of probation.
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  onClick={() => {
                    onBooster(boosterAsk);
                    setBoosterAsk(null);
                  }}
                  style={actionBtn('#DC2626', false)}
                >
                  Make the offer
                </button>
                <button onClick={() => setBoosterAsk(null)} style={actionBtn('#64748B', false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
const TeamNeedsPanel: React.FC<{ needs: PositionNeed[]; onPrograms: () => void; onPick: (position: Position) => void }> = ({ needs, onPrograms, onPick }) => {
  const priority = priorityNeeds(needs);
  const rest = needs.filter((n) => !priority.includes(n));
  const row = (n: PositionNeed, urgent: boolean) => (
    <button
      key={n.position}
      onClick={() => onPick(n.position)}
      aria-label={`${n.position}: see the prospects`}
      style={{
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
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
        {n.pipeline} {n.pipeline === 1 ? 'prospect' : 'prospects'}
        <span aria-hidden="true" style={{ color: '#1D4ED8', fontSize: '17px', marginLeft: '6px' }}>
          ›
        </span>
      </div>
    </button>
  );
  return (
    <div>
      <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748B' }}>
        Holes in next season&apos;s roster by position, after the seniors leave. Target these positions with visits and programs: each position group
        has its own program (The Trenches for linemen, Quarterback Academy and more).{' '}
        <button onClick={onPrograms} style={{ ...playerLink, color: '#1D4ED8' }}>
          Programs →
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

const listBtn = (on: boolean): React.CSSProperties => ({
  flex: '0 0 auto',
  minHeight: '32px',
  padding: '4px 9px',
  borderRadius: '8px',
  border: '2px solid #2563EB',
  background: on ? '#2563EB' : '#fff',
  color: on ? '#fff' : '#1D4ED8',
  fontWeight: 800,
  fontSize: '12px',
  whiteSpace: 'nowrap',
  cursor: 'pointer'
});

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
