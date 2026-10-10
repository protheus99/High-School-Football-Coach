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
import { CONTACT_ACTIONS, FEEDER_EVENTS, FeederEventType, LINE_POSITIONS, MAX_POOL_SIZE, SKILL_POSITIONS, inUserPipeline } from '../sim/feederEngine';
import { feederEventCost } from '../sim/coachPoints';
import { isDivisionOne, recruitScore } from '../sim/collegeRecruitingEngine';
import { rankedName } from '../sim/newsEngine';
import { HubHeadlines } from './HubHeadlines';
import { SeasonCard } from './SeasonCard';
import { PracticePicker } from './PracticePicker';
import { PRACTICE_OPTIONS } from '../sim/training';
import { isAcademicallyAtRisk } from '../sim/playerEngine';
import { dilemmaChoiceEffects } from '../sim/dilemmaEngine';
import { ChoiceEffects } from './ui/ChoiceEffects';
import { ScoutingReport } from './ScoutingReport';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict, seasonLength } from '../sim/league';
import { HOT_SEAT_TRUST, programRating, ratingAlerts } from '../sim/programMeters';
import { finishSpotsPerDistrict, playoffQualifyText, rulesForState } from '../sim/stateRules';
import { nationalTeams } from '../sim/nationalWorld';
import { bracketRoundForWeek, findUserNode, powerRatings } from '../sim/playoffEngine';
import { Player, Team } from '../types/game';
import { priorityNeeds, seniorsStillHere, teamNeeds } from '../sim/teamNeeds';

/** Screens the Hub can send the coach to. */
export type AgendaTab =
  | 'ROSTER'
  | 'INJURIES'
  | 'PRACTICE'
  | 'COLLEGE'
  | 'STAFF'
  | 'SCHEDULE'
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

