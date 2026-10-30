import React, { useState } from 'react';
import { feederEventsOpen, useGameStore } from '../store/gameStore';
import {
  FEEDER_SIGNING_WEEK,
  FIRST_DISTRICT_WEEK,
  FIRST_NON_DISTRICT_WEEK,
  FIRST_TRAINING_CAMP_WEEK,
  LAST_REGULAR_SEASON_WEEK,
  LAST_TRAINING_CAMP_WEEK,
  PRESEASON_WEEKS,
  getSeasonPhase,
  getTeamGameForWeek
} from '../sim/scheduleEngine';
import { inUserPipeline } from '../sim/feederEngine';
import { recruitScore } from '../sim/collegeRecruitingEngine';
import { rankedName } from '../sim/newsEngine';
import { HubHeadlines } from './HubHeadlines';
import { SeasonCard } from './SeasonCard';
import { usePlayoffRecords } from '../hooks/usePlayoffRecords';
import { recordText } from '../sim/seasonRecord';
import { PracticePicker } from './PracticePicker';
import { PRACTICE_OPTIONS } from '../sim/training';
import { isAcademicallyAtRisk } from '../sim/playerEngine';
import { dilemmaChoiceEffects } from '../sim/dilemmaEngine';
import { ChoiceEffects } from './ui/ChoiceEffects';
import { ScoutingReport } from './ScoutingReport';
import { gameStakes } from '../sim/talkPicker';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict, seasonLength } from '../sim/league';
import { HOT_SEAT_TRUST, programRating, ratingAlerts } from '../sim/programMeters';
import { finishSpotsPerDistrict, playoffQualifyText, rulesForState } from '../sim/stateRules';
import { nationalTeams } from '../sim/nationalWorld';
import { bracketRoundForWeek, findUserNode, powerRatings } from '../sim/playoffEngine';
import { Player, Team } from '../types/game';
import { priorityNeeds, seniorsStillHere, teamNeeds } from '../sim/teamNeeds';
import { GRADE_FIXES, gradeWatchActive, startersAtRisk, weeksToReportCard } from '../sim/grades';
import { gradesNeedReview } from '../sim/advanceGate';
import { playerMention, playerTrouble, shortFromName, starsLabel } from '../utils/playerFormat';

/** Screens the Hub can send the coach to. */
export type AgendaTab =
  | 'ROSTER'
  | 'INJURIES'
  | 'GRADES'
  | 'PRACTICE'
  | 'COLLEGE'
  | 'STAFF'
  | 'SCHEDULE'
  | 'COMPLIANCE'
  | 'TALENTS'
  | 'FEEDERS'
  | 'FEEDER_PROGRAMS'
  | 'FEEDER_NEEDS'
  | 'DISTRICT'
  | 'POLLS'
  | 'PLAYOFFS'
  | 'NEWS'
  | 'SCOREBOARD';

/** This week's game, as the Hub needs it. */
export interface HubGame {
  opponent: Team;
  isHome: boolean;
  isPlayed: boolean;
  result?: string;
  label?: string; // playoff round
  isPlayoff: boolean;
  resultStands?: boolean; // played before an older save was loaded: its final was put back
  inProgress?: { userScore: number; opponentScore: number; clock: string }; // kicked off, not finished: resume only
  benched?: string; // the coach is suspended: his coordinator coaches it (sim only), and why
}

interface AgendaAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}

interface AgendaItem {
  id: string;
  icon: string;
  title: React.ReactNode;
  detail?: string;
  tone: 'urgent' | 'todo' | 'info' | 'done';
  actions?: AgendaAction[];
  link?: { label: string; onClick: () => void }; // shown as a button after the actions
  content?: React.ReactNode; // custom body (the dilemma, the practice plan)
  kicker?: string; // a small label over the title ("NEEDS YOUR REVIEW")
  kickerDone?: boolean; // the label reads as settled (green): "REVIEWED"
  note?: string; // a line under the buttons
  accent?: string; // the card's color (defaults by tone)
  counted?: boolean; // a task for the "to do" count: done when `tone` is 'done'
}

/** Each card's color: the left edge, and a tint behind its icon. */
const ACCENTS: Record<string, [string, string]> = {
  dilemma: ['#F59E0B', '#FEF3C7'],
  game: ['#2563EB', '#DBEAFE'],
  starters: ['#DC2626', '#FEE2E2'],
  warnings: ['#DC2626', '#FEE2E2'],
  practice: ['#7C3AED', '#EDE9FE'],
  college: ['#0891B2', '#CFFAFE'],
  feeder: ['#0D9488', '#CCFBF1'],
  race: ['#4F46E5', '#E0E7FF'],
  school: ['#EA580C', '#FFEDD5'],
  info: ['#64748B', '#F1F5F9']
};
const accentFor = (item: AgendaItem): [string, string] => {
  if (item.accent) return ACCENTS[item.accent] ?? ACCENTS.info;
  const id = item.id;
  if (id === 'dilemma') return ACCENTS.dilemma;
  if (id === 'game' || id === 'open-week' || id === 'preview' || id === 'depth-chart') return ACCENTS.game;
  if (id === 'starters' || id === 'warnings') return ACCENTS.starters;
  if (id.startsWith('practice') || id.startsWith('camp')) return ACCENTS.practice;
  if (id === 'college') return ACCENTS.college;
  if (id === 'visits' || id === 'signing' || id === 'feeder-events' || id === 'team-needs' || id === 'pipeline' || id === 'signing-results') return ACCENTS.feeder;
  if (id === 'race') return ACCENTS.race;
  if (id === 'report-cards' || id === 'board-review') return ACCENTS.school;
  if (item.tone === 'urgent') return ACCENTS.dilemma;
  return ACCENTS.info;
};

