import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { GameSimulationState, PlayConcept, LeverageType, DefensiveCall, PlayEvent } from '../types/game';
import { simWorkerBridge } from '../services/workerBridge';
import { soundFx } from '../utils/soundEngine';
import { PostGameBoxScoreModal } from './PostGameBoxScoreModal';
import { HalftimeSpeechModal } from './HalftimeSpeechModal';
import { halftimeOffer } from './halftimeOffer';
import { TalkOption, rememberTalks } from '../sim/talkPicker';
import { ReplayField } from '../replayTest/ReplayField';
import { ReplayOverlay } from '../replayTest/replayGameOverlay';
import { ReplayOptionsContext, ReplayOptionsSetContext, ReplayPhase, testRatesFor } from '../replayTest/matchOptions';
import { Chooser, HalftimePanel, MP_CSS, Opt, OptionsBody, PlanBar, Sheet, StatsBody, TimeoutBanner } from '../replayTest/MatchPageParts';
import { ReplayScoreboard } from '../replayTest/ReplayScoreboard';
import { PlayAlert } from './PlayAlert';
import { PlayAlertData, PreSnap, alertsForPlay } from '../sim/playAlerts';
import { readableOnWhite } from '../utils/color';
import { PlayCallingPanel } from './PlayCallingPanel';
import { AroundTheLeague } from './AroundTheLeague';
import { AroundTheState } from './AroundTheState';
import { GamePlanBar, GamePlanSheet } from './GamePlanSheet';
import { GameBallSheet, PressConferenceSheet } from './PostGameSheets';
import { useGameStore } from '../store/gameStore';
import { GameBallCandidate, gameBallCandidates } from '../sim/postGame';
import { PressQuestion, buildPressContext, pickPressQuestion } from '../sim/pressConference';
import { DilemmaChoice } from '../types/game';
import { DefensiveFocus, FOCUS_CALL, FOCUS_NAMES, OFFENSE_NAMES, OFFENSE_STYLES, SECOND_STRING_LEADS, focusFromCall, secondStringLabel } from '../sim/gamePlan';
import { secondStringLead } from '../sim/matchEngine';
import { recordAfter } from '../sim/lineScore';
import { fullRecord } from '../sim/seasonRecord';
import { OffensiveScheme } from '../types/game';
import { FlagCall } from './FlagCall';
import { FLAG_STAGE_MS, FlagStage, flagStages } from '../sim/flagSequence';
import { PenaltyFlag } from './ui/PenaltyFlag';
import { track } from '../services/analytics';
import { gameContext, liveTally, moment, scoreBand, secondString, talkParams } from '../services/analyticsParams';
import { finalWhistleTune, soundsForPlay } from '../utils/playSounds';
import { shortName } from '../utils/shortName';

interface LiveMatchProps {
  initialState: GameSimulationState;
  userTeamId: string;
  onExit: (finalState: GameSimulationState) => void;
}

const LEVERAGE_HEADINGS: Record<Exclude<LeverageType, 'PAT_DECISION'>, string> = {
  FOURTH_DOWN: '4TH DOWN TACTICAL DECISION',
  RED_ZONE_GOAL_TO_GO: 'GOAL-TO-GO: PUNCH IT IN',
  TWO_MINUTE_DRILL: 'TWO-MINUTE DRILL'
};

const downLabel = (down: number) => ['1st', '2nd', '3rd', '4th'][down - 1] ?? `${down}th`;

/** Field position from the offense's view: own half below the 50, opponent's half above it. */
const fieldPosition = (yardLine: number) =>
  yardLine === 50 ? 'midfield' : yardLine < 50 ? `your own ${yardLine}` : `the opponent's ${100 - yardLine}`;

const MAX_FIELD_GOAL_PROMPT_YARDS = 55;