const shortName = (p: Player) => `${p.firstName.charAt(0)}. ${p.lastName}`;
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
  onAutoSim: () => void;
  onAdvanceWeek: () => void;
  onNavigate: (tab: AgendaTab) => void;
  phaseLabel: string; // e.g. Pre Season, Regular Season District
}> = ({ game, onPlayGame, onAutoSim, onAdvanceWeek, onNavigate, phaseLabel }) => {
  const store = useGameStore();
  const {
    leagueTeams,
    nationalLeagues,
    districtTeams,
    userTeamId,
    currentWeek,
    currentYear,
    coachPoints,
    coachTalents,
    activeDilemma,
    resolveDilemma,
    dilemmaLog,
    feederEventsThisWeek,
    runFeederEvent,
    lastTrainingReport,
    practiceIntensity,
    polls,
    league,
    scoutingPool,
    feederClassYear,
    contactFeederProspect,
    lastFeederResults,
    seasonSchedule,
    playoffBracket,
    onHotSeat,
    sanctionLevel,
    seasonRecap,
    coachingStaff
  } = store;
  // Confirmation for the last quick action; it belongs to the week it happened in
  const [flashState, setFlashState] = useState<{ text: string; week: number } | null>(null);
  // The dilemma opens to its options on Review; one tap on an option decides
  const [reviewing, setReviewing] = useState(false);
  const flash = flashState?.week === currentWeek ? flashState.text : null;
  const setFlash = (text: string) => setFlashState({ text, week: currentWeek });
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

  const unavailableCard = (): AgendaItem | null => {
    const out = team.roster.filter((p) => p.depthChartTier === 1 && (p.condition.injuryStatus !== 'HEALTHY' || !p.academics.isEligible));
    if (out.length === 0) return null;
    return {
      id: 'starters',
      icon: '🩹',
      title: `${plural(out.length, 'starter')} out`,
      detail: `${out
        .slice(0, 4)
        .map((p) => `${p.position} ${shortName(p)} (${p.condition.isSuspended ? 'suspended' : p.condition.injuryStatus !== 'HEALTHY' ? 'injured' : 'ineligible'})`)
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

  // College recruiting lives on its own screen (film, calls, camps): the Hub points the way
  const collegeCard = (seniorsOnly = false): AgendaItem | null => {
    const recruits = team.roster
      .filter((p) => (p.classYear === 'Senior' || (!seniorsOnly && p.classYear === 'Junior')) && !p.recruiting.isNationalLetterOfIntentSigned)
      .sort((a, b) => recruitScore(b) - recruitScore(a));
    if (recruits.length === 0) return null;
    const seniorsWithoutD1 = recruits.filter((p) => p.classYear === 'Senior' && !p.recruiting.committedCollege && !p.recruiting.offers.some((o) => isDivisionOne(o.tier)));
    const shown = (seniorsWithoutD1.length > 0 ? seniorsWithoutD1 : recruits).slice(0, TOP_PROSPECTS);
    return {
      id: 'college',
      icon: '🎓',
      title: seniorsWithoutD1.length > 0 ? `${plural(seniorsWithoutD1.length, 'senior')} without a D-I offer` : 'Help your players get recruited',
      detail: shown.map((p) => `${p.position} ${shortName(p)}${p.recruiting.starRating ? ` (${p.recruiting.starRating}★)` : ''}`).join(', '),
      tone: 'todo',
      actions: [{ label: '🎓 College recruiting ›', onClick: () => onNavigate('COLLEGE') }]
    };
  };

  // Practice: one decision (intensity), with what it does this week; tired starters are called out
  const tiredStarters = (team?.roster ?? []).filter((p) => p.depthChartTier === 1 && p.condition.injuryStatus === 'HEALTHY' && p.condition.seasonWear >= TIRED).length;
  const practiceCard = (title = `Practice: ${PRACTICE_OPTIONS.find((o) => o.id === practiceIntensity)?.label ?? 'Limited'}`, id = 'practice'): AgendaItem => ({
    id,
    icon: '🏋️',
    title,
    detail: `Harder practice builds more skill but tires players and risks injuries.${tiredStarters > 0 ? ` ${plural(tiredStarters, 'starter')} ${tiredStarters === 1 ? 'is' : 'are'} Tired or worse.` : ''}`,
    tone: 'done',
    counted: true,
    accent: 'practice',
    content: <PracticePicker compact />,
    link: tiredStarters > 0 ? { label: 'Health', onClick: () => onNavigate('INJURIES') } : { label: 'Practice', onClick: () => onNavigate('PRACTICE') }
  });

  const visitsCard = (title: string, tone: AgendaItem['tone'], id = 'visits'): AgendaItem => {
    const onTheFence = scoutingPool
      .filter((p) => inUserPipeline(p) && p.interestScore >= 30 && p.interestScore <= 75)
      .sort((a, b) => b.interestScore - a.interestScore)
      .slice(0, 3);
    const cost = onTheFence.filter((p) => !p.actionsThisWeek?.includes('VISIT')).length * CONTACT_ACTIONS.VISIT.cost;
    return {
      id,
      icon: '✍️',
      title,
      detail: `${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')} in your pipeline pick their school when week ${FEEDER_SIGNING_WEEK} ends.${
        onTheFence.length ? ` Still deciding: ${onTheFence.map((p) => `${p.projectedPosition} ${p.name}`).join(', ')}.` : ''
      }`,
      tone,
      actions: onTheFence.length
        ? [
            {
              label: `Home visits for ${onTheFence.length} (₡${cost})`,
              primary: true,
              disabled: coachPoints < cost,
              onClick: () => {
                onTheFence.forEach((p) => contactFeederProspect(p.id, 'VISIT'));
                setFlash(`Visited ${plural(onTheFence.length, 'prospect')} before Prospect signing day.`);
              }
            }
          ]
        : undefined,
      link: { label: 'Prospects', onClick: () => onNavigate('FEEDERS') }
    };
  };

  const feederEventsCard = (title: string): AgendaItem | null => {
    if (!feederEventsOpen({ currentWeek, league })) return null;
    // Programs that target this year's needs come first; the full list is on the Off Season Programs page
    const needed = priorityNeeds(teamNeeds(team, scoutingPool, seniorsStillHere(currentYear, feederClassYear, currentWeek))).map((n) => n.position);
    const targeted: FeederEventType[] = [
      ...(needed.some((p) => LINE_POSITIONS.includes(p)) ? (['BIG_MAN_CAMP'] as FeederEventType[]) : []),
      ...(needed.some((p) => SKILL_POSITIONS.includes(p)) ? (['SKILLS_ACADEMY'] as FeederEventType[]) : [])
    ];
    const events = [...new Set([...targeted, ...(Object.keys(FEEDER_EVENTS) as FeederEventType[])])].filter((e) => !feederEventsThisWeek.includes(e)).slice(0, 4);
    if (events.length === 0) return null;
    return {
      id: 'feeder-events',
      icon: '🔍',
      title,
      detail: scoutingPool.filter((p) => !p.homeTeamId).length >= MAX_POOL_SIZE
        ? `Your pipeline is full (${MAX_POOL_SIZE}): programs warm up your prospects but won't find new ones until you remove some.`
        : `Clinics and events find and win over next year's players. They pick their school on Prospect signing day (pre season week ${FEEDER_SIGNING_WEEK}).`,
      tone: 'todo',
      actions: events.map((e) => {
        const cost = feederEventCost(FEEDER_EVENTS[e].cost, coachTalents);
        return {
          label: `${FEEDER_EVENTS[e].label} (₡${cost})`,
          disabled: coachPoints < cost,
          onClick: () => {
            const found = runFeederEvent(e);
            setFlash(`${FEEDER_EVENTS[e].label}: ${plural(found.length, 'new prospect')} discovered.`);
          }
        };
      }),
      link: { label: 'All programs', onClick: () => onNavigate('FEEDER_PROGRAMS') }
    };
  };

  // Post season on: the holes the next class has to fill
  const teamNeedsCard = (): AgendaItem | null => {
    const top = priorityNeeds(teamNeeds(team, scoutingPool, seniorsStillHere(currentYear, feederClassYear, currentWeek))).slice(0, 5);
    if (top.length === 0) return null;
    return {
      id: 'team-needs',
      icon: '📋',
      title: `Team needs: ${top.map((n) => n.position).join(', ')}`,
      detail: top.map((n) => `${n.position} need ${n.need}${n.starterHoles ? ` (${n.starterHoles} starting job${n.starterHoles === 1 ? '' : 's'} open)` : ''}, ${n.pipeline} in pipeline`).join(' · '),
      tone: 'todo',
      link: { label: 'Team needs', onClick: () => onNavigate('FEEDER_NEEDS') }
    };
  };

  // ---------------------------------------------------------------- headline: what this week is about
  let headline: AgendaItem;
  let task: AgendaItem | null = null;
  const extras: AgendaItem[] = [];

  if (game && !game.isPlayed) {
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
    const opp = game.opponent;
    headline = {
      id: 'game',
      icon: game.isPlayoff ? '🏆' : '🏈',
      // A nationally ranked opponent carries its rank: "vs #18 Midland Legacy"
      title: `${game.label ? `${game.label}: ` : ''}${game.isHome ? 'vs' : 'at'} ${rankedName(opp, polls)} (${opp.record.wins}-${opp.record.losses})`,
      detail: note,
      tone: 'todo',
      counted: true,
      // The film study, right here: no extra tap before choosing to play or sim
      content: <ScoutingReport opponent={opp} />,
      actions: [
        { label: '🏈 Play Game', primary: true, onClick: onPlayGame },
        { label: '⏩ Sim Game', onClick: onAutoSim }
      ],
      note: 'Play: you set the game plan next. Sim: your staff picks it.'
    };
  } else if (game?.isPlayed && game.result) {
    headline = { id: 'game', icon: game.isPlayoff ? '🏆' : '🏈', title: game.result, detail: "The final is in. Advance when you're ready.", tone: 'done', counted: true };
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
          detail: 'The program has no assistant coaches. Coordinators and position coaches give an edge on game day, develop players and earn Coach Points.',
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
            detail: `${joined.filter((o) => o.outcome === 'OTHER_SCHOOL').length} chose another school and ${joined.filter((o) => o.outcome === 'LEFT_AREA').length} moved away. New student enrollment is done: meet them on the roster.`,
            tone: 'info',
            link: { label: 'Roster', onClick: () => onNavigate('ROSTER') }
          }
        : { id: 'enrollment', icon: '🏫', title: 'New student enrollment and college camps', detail: 'Summer camps get your juniors and seniors in front of college coaches.', tone: 'info' };
      task = collegeCard();
    } else {
      headline = { id: 'camp-next', icon: '⛺', title: 'Training camp starts next week', detail: 'Camp weeks count double: skills build twice as fast, and so does practice fatigue.', tone: 'info' };
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
        title: `Camp report: +${report?.skillPoints ?? 0} skill points${report?.injured.length ? `, ${report.injured.length} hurt in practice` : ''}`,
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
          : `${ROUND_LABELS[playoffBracket.roundNames[0]]} next week ${mine.team1.id === userTeamId ? 'vs' : 'at'} ${opponent!.name} (${opponent!.record.wins}-${opponent!.record.losses}). No game this week: rest, heal and study film.`
        : "You didn't make the field. The season ends at the banquet: use the time for college recruiting.",
      tone: 'info',
      link: { label: 'Playoffs', onClick: () => onNavigate('PLAYOFFS') }
    };
  } else if (phase === 'STATE_PLAYOFFS') {
    headline = {
      id: 'season-over',
      icon: '🏁',
      title: `Season over: ${team.record.wins}-${team.record.losses}${myRow ? `, ${ordinal(myRow.rank)} in ${districtName}` : ''}`,
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
        title: currentWeek === firstOffSeasonWeek ? `Prospect season opens: ${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')} in your pipeline` : `Grow the pipeline: ${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')}`,
        detail: `Off season week ${currentWeek - firstOffSeasonWeek + 1} of 4. Prospect signing day is pre season week ${FEEDER_SIGNING_WEEK}.`,
        tone: 'info',
        link: { label: 'Prospects', onClick: () => onNavigate('FEEDERS') }
      };
    }
    task = feederEventsCard(currentWeek === totalWeeks ? 'Last chance for prospect events' : 'Run prospect events');
  } else {
    headline = { id: 'bye', icon: '😴', title: 'Bye week: rest and prepare', detail: 'No game this week. Injured players get a week to heal.', tone: 'info' };
  }

  // Regular season and playoff runs: practice is the weekly task
  if (isGamePhase && game) task = practiceCard();

  // ---------------------------------------------------------------- week-specific extras
  if (phase === 'POST_SEASON' || phase === 'OFF_SEASON') {
    const needsCard = teamNeedsCard();
    if (needsCard) extras.push(needsCard);
  }
  // Report cards come out every third week
  if (isGamePhase && currentWeek % 3 === 0) {
    const ineligible = team.roster.filter((p) => !p.academics.isEligible).length;
    const atRisk = team.roster.filter((p) => p.academics.isEligible && isAcademicallyAtRisk(p, stateRules)).length;
    if (ineligible + atRisk > 0) {
      extras.push({
        id: 'report-cards',
        icon: '📚',
        title: `Report cards: ${plural(ineligible, 'player')} ineligible`,
        detail: `${plural(atRisk, 'more player')} close to the line (${stateRules.academics.ruleName}). Anyone below it sits until his grades recover.`,
        tone: ineligible > 0 ? 'urgent' : 'info',
        link: { label: 'Roster', onClick: () => onNavigate('ROSTER') }
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
  const needs = [dilemmaCard(), isGamePhase || currentWeek === LAST_TRAINING_CAMP_WEEK ? (game || !isGamePhase ? unavailableCard() : null) : null, warningsCard()].filter(
    (c): c is AgendaItem => c !== null
  );

  // ---------------------------------------------------------------- the list
  // The decision first, then this week's headline (usually the game), anything else that needs the coach,
  // the week's task (usually practice), then the rest; background notes fold under "More this week"
  const [decision, ...otherNeeds] = needs[0]?.id === 'dilemma' ? needs : [dilemmaCard(), ...needs];
  const college = task?.id === 'college' ? null : collegeCard();
  const visible = [decision, headline, ...otherNeeds, ...(task ? [task] : []), ...extras, college].filter((c): c is AgendaItem => !!c);
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
            {item.kicker && <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.03em', color: '#B45309' }}>{item.kicker}</div>}
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
      {flash && (
        <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', margin: '6px 0' }}>
          {flash}
        </div>
      )}
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
          activeDilemma
            ? { ...advanceBtn, background: '#FEF3C7', color: '#92400E', border: '2px solid #F59E0B' }
            : left > 0
              ? advanceBtn
              : { ...advanceBtn, background: '#16A34A' }
        }
      >
        {activeDilemma ? (
          '⚠️ Review needed before you advance ↑'
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