const TOP_PROSPECTS = 3;
const TIRED = 55; // fatigue at which a starter is flagged (Tired and Exhausted, sim/training)

const CLASS_SHORT: Record<Player['classYear'], string> = { Freshman: 'Fr', Sophomore: 'So', Junior: 'Jr', Senior: 'Sr' };
const posChip: React.CSSProperties = { flex: '0 0 auto', fontWeight: 900, fontSize: '11px', color: '#fff', background: '#334155', borderRadius: '5px', padding: '2px 6px' };
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The Hub's week plan. Every week shows, in order: one headline card (what this week is about), "needs you"
 * cards only when something is blocking or urgent, one task for the current phase, then everything else
 * folded under "More this week". At most four cards are open, then Advance Week.
 */
export const WeeklyAgenda: React.FC<{
  game: HubGame | null;
  onPlayGame: () => void;
  onResumeGame: () => void;
  onAutoSim: () => void;
  onAdvanceWeek: () => void;
  onNavigate: (tab: AgendaTab) => void;
  phaseLabel: string; // e.g. Pre Season, Regular Season District
}> = ({ game, onPlayGame, onResumeGame, onAutoSim, onAdvanceWeek, onNavigate, phaseLabel }) => {
  const store = useGameStore();
  const playoffs = usePlayoffRecords();
  const {
    leagueTeams,
    nationalLeagues,
    districtTeams,
    userTeamId,
    currentWeek,
    currentYear,
    coachPoints,
    activeDilemma,
    resolveDilemma,
    dilemmaLog,
    lastTrainingReport,
    practiceIntensity,
    polls,
    league,
    scoutingPool,
    feederClassYear,
    lastFeederResults,
    seasonSchedule,
    playoffBracket,
    onHotSeat,
    sanctionLevel,
    seasonRecap,
    coachingStaff
  } = store;
  // Confirmation for the last quick action; it belongs to the week it happened in
  // The dilemma opens to its options on Review; one tap on an option decides
  const [reviewing, setReviewing] = useState(false);
  const team = leagueTeams.find((t) => t.id === userTeamId);
  if (!team) return null;

  const stateRules = rulesForState(league?.state);
  // The district opener's one-line reminder of what's at stake
  const openerRule =
    stateRules.playoffs.format === 'STATEWIDE_RANKING'
      ? `${stateRules.districtLabel.toLowerCase()} champions are guaranteed a playoff spot`
      : stateRules.playoffs.format === 'DISTRICT_FINISH'
        ? `the top ${stateRules.playoffs.qualifiersPerDistrict} make the playoffs`
        : stateRules.playoffs.regional?.selection === 'DISTRICT_FINISH'
          ? `the top ${finishSpotsPerDistrict(stateRules.playoffs.regional)} make the playoffs`
          : stateRules.playoffs.regional?.championsSeededFirst
            ? `${stateRules.districtLabel.toLowerCase()} champions get a top playoff seed`
            : 'every win counts in the power ranking'
  const ROUND_LABELS = stateRules.playoffs.roundLabels;
  const phase = getSeasonPhase(currentWeek);
  const totalWeeks = league ? seasonLength(league) : 28;
  const firstOffSeasonWeek = totalWeeks - 3;
  const isGamePhase = phase === 'NON_DISTRICT' || phase === 'DISTRICT_PLAY' || phase === 'STATE_PLAYOFFS';
  const signingThisSeason = currentYear >= feederClassYear;
  const districtName = (league && findDistrict(league, userTeamId)?.name) ?? 'the district';
  const standings = calculateDistrictStandings(districtTeams);
  const myRow = standings.find((r) => r.teamId === userTeamId);

  // ---------------------------------------------------------------- reusable cards
  // This week's decision, once made: it stays on the list as done
  const decided = dilemmaLog.find((r) => r.year === currentYear && r.week === currentWeek);
  // The state's call on the coach's booster money, when he chose to decide later
  const complianceCard = (): AgendaItem | null => {
    const decision = store.compliance.pendingDecision;
    if (!decision || !store.compliance.decisionDeferred) return null;
    return {
      id: 'compliance',
      icon: '⚖️',
      kicker: 'NEEDS YOUR DECISION',
      title: decision === 'INQUIRY' ? 'A formal inquiry is open' : 'The state has questions',
      detail: 'Self-report now, or say nothing and let it ride.',
      tone: 'urgent',
      accent: 'warnings',
      actions: [
        { label: 'Decide', primary: true, onClick: () => useGameStore.setState({ compliance: { ...store.compliance, decisionDeferred: false } }) },
        { label: 'Compliance', onClick: () => onNavigate('COMPLIANCE') }
      ]
    };
  };

  const dilemmaCard = (): AgendaItem | null => {
    if (!activeDilemma)
      return decided
        ? { id: 'dilemma', icon: '📣', title: decided.title, detail: decided.choiceLabel ? `You chose: ${decided.choiceLabel}` : undefined, tone: 'done', counted: true }
        : null;
    return {
      id: 'dilemma',
      icon: '📣',
      kicker: 'NEEDS YOUR REVIEW',
      title: activeDilemma.title,
      detail: activeDilemma.scenario,
      tone: 'urgent',
      counted: true,
      actions: reviewing ? undefined : [{ label: 'Review', primary: true, onClick: () => setReviewing(true) }],
      content: reviewing && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {activeDilemma.choices.map((c) => {
              const fx = dilemmaChoiceEffects(c, team);
              const cannotAfford = fx.coachPoints < 0 && coachPoints < -fx.coachPoints;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setReviewing(false);
                    resolveDilemma(c);
                  }}
                  disabled={cannotAfford}
                  style={{ ...choiceBtn, ...(cannotAfford && { opacity: 0.6, cursor: 'not-allowed' }) }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{c.label}</div>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{c.description}</div>
                  {/* What it does: the combined Rating change, Coach Points, the Friday edge, then gains and losses */}
                  <ChoiceEffects fx={fx} />
                  {cannotAfford && <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px' }}>Needs ₡{-fx.coachPoints}</div>}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>Tap an option to decide.</div>
        </div>
      )
    };
  };

  // Starters who could be ineligible at the next report card: reviewed on Team › Grades before the week moves on
  const gradesBlocked = gradesNeedReview(store);
  const gradesCard = (): AgendaItem | null => {
    if (!gradeWatchActive(currentWeek, playoffBracket, userTeamId)) return null;
    const watch = startersAtRisk(team, stateRules);
    if (watch.length === 0) return null;
    const weeks = weeksToReportCard(currentWeek, totalWeeks);
    return {
      id: 'grades',
      icon: '📚',
      // Reviewed this week: the label says so, and the button is a plain link back to the grades
      kicker: `${gradesBlocked ? 'NEEDS YOUR REVIEW' : 'REVIEWED'} · REPORT CARDS IN ${weeks === 1 ? '1 WEEK' : `${weeks} WEEKS`}`,
      kickerDone: !gradesBlocked,
      title: `${plural(watch.length, 'starter')} could be ineligible`,
      tone: gradesBlocked ? 'urgent' : 'done',
      accent: 'school',
      counted: true,
      content: (
        <div style={{ marginTop: '6px' }}>
          {watch.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
              <span style={posChip}>{p.position}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.firstName} {p.lastName} · {p.overallRating}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                  {CLASS_SHORT[p.classYear]}
                  {!p.academics.isEligible && ' · Ineligible'} · {p.academics.gradeFix ? `${GRADE_FIXES[p.academics.gradeFix].label} booked` : 'No fix yet'}
                </div>
              </div>
              <div style={{ flex: '0 0 auto', fontWeight: 900, fontSize: '15px', color: '#9A3412', fontVariantNumeric: 'tabular-nums' }}>GPA {p.academics.gpa.toFixed(2)}</div>
            </div>
          ))}
        </div>
      ),
      actions: [gradesBlocked ? { label: '📚 Review grades', primary: true, onClick: () => onNavigate('GRADES') } : { label: '📚 Grades', onClick: () => onNavigate('GRADES') }]
    };
  };

  const unavailableCard = (): AgendaItem | null => {
    const out = team.roster.filter((p) => p.depthChartTier === 1 && (p.condition.injuryStatus !== 'HEALTHY' || !p.academics.isEligible));
    if (out.length === 0) return null;
    return {
      id: 'starters',
      icon: '🩹',
      title: `${plural(out.length, 'starter')} out`,
      detail: `${out
        .slice(0, 4)
        .map((p) => `${playerMention(p)} (${playerTrouble(p)?.words ?? 'out'})`)
        .join(', ')}${out.length > 4 ? '…' : ''}. Backups are in unless you change the depth chart.`,
      tone: 'urgent',
      accent: 'starters',
      actions: [
        ...(out.some((p) => p.condition.injuryStatus !== 'HEALTHY') ? [{ label: 'Injuries', onClick: () => onNavigate('INJURIES') }] : []),
        { label: 'Depth chart', onClick: () => onNavigate('ROSTER') }
      ]
    };
  };

  // Serious trouble (state penalties, the hot seat) needs the coach; slower-burning concerns wait under "More"
  const sanctionText =
    sanctionLevel > 0
      ? ['', 'State association: public reprimand issued.', 'State association: a district win was forfeited.', 'State association: banned from the playoffs.'][sanctionLevel]
      : null;
  const alerts = ratingAlerts(team, onHotSeat);
  const hotSeatAlert = onHotSeat ? alerts[0] : null;
  const warningsCard = (): AgendaItem | null => {
    const warnings = [sanctionText, hotSeatAlert].filter((w): w is string => !!w);
    if (warnings.length === 0) return null;
    return { id: 'warnings', icon: '📉', title: 'Program warning', detail: warnings.join(' '), tone: 'urgent' };
  };
  const concernsCard = (): AgendaItem | null => {
    const concerns = alerts.filter((a) => a !== hotSeatAlert);
    if (concerns.length === 0) return null;
    return { id: 'concerns', icon: '📉', title: 'Program concerns', detail: concerns.join(' '), tone: 'info' };
  };

  // College recruiting lives on its own screen (film, calls, camps): the Hub points the way. Every senior with an
  // offer signs somewhere at the banquet, so the seniors who matter are the ones with no offer at all.
  const collegeCard = (seniorsOnly = false): AgendaItem | null => {
    const recruits = team.roster
      .filter((p) => (p.classYear === 'Senior' || (!seniorsOnly && p.classYear === 'Junior')) && !p.recruiting.isNationalLetterOfIntentSigned)
      .sort((a, b) => recruitScore(b) - recruitScore(a));
    if (recruits.length === 0) return null;
    const seniors = recruits.filter((p) => p.classYear === 'Senior');
    const noOffer = seniors.filter((p) => !p.recruiting.committedCollege && p.recruiting.offers.length === 0);
    const choosing = seniors.filter((p) => !p.recruiting.committedCollege && p.recruiting.offers.length > 0).length;
    const line = (players: Player[]) => players.slice(0, TOP_PROSPECTS).map((p) => [playerMention(p), starsLabel(p.recruiting.starRating)].filter(Boolean).join(' ')).join(', ');
    const action = { label: '🎓 College recruiting ›', onClick: () => onNavigate('COLLEGE') };
    if (noOffer.length > 0) return { id: 'college', icon: '🎓', title: `${plural(noOffer.length, 'senior')} without a college offer`, detail: line(noOffer), tone: 'todo', actions: [action] };
    if (seniors.length > 0)
      return {
        id: 'college',
        icon: '🎓',
        title: "All seniors have offers: they'll sign at the banquet",
        detail: choosing > 0 ? `${plural(choosing, 'senior')} still choosing. More exposure can bring a bigger school.` : 'Every senior has committed.',
        tone: 'info',
        actions: [action]
      };
    return { id: 'college', icon: '🎓', title: 'Help your players get recruited', detail: line(recruits), tone: 'todo', actions: [action] };
  };

  // Practice: one decision (intensity), with what it does this week; tired starters are called out
  const tiredStarters = (team?.roster ?? []).filter((p) => p.depthChartTier === 1 && p.condition.injuryStatus === 'HEALTHY' && p.condition.seasonWear >= TIRED).length;
  const practiceCard = (title = `Practice: ${PRACTICE_OPTIONS.find((o) => o.id === practiceIntensity)?.label ?? 'Limited'}`, id = 'practice'): AgendaItem => ({
    id,
    icon: '🏋️',
    title,
    detail: `Harder practice builds more attribute points but tires players and risks injuries.${tiredStarters > 0 ? ` ${plural(tiredStarters, 'starter')} ${tiredStarters === 1 ? 'is' : 'are'} Tired or worse.` : ''}`,
    tone: 'done',
    counted: true,
    accent: 'practice',
    content: <PracticePicker compact />,
    link: tiredStarters > 0 ? { label: 'Health', onClick: () => onNavigate('INJURIES') } : { label: 'Practice', onClick: () => onNavigate('PRACTICE') }
  });

  // Signing week: who's still deciding, and the way to the Prospects page to win them over (visits happen there)
  const visitsCard = (title: string, tone: AgendaItem['tone'], id = 'visits'): AgendaItem => {
    const onTheFence = scoutingPool
      .filter((p) => inUserPipeline(p) && p.interestScore >= 30 && p.interestScore <= 75)
      .sort((a, b) => b.interestScore - a.interestScore)
      .slice(0, 3);
    return {
      id,
      icon: '✍️',
      title,
      detail: `${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')} in your pool pick their school when week ${FEEDER_SIGNING_WEEK} ends.${
        onTheFence.length ? ` Still deciding: ${onTheFence.map((p) => `${p.projectedPosition} ${shortFromName(p.name)}`).join(', ')}.` : ''
      }`,
      tone,
      link: { label: 'Prospects', onClick: () => onNavigate('FEEDERS') }
    };
  };

  // Programs run all year (except the post season): a standing question, not a task. Coach Points are the limit
  const programsCard = (): AgendaItem | null =>
    feederEventsOpen({ currentWeek, league })
      ? {
          id: 'programs',
          icon: '🏟️',
          title: 'Which programs should we run this week, Coach?',
          detail: 'Programs find and scout prospects. Texts, calls and visits win them over.',
          tone: 'info',
          accent: 'feeder',
          counted: false,
          actions: [{ label: 'Programs ›', primary: true, onClick: () => onNavigate('FEEDER_PROGRAMS') }]
        }
      : null;

  // Post season on: the holes the next class has to fill
  const teamNeedsCard = (): AgendaItem | null => {
    const top = priorityNeeds(teamNeeds(team, scoutingPool, seniorsStillHere(currentYear, feederClassYear, currentWeek))).slice(0, 5);
    if (top.length === 0) return null;
    return {
      id: 'team-needs',
      icon: '📋',
      title: `Team needs: ${top.map((n) => n.position).join(', ')}`,
      detail: top.map((n) => `${n.position} need ${n.need}${n.starterHoles ? ` (${n.starterHoles} starting job${n.starterHoles === 1 ? '' : 's'} open)` : ''}, ${n.pipeline} ${n.pipeline === 1 ? 'prospect' : 'prospects'}`).join(' · '),
      tone: 'todo',
      link: { label: 'Team needs', onClick: () => onNavigate('FEEDER_NEEDS') }
    };
  };

  // ---------------------------------------------------------------- headline: what this week is about
  let headline: AgendaItem;
  let task: AgendaItem | null = null;
  const extras: AgendaItem[] = [];

  if (game && !game.isPlayed && game.inProgress) {
    const opp = game.opponent;
    const live = game.inProgress;
    const team = districtTeams.find((t) => t.id === userTeamId);
    const side = (name: string, score: number, right = false) => (
      <div style={{ textAlign: right ? 'right' : 'left', minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
      </div>
    );
    headline = {
      id: 'game',
      icon: game.isPlayoff ? '🏆' : '🏈',
      kicker: 'GAME IN PROGRESS',
      title: `${game.label ? `${game.label}: ` : ''}${game.isHome ? 'vs' : 'at'} ${rankedName(opp, polls)} (${recordText(opp, playoffs)})`,
      detail: "This game already kicked off and wasn't finished. It picks up where it left off.",
      tone: 'todo',
      counted: true,
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '6px', marginTop: '8px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '8px 10px' }}>
          {side(team?.name ?? 'You', live.userScore)}
          <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 800, color: '#FACC15', letterSpacing: '0.04em', whiteSpace: 'pre-line' }}>{live.clock.toUpperCase().replace(' · ', '\n')}</div>
          {side(opp.name, live.opponentScore, true)}
        </div>
      ),
      actions: [{ label: '▶ Resume Game', primary: true, onClick: onResumeGame }],
      note: 'A game counts once it kicks off.'
    };
  } else if (game && !game.isPlayed) {
    const roundIndex = playoffBracket ? bracketRoundForWeek(playoffBracket, currentWeek) : -1;
    const nextRound = playoffBracket?.roundNames[roundIndex + 1];
    const note = game.isPlayoff
      ? nextRound
        ? `Win and advance to the ${ROUND_LABELS[nextRound]}`
        : 'Win the state championship'
      : currentWeek === FIRST_NON_DISTRICT_WEEK
        ? 'Season opener'
        : currentWeek === FIRST_DISTRICT_WEEK
          ? `${stateRules.districtLabel} opener: ${openerRule}`
          : undefined;
    // Homecoming, Senior Night or the rivalry game (the playoffs already name the round)
    const night = game.isPlayoff ? null : (gameStakes(store)?.banner ?? null);
    const opp = game.opponent;
    headline = {
      id: 'game',
      icon: game.isPlayoff ? '🏆' : '🏈',
      // A nationally ranked opponent carries its rank: "vs #18 Midland Legacy"
      title: `${game.label ? `${game.label}: ` : ''}${game.isHome ? 'vs' : 'at'} ${rankedName(opp, polls)} (${recordText(opp, playoffs)})`,
      detail: [night, note].filter(Boolean).join(' · ') || undefined,
      tone: 'todo',
      counted: true,
      // The film study, right here: no extra tap before choosing to play or sim
      content: <ScoutingReport opponent={opp} />,
      // A suspended coach watches: his coordinator coaches it, so it can only be simulated
      actions: game.benched
        ? [{ label: '⏩ Sim Game', primary: true, onClick: onAutoSim }]
        : [
            { label: '🏈 Play Game', primary: true, onClick: onPlayGame },
            { label: '⏩ Sim Game', onClick: onAutoSim }
          ],
      note: game.benched ?? 'Play: you set the game plan next. Sim: your staff picks it.'
    };
  } else if (game?.isPlayed && game.result) {
    headline = {
      id: 'game',
      icon: game.isPlayoff ? '🏆' : '🏈',
      title: game.result,
      detail: game.resultStands ? 'Played before this save was loaded. The result stands.' : "The final is in. Advance when you're ready.",
      tone: 'done',
      counted: true
    };
  } else if (phase === 'SPRING_EVALUATION') {
    if (currentWeek === 1) {
      headline =
        seasonRecap && seasonRecap.year === currentYear - 1
          ? {
              id: 'season',
              icon: '📅',
              title: `New season: ${plural(seasonRecap.graduated, 'senior')} graduated, ${plural(seasonRecap.returningStarters, 'starter')} return`,
              detail: `Last season: ${seasonRecap.wins}-${seasonRecap.losses}, ${ordinal(seasonRecap.districtFinish)} in the district. Prestige ${team.prestige}, Rating ${programRating(team)}.`,
              tone: 'info',
              link: { label: 'Roster', onClick: () => onNavigate('ROSTER') }
            }
          : {
              id: 'season',
              icon: '📅',
              title: `Welcome to ${team.name}, Coach`,
              detail: `Prestige ${team.prestige}, Rating ${programRating(team)}. Your first Prospect signing day is next season.`,
              tone: 'info',
              link: { label: 'Roster', onClick: () => onNavigate('ROSTER') }
            };
      task = signingThisSeason ? visitsCard('Prospect signing day is next week: final visits', 'todo') : collegeCard();
      // Week 1: set the program up (a new program has no assistants)
      if (coachingStaff.length === 0)
        extras.push({
          id: 'hire-staff',
          icon: '🧑‍🏫',
          title: 'Hire your coaching staff',
          detail: 'The program has no assistant coaches. Hire them before the season opener (Week 8), when the staff locks. Coordinators and position coaches give an edge on game day and develop players.',
          tone: 'todo',
          link: { label: 'Staff', onClick: () => onNavigate('STAFF') }
        });
      extras.push(practiceCard('Set your practice intensity', 'practice-focus'));
    } else if (currentWeek === FEEDER_SIGNING_WEEK && signingThisSeason) {
      headline = visitsCard('Prospect signing day: last chance to win prospects over', 'urgent', 'signing');
      task = collegeCard();
    } else if (currentWeek <= PRESEASON_WEEKS && currentWeek < PRESEASON_WEEKS) {
      const joined = lastFeederResults && feederClassYear === currentYear + 1 && currentYear > (seasonRecap?.year ?? 0) ? lastFeederResults : null;
      headline = joined?.length
        ? {
            id: 'signing-results',
            icon: '🆕',
            title: `Prospect signing day: ${plural(joined.filter((o) => o.outcome === 'JOINED').length, 'newcomer')} joined`,
            detail: `${joined.filter((o) => o.outcome === 'OTHER_SCHOOL').length} chose another school and ${joined.filter((o) => o.outcome === 'LEFT_AREA').length} moved away. New student enrollment is done.`,
            tone: 'info',
            actions: [{ label: 'Review Signings ›', onClick: () => onNavigate('FEEDERS') }]
          }
        : { id: 'enrollment', icon: '🏫', title: 'New student enrollment and college camps', detail: 'Summer camps get your juniors and seniors in front of college coaches.', tone: 'info' };
      task = collegeCard();
    } else {
      headline = { id: 'camp-next', icon: '⛺', title: 'Training camp starts next week', detail: 'Camp weeks count double: attributes build twice as fast, and so does practice fatigue.', tone: 'info' };
      task = practiceCard('Set your practice intensity');
    }
  } else if (phase === 'SUMMER_CAMP') {
    const campWeek = currentWeek - FIRST_TRAINING_CAMP_WEEK + 1;
    if (currentWeek === FIRST_TRAINING_CAMP_WEEK) {
      headline = { ...practiceCard(`Camp opens (week ${campWeek} of 3): 2× training`, 'camp-open'), icon: '⛺' };
    } else if (currentWeek < LAST_TRAINING_CAMP_WEEK) {
      const report = lastTrainingReport;
      headline = {
        id: 'camp-report',
        icon: '📈',
        title: `Camp report: +${report?.skillPoints ?? 0} attribute points${report?.injured.length ? `, ${report.injured.length} hurt in practice` : ''}`,
        detail: [report?.improved.slice(0, 3).join(' · '), report?.injured.length ? `Hurt: ${report.injured.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Practice results come in each week.',
        tone: 'info',
        link: { label: 'Practice', onClick: () => onNavigate('PRACTICE') }
      };
      task = practiceCard('Adjust your camp practice');
    } else {
      headline = {
        id: 'depth-chart',
        icon: '📋',
        title: 'Set your depth chart',
        detail: 'Camp ends this week and the season opens next week. Lock in your starters and backups.',
        tone: 'urgent',
        link: { label: 'Depth chart', onClick: () => onNavigate('ROSTER') }
      };
      const preview = [FIRST_NON_DISTRICT_WEEK, FIRST_NON_DISTRICT_WEEK + 1, FIRST_NON_DISTRICT_WEEK + 2]
        .map((w) => getTeamGameForWeek(seasonSchedule, w, userTeamId))
        .filter((g) => g !== undefined)
        .map((g) => {
          const home = g!.homeTeamId === userTeamId;
          const opp = nationalTeams(leagueTeams, nationalLeagues).find((t) => t.id === (home ? g!.awayTeamId : g!.homeTeamId));
          return `Wk ${g!.week} ${home ? 'vs' : 'at'} ${opp?.name ?? '?'}`;
        });
      task = { id: 'preview', icon: '🗓️', title: 'Season preview', detail: preview.join(' · '), tone: 'info', link: { label: 'Schedule', onClick: () => onNavigate('SCHEDULE') } };
    }
  } else if (phase === 'STATE_PLAYOFFS' && playoffBracket?.isPlayoffsActive && bracketRoundForWeek(playoffBracket, currentWeek) < 0) {
    // A five-round state's open week: the field is set and the first round is next week
    const mine = findUserNode(playoffBracket, userTeamId)?.node;
    const opponent = mine && !mine.isBye ? (mine.team1.id === userTeamId ? mine.team2 : mine.team1) : undefined;
    headline = {
      id: 'open-week',
      icon: mine ? '🎟️' : '📋',
      title: mine ? 'Open week: you made the playoffs' : 'Open week: the playoff field is set',
      detail: mine
        ? mine.isBye
          ? `You have a first-round bye. Rest up: injuries heal and the ${ROUND_LABELS[playoffBracket.roundNames[1]] ?? 'next round'} is in two weeks.`
          : `${ROUND_LABELS[playoffBracket.roundNames[0]]} next week ${mine.team1.id === userTeamId ? 'vs' : 'at'} ${opponent!.name} (${recordText(opponent!, playoffs)}). No game this week: rest, heal and study film.`
        : "You didn't make the field. The season ends at the banquet: use the time for college recruiting.",
      tone: 'info',
      link: { label: 'Playoffs', onClick: () => onNavigate('PLAYOFFS') }
    };
  } else if (phase === 'STATE_PLAYOFFS') {
    headline = {
      id: 'season-over',
      icon: '🏁',
      title: `Season over: ${recordText(team, playoffs)}${myRow ? `, ${ordinal(myRow.rank)} in ${districtName}` : ''}`,
      detail: 'The playoffs go on without you. The season ends at the banquet: use the time for college recruiting.',
      tone: 'info',
      link: { label: 'Playoffs', onClick: () => onNavigate('PLAYOFFS') }
    };
    task = collegeCard(true);
  } else if (phase === 'OFF_SEASON') {
    if (currentWeek === totalWeeks) {
      const atRisk = onHotSeat || team.programMeters.schoolBoardTrust < HOT_SEAT_TRUST;
      headline = {
        id: 'board-review',
        icon: atRisk ? '⚠️' : '🏫',
        title: 'School board review this week',
        detail: atRisk
          ? onHotSeat
            ? 'You are on the hot seat. If the board still lacks confidence, it will make a change.'
            : 'The board is losing patience. Another poor review puts you on the hot seat.'
          : 'The board is satisfied with the program. The new school year begins next week.',
        tone: atRisk ? 'urgent' : 'info'
      };
    } else {
      headline = {
        id: 'pipeline',
        icon: '🔍',
        title: currentWeek === firstOffSeasonWeek ? `Prospect season opens: ${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')} in your pool` : `Grow your pool: ${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')}`,
        detail: `Off season week ${currentWeek - firstOffSeasonWeek + 1} of 4. Prospect signing day is pre season week ${FEEDER_SIGNING_WEEK}.`,
        tone: 'info',
        link: { label: 'Prospects', onClick: () => onNavigate('FEEDERS') }
      };
    }
  } else {
    headline = { id: 'bye', icon: '😴', title: 'Bye week: rest and prepare', detail: 'No game this week. Injured players get a week to heal.', tone: 'info' };
  }

  // Regular season and playoff runs: practice is the weekly task
  if (isGamePhase && game) task = practiceCard();

  // ---------------------------------------------------------------- week-specific extras
  const programs = programsCard();
  if (programs) extras.push(programs);
  if (phase === 'POST_SEASON' || phase === 'OFF_SEASON') {
    const needsCard = teamNeedsCard();
    if (needsCard) extras.push(needsCard);
  }
  // Report cards come out every third week (the starters' own card covers them while it shows)
  const grades = gradesCard();
  if (isGamePhase && currentWeek % 3 === 0 && !grades) {
    const ineligible = team.roster.filter((p) => !p.academics.isEligible).length;
    const atRisk = team.roster.filter((p) => p.academics.isEligible && isAcademicallyAtRisk(p, stateRules)).length;
    if (ineligible + atRisk > 0) {
      extras.push({
        id: 'report-cards',
        icon: '📚',
        title: `Report cards: ${plural(ineligible, 'player')} ineligible`,
        detail: `${plural(atRisk, 'more player')} close to the line (${stateRules.academics.ruleName}). Anyone below it sits until his grades recover.`,
        tone: ineligible > 0 ? 'urgent' : 'info',
        link: { label: 'Grades', onClick: () => onNavigate('GRADES') }
      });
    }
  }
  // The playoff race (weeks 14-17): a power ranking picks the field (Georgia, Florida, Maryland, North Carolina) ...
  const regional = stateRules.playoffs.regional;
  const rankingRace = stateRules.playoffs.format === 'STATEWIDE_RANKING' || (stateRules.playoffs.format === 'REGIONAL_SEEDED' && regional?.selection === 'RANKING');
  if (phase === 'DISTRICT_PLAY' && currentWeek >= LAST_REGULAR_SEASON_WEEK - 3 && myRow && rankingRace) {
    const ratings = powerRatings(leagueTeams, seasonSchedule);
    // Ranked against the teams competing for the same spots: the state, or the user's playoff region
    const districts = league?.regions.flatMap((r) => r.districts) ?? [];
    const myDistrict = districts.findIndex((d) => d.teamIds.includes(userTeamId)) + 1;
    const myRegion = regional && !regional.statewideQualifiers ? regional.regions.find((g) => g.districts.includes(myDistrict)) : undefined;
    const field = myRegion ? leagueTeams.filter((t) => myRegion.districts.some((d) => districts[d - 1]?.teamIds.includes(t.id))) : leagueTeams;
    const powerRank = [...field].sort((a, b) => (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0)).findIndex((t) => t.id === userTeamId) + 1;
    const spots = myRegion ? regional!.qualifiersPerRegion : regional?.statewideQualifiers ?? stateRules.playoffs.bracketSize;
    extras.push({
      id: 'race',
      icon: powerRank <= spots || myRow.rank === 1 ? '📊' : '⚠️',
      title: `Playoff race: #${powerRank} in the ${myRegion ? `${myRegion.name} ` : ''}power ranking`,
      detail: `${playoffQualifyText(stateRules)} You're ${ordinal(myRow.rank)} in ${districtName} (${myRow.districtRecord}).`,
      tone: 'todo',
      link: { label: 'Standings', onClick: () => onNavigate('DISTRICT') }
    });
  }
  // ... or the top N of each district (Texas, Alabama)
  const finishSpots = stateRules.playoffs.format === 'DISTRICT_FINISH' ? stateRules.playoffs.qualifiersPerDistrict : regional?.selection === 'DISTRICT_FINISH' ? finishSpotsPerDistrict(regional) : 0;
  if (phase === 'DISTRICT_PLAY' && currentWeek >= LAST_REGULAR_SEASON_WEEK - 3 && myRow && finishSpots > 0) {
    const remaining = (id: string) => seasonSchedule.filter((g) => g.isDistrictGame && g.homeScore === undefined && (g.homeTeamId === id || g.awayTeamId === id)).length;
    const wins = (id: string) => districtTeams.find((t) => t.id === id)?.record.districtWins ?? 0;
    const others = standings.filter((r) => r.teamId !== userTeamId).map((r) => r.teamId);
    const mine = wins(userTeamId);
    const clinched = others.filter((id) => wins(id) + remaining(id) >= mine).length < finishSpots;
    const eliminated = sanctionLevel === 3 || others.filter((id) => wins(id) > mine + remaining(userTeamId)).length >= finishSpots;
    const lastIn = standings[finishSpots - 1];
    const gamesBack = lastIn && myRow.rank > finishSpots ? wins(lastIn.teamId) - mine : 0;
    extras.push({
      id: 'race',
      icon: clinched ? '🎟️' : eliminated ? '🚫' : '📊',
      title: clinched
        ? 'Playoff spot clinched'
        : eliminated
          ? 'Out of the playoff race'
          : currentWeek === LAST_REGULAR_SEASON_WEEK
            ? `Final week: the top ${finishSpots} make the playoffs`
            : 'Playoff race',
      detail: `${ordinal(myRow.rank)} in ${districtName} (${myRow.districtRecord}).${gamesBack > 0 ? ` ${plural(gamesBack, 'game')} behind ${ordinal(finishSpots)}.` : ''}`,
      tone: eliminated ? 'info' : 'todo',
      link: { label: 'Standings', onClick: () => onNavigate('DISTRICT') }
    });
  }

  // ---------------------------------------------------------------- needs you
  const needs = [dilemmaCard(), complianceCard(), isGamePhase || currentWeek === LAST_TRAINING_CAMP_WEEK ? (game || !isGamePhase ? unavailableCard() : null) : null, warningsCard()].filter(
    (c): c is AgendaItem => c !== null
  );

  // ---------------------------------------------------------------- the list
  // The decision first (then the grades to review), then this week's headline (usually the game), anything else that needs the coach,
  // the week's task (usually practice), then the rest; background notes fold under "More this week"
  const [decision, ...otherNeeds] = needs[0]?.id === 'dilemma' ? needs : [dilemmaCard(), ...needs];
  const college = task?.id === 'college' ? null : collegeCard();
  const visible = [decision, grades, headline, ...otherNeeds, ...(task ? [task] : []), ...extras, college].filter((c): c is AgendaItem => !!c);
  const folded: AgendaItem[] = [];
  const concerns = concernsCard();
  if (concerns) folded.push(concerns);
  if (task?.id !== 'practice' && (isGamePhase || phase === 'OFF_SEASON')) folded.push({ ...practiceCard('Practice', 'practice-more'), counted: false });
  if (isGamePhase) folded.push({ id: 'scores', icon: '📋', title: 'Scores around the league', tone: 'info', link: { label: 'Scoreboard', onClick: () => onNavigate('SCOREBOARD') } });

  // The week's tasks: done ones keep their card with a check
  const tasks = visible.filter((c) => c.counted);
  const doneCount = tasks.filter((c) => c.tone === 'done').length;
  const left = tasks.length - doneCount;

  const renderCard = (item: AgendaItem) => {
    const [accent, tint] = accentFor(item);
    const urgent = item.tone === 'urgent' && item.id === 'dilemma';
    const done = item.tone === 'done';
    const buttons = [...(item.actions ?? []), ...(item.link ? [{ label: item.link.label, onClick: item.link.onClick }] : [])];
    return (
      <div
        key={item.id}
        id={`agenda-${item.id}`}
        style={{
          ...cardStyle,
          scrollMarginTop: 'calc(var(--topbar-h) + 12px)',
          borderLeft: `5px solid ${accent}`,
          ...(urgent && { background: '#FFFBEB', outline: '2px solid #F59E0B' })
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div aria-hidden="true" style={{ ...iconTile, background: tint }}>
            {item.icon}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {item.kicker && <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.03em', color: item.kickerDone ? '#15803D' : '#B45309' }}>{item.kicker}</div>}
            <div style={{ fontWeight: 800, fontSize: '14.5px', color: done && item.counted ? '#334155' : '#0F172A' }}>{item.title}</div>
            {item.detail && <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>{item.detail}</div>}
          </div>
          {done && item.counted && <span style={donePill}>✓ Done</span>}
        </div>
        {item.content}
        {buttons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {buttons.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                disabled={'disabled' in a ? a.disabled : false}
                style={actionBtn('primary' in a ? !!a.primary : false, 'disabled' in a ? !!a.disabled : false, item.id === 'dilemma')}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {item.note && <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '5px' }}>{item.note}</div>}
      </div>
    );
  };

  return (
    <section aria-labelledby="this-week-title" style={{ marginBottom: '24px' }}>
      <h2 id="this-week-title" className="ui-section-title">
        Week {currentWeek} <span style={{ color: '#4F46E5', fontSize: '0.75em' }}>| {phaseLabel}</span>
      </h2>
      <SeasonCard team={team} standingRank={myRow?.rank} districtName={districtName} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 2px 8px' }}>
        <h3 style={{ margin: 0, fontSize: '16px' }}>To do this week</h3>
        {tasks.length > 0 && (
          <span style={progressPill}>
            {doneCount} of {tasks.length} done
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{visible.map((item) => renderCard(item))}</div>
      {folded.length > 0 && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: '#334155', padding: '8px 0', minHeight: '32px' }}>
            More this week ({folded.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{folded.map((item) => renderCard(item))}</div>
        </details>
      )}
      <HubHeadlines onNavigate={onNavigate} />
      {/* A decision must be reviewed before the week can move on: the button takes the coach to it. Otherwise it
          shows what's still open, without stopping him */}
      <button
        onClick={onAdvanceWeek}
        style={
          activeDilemma || gradesBlocked
            ? { ...advanceBtn, background: '#FEF3C7', color: '#92400E', border: '2px solid #F59E0B' }
            : left > 0
              ? advanceBtn
              : { ...advanceBtn, background: '#16A34A' }
        }
      >
        {activeDilemma ? (
          '⚠️ Review needed before you advance ↑'
        ) : gradesBlocked ? (
          '📚 Review grades before you advance'
        ) : left > 0 ? (
          <>
            ⏭️ Advance Week{' '}
            <span style={{ fontWeight: 600, fontSize: '12px', opacity: 0.85 }}>
              · {plural(left, 'thing')} left
            </span>
          </>
        ) : (
          '✓ All set: Advance Week ⏭️'
        )}
      </button>
    </section>
  );
};

const choiceBtn: React.CSSProperties = {
  textAlign: 'left',
  width: '100%',
  minHeight: '44px',
  padding: '10px 12px',
  background: '#fff',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  cursor: 'pointer',
  color: '#0F172A'
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '10px 12px',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)'
};

const iconTile: React.CSSProperties = {
  flex: '0 0 28px',
  width: '28px',
  height: '28px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '17px'
};

const donePill: React.CSSProperties = {
  marginLeft: 'auto',
  flex: '0 0 auto',
  background: '#DCFCE7',
  color: '#166534',
  fontSize: '11px',
  fontWeight: 800,
  borderRadius: '999px',
  padding: '3px 8px'
};

const progressPill: React.CSSProperties = { fontSize: '12px', fontWeight: 700, color: '#1D4ED8', background: '#DBEAFE', borderRadius: '999px', padding: '2px 8px' };

const actionBtn = (primary: boolean, disabled: boolean, amber = false): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 14px',
  borderRadius: '8px',
  border: amber && primary ? '1px solid #F59E0B' : primary ? '1px solid #2563EB' : '1px solid #CBD5E1',
  background: disabled ? '#E2E8F0' : amber && primary ? '#F59E0B' : primary ? '#2563EB' : '#fff',
  color: disabled ? '#94A3B8' : amber && primary ? '#0F172A' : primary ? '#fff' : '#1E293B',
  fontWeight: 800,
  fontSize: '13px',
  cursor: disabled ? 'default' : 'pointer'
});

const advanceBtn: React.CSSProperties = {
  width: '100%',
  marginTop: '14px',
  minHeight: '48px',
  padding: '12px',
  background: '#0F172A',
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  fontWeight: 800,
  fontSize: '14px',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(15,23,42,.18)'
};