export const LiveMatchScreen: React.FC<LiveMatchProps> = ({ initialState, userTeamId, onExit }) => {
  const [gameState, setGameState] = useState<GameSimulationState>(initialState);
  // PLAYTEST: each snap is acted out by a real play first; the scoreboard, sounds and banners wait for the whistle
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const [replay, setReplay] = useState<{ event: PlayEvent; pre: GameSimulationState } | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  // The replay test: the snap that waits while the kickoff before it plays out, and the last snap seen
  const queuedRef = useRef<{ event: PlayEvent; pre: GameSimulationState } | null>(null);
  const lastEventRef = useRef<PlayEvent | null>(null);
  // The replay test's options (null outside the test: the snap plays out, then the field clears)
  const replayOpts = useContext(ReplayOptionsContext);
  // With the options: down card ('pre'), the play ('live'), the result banner while the players walk back ('post'), done
  const [phase, setPhase] = useState<ReplayPhase>('done');
  const replayOptsRef = useRef(replayOpts);
  replayOptsRef.current = replayOpts;
  const setReplayOpts = useContext(ReplayOptionsSetContext);
  // The match page: a plan choice or a timeout open over the field, a sheet slid up, a timeout banner, halftime's pick
  const [choice, setChoice] = useState<'offense' | 'defense' | 'bench' | 'timeout' | null>(null);
  const [sheet, setSheet] = useState<'stats' | 'scores' | 'opts' | 'pbp' | null>(null);
  const [toBanner, setToBanner] = useState<{ teamId: string; line: string } | null>(null);
  const toTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownTimeoutRef = useRef<string | null>(null);
  const [halftimeTalk, setHalftimeTalk] = useState<{ options: TalkOption[]; lines: string[] } | null>(null);
  const [halftimePick, setHalftimePick] = useState<string | null>(null);
  /** A timeout's banner, in the calling school's colors, for a moment (the next snap waits for it) */
  const showTimeout = useCallback((teamId: string, line: string) => {
    if (toTimerRef.current) clearTimeout(toTimerRef.current);
    setToBanner({ teamId, line });
    soundFx.playWhistle();
    toTimerRef.current = setTimeout(() => setToBanner(null), TIMEOUT_BANNER_MS);
  }, []);
  useEffect(() => () => { if (toTimerRef.current) clearTimeout(toTimerRef.current); }, []);
  // The replay test: a flag on the grass, an injured player's scene (down, up, off)
  const [flagDown, setFlagDown] = useState(false);
  const [injuryStage, setInjuryStage] = useState<string | null>(null);
  // The replay test's injury and flag rates go to the engine (the real game: no injuries during a game, flags as tuned)
  useEffect(() => {
    if (replayOpts?.playtest) simWorkerBridge.setTestRates(testRatesFor(replayOpts));
  }, [replayOpts]);
  const runPending = useCallback(() => {
    const run = pendingRef.current;
    pendingRef.current = null;
    run?.();
  }, []);
  const finishReplay = useCallback(() => {
    // A kickoff done: now the snap that came after it
    const q = queuedRef.current;
    if (replayOpts && q) {
      queuedRef.current = null;
      setReplay(q);
      setPhase('pre');
      setFlagDown(false);
      setInjuryStage(null);
      return;
    }
    if (replayOpts) setPhase('done'); // the last play stays on the field, its players still moving
    else setReplay(null);
    runPending();
  }, [replayOpts, runPending]);
  const [leveragePrompt, setLeveragePrompt] = useState<LeverageType | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  // Sim to End asks twice: the first tap arms it for a few seconds
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    if (!confirmEnd) return;
    const timer = setTimeout(() => setConfirmEnd(false), CONFIRM_END_MS);
    return () => clearTimeout(timer);
  }, [confirmEnd]);
  // A flag: the game holds while it plays out (the play, FLAG, the call, the new spot)
  const [flag, setFlag] = useState<{ event: PlayEvent; stage: FlagStage } | null>(null);
  const flagTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearFlag = () => {
    flagTimersRef.current.forEach(clearTimeout);
    flagTimersRef.current = [];
    setFlag(null);
  };
  useEffect(() => () => flagTimersRef.current.forEach(clearTimeout), []);
  // Auto-sim pauses for a decision (4th down, a try, halftime) and picks back up once it's made
  const autoPlayRef = useRef(false);
  const resumeAutoRef = useRef(false);
  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);
  // A resumed game that had ended (the browser closed on the box score) opens on the box score
  const [showBoxScore, setShowBoxScore] = useState(initialState.isGameOver);
  const [planOpen, setPlanOpen] = useState(false);
  // After the box score: the Player of the Game, then the press conference, then back to the Hub
  const [postStep, setPostStep] = useState<'GAME_BALL' | 'PRESS' | null>(null);
  const [pressQuestion, setPressQuestion] = useState<PressQuestion | null>(null);
  const changedPlanAtHalftimeRef = useRef(false);
  const [showHalftimeModal, setShowHalftimeModal] = useState(false);
  // A ref (not state) so flipping it doesn't re-run the setup effect and restart the game
  // (a resumed game past halftime, or whose talk was given, has had its halftime)
  const halftimeHandledRef = useRef(
    !!initialState.halftimeTalks?.[userTeamId] || initialState.currentQuarter === 4 || initialState.currentQuarter === 'OT'
  );
  const logContainerRef = useRef<HTMLDivElement>(null);
  // Play-by-play starts collapsed (the strip under the field shows the latest play); the choice is remembered
  const [logOpen, setLogOpen] = useState(() => {
    try {
      return localStorage.getItem(LOG_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleLog = () =>
    setLogOpen((open) => {
      try {
        localStorage.setItem(LOG_OPEN_KEY, open ? '0' : '1');
      } catch {
        // storage unavailable (private mode): the toggle still works for this session
      }
      return !open;
    });
  // Flashing banner for big moments; muted while fast-forwarding to the final
  // Banners queue up when one play has two moments (a field goal, then a fumbled kickoff); a new play replaces the queue
  const [alertQueue, setAlertQueue] = useState<PlayAlertData[]>([]);
  const playAlert = alertQueue[0] ?? null;
  const simmingToEndRef = useRef(false);
  // The game just before the current snap, so alerts can credit the right team
  const preSnapRef = useRef<PreSnap>({
    possessionTeamId: initialState.possessionTeamId,
    homeScore: initialState.homeScore,
    awayScore: initialState.awayScore,
    down: initialState.down,
    distance: initialState.distance
  });
  const clearPlayAlert = useCallback(() => setAlertQueue((q) => q.slice(1)), []);
  // The clock just before the current snap: the quarter buzzer and the two-minute clock sound as a play crosses them
  const clockBeforeRef = useRef({ quarter: initialState.currentQuarter, seconds: initialState.clockSecondsRemaining });

  // iPhones only start sound inside a tap, and the first sound comes when a play lands: the first touch turns it on
  useEffect(() => {
    const unlock = () => soundFx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    simWorkerBridge.initialize();
    simWorkerBridge.initGame(initialState, userTeamId);
    // (the replay test's rates again, now that the worker is there to hear them)
    if (replayOptsRef.current?.playtest) simWorkerBridge.setTestRates(testRatesFor(replayOptsRef.current));

    // A flag plays out stage by stage, then the game carries on
    const runFlag = (event: PlayEvent) => {
      flagTimersRef.current.forEach(clearTimeout);
      let at = 0;
      flagTimersRef.current = flagStages(event).map((stage) => {
        const timer = setTimeout(() => setFlag({ event, stage }), at);
        at += FLAG_STAGE_MS[stage];
        return timer;
      });
      flagTimersRef.current.push(setTimeout(() => setFlag(null), at));
    };

    // Shared by both play callbacks: update the screen, queue banners (or play out a flag), and open the halftime locker room
    const afterSnap = (state: GameSimulationState, event?: PlayEvent, decision = false) => {
      const animate = !!event && (!event.penalty || !!replayOptsRef.current) && !simmingToEndRef.current;
      if (animate) {
        pendingRef.current?.(); // a snap still playing out gives way to the new one
        // The replay test: a kickoff came first (the opening kickoff, after a score, to start the second half)
        const ko = replayOptsRef.current ? kickoffBefore(event!, lastEventRef.current, gameStateRef.current) : null;
        queuedRef.current = ko ? { event: event!, pre: gameStateRef.current } : null;
        setReplay({ event: ko ?? event!, pre: gameStateRef.current });
        setPhase('pre');
        setFlagDown(false);
        setInjuryStage(null);
      } else if (event) {
        setReplay(null); // a flag or a sim to the end: the field shows the spot
        setPhase('done');
      }
      if (event) lastEventRef.current = event;
      setGameState({ ...state });
      // The play's sounds, from the coach's side (utils/playSounds.ts)
      const moments = event ? alertsForPlay(event, preSnapRef.current, state) : [];
      const sounds = soundsForPlay(event, moments, userTeamId, clockBeforeRef.current, state, decision);
      const afterWhistle = () => soundFx.playAll(sounds);
      clockBeforeRef.current = { quarter: state.currentQuarter, seconds: state.clockSecondsRemaining };
      useGameStore.getState().markGameLive(state); // a game counts once it kicks off: where it stands is written down
      if (event?.penalty && !simmingToEndRef.current && !replayOptsRef.current) {
        setAlertQueue([]);
        runFlag(event);
      }
      // (the replay test's result banner on the field already says it: no second banner under it)
      const alerts = event && !event.penalty && !simmingToEndRef.current && !replayOptsRef.current ? moments : [];
      const whistle = () => {
        afterWhistle();
        if (alerts.length > 0) setAlertQueue(alerts);
      };
      if (animate) pendingRef.current = whistle;
      else whistle();
      preSnapRef.current = {
        possessionTeamId: state.possessionTeamId,
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        down: state.down,
        distance: state.distance
      };
      if (state.currentQuarter === 3 && !halftimeHandledRef.current) {
        halftimeHandledRef.current = true;
        if (autoPlayRef.current) resumeAutoRef.current = true;
        setAutoPlay(false);
        setShowHalftimeModal(true);
      }
    };

    simWorkerBridge.subscribe({
      onPlayResolved: ({ state, event }) => {
        // A decision prompt only applies to the snap it was asked about (e.g. Next Snap was pressed instead)
        setLeveragePrompt(null);
        afterSnap(state, event);
        simmingToEndRef.current = false; // a sim to halftime has landed: banners are back on
      },
      // The play that sets up a decision (your touchdown's try, a red-zone or 4th-down call) arrives here instead
      onLeveragePrompt: ({ state, event, leverageType }) => {
        afterSnap(state, event, true);
        setLeveragePrompt(leverageType || 'FOURTH_DOWN');
        if (autoPlayRef.current) resumeAutoRef.current = true;
        setAutoPlay(false);
      },
      // PLAYTEST: the coach's timeout: the clock goes back to the last whistle
      onTimeout: ({ state, timeout }) => {
        setGameState({ ...state });
        if (timeout) {
          const team = timeout.teamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
          showTimeout(timeout.teamId, timeoutLine(shortName(team), timeout.left, state.currentQuarter));
        }
      },
      onGameOver: ({ state }) => {
        setGameState({ ...state });
        useGameStore.getState().markGameLive(state, true);
        setAutoPlay(false);
        // The final whistle, then the band: a victory tune or a loss tune (a tie gets the whistle alone)
        soundFx.playWhistle();
        const tune = finalWhistleTune(state, userTeamId);
        if (tune === 'VICTORY') soundFx.playVictory(0.5);
        else if (tune === 'DEFEAT') soundFx.playDefeat(0.5);
        setShowBoxScore(true);
      }
    });
  }, [initialState, userTeamId, showTimeout]);

  // PLAYTEST: a staff's timeout shows once its play is over (the kicker iced: before the kick)
  useEffect(() => {
    const ev = replay?.event;
    if (!replayOpts || !ev) return;
    if (phase === 'pre' && ev.iceTimeout && shownTimeoutRef.current !== `ice-${ev.playId}`) {
      shownTimeoutRef.current = `ice-${ev.playId}`;
      const team = ev.iceTimeout.teamId === gameState.homeTeam.id ? gameState.homeTeam : gameState.awayTeam;
      showTimeout(ev.iceTimeout.teamId, `${shortName(team)} ices the kicker · ${ev.iceTimeout.left} left`);
    }
    if (phase === 'done' && ev.timeout?.by === 'staff' && shownTimeoutRef.current !== ev.playId) {
      shownTimeoutRef.current = ev.playId;
      const team = ev.timeout.teamId === gameState.homeTeam.id ? gameState.homeTeam : gameState.awayTeam;
      showTimeout(ev.timeout.teamId, timeoutLine(shortName(team), ev.timeout.left, gameState.currentQuarter));
    }
  }, [phase, replay, replayOpts, gameState.homeTeam, gameState.awayTeam, gameState.currentQuarter, showTimeout]);

  // PLAYTEST: halftime's speeches are picked once, when the second half is next
  useEffect(() => {
    if (replayOpts && showHalftimeModal && !halftimeTalk) setHalftimeTalk(halftimeOffer(gameStateRef.current, userTeamId));
  }, [replayOpts, showHalftimeModal, halftimeTalk, userTeamId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [gameState.eventLog.length, logOpen]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const busy = replayOpts ? phase !== 'done' || !!toBanner || !!choice : !!replay;
    if (autoPlay && !busy && !leveragePrompt && !showHalftimeModal && !flag && !gameState.isGameOver) {
      // With the replay test the result has already been read under the banner: the next snap lines up right away
      interval = setInterval(() => {
        simWorkerBridge.stepPlay(undefined, undefined, true); // (the staff runs the game: it may call a timeout too)
      }, replayOpts && replay ? 250 : 1100);
    }
    return () => clearInterval(interval);
  }, [autoPlay, replay, phase, replayOpts, leveragePrompt, showHalftimeModal, flag, gameState.isGameOver, toBanner, choice]);

  const handleDefensiveCall = (call: DefensiveCall) => {
    liveTally.defCalls++;
    simWorkerBridge.stepPlay(undefined, call);
  };

  /** After a decision that paused auto-sim, auto-sim carries on. */
  const resumeAutoSim = () => {
    if (!resumeAutoRef.current) return;
    resumeAutoRef.current = false;
    setAutoPlay(true);
  };

  const handleDecision = (concept: PlayConcept) => {
    setLeveragePrompt(null);
    simWorkerBridge.stepPlay(concept, undefined, resumeAutoRef.current); // (back to Begin after it: the staff's game)
    resumeAutoSim();
  };
  // The coach's side of the score, for game events
  const scoreDiff = () => (gameState.homeTeam.id === userTeamId ? 1 : -1) * (gameState.homeScore - gameState.awayScore);
  // A big moment's call (the point after, 4th down, goal to go, the two-minute drill): tracked, then played
  const handleLeverageCall = (concept: PlayConcept) => {
    if (leveragePrompt) {
      const toGo = gameState.yardLine + gameState.distance >= 100 ? 'goal' : gameState.distance <= 2 ? '1-2' : gameState.distance <= 5 ? '3-5' : '6+';
      track('leverage_call', {
        situation: leveragePrompt === 'PAT_DECISION' ? 'pat' : leveragePrompt.toLowerCase(),
        call: concept.toLowerCase(),
        quarter: String(gameState.currentQuarter),
        score_diff: scoreBand(scoreDiff()),
        ...(leveragePrompt !== 'PAT_DECISION' && { down: gameState.down, to_go: toGo, field_zone: gameState.yardLine < 50 ? 'own_half' : gameState.yardLine < 80 ? 'opponent_half' : 'red_zone' })
      });
    }
    handleDecision(concept);
  };

  // Sim ahead (the staff calls every play): the rest of the quarter, the half, or the game
  const firstHalf = gameState.currentQuarter === 1 || gameState.currentQuarter === 2;
  const started = gameState.eventLog.length > 0;
  const simAhead = (to: 'QUARTER' | 'HALF' | 'END') => {
    setAutoPlay(false);
    setLeveragePrompt(null);
    setConfirmEnd(false);
    resumeAutoRef.current = false;
    simmingToEndRef.current = true;
    liveTally.simmed(to === 'QUARTER' ? 'quarter' : to === 'HALF' ? 'half' : 'end');
    setAlertQueue([]);
    clearFlag();
    if (to === 'QUARTER') simWorkerBridge.simQuarter();
    else if (to === 'HALF') simWorkerBridge.simToHalftime();
    else simWorkerBridge.simToEnd();
  };
  // During a flag the field and scoreboard show the snap's spot until the penalty is walked off
  const beforeSpot = flag && flag.stage !== 'SPOT' && flag.event.snapDown !== undefined;
  // While a snap plays out, the scoreboard shows the game as it stood at the snap
  const board = replay && (!replayOpts || phase === 'pre' || phase === 'live') ? replay.pre : gameState;
  const shownDown = beforeSpot ? flag.event.snapDown! : board.down;
  const shownDistance = beforeSpot ? flag.event.snapDistance! : board.distance;
  const shownYardLine = beforeSpot ? flag.event.snapYardLine! : board.yardLine;

  // The game plan the coach's team is running (from the strategy room, or changed mid-game)
  const userTeam = gameState.homeTeam.id === userTeamId ? gameState.homeTeam : gameState.awayTeam;
  const opponent = gameState.homeTeam.id === userTeamId ? gameState.awayTeam : gameState.homeTeam;
  const planOffense = gameState.offensiveGamePlan?.[userTeamId] ?? userTeam.schemeOffense;
  const planFocus = focusFromCall(gameState.defensiveGamePlan?.[userTeamId]);
  const planBench = secondStringLead(gameState, userTeamId);
  const openPlan = () => {
    // Auto-sim waits while the coach changes the plan, then carries on
    if (autoPlay) resumeAutoRef.current = true;
    setAutoPlay(false);
    setPlanOpen(true);
  };
  const closePlan = () => {
    setPlanOpen(false);
    // At halftime the speech restarts the game (and auto-sim with it)
    if (!showHalftimeModal) resumeAutoSim();
  };
  const applyPlan = (offense: OffensiveScheme, focus: DefensiveFocus, bench: number | null) => {
    if (showHalftimeModal) changedPlanAtHalftimeRef.current = true; // the press may ask about it
    track('game_plan_change', {
      offense,
      focus,
      second_string: secondString(bench),
      when: showHalftimeModal ? 'halftime' : 'in_game',
      quarter: String(gameState.currentQuarter),
      score_diff: scoreBand(scoreDiff())
    });
    const call = FOCUS_CALL[focus];
    simWorkerBridge.setGamePlan(userTeamId, offense, call, bench);
    useGameStore.getState().setSecondStringLead(bench); // the bench line carries over to the next game
    setGameState((s) => {
      const defense = { ...s.defensiveGamePlan };
      if (call) defense[userTeamId] = call;
      else delete defense[userTeamId];
      return {
        ...s,
        offensiveGamePlan: { ...s.offensiveGamePlan, [userTeamId]: offense },
        defensiveGamePlan: defense,
        secondStringLead: { ...s.secondStringLead, [userTeamId]: bench }
      };
    });
    closePlan();
  };
  // The speech shapes the second half: the worker plays it, the screen's copy records it, and the next game's offer
  // steers clear of this one's
  const applySpeech = (given: TalkOption, offered: TalkOption[]) => {
    const talk = given.talk.id;
    const store = useGameStore.getState();
    store.setRecentTalks(rememberTalks(store.recentTalks, 'HALF', offered, given));
    simWorkerBridge.setHalftimeTalk(userTeamId, talk);
    track('halftime_talk', { ...talkParams(given, offered), score_diff: scoreDiff(), ...gameContext(store), ...moment(store) });
    setGameState((s) => ({ ...s, halftimeTalks: { ...s.halftimeTalks, [userTeamId]: talk } }));
    useGameStore.getState().markGameLive({ ...gameState, halftimeTalks: { ...gameState.halftimeTalks, [userTeamId]: talk } }, true);
    setShowHalftimeModal(false);
    setHalftimeTalk(null);
    setHalftimePick(null);
    soundFx.playWhistle();
    resumeAutoSim();
  };
  const clockLabel =
    gameState.currentQuarter === 'OT'
      ? 'Overtime'
      : `Q${gameState.currentQuarter} ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')}`;

  // The post-game steps (the game ball and the press work on the store's copy of the coach's team)
  const candidates: GameBallCandidate[] = gameState.isGameOver ? gameBallCandidates(gameState, userTeam) : [];
  const finalHeadline = `Final · ${gameState.awayTeam.name} ${gameState.awayScore}, ${gameState.homeTeam.name} ${gameState.homeScore}${gameState.overtime ? ' (OT)' : ''}`;
  const finishPostGame = () => {
    setPostStep(null);
    onExit(gameState);
  };
  const askPress = (gameBall?: GameBallCandidate) => {
    const s = useGameStore.getState();
    const team = s.districtTeams.find((t) => t.id === userTeamId);
    if (!team) return finishPostGame();
    const context = buildPressContext({
      game: gameState,
      team,
      userTeamId,
      schedule: [...s.seasonSchedule, ...s.interstateGames],
      week: s.currentWeek,
      bracket: s.playoffBracket,
      gameBall: gameBall && team.roster.find((p) => p.id === gameBall.player.id),
      gameBallLine: gameBall?.line,
      changedPlanAtHalftime: changedPlanAtHalftimeRef.current
    });
    const question = pickPressQuestion(context, s.pressLog, s.currentYear);
    if (!question) return finishPostGame();
    setPressQuestion(question);
    setPostStep('PRESS');
  };
  const awardBall = (c: GameBallCandidate) => {
    const ours = gameState.homeTeam.id === userTeamId ? gameState.homeScore : gameState.awayScore;
    const theirs = gameState.homeTeam.id === userTeamId ? gameState.awayScore : gameState.homeScore;
    useGameStore.getState().awardGameBall(c.player.id, { opponentName: opponent.name, won: ours > theirs, score: `${ours}-${theirs}`, line: c.line });
    askPress(c);
  };
  const answerPress = (choice: DilemmaChoice) => {
    if (pressQuestion) useGameStore.getState().answerPress(pressQuestion, choice);
    finishPostGame();
  };

  // Each team's season (playoffs included): coming into the game, then with this game once it's over
  const seasonSchedule = useGameStore((s) => s.seasonSchedule);
  const interstateGames = useGameStore((s) => s.interstateGames);
  const playoffBracket = useGameStore((s) => s.playoffBracket);
  const seasonOf = (side: 'home' | 'away') => {
    const team = side === 'home' ? gameState.homeTeam : gameState.awayTeam;
    const r = gameState.isGameOver ? recordAfter(team, side, gameState, [...seasonSchedule, ...interstateGames], playoffBracket) : fullRecord(team, playoffBracket);
    return `${r.wins}-${r.losses}`;
  };


  // ---------- PLAYTEST: the match page (Game Screen Replay): nothing scrolls ----------
  function matchPage() {
    const opts = replayOpts!;
    const markOf = opts.look.marks === 'team' ? (t: { id: string }) => (t.id === gameState.awayTeam.id ? 'O' : 'X') as 'O' | 'X' : undefined;
    const halftimeUp = showHalftimeModal && (phase === 'done' || !replay);
    const last = gameState.eventLog[gameState.eventLog.length - 1];
    const myTimeouts = gameState.timeoutsLeft?.[userTeamId] ?? 3;
    const canTimeout = !!last && !last.timeout && myTimeouts > 0 && !gameState.isGameOver && !halftimeUp;
    const halfWord = gameState.currentQuarter === 'OT' ? 'this overtime' : 'this half';
    const openChoice = (k: NonNullable<typeof choice>) => {
      if (choice === k) return closeChoice();
      if (autoPlay) resumeAutoRef.current = true;
      setAutoPlay(false);
      setChoice(k);
    };
    const closeChoice = () => {
      setChoice(null);
      if (!showHalftimeModal) resumeAutoSim();
    };
    const pick = (offense = planOffense, focus = planFocus, bench = planBench) => {
      setChoice(null);
      applyPlan(offense, focus, bench);
    };
    const callTimeout = () => {
      simWorkerBridge.callTimeout(userTeamId);
      track('timeout', { quarter: String(gameState.currentQuarter), clock: gameState.clockSecondsRemaining, score_diff: scoreBand(scoreDiff()), left: myTimeouts - 1 });
      setChoice(null);
      if (!leveragePrompt) resumeAutoSim();
    };
    const toTeam = toBanner && (toBanner.teamId === gameState.homeTeam.id ? gameState.homeTeam : gameState.awayTeam);

    // A decision that's due opens over the field, in the plan choices' format
    const decision = leveragePrompt && !gameState.isGameOver && phase === 'done' && !halftimeUp ? (
      leveragePrompt === 'PAT_DECISION' ? (
        <Chooser due title="⚡ Touchdown! The point after" sub="Kick the extra point, or go for two from the 3?">
          <Opt name="👟 Kick it" note="Extra point" onClick={() => handleLeverageCall('PAT_KICK')} />
          <Opt name="✌️ Go for two" note="From the 3" onClick={() => handleLeverageCall('TWO_POINT_TRY')} />
        </Chooser>
      ) : (
        <Chooser
          due
          title={`⚡ ${DUE_TITLES[leveragePrompt]}`}
          sub={`${downLabel(gameState.down)} & ${gameState.yardLine + gameState.distance >= 100 ? 'Goal' : gameState.distance} at ${fieldPosition(gameState.yardLine)}${leveragePrompt === 'TWO_MINUTE_DRILL' ? ` with ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')} left` : ''}`}
        >
          <Opt name="🏈 Power run" note="Inside run" onClick={() => handleLeverageCall('INSIDE_RUN')} />
          <Opt name="🎯 Quick pass" note="Short pass" onClick={() => handleLeverageCall('SHORT_PASS')} />
          {leveragePrompt !== 'RED_ZONE_GOAL_TO_GO' && <Opt name="🚀 Deep shot" note="Down the field" onClick={() => handleLeverageCall('DEEP_PASS')} />}
          {gameState.down === 4 && 100 - gameState.yardLine + 17 <= MAX_FIELD_GOAL_PROMPT_YARDS && (
            <Opt name="🎯 Field goal" note={`${100 - gameState.yardLine + 17} yards`} onClick={() => handleLeverageCall('FIELD_GOAL')} />
          )}
          {gameState.down === 4 && gameState.yardLine < 80 && <Opt name="👟 Punt" note="Flip the field" onClick={() => handleLeverageCall('PUNT')} />}
          {canTimeout && <Opt name="⏱ Timeout" note={`${myTimeouts} left, then decide`} onClick={callTimeout} />}
        </Chooser>
      )
    ) : null;

    // A plan choice or the timeout, over the bottom of the field
    const chooser =
      choice === 'offense' ? (
        <Chooser title="Offense" onClose={closeChoice}>
          {(['TRIPLE_OPTION', 'POWER_I', 'SPREAD', 'AIR_RAID'] as const).map((k) => (
            <Opt key={k} name={OFFENSE_NAMES[k]} note={OFFENSE_STYLES[k]} picked={planOffense === k} onClick={() => pick(k)} />
          ))}
        </Chooser>
      ) : choice === 'defense' ? (
        <Chooser title="Defense" onClose={closeChoice}>
          {(['BALANCED', 'STOP_RUN', 'STOP_PASS', 'BLITZ'] as const).map((k) => (
            <Opt key={k} name={FOCUS_NAMES[k]} note={FOCUS_SHORT[k]} picked={planFocus === k} onClick={() => pick(undefined, k)} />
          ))}
        </Chooser>
      ) : choice === 'bench' ? (
        <Chooser title="2nd string" onClose={closeChoice}>
          {SECOND_STRING_LEADS.map((lead) => (
            <Opt key={String(lead)} name={secondStringLabel(lead)} note={lead === null ? 'Starters all game' : `Backups at a ${lead}-point lead`} picked={planBench === lead} onClick={() => pick(undefined, undefined, lead)} />
          ))}
        </Chooser>
      ) : choice === 'timeout' ? (
        <Chooser title="Timeout" onClose={closeChoice}
          sub={!started ? 'The game has not started yet.' : myTimeouts === 0 ? `No timeouts left ${halfWord}.` : last?.timeout ? 'A timeout was just called. Wait for the next snap.' : `Stop the clock at the last whistle. ${myTimeouts} left ${halfWord}.`}>
          <Opt name="Not now" note="Keep playing" onClick={closeChoice} />
          <Opt name="Call timeout" note={`${Math.max(0, myTimeouts - 1)} left after`} picked={canTimeout} disabled={!canTimeout} onClick={callTimeout} />
        </Chooser>
      ) : null;

    // The last two plays, one line each (tap for the whole list)
    const recent = gameState.eventLog.slice(-2).reverse();
    return (
      <div className="mp-page">
        <style>{MP_CSS}</style>
        {showBoxScore && (
          <PostGameBoxScoreModal gameState={gameState} closeLabel="Continue" aroundTheState onClose={() => { setShowBoxScore(false); setPostStep('GAME_BALL'); }} />
        )}
        {postStep === 'GAME_BALL' &&
          (candidates.length > 0 ? (
            <GameBallSheet candidates={candidates} headline={finalHeadline} year={useGameStore.getState().currentYear} onAward={awardBall} />
          ) : (
            <SkipStep onReady={() => askPress()} />
          ))}
        {postStep === 'PRESS' && pressQuestion && (
          <PressConferenceSheet question={pressQuestion} team={useGameStore.getState().districtTeams.find((t) => t.id === userTeamId) ?? userTeam} onAnswer={answerPress} />
        )}

        <ReplayScoreboard variant={opts.scoreboard} markOf={markOf} board={board} down={shownDown} distance={shownDistance} yardLine={shownYardLine} blankDown={halftimeUp} />

        <div className="mp-field">
          <ReplayField
            event={replay?.event ?? null}
            board={replay ? replay.pre : board}
            onDone={finishReplay}
            caption={null}
            bare
            fill
            look={opts.look}
            kickoffPreview={gameState.eventLog.length === 0}
            walkBack
            holdMs={opts.cardMs}
            afterWhistleMs={opts.bannerMs}
            showMode={opts.show}
            onStart={() => setPhase('live')}
            onWhistle={() => {
              setPhase('post');
              if (!queuedRef.current) runPending(); // (a kickoff's whistle isn't the snap's)
            }}
            officials
            onFlag={() => setFlagDown(true)}
            onInjury={(stage: string) => setInjuryStage(stage)}
            overlay={<ReplayOverlay event={replay?.event ?? null} phase={phase} home={gameState.homeTeam} away={gameState.awayTeam} flagDown={flagDown} injuryStage={injuryStage} />}
          />
          {halftimeUp && halftimeTalk && (
            <HalftimePanel
              score={(() => {
                const ours = gameState.homeTeam.id === userTeamId ? gameState.homeScore : gameState.awayScore;
                const theirs = gameState.homeTeam.id === userTeamId ? gameState.awayScore : gameState.homeScore;
                return `${ours}-${theirs} · ${ours > theirs ? `Leading by ${ours - theirs}` : ours < theirs ? `Trailing by ${theirs - ours}` : 'Tied'}`;
              })()}
              lines={halftimeTalk.lines}
              options={halftimeTalk.options}
              picked={halftimePick}
              onPick={setHalftimePick}
            />
          )}
          {decision ?? chooser}
          {toBanner && toTeam && <TimeoutBanner team={toTeam} mark={markOf?.(toTeam)} line={toBanner.line} />}
        </div>

        {!gameState.isGameOver && (
          <PlanBar
            open={choice}
            onToggle={(k) => openChoice(k as NonNullable<typeof choice>)}
            items={[
              { key: 'offense', label: 'Offense', value: OFFENSE_NAMES[planOffense] },
              { key: 'defense', label: 'Defense', value: FOCUS_NAMES[planFocus] },
              { key: 'bench', label: '2nd String', value: secondStringLabel(planBench) },
              { key: 'timeout', label: 'Timeout', value: `${myTimeouts} left`, disabled: halftimeUp }
            ]}
          />
        )}

        {halftimeUp ? (
          <div className="mp-ctl">
            <button
              type="button"
              className="mp-ret"
              disabled={!halftimePick}
              onClick={() => {
                const given = halftimeTalk?.options.find((o) => o.talk.id === halftimePick);
                if (given && halftimeTalk) applySpeech(given, halftimeTalk.options);
              }}
            >
              🏈 Return to the Field
            </button>
          </div>
        ) : (
          <div style={{ flex: 'none' }}>{simButtons}</div>
        )}

        {/* (at halftime the panel needs the room: the strip comes back with the second half) */}
        {opts.pbp && recent.length > 0 && !halftimeUp && (
          <button type="button" className="mp-pbp" onClick={() => setSheet('pbp')} aria-label="The whole play-by-play">
            {recent.map((ev, i) => (
              <span key={ev.playId} style={i ? { color: '#94A3B8' } : undefined}>
                {i === 0 ? '📜 ' : ''}
                {snapLabel(ev) && <b style={{ color: i ? '#94A3B8' : '#1D4ED8' }}>{snapLabel(ev)} </b>}
                {ev.textCommentary}
              </span>
            ))}
          </button>
        )}

        <div className="mp-bottom">
          <button type="button" className="mp-qb" onClick={() => setSheet('stats')}>📊 Stats</button>
          <button type="button" className="mp-qb" onClick={() => setSheet('scores')}>🏟️ Other scores</button>
          <button type="button" className="mp-qb mp-opts" onClick={() => setSheet('opts')}>⚙️ Options</button>
        </div>

        <Sheet open={sheet === 'stats'} title="📊 Game stats" onClose={() => setSheet(null)}>
          <StatsBody state={gameState} markOf={markOf} when={gameState.isGameOver ? 'FINAL' : halftimeUp ? 'HALFTIME' : clockLabel.toUpperCase()} />
        </Sheet>
        <Sheet open={sheet === 'scores'} title="🏟️ Other scores" onClose={() => setSheet(null)}>
          <AroundTheLeague bare quarter={gameState.currentQuarter} clock={gameState.clockSecondsRemaining} isOver={gameState.isGameOver} />
        </Sheet>
        <Sheet open={sheet === 'opts'} title="⚙️ Options" onClose={() => setSheet(null)}>
          {setReplayOpts && <OptionsBody opts={opts} set={setReplayOpts} />}
        </Sheet>
        <Sheet open={sheet === 'pbp'} title="📜 Play-by-play" onClose={() => setSheet(null)}>
          {gameState.eventLog.slice().reverse().map((ev, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #EEF2F6', fontSize: 13.5, lineHeight: 1.4, ...(ev.penalty ? { background: '#FEF9C3' } : {}) }}>
              {ev.timeout && (
                <div style={{ fontWeight: 800, color: '#0F172A', marginBottom: 3 }}>
                  ⏱ Timeout, {ev.timeout.teamId === gameState.homeTeam.id ? gameState.homeTeam.name : gameState.awayTeam.name} ({ev.timeout.left} left)
                </div>
              )}
              {ev.penalty && <PenaltyFlag size={14} />}{' '}
              <span style={{ fontWeight: 800, color: '#64748B' }}>
                {ev.quarter === 'OT' ? 'OT' : `Q${ev.quarter} ${Math.floor(ev.clockTimeRemainingSeconds / 60)}:${(ev.clockTimeRemainingSeconds % 60).toString().padStart(2, '0')}`}
              </span>{' '}
              {snapLabel(ev) && <strong style={{ color: '#1D4ED8' }}>{snapLabel(ev)}</strong>} {ev.textCommentary}
              {ev.substitution && <div style={{ fontWeight: 700, marginTop: 3 }}>{substitutionLine(ev.substitution, ev.substitution.teamId === userTeamId ? null : opponent.name)}</div>}
            </div>
          ))}
        </Sheet>
      </div>
    );
  }

  // Begin / Pause, Sim Quarter, Sim Half (or Sim to End), or the box score at the final whistle
  const simButtons = (
    <div style={{ display: 'flex', gap: '8px' }}>
      {!gameState.isGameOver ? (
        <>
          {flag ? (
            <button disabled style={{ ...controlBtnStyle, background: '#FDE68A', color: '#713F12', border: '1px solid #EAB308', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <PenaltyFlag size={20} /> Flag…
            </button>
          ) : (
            <button
              onClick={() => {
                resumeAutoRef.current = false;
                setAutoPlay(!autoPlay);
              }}
              style={{ ...controlBtnStyle, ...(autoPlay ? { background: '#F59E0B', color: '#0F172A' } : { background: '#16A34A' }) }}
            >
              {autoPlay ? '⏸ Pause' : started ? '▶ Resume' : '▶ Begin'}
            </button>
          )}
          <button onClick={() => simAhead('QUARTER')} disabled={!!flag} style={{ ...controlBtnStyle, ...(flag ? dimmed : {}) }}>
            {gameState.currentQuarter === 'OT' ? '⏩ Sim OT' : '⏩ Sim Quarter'}
          </button>
          {firstHalf ? (
            <button onClick={() => simAhead('HALF')} disabled={!!flag} style={{ ...controlBtnStyle, ...(flag ? dimmed : {}) }}>
              ⏭ Sim Half
            </button>
          ) : confirmEnd ? (
            <button onClick={() => simAhead('END')} style={{ ...controlBtnStyle, background: '#DC2626' }}>
              Tap again to sim
            </button>
          ) : (
            <button onClick={() => setConfirmEnd(true)} disabled={!!flag} style={{ ...controlBtnStyle, ...(flag ? dimmed : {}) }}>
              🏁 Sim to End
            </button>
          )}
        </>
      ) : (
        <button onClick={() => setShowBoxScore(true)} style={{ ...controlBtnStyle, background: '#047857', color: '#fff' }}>
          📊 Final Box Score
        </button>
      )}
    </div>
  );

  if (replayOpts) return matchPage();

  return (
    <div style={{ padding: replayOpts ? '16px 8px' : '16px', maxWidth: '840px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showBoxScore && (
        <PostGameBoxScoreModal gameState={gameState} closeLabel="Continue" aroundTheState onClose={() => { setShowBoxScore(false); setPostStep('GAME_BALL'); }} />
      )}

      {showHalftimeModal && (
        <HalftimeSpeechModal
          gameState={gameState}
          userTeamId={userTeamId}
          plan={{ offense: planOffense, focus: planFocus, bench: planBench }}
          onUpdatePlan={() => setPlanOpen(true)}
          onApplySpeech={applySpeech}
        />
      )}

      {postStep === 'GAME_BALL' &&
        (candidates.length > 0 ? (
          <GameBallSheet candidates={candidates} headline={finalHeadline} year={useGameStore.getState().currentYear} onAward={awardBall} />
        ) : (
          <SkipStep onReady={() => askPress()} />
        ))}
      {postStep === 'PRESS' && pressQuestion && (
        <PressConferenceSheet question={pressQuestion} team={useGameStore.getState().districtTeams.find((t) => t.id === userTeamId) ?? userTeam} onAnswer={answerPress} />
      )}

      {planOpen && (
        <GamePlanSheet
          offense={planOffense}
          focus={planFocus}
          bench={planBench}
          opponent={opponent}
          usualOffense={userTeam.schemeOffense}
          weather={gameState.weather}
          when={showHalftimeModal ? 'Halftime' : clockLabel}
          onDone={applyPlan}
          onCancel={closePlan}
        />
      )}

      {/* Scoreboard: away on the left, home on the right; light background so every school color reads; the ball marks who has possession */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '8px' }}>
          {[board.awayTeam, null, board.homeTeam].map((team, i) =>
            team ? (
              <div key={team.id} style={{ minWidth: 0, textAlign: i === 0 ? 'left' : 'right' }}>
                {/* The ball icon sits outside the truncated name so long school names never hide it */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: i === 0 ? 'flex-start' : 'flex-end', minWidth: 0 }}>
                  {i === 2 && board.possessionTeamId === team.id && <span style={{ flex: '0 0 auto' }} aria-label="has the ball">🏈</span>}
                  <span style={teamNameStyle(readableOnWhite(team.primaryColor, team.secondaryColor))}>{team.name}</span>
                  {i === 0 && board.possessionTeamId === team.id && <span style={{ flex: '0 0 auto' }} aria-label="has the ball">🏈</span>}
                </div>
                {/* Record coming into the game (with this game at the final whistle) */}
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 'bold' }}>({seasonOf(i === 0 ? 'away' : 'home')})</div>
                <div style={{ fontSize: '30px', fontWeight: 'bold', lineHeight: 1.1, color: '#0F172A' }}>{i === 0 ? board.awayScore : board.homeScore}</div>
              </div>
            ) : (
              <div key="clock" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#B45309' }}>
                  {board.currentQuarter === 'OT'
                    ? `OT ${board.overtime?.period ?? 1}`
                    : `Q${board.currentQuarter} ${Math.floor(board.clockSecondsRemaining / 60)}:${(board.clockSecondsRemaining % 60).toString().padStart(2, '0')}`}
                </div>
                <div className={flag?.stage === 'SPOT' ? 'down-flash' : undefined} style={{ fontSize: '13px', color: '#334155', fontWeight: 'bold', padding: '0 4px' }}>
                  {shownDown}
                  {ORDINAL[shownDown] ?? 'th'} &amp; {shownDistance}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>{shownYardLine > 50 ? `Opp ${100 - shownYardLine}` : `Own ${shownYardLine}`}</div>
              </div>
            )
          )}
        </div>
      </div>

      {/* PLAYTEST: the coach's diagram, each snap acted out by a matched real play */}
      {/* The replay test: the field as wide as the scoreboard and the boxes under it, all on one edge */}
      <div style={replayOpts ? { borderRadius: 10, overflow: 'hidden', marginBottom: 12 } : undefined}>
      <ReplayField
        event={replay?.event ?? null}
        board={replayOpts && replay ? replay.pre : board}
        onDone={finishReplay}
        caption={
          flag ? (
            <FlagCall event={flag.event} stage={flag.stage} teams={[gameState.homeTeam, gameState.awayTeam]} />
          ) : playAlert ? (
            <PlayAlert alert={playAlert} userTeamId={userTeamId} onDone={clearPlayAlert} />
          ) : replayOpts ? null : (
            <div className="play-latest" aria-live="polite">
              {board.eventLog[board.eventLog.length - 1]?.textCommentary ?? 'Kickoff! The game is under way.'}
            </div>
          )
        }
      />
      </div>

      {/* A decision, when one is due: right under the field, where the eye already is */}
      {leveragePrompt === 'PAT_DECISION' && !gameState.isGameOver && (!replayOpts || phase === 'done') && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#92400E' }}>⚡ TOUCHDOWN! POINT-AFTER DECISION</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            Kick the extra point, or go for two from the 3-yard line?
          </p>
          <div style={decisionGrid}>
            <button onClick={() => handleLeverageCall('PAT_KICK')} style={btnStyle}>👟 Kick Extra Point</button>
            <button onClick={() => handleLeverageCall('TWO_POINT_TRY')} style={btnStyle}>✌️ Go for Two</button>
          </div>
        </div>
      )}

      {leveragePrompt && leveragePrompt !== 'PAT_DECISION' && !gameState.isGameOver && (!replayOpts || phase === 'done') && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#92400E' }}>⚡ {LEVERAGE_HEADINGS[leveragePrompt]}</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            {downLabel(gameState.down)} & {gameState.yardLine + gameState.distance >= 100 ? 'Goal' : gameState.distance} at {fieldPosition(gameState.yardLine)}
            {leveragePrompt === 'TWO_MINUTE_DRILL' && ` with ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')} left`}
            . Choose your tactical call:
          </p>
          <div style={decisionGrid}>
            <button onClick={() => handleLeverageCall('INSIDE_RUN')} style={btnStyle}>🏈 Power Run</button>
            <button onClick={() => handleLeverageCall('SHORT_PASS')} style={btnStyle}>🎯 Quick Pass</button>
            {leveragePrompt !== 'RED_ZONE_GOAL_TO_GO' && (
              <button onClick={() => handleLeverageCall('DEEP_PASS')} style={btnStyle}>🚀 Deep Shot</button>
            )}
            {gameState.down === 4 && 100 - gameState.yardLine + 17 <= MAX_FIELD_GOAL_PROMPT_YARDS && (
              <button onClick={() => handleLeverageCall('FIELD_GOAL')} style={btnStyle}>👟 Field Goal ({100 - gameState.yardLine + 17} yds)</button>
            )}
            {gameState.down === 4 && gameState.yardLine < 80 && (
              <button onClick={() => handleLeverageCall('PUNT')} style={btnStyle}>🛡️ Punt</button>
            )}
          </div>
        </div>
      )}

      {/* The replay test: Begin and the sims right under the field, so the screen needs no scrolling */}
      {replayOpts && <div style={{ marginBottom: 12 }}>{simButtons}</div>}

      {/* While the game is paused (or before it begins) the coach calls each play himself: one snap per call (the replay
          test leaves them out until the game is under way) */}
      {!autoPlay && !gameState.isGameOver && leveragePrompt === null && !showHalftimeModal && (!replayOpts || started) && (
        <>
          <PlayCallingPanel
            side={gameState.possessionTeamId === userTeamId ? 'OFFENSE' : 'DEFENSE'}
            onCallPlay={(concept) => {
              liveTally.plays++;
              handleDecision(concept);
            }}
            onCallDefense={handleDefensiveCall}
            disabled={flag !== null}
          />
          <p style={{ margin: '-4px 2px 12px', fontSize: '12.5px', color: '#64748B' }}>
            {started ? 'Paused: call plays yourself, or tap Resume to let your staff call them.' : 'Call the first play yourself, or tap Begin to let your staff call them.'}
          </p>
        </>
      )}

      {/* The game plan: below the boxes that pop up, above the scoreboard and the play-by-play */}
      {!replayOpts && !gameState.isGameOver && <GamePlanBar offense={planOffense} focus={planFocus} bench={planBench} onUpdate={openPlan} />}

      {/* Other games this week, at this game's clock; at the final whistle, the week's top games (all final) */}
      {!replayOpts && (gameState.isGameOver ? <AroundTheState /> : <AroundTheLeague quarter={gameState.currentQuarter} clock={gameState.clockSecondsRemaining} isOver={false} />)}

      {/* Play-by-Play Stream (collapsible) */}
      <button
        className="ui-btn ui-btn-block"
        onClick={toggleLog}
        aria-expanded={logOpen}
        aria-controls="play-by-play-log"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: logOpen ? '8px' : '16px' }}
      >
        <span>📜 Play-by-play ({gameState.eventLog.length})</span>
        <span aria-hidden="true">{logOpen ? '▴' : '▾'}</span>
      </button>
      {logOpen && (
      <div
        id="play-by-play-log"
        ref={logContainerRef}
        style={{
          background: '#F3F4F6',
          borderRadius: '8px',
          height: '200px',
          overflowY: 'auto',
          padding: '12px',
          border: '1px solid #E5E7EB',
          marginBottom: '16px'
        }}
      >
        {gameState.eventLog.map((ev, i) => (
          <React.Fragment key={i}>
            <div
              style={{
                marginBottom: '8px',
                fontSize: '13px',
                lineHeight: '1.4',
                ...(ev.penalty ? { background: '#FEF9C3', borderLeft: '4px solid #EAB308', borderRadius: '4px', padding: '3px 6px' } : {})
              }}
            >
              {ev.penalty && <PenaltyFlag size={14} />}{' '}
              <span style={{ fontWeight: 'bold', color: ev.penalty ? '#854D0E' : '#4B5563' }}>
                [{ev.quarter === 'OT'
                  ? 'OT'
                  : `Q${ev.quarter} - ${Math.floor(ev.clockTimeRemainingSeconds / 60)}:${(ev.clockTimeRemainingSeconds % 60).toString().padStart(2, '0')}`}]
              </span>{' '}
              {snapLabel(ev) && <strong style={{ color: '#1D4ED8' }}>{snapLabel(ev)}</strong>} {ev.textCommentary}
            </div>
            {ev.substitution && (
              <div
                style={{
                  marginBottom: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  padding: '3px 6px',
                  ...(ev.substitution.in ? { background: '#FEF3C7', color: '#78350F' } : { background: '#DCFCE7', color: '#14532D' })
                }}
              >
                {substitutionLine(ev.substitution, ev.substitution.teamId === userTeamId ? null : opponent.name)}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      )}

      {/* The replay test: the game plan and the other games under the play-by-play */}
      {replayOpts && !gameState.isGameOver && <GamePlanBar offense={planOffense} focus={planFocus} bench={planBench} onUpdate={openPlan} />}
      {replayOpts && (gameState.isGameOver ? <AroundTheState /> : <AroundTheLeague quarter={gameState.currentQuarter} clock={gameState.clockSecondsRemaining} isOver={false} />)}

      {/* Sim controls: pinned to the bottom of the screen so they're always under your thumb (the replay test puts them
          right under the field instead) */}
      {!replayOpts && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#F8FAFC',
            padding: '10px 0',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
            zIndex: 20
          }}
        >
          {simButtons}
        </div>
      )}
    </div>
  );
};

