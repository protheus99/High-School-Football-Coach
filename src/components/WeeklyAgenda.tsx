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
import { COACH_TALENTS, collegeActionCost, feederEventCost, formatCP, talentBlocker, weeklyCpIncome } from '../sim/coachPoints';
import { CAMP_WEEKS, COLLEGE_ACTION_COSTS, CollegeAction, collegeActionBlocker, recruitScore } from '../sim/collegeRecruitingEngine';
import { PracticePicker } from './PracticePicker';
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
  title: string;
  detail?: string;
  tone: 'urgent' | 'todo' | 'info' | 'done';
  actions?: AgendaAction[];
  link?: { label: string; onClick: () => void };
  content?: React.ReactNode; // custom body (the dilemma, the practice plan)
}

const TONES: Record<AgendaItem['tone'], { border: string; background: string }> = {
  urgent: { border: '#F59E0B', background: '#FFFBEB' },
  todo: { border: '#3B82F6', background: '#EFF6FF' },
  info: { border: '#CBD5E1', background: '#fff' },
  done: { border: '#86EFAC', background: '#F0FDF4' }
};

const MAX_OPEN_CARDS = 4;
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
    feederEventsThisWeek,
    runFeederEvent,
    collegeRecruitAction,
    lastTrainingReport,
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
  const dilemmaCard = (): AgendaItem | null =>
    activeDilemma && {
      id: 'dilemma',
      icon: '⚠️',
      title: activeDilemma.title,
      tone: 'urgent',
      content: (
        <div>
          <p style={{ margin: '4px 0 8px 0', fontSize: '13px', color: '#334155' }}>{activeDilemma.scenario}</p>
          <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>What do you do?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeDilemma.choices.map((c) => {
              const fx = dilemmaChoiceEffects(c, team);
              const cannotAfford = fx.coachPoints < 0 && coachPoints < -fx.coachPoints;
              return (
                <button key={c.id} onClick={() => resolveDilemma(c)} disabled={cannotAfford} style={{ ...choiceBtn, ...(cannotAfford && { opacity: 0.6, cursor: 'not-allowed' }) }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{c.label}</div>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{c.description}</div>
                  {/* What it does: the combined Rating change, Coach Points, the Friday edge, then gains and losses */}
                  <ChoiceEffects fx={fx} />
                  {cannotAfford && <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px' }}>Needs ₡{-fx.coachPoints}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )
    };

  const unavailableCard = (): AgendaItem | null => {
    const out = team.roster.filter((p) => p.depthChartTier === 1 && (p.condition.injuryStatus !== 'HEALTHY' || !p.academics.isEligible));
    if (out.length === 0) return null;
    return {
      id: 'starters',
      icon: '🩹',
      title: `${plural(out.length, 'starter')} unavailable`,
      detail: `${out
        .slice(0, 4)
        .map((p) => `${p.position} ${shortName(p)} (${p.condition.isSuspended ? 'suspended' : p.condition.injuryStatus !== 'HEALTHY' ? 'injured' : 'ineligible'})`)
        .join(', ')}${out.length > 4 ? '…' : ''}. The next man up plays unless you change the depth chart.`,
      tone: 'urgent',
      link: out.some((p) => p.condition.injuryStatus !== 'HEALTHY') ? { label: 'Injury report', onClick: () => onNavigate('INJURIES') } : { label: 'Depth chart', onClick: () => onNavigate('ROSTER') }
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

  const collegeCard = (seniorsOnly = false): AgendaItem | null => {
    const prospects = team.roster
      .filter((p) => (p.classYear === 'Senior' || (!seniorsOnly && p.classYear === 'Junior')) && !p.recruiting.isNationalLetterOfIntentSigned)
      .sort((a, b) => recruitScore(b) - recruitScore(a))
      .slice(0, TOP_PROSPECTS);
    const batch = (action: CollegeAction) => {
      const ready = prospects.filter((p) => !collegeActionBlocker(p, action, currentWeek, currentYear));
      return { ready, cost: ready.length * collegeActionCost(COLLEGE_ACTION_COSTS[action], coachTalents) };
    };
    const runBatch = (action: CollegeAction, verb: string) => {
      let offers = 0;
      let done = 0;
      batch(action).ready.forEach((p) => {
        const result = collegeRecruitAction(p.id, action);
        if (result.ok) done++;
        if (result.offer) offers++;
      });
      setFlash(`${verb} ${plural(done, 'prospect')}${offers ? `: ${plural(offers, 'new offer')}!` : '.'}`);
    };
    const camp = batch('CAMP');
    const film = batch('FILM');
    const actions: AgendaAction[] = [];
    if (currentWeek <= CAMP_WEEKS && camp.ready.length > 0)
      actions.push({ label: `Camp for top ${camp.ready.length} (₡${camp.cost})`, disabled: coachPoints < camp.cost, onClick: () => runBatch('CAMP', 'Took') });
    if (film.ready.length > 0)
      actions.push({ label: `Send film for top ${film.ready.length} (₡${film.cost})`, disabled: coachPoints < film.cost, onClick: () => runBatch('FILM', 'Sent film for') });
    if (actions.length === 0) return null;
    return {
      id: 'college',
      icon: '🎓',
      title: seniorsOnly ? "Push your seniors' college recruiting" : 'Help your players with College recruiting',
      detail: prospects.map((p) => `${p.position} ${shortName(p)} (${p.recruiting.starRating}★)`).join(', '),
      tone: 'todo',
      actions,
      link: { label: 'College', onClick: () => onNavigate('COLLEGE') }
    };
  };

  // Practice: one decision (intensity), with what it does this week; tired starters are called out
  const tiredStarters = (team?.roster ?? []).filter((p) => p.depthChartTier === 1 && p.condition.injuryStatus === 'HEALTHY' && p.condition.seasonWear >= TIRED).length;
  const practiceCard = (title = 'Practice plan', id = 'practice'): AgendaItem => ({
    id,
    icon: '🏋️',
    title,
    detail: `Harder practice builds more skill but tires players and risks injuries.${tiredStarters > 0 ? ` ${plural(tiredStarters, 'starter')} ${tiredStarters === 1 ? 'is' : 'are'} Tired or worse.` : ''}`,
    tone: 'todo',
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
                setFlash(`Visited ${plural(onTheFence.length, 'prospect')} before signing day.`);
              }
            }
          ]
        : undefined,
      link: { label: 'Feeders', onClick: () => onNavigate('FEEDERS') }
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
        : `Clinics and events find and win over next year's players. They pick their school on signing day (pre season week ${FEEDER_SIGNING_WEEK}).`,
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
      title: `${game.label ? `${game.label}: ` : ''}${game.isHome ? 'vs' : 'at'} ${opp.name} (${opp.record.wins}-${opp.record.losses})`,
      detail: note,
      tone: 'todo',
      // The film study, right here: no extra tap before choosing to play or sim
      content: <ScoutingReport opponent={opp} />,
      actions: [
        { label: '🏈 Play the game', primary: true, onClick: onPlayGame },
        { label: '⏩ Sim game', onClick: onAutoSim }
      ]
    };
  } else if (game?.isPlayed && game.result) {
    headline = { id: 'game', icon: '✅', title: game.result, detail: "The final is in. Advance when you're ready.", tone: 'done' };
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
              detail: `Prestige ${team.prestige}, Rating ${programRating(team)}. Your first feeder signing day is next season.`,
              tone: 'info',
              link: { label: 'Roster', onClick: () => onNavigate('ROSTER') }
            };
      task = signingThisSeason ? visitsCard('Signing day is next week: final visits', 'todo') : collegeCard();
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
      headline = visitsCard('Feeder signing day: last chance to win prospects over', 'urgent', 'signing');
      task = collegeCard();
    } else if (currentWeek <= PRESEASON_WEEKS && currentWeek < PRESEASON_WEEKS) {
      const joined = lastFeederResults && feederClassYear === currentYear + 1 && currentYear > (seasonRecap?.year ?? 0) ? lastFeederResults : null;
      headline = joined?.length
        ? {
            id: 'signing-results',
            icon: '🆕',
            title: `Signing day: ${plural(joined.filter((o) => o.outcome === 'JOINED').length, 'newcomer')} joined`,
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
        : "You didn't make the field. The season ends at the banquet: use the time for college recruiting and coach talents.",
      tone: 'info',
      link: { label: 'Bracket', onClick: () => onNavigate('SCOREBOARD') }
    };
  } else if (phase === 'STATE_PLAYOFFS') {
    headline = {
      id: 'season-over',
      icon: '🏁',
      title: `Season over: ${team.record.wins}-${team.record.losses}${myRow ? `, ${ordinal(myRow.rank)} in ${districtName}` : ''}`,
      detail: 'The playoffs go on without you. The season ends at the banquet: use the time for college recruiting and coach talents.',
      tone: 'info',
      link: { label: 'Scoreboard', onClick: () => onNavigate('SCOREBOARD') }
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
        title: currentWeek === firstOffSeasonWeek ? `Feeder program opens: ${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')} in your pipeline` : `Grow the pipeline: ${plural(scoutingPool.filter(inUserPipeline).length, 'prospect')}`,
        detail: `Off season week ${currentWeek - firstOffSeasonWeek + 1} of 4. Signing day is pre season week ${FEEDER_SIGNING_WEEK}.`,
        tone: 'info',
        link: { label: 'Feeders', onClick: () => onNavigate('FEEDERS') }
      };
    }
    task = feederEventsCard(currentWeek === totalWeeks ? 'Last chance for feeder events' : 'Run feeder events');
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

  // ---------------------------------------------------------------- more this week (folded)
  const more: AgendaItem[] = [];
  const concerns = concernsCard();
  if (concerns) more.push(concerns);
  if (task?.id !== 'college') {
    const college = collegeCard();
    if (college) more.push(college);
  }
  if (task?.id !== 'practice' && (isGamePhase || phase === 'OFF_SEASON')) more.push({ ...practiceCard('Practice', 'practice-more'), tone: 'info' });
  if (COACH_TALENTS.some((t) => !talentBlocker(t.id, coachTalents, coachPoints))) {
    more.push({ id: 'talents', icon: '🎖️', title: 'You can afford a coach talent', detail: 'Spend Coach Points on a permanent upgrade.', tone: 'info', link: { label: 'Talents', onClick: () => onNavigate('TALENTS') } });
  }
  if (isGamePhase) {
    more.push({ id: 'scores', icon: '📋', title: 'Scores around the league', tone: 'info', link: { label: 'Scoreboard', onClick: () => onNavigate('SCOREBOARD') } });
  }

  // At most four cards open; the rest fold into "More this week" (urgent cards always stay open)
  const open = [headline, ...needs, ...extras, ...(task ? [task] : [])];
  const visible = open.slice(0, Math.max(MAX_OPEN_CARDS, 1 + needs.length));
  const folded = [...open.slice(visible.length), ...more];

  const renderCard = (item: AgendaItem, big = false) => (
    <div
      key={item.id}
      id={`agenda-${item.id}`}
      style={{
        scrollMarginTop: 'calc(var(--topbar-h) + 12px)',
        border: `1px solid ${TONES[item.tone].border}`,
        borderLeft: `4px solid ${TONES[item.tone].border}`,
        background: TONES[item.tone].background,
        borderRadius: '6px',
        padding: big ? '12px 14px' : '10px 12px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontWeight: 'bold', fontSize: big ? '16px' : '14px' }}>
          {item.icon} {item.title}
        </div>
        {item.link && (
          <button onClick={item.link.onClick} style={linkBtn}>
            {item.link.label} →
          </button>
        )}
      </div>
      {item.detail && <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{item.detail}</div>}
      {item.content}
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
  );

  return (
    <section aria-labelledby="this-week-title" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 12px' }}>
        <h2 id="this-week-title" className="ui-section-title">
          Week {currentWeek} <span style={{ color: '#4F46E5', fontSize: '0.75em' }}>| {phaseLabel}</span>
        </h2>
        <span style={{ fontSize: '13px', color: '#64748B' }}>
          {formatCP(coachPoints)} <span style={{ color: '#64748B' }}>· +{formatCP(weeklyCpIncome(currentWeek + 1, coachTalents, team.programMeters.schoolBoardTrust))} next week</span>
        </span>
      </div>
      {flash && (
        <div role="status" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', margin: '6px 0' }}>
          {flash}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>{visible.map((item, i) => renderCard(item, i === 0))}</div>
      {folded.length > 0 && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: '#334155', padding: '8px 0', minHeight: '32px' }}>
            More this week ({folded.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{folded.map((item) => renderCard(item))}</div>
        </details>
      )}
      {/* A decision must be made before the week can move on: the button takes the coach to it */}
      <button onClick={onAdvanceWeek} style={activeDilemma ? { ...advanceBtn, background: '#FEF3C7', color: '#92400E', border: '2px solid #F59E0B' } : advanceBtn}>
        {activeDilemma ? '⚠️ Decision needed before you advance ↑' : 'All set: Advance Week ⏭️'}
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

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#1D4ED8',
  fontWeight: 'bold',
  fontSize: '14px',
  cursor: 'pointer',
  padding: '0 4px',
  whiteSpace: 'nowrap',
  // A finger-sized tap area around the text
  minHeight: '40px',
  display: 'inline-flex',
  alignItems: 'center'
};

const actionBtn = (primary: boolean, disabled: boolean): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  borderRadius: '5px',
  border: primary ? '1px solid #2563EB' : '1px solid #CBD5E1',
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
