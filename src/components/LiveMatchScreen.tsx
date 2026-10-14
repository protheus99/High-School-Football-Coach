import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameSimulationState, PlayConcept, LeverageType, DefensiveCall, PlayEvent } from '../types/game';
import { simWorkerBridge } from '../services/workerBridge';
import { soundFx } from '../utils/soundEngine';
import { PostGameBoxScoreModal } from './PostGameBoxScoreModal';
import { HalftimeSpeechModal } from './HalftimeSpeechModal';
import { FieldVisualizer } from './FieldVisualizer';
import { PlayAlert } from './PlayAlert';
import { PlayAlertData, PreSnap, alertsForPlay } from '../sim/playAlerts';
import { readableOnWhite } from '../utils/color';
import { PlayCallingPanel } from './PlayCallingPanel';
import { AroundTheLeague } from './AroundTheLeague';
import { GamePlanBar, GamePlanSheet } from './GamePlanSheet';
import { GameBallSheet, PressConferenceSheet } from './PostGameSheets';
import { useGameStore } from '../store/gameStore';
import { GameBallCandidate, gameBallCandidates } from '../sim/postGame';
import { PressQuestion, buildPressContext, pickPressQuestion } from '../sim/pressConference';
import { DilemmaChoice } from '../types/game';
import { DefensiveFocus, FOCUS_CALL, focusFromCall } from '../sim/gamePlan';
import { OffensiveScheme } from '../types/game';
import { FlagCall } from './FlagCall';
import { FLAG_STAGE_MS, FlagStage, flagStages } from '../sim/flagSequence';
import { PenaltyFlag } from './ui/PenaltyFlag';

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

  useEffect(() => {
    simWorkerBridge.initialize();
    simWorkerBridge.initGame(initialState, userTeamId);

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
    const afterSnap = (state: GameSimulationState, event?: PlayEvent) => {
      setGameState({ ...state });
      useGameStore.getState().markGameLive(state); // a game counts once it kicks off: where it stands is written down
      if (event?.penalty && !simmingToEndRef.current) {
        setAlertQueue([]);
        runFlag(event);
      }
      const alerts = event && !event.penalty && !simmingToEndRef.current ? alertsForPlay(event, preSnapRef.current, state) : [];
      if (alerts.length > 0) setAlertQueue(alerts);
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
        if (event?.isScore && event.scoreType === 'TOUCHDOWN') soundFx.playTouchdownHorn();
        else if (event?.isTurnover || event?.penalty) soundFx.playWhistle();
        else soundFx.playTackleThud();
      },
      // The play that sets up a decision (your touchdown's try, a red-zone or 4th-down call) arrives here instead
      onLeveragePrompt: ({ state, event, leverageType }) => {
        afterSnap(state, event);
        setLeveragePrompt(leverageType || 'FOURTH_DOWN');
        if (autoPlayRef.current) resumeAutoRef.current = true;
        setAutoPlay(false);
        if (event?.isScore && event.scoreType === 'TOUCHDOWN') soundFx.playTouchdownHorn();
        else soundFx.playLeverageAlert();
      },
      onGameOver: ({ state }) => {
        setGameState({ ...state });
        useGameStore.getState().markGameLive(state, true);
        setAutoPlay(false);
        soundFx.playWhistle();
        setShowBoxScore(true);
      }
    });
  }, [initialState, userTeamId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [gameState.eventLog.length, logOpen]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoPlay && !leveragePrompt && !showHalftimeModal && !flag && !gameState.isGameOver) {
      interval = setInterval(() => {
        simWorkerBridge.stepPlay();
      }, 1100);
    }
    return () => clearInterval(interval);
  }, [autoPlay, leveragePrompt, showHalftimeModal, flag, gameState.isGameOver]);

  const handleDefensiveCall = (call: DefensiveCall) => {
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
    simWorkerBridge.stepPlay(concept);
    resumeAutoSim();
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
    setAlertQueue([]);
    clearFlag();
    if (to === 'QUARTER') simWorkerBridge.simQuarter();
    else if (to === 'HALF') simWorkerBridge.simToHalftime();
    else simWorkerBridge.simToEnd();
  };
  // During a flag the field and scoreboard show the snap's spot until the penalty is walked off
  const beforeSpot = flag && flag.stage !== 'SPOT' && flag.event.snapDown !== undefined;
  const shownDown = beforeSpot ? flag.event.snapDown! : gameState.down;
  const shownDistance = beforeSpot ? flag.event.snapDistance! : gameState.distance;
  const shownYardLine = beforeSpot ? flag.event.snapYardLine! : gameState.yardLine;

  // The game plan the coach's team is running (from the strategy room, or changed mid-game)
  const userTeam = gameState.homeTeam.id === userTeamId ? gameState.homeTeam : gameState.awayTeam;
  const opponent = gameState.homeTeam.id === userTeamId ? gameState.awayTeam : gameState.homeTeam;
  const planOffense = gameState.offensiveGamePlan?.[userTeamId] ?? userTeam.schemeOffense;
  const planFocus = focusFromCall(gameState.defensiveGamePlan?.[userTeamId]);
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
  const applyPlan = (offense: OffensiveScheme, focus: DefensiveFocus) => {
    if (showHalftimeModal) changedPlanAtHalftimeRef.current = true; // the press may ask about it
    const call = FOCUS_CALL[focus];
    simWorkerBridge.setGamePlan(userTeamId, offense, call);
    setGameState((s) => {
      const defense = { ...s.defensiveGamePlan };
      if (call) defense[userTeamId] = call;
      else delete defense[userTeamId];
      return { ...s, offensiveGamePlan: { ...s.offensiveGamePlan, [userTeamId]: offense }, defensiveGamePlan: defense };
    });
    closePlan();
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

  const isHomePoss = gameState.possessionTeamId === gameState.homeTeam.id;
  const currentPossTeam = isHomePoss ? gameState.homeTeam : gameState.awayTeam;

  return (
    <div style={{ padding: '16px', maxWidth: '840px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showBoxScore && (
        <PostGameBoxScoreModal gameState={gameState} closeLabel="Continue" onClose={() => { setShowBoxScore(false); setPostStep('GAME_BALL'); }} />
      )}

      {showHalftimeModal && (
        <HalftimeSpeechModal
          gameState={gameState}
          userTeamId={userTeamId}
          plan={{ offense: planOffense, focus: planFocus }}
          onUpdatePlan={() => setPlanOpen(true)}
          onApplySpeech={(talk) => {
            // The message shapes the second half: the worker plays it, the screen's copy records it
            simWorkerBridge.setHalftimeTalk(userTeamId, talk);
            setGameState((s) => ({ ...s, halftimeTalks: { ...s.halftimeTalks, [userTeamId]: talk } }));
            useGameStore.getState().markGameLive({ ...gameState, halftimeTalks: { ...gameState.halftimeTalks, [userTeamId]: talk } }, true);
            setShowHalftimeModal(false);
            soundFx.playWhistle();
            resumeAutoSim();
          }}
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
          {[gameState.awayTeam, null, gameState.homeTeam].map((team, i) =>
            team ? (
              <div key={team.id} style={{ minWidth: 0, textAlign: i === 0 ? 'left' : 'right' }}>
                {/* The ball icon sits outside the truncated name so long school names never hide it */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: i === 0 ? 'flex-start' : 'flex-end', minWidth: 0 }}>
                  {i === 2 && gameState.possessionTeamId === team.id && <span style={{ flex: '0 0 auto' }} aria-label="has the ball">🏈</span>}
                  <span style={teamNameStyle(readableOnWhite(team.primaryColor, team.secondaryColor))}>{team.name}</span>
                  {i === 0 && gameState.possessionTeamId === team.id && <span style={{ flex: '0 0 auto' }} aria-label="has the ball">🏈</span>}
                </div>
                {/* Record coming into the game */}
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 'bold' }}>
                  ({team.record.wins}-{team.record.losses})
                </div>
                <div style={{ fontSize: '30px', fontWeight: 'bold', lineHeight: 1.1, color: '#0F172A' }}>{i === 0 ? gameState.awayScore : gameState.homeScore}</div>
              </div>
            ) : (
              <div key="clock" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#B45309' }}>
                  {gameState.currentQuarter === 'OT'
                    ? `OT ${gameState.overtime?.period ?? 1}`
                    : `Q${gameState.currentQuarter} ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')}`}
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

      {/* 2D SVG Interactive Field Visualizer */}
      <FieldVisualizer
        yardLine={shownYardLine}
        distance={shownDistance}
        possessionColor={currentPossTeam.primaryColor}
        flagYardLine={flag && flag.stage !== 'PLAY' ? flag.event.snapYardLine : undefined}
        caption={
          flag ? (
            <FlagCall event={flag.event} stage={flag.stage} teams={[gameState.homeTeam, gameState.awayTeam]} />
          ) : playAlert ? (
            <PlayAlert alert={playAlert} userTeamId={userTeamId} onDone={clearPlayAlert} />
          ) : (
            <div className="play-latest" aria-live="polite">
              {gameState.eventLog[gameState.eventLog.length - 1]?.textCommentary ?? 'Kickoff! The game is under way.'}
            </div>
          )
        }
        possessionIsHome={gameState.possessionTeamId === gameState.homeTeam.id}
        homeTeamName={gameState.homeTeam.name}
        homeColor={gameState.homeTeam.primaryColor}
        homeSecondaryColor={gameState.homeTeam.secondaryColor}
      />

      {/* A decision, when one is due: right under the field, where the eye already is */}
      {leveragePrompt === 'PAT_DECISION' && !gameState.isGameOver && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#92400E' }}>⚡ TOUCHDOWN! POINT-AFTER DECISION</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            Kick the extra point, or go for two from the 3-yard line?
          </p>
          <div style={decisionGrid}>
            <button onClick={() => handleDecision('PAT_KICK')} style={btnStyle}>👟 Kick Extra Point</button>
            <button onClick={() => handleDecision('TWO_POINT_TRY')} style={btnStyle}>✌️ Go for Two</button>
          </div>
        </div>
      )}

      {leveragePrompt && leveragePrompt !== 'PAT_DECISION' && !gameState.isGameOver && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#92400E' }}>⚡ {LEVERAGE_HEADINGS[leveragePrompt]}</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            {downLabel(gameState.down)} & {gameState.yardLine + gameState.distance >= 100 ? 'Goal' : gameState.distance} at {fieldPosition(gameState.yardLine)}
            {leveragePrompt === 'TWO_MINUTE_DRILL' && ` with ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')} left`}
            . Choose your tactical call:
          </p>
          <div style={decisionGrid}>
            <button onClick={() => handleDecision('INSIDE_RUN')} style={btnStyle}>🏈 Power Run</button>
            <button onClick={() => handleDecision('SHORT_PASS')} style={btnStyle}>🎯 Quick Pass</button>
            {leveragePrompt !== 'RED_ZONE_GOAL_TO_GO' && (
              <button onClick={() => handleDecision('DEEP_PASS')} style={btnStyle}>🚀 Deep Shot</button>
            )}
            {gameState.down === 4 && 100 - gameState.yardLine + 17 <= MAX_FIELD_GOAL_PROMPT_YARDS && (
              <button onClick={() => handleDecision('FIELD_GOAL')} style={btnStyle}>👟 Field Goal ({100 - gameState.yardLine + 17} yds)</button>
            )}
            {gameState.down === 4 && gameState.yardLine < 80 && (
              <button onClick={() => handleDecision('PUNT')} style={btnStyle}>🛡️ Punt</button>
            )}
          </div>
        </div>
      )}

      {/* While the game is paused (or before it begins) the coach calls each play himself: one snap per call */}
      {!autoPlay && !gameState.isGameOver && leveragePrompt === null && !showHalftimeModal && (
        <>
          <PlayCallingPanel
            side={gameState.possessionTeamId === userTeamId ? 'OFFENSE' : 'DEFENSE'}
            onCallPlay={(concept) => handleDecision(concept)}
            onCallDefense={handleDefensiveCall}
            disabled={flag !== null}
          />
          <p style={{ margin: '-4px 2px 12px', fontSize: '12.5px', color: '#64748B' }}>
            {started ? 'Paused: call plays yourself, or tap Resume to let your staff call them.' : 'Call the first play yourself, or tap Begin to let your staff call them.'}
          </p>
        </>
      )}

      {/* The game plan: below the boxes that pop up, above the scoreboard and the play-by-play */}
      {!gameState.isGameOver && <GamePlanBar offense={planOffense} focus={planFocus} onUpdate={openPlan} />}

      {/* Other games this week, at this game's clock */}
      <AroundTheLeague quarter={gameState.currentQuarter} clock={gameState.clockSecondsRemaining} isOver={gameState.isGameOver} />

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
          <div
            key={i}
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
        ))}
      </div>
      )}

      {/* Sim controls: pinned to the bottom of the screen so they're always under your thumb */}
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
      </div>
    </div>
  );
};

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