/**
 * PLAYTEST: the kickoff before this snap, if there was one: the game's first snap, the first of the second half, or
 * the snap after a score (the game adds its kickoff to the scoring play's line: "Lewis returns the kickoff 26 yds to
 * the 32", or a touchback). High school overtime has no kickoffs. The kicking team kicks from its 40; the return ends
 * where the game spotted the ball for this snap.
 */
function kickoffBefore(ev: PlayEvent, prev: PlayEvent | null, state: GameSimulationState): PlayEvent | null {
  if (ev.quarter === 'OT' || ev.snapQuarter === 'OT' || ev.isTry) return null;
  const text = prev?.textCommentary ?? '';
  // (a kickoff's own words: a punt into the end zone is "for a touchback" too, and is never followed by a kickoff)
  const afterScore = prev?.playConcept !== 'PUNT' && /returns the kickoff|Kickoff by \S+ sails into the end zone|FUMBLES the kickoff/.test(text);
  const opening = !prev;
  const secondHalf = !!prev && prev.snapQuarter !== undefined && Number(prev.snapQuarter) <= 2 && Number(ev.snapQuarter ?? ev.quarter) >= 3;
  if (!afterScore && !opening && !secondHalf) return null;
  const [home, away] = [state.homeTeam, state.awayTeam];
  const receiving = ev.snapTeamId === home.id ? home : away;
  const kicking = receiving === home ? away : home;
  const spot = ev.snapYardLine ?? 25; // where the receiving team starts
  const k = kicking.roster.find((p) => p.position === 'K');
  const ret = afterScore ? text.match(/ (\S+) returns the kickoff (\d+) yds/) : null;
  const touchback = afterScore ? /touchback/.test(text) : spot === 20;
  // (the game's kickoff returner is a running back; with no line from the game, its first one)
  const returner = ret ? receiving.roster.find((p) => p.lastName === ret[1]) : receiving.roster.filter((p) => p.position === 'RB').sort((a, b) => a.depthChartTier - b.depthChartTier)[0];
  const words =
    `${k ? `K ${k.lastName}` : 'The kicker'} kicks off.` +
    (touchback ? ' Touchback.' : returner ? ` ${returner.position} ${returner.lastName} returns it ${ret ? `${ret[2]} yds` : `to the ${spot}`}.` : '');
  return {
    playId: `ko-${ev.playId}`, quarter: ev.quarter, snapQuarter: ev.snapQuarter, clockTimeRemainingSeconds: ev.clockTimeRemainingSeconds,
    snapTeamId: kicking.id, snapYardLine: 40, snapDown: 1, snapDistance: 10, down: 1, distance: 10, yardLine: spot,
    possessionTeamId: receiving.id, playConcept: 'KICKOFF' as PlayConcept,
    yardsGained: 100 - spot - 40, // the return ends this far from the kick spot (the kicking team's view)
    isTurnover: false, isScore: false, textCommentary: words, isLeverageMoment: false
  } as PlayEvent;
}

