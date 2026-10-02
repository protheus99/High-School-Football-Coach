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
  const [showBoxScore, setShowBoxScore] = useState(false);
  const [showHalftimeModal, setShowHalftimeModal] = useState(false);
  // A ref (not state) so flipping it doesn't re-run the setup effect and restart the game
  const halftimeHandledRef = useRef(false);
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

    // Shared by both play callbacks: update the screen, queue banners, and open the halftime locker room
    const afterSnap = (state: GameSimulationState, event?: PlayEvent) => {
      setGameState({ ...state });
      const alerts = event && !simmingToEndRef.current ? alertsForPlay(event, preSnapRef.current, state) : [];
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
        setAutoPlay(false);
        setShowHalftimeModal(true);
      }
    };

    simWorkerBridge.subscribe({
      onPlayResolved: ({ state, event }) => {
        // A decision prompt only applies to the snap it was asked about (e.g. Next Snap was pressed instead)
        setLeveragePrompt(null);
        afterSnap(state, event);
        if (event?.isScore && event.scoreType === 'TOUCHDOWN') soundFx.playTouchdownHorn();
        else if (event?.isTurnover) soundFx.playWhistle();
        else soundFx.playTackleThud();
      },
      // The play that sets up a decision (your touchdown's try, a red-zone or 4th-down call) arrives here instead
      onLeveragePrompt: ({ state, event, leverageType }) => {
        afterSnap(state, event);
        setLeveragePrompt(leverageType || 'FOURTH_DOWN');
        setAutoPlay(false);
        if (event?.isScore && event.scoreType === 'TOUCHDOWN') soundFx.playTouchdownHorn();
        else soundFx.playLeverageAlert();
      },
      onGameOver: ({ state }) => {
        setGameState({ ...state });
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
    if (autoPlay && !leveragePrompt && !showHalftimeModal && !gameState.isGameOver) {
      interval = setInterval(() => {
        simWorkerBridge.stepPlay();
      }, 1100);
    }
    return () => clearInterval(interval);
  }, [autoPlay, leveragePrompt, showHalftimeModal, gameState.isGameOver]);

  const handleDefensiveCall = (call: DefensiveCall) => {
    simWorkerBridge.stepPlay(undefined, call);
  };

  const handleDecision = (concept: PlayConcept) => {
    setLeveragePrompt(null);
    simWorkerBridge.stepPlay(concept);
  };

  const isHomePoss = gameState.possessionTeamId === gameState.homeTeam.id;
  const currentPossTeam = isHomePoss ? gameState.homeTeam : gameState.awayTeam;

  return (
    <div style={{ padding: '16px', maxWidth: '840px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showBoxScore && (
        <PostGameBoxScoreModal gameState={gameState} onClose={() => { setShowBoxScore(false); onExit(gameState); }} />
      )}

      {showHalftimeModal && (
        <HalftimeSpeechModal
          gameState={gameState}
          userTeamId={userTeamId}
          onApplySpeech={(_speechType) => {
            setShowHalftimeModal(false);
            soundFx.playWhistle();
          }}
        />
      )}

      {/* Scoreboard: light background so every school color reads; the ball marks who has possession */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: '8px' }}>
          {[gameState.homeTeam, null, gameState.awayTeam].map((team, i) =>
            team ? (
              <div key={team.id} style={{ minWidth: 0, textAlign: i === 0 ? 'left' : 'right' }}>
                {/* The ball icon sits outside the truncated name so long school names never hide it */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: i === 0 ? 'flex-start' : 'flex-end', minWidth: 0 }}>
                  {i === 2 && gameState.possessionTeamId === team.id && <span style={{ flex: '0 0 auto' }} aria-label="has the ball">🏈</span>}
                  <span style={teamNameStyle(readableOnWhite(team.primaryColor, team.secondaryColor))}>{team.name}</span>
                  {i === 0 && gameState.possessionTeamId === team.id && <span style={{ flex: '0 0 auto' }} aria-label="has the ball">🏈</span>}
                </div>
                <div style={{ fontSize: '30px', fontWeight: 'bold', lineHeight: 1.1, color: '#0F172A' }}>{i === 0 ? gameState.homeScore : gameState.awayScore}</div>
              </div>
            ) : (
              <div key="clock" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#B45309' }}>
                  {gameState.currentQuarter === 'OT'
                    ? `OT ${gameState.overtime?.period ?? 1}`
                    : `Q${gameState.currentQuarter} ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')}`}
                </div>
                <div style={{ fontSize: '13px', color: '#334155', fontWeight: 'bold' }}>
                  {gameState.down}
                  {ORDINAL[gameState.down] ?? 'th'} &amp; {gameState.distance}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>{gameState.yardLine > 50 ? `Opp ${100 - gameState.yardLine}` : `Own ${gameState.yardLine}`}</div>
              </div>
            )
          )}
        </div>
      </div>

      {/* 2D SVG Interactive Field Visualizer */}
      <FieldVisualizer
        yardLine={gameState.yardLine}
        distance={gameState.distance}
        possessionColor={currentPossTeam.primaryColor}
        caption={
          playAlert ? (
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

      {/* Manual Play Calling Controls */}
      <PlayCallingPanel
        side={gameState.possessionTeamId === userTeamId ? 'OFFENSE' : 'DEFENSE'}
        onCallPlay={(concept) => handleDecision(concept)}
        onCallDefense={handleDefensiveCall}
        disabled={autoPlay || gameState.isGameOver || leveragePrompt !== null}
      />

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
          <div key={i} style={{ marginBottom: '8px', fontSize: '13px', lineHeight: '1.4' }}>
            <span style={{ fontWeight: 'bold', color: '#4B5563' }}>
              [{ev.quarter === 'OT'
                ? 'OT'
                : `Q${ev.quarter} - ${Math.floor(ev.clockTimeRemainingSeconds / 60)}:${(ev.clockTimeRemainingSeconds % 60).toString().padStart(2, '0')}`}]
            </span>{' '}
            {snapLabel(ev) && <strong style={{ color: '#1D4ED8' }}>{snapLabel(ev)}</strong>} {ev.textCommentary}
          </div>
        ))}
      </div>
      )}

      {/* Leverage Modal Interrupt */}
      {leveragePrompt === 'PAT_DECISION' && !gameState.isGameOver && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#92400E' }}>⚡ TOUCHDOWN! POINT-AFTER DECISION</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            Kick the extra point, or go for two from the 3-yard line?
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleDecision('PAT_KICK')} style={btnStyle}>👟 Kick Extra Point</button>
            <button onClick={() => handleDecision('TWO_POINT_TRY')} style={btnStyle}>✌️ Go for Two</button>
          </div>
        </div>
      )}

      {leveragePrompt && leveragePrompt !== 'PAT_DECISION' && !gameState.isGameOver && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#92400E' }}>⚡ {LEVERAGE_HEADINGS[leveragePrompt]}</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            {downLabel(gameState.down)} & {gameState.yardLine + gameState.distance >= 100 ? 'Goal' : gameState.distance} at {fieldPosition(gameState.yardLine)}
            {leveragePrompt === 'TWO_MINUTE_DRILL' && ` with ${Math.floor(gameState.clockSecondsRemaining / 60)}:${(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')} left`}
            . Choose your tactical call:
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
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

      {/* Sim controls: pinned to the bottom of the screen so they're always under your thumb */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          gap: '8px',
          background: '#F8FAFC',
          padding: '10px 0',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
          zIndex: 20
        }}
      >
        {!gameState.isGameOver ? (
          <>
            <button onClick={() => simWorkerBridge.stepPlay()} disabled={autoPlay} style={controlBtnStyle}>
              Next Snap
            </button>
            <button onClick={() => setAutoPlay(!autoPlay)} style={controlBtnStyle}>
              {autoPlay ? '⏸️ Pause' : '▶️ Auto-Sim'}
            </button>
            <button
              onClick={() => {
                simmingToEndRef.current = true;
                setAlertQueue([]);
                simWorkerBridge.simToEnd();
              }}
              style={controlBtnStyle}
            >
              ⏩ Sim to Final
            </button>
          </>
        ) : (
          <button onClick={() => setShowBoxScore(true)} style={{ ...controlBtnStyle, background: '#10B981', color: '#fff' }}>
            📊 Final Box Score
          </button>
        )}
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#1F2937',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const ORDINAL: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
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
  padding: '10px 8px',
  background: '#3B82F6',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};