// PLAYTEST: the match page's decision titles, the defense choices' short notes, and how long a timeout's banner shows
const DUE_TITLES: Record<Exclude<LeverageType, 'PAT_DECISION'>, string> = {
  FOURTH_DOWN: '4th down: go for it or kick?',
  RED_ZONE_GOAL_TO_GO: 'Goal to go: punch it in',
  TWO_MINUTE_DRILL: 'Two-minute drill'
};
const FOCUS_SHORT: Record<DefensiveFocus, string> = { BALANCED: 'Staff picks by situation', STOP_RUN: 'Run blitz', STOP_PASS: 'Pass coverage', BLITZ: 'Sacks, risky' };
const TIMEOUT_BANNER_MS = 1800;
const timeoutLine = (team: string, left: number, quarter: GameSimulationState['currentQuarter']) =>
  `${team} · ${left} left ${quarter === 'OT' ? 'this overtime' : 'this half'}`;

// Decision buttons: two to a row so four or five options fit a phone
const decisionGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' };

const btnStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '8px 10px',
  background: '#1F2937',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const ORDINAL: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
// Sim to End's second tap has this long to land
const CONFIRM_END_MS = 3000;
const dimmed: React.CSSProperties = { opacity: 0.5, cursor: 'default' };
const LOG_OPEN_KEY = 'hsfhc.playByPlayOpen';

/** "🔄 Second string in: up 35" / "🔁 Starters back in: lead cut to 28" (the opponent's, with its name). */
function substitutionLine(sub: NonNullable<PlayEvent['substitution']>, teamName: string | null): string {
  const who = teamName ? `${teamName} ` : '';
  return sub.in
    ? `🔄 ${who}${teamName ? 'second' : 'Second'} string in: up ${sub.lead}`
    : `🔁 ${who}${teamName ? 'starters' : 'Starters'} back in: lead cut to ${sub.lead}`;
}

/** "1st & 10", "3rd & Goal", or "Try" for a PAT / two-point attempt (blank for events saved before this was recorded). */
function snapLabel(ev: PlayEvent): string {
  if (ev.isTry) return 'Try';
  if (!ev.snapDown || ev.snapDistance === undefined) return '';
  const toGo = ev.snapYardLine !== undefined && ev.snapYardLine + ev.snapDistance >= 100 ? 'Goal' : `${ev.snapDistance}`;
  return `${ev.snapDown}${ORDINAL[ev.snapDown] ?? 'th'} & ${toGo}`;
}

const teamNameStyle = (color: string): React.CSSProperties => ({
  minWidth: 0,
  fontSize: '14px',
  fontWeight: 'bold',
  color,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

const controlBtnStyle: React.CSSProperties = {
  minHeight: '48px',
  flex: '1 1 0', // share the row evenly so labels fit on phones
  minWidth: 0,
  padding: '10px 2px',
  whiteSpace: 'nowrap', // one line: "⏩ Sim Quarter" fits a third of a phone screen, down to 320px wide
  fontSize: 'clamp(11px, 3.4vw, 15px)',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

/** Moves straight on when a step has nothing to show (no one recorded a stat). */
const SkipStep: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  }, [onReady]);
  return null;
};
