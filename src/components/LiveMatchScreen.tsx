import React, { useState, useEffect, useRef } from 'react';
import { GameSimulationState, PlayConcept, LeverageType } from '../types/game';
import { simWorkerBridge } from '../services/workerBridge';
import { soundFx } from '../utils/soundEngine';
import { PostGameBoxScoreModal } from './PostGameBoxScoreModal';
import { HalftimeSpeechModal } from './HalftimeSpeechModal';
import { FieldVisualizer } from './FieldVisualizer';
import { PlayCallingPanel } from './PlayCallingPanel';

interface LiveMatchProps {
  initialState: GameSimulationState;
  userTeamId: string;
  onExit: () => void;
}

export const LiveMatchScreen: React.FC<LiveMatchProps> = ({ initialState, userTeamId, onExit }) => {
  const [gameState, setGameState] = useState<GameSimulationState>(initialState);
  const [leveragePrompt, setLeveragePrompt] = useState<LeverageType | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showBoxScore, setShowBoxScore] = useState(false);
  const [showHalftimeModal, setShowHalftimeModal] = useState(false);
  const [halftimeHandled, setHalftimeHandled] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    simWorkerBridge.initialize();
    simWorkerBridge.initGame(initialState);

    simWorkerBridge.subscribe({
      onPlayResolved: ({ state, event }) => {
        setGameState({ ...state });

        // Trigger Halftime Modal at start of Q3
        if (state.currentQuarter === 3 && !halftimeHandled) {
          setAutoPlay(false);
          setShowHalftimeModal(true);
          setHalftimeHandled(true);
        }

        if (event?.isScore && event.scoreType === 'TOUCHDOWN') {
          soundFx.playTouchdownHorn();
        } else if (event?.isTurnover) {
          soundFx.playWhistle();
        } else {
          soundFx.playTackleThud();
        }
      },
      onLeveragePrompt: ({ state, leverageType }) => {
        setGameState({ ...state });
        setLeveragePrompt(leverageType || 'FOURTH_DOWN');
        setAutoPlay(false);
        soundFx.playLeverageAlert();
      },
      onGameOver: ({ state }) => {
        setGameState({ ...state });
        setAutoPlay(false);
        soundFx.playWhistle();
        setShowBoxScore(true);
      }
    });
  }, [initialState, halftimeHandled]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [gameState.eventLog.length]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoPlay && !leveragePrompt && !showHalftimeModal && !gameState.isGameOver) {
      interval = setInterval(() => {
        simWorkerBridge.stepPlay();
      }, 1100);
    }
    return () => clearInterval(interval);
  }, [autoPlay, leveragePrompt, showHalftimeModal, gameState.isGameOver]);

  const handleDecision = (concept: PlayConcept) => {
    setLeveragePrompt(null);
    simWorkerBridge.stepPlay(concept);
  };

  const isHomePoss = gameState.possessionTeamId === gameState.homeTeam.id;
  const currentPossTeam = isHomePoss ? gameState.homeTeam : gameState.awayTeam;

  return (
    <div style={{ padding: '16px', maxWidth: '840px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showBoxScore && (
        <PostGameBoxScoreModal gameState={gameState} onClose={() => { setShowBoxScore(false); onExit(); }} />
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

      {/* Scoreboard Header */}
      <div style={{ background: '#111827', color: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, color: gameState.homeTeam.primaryColor }}>{gameState.homeTeam.name}</h2>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{gameState.homeScore}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#F59E0B' }}>
              Q{gameState.currentQuarter} - {Math.floor(gameState.clockSecondsRemaining / 60)}:
              {(gameState.clockSecondsRemaining % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>
              BALL ON: {gameState.yardLine} YD | DOWN: {gameState.down} & {gameState.distance}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, color: gameState.awayTeam.primaryColor }}>{gameState.awayTeam.name}</h2>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{gameState.awayScore}</div>
          </div>
        </div>
      </div>

      {/* 2D SVG Interactive Field Visualizer */}
      <FieldVisualizer
        yardLine={gameState.yardLine}
        down={gameState.down}
        distance={gameState.distance}
        possessionTeamName={currentPossTeam.name}
        possessionColor={currentPossTeam.primaryColor}
      />

      {/* Manual Play Calling Controls */}
      <PlayCallingPanel
        onCallPlay={(concept) => handleDecision(concept)}
        disabled={autoPlay || gameState.isGameOver}
      />

      {/* Play-by-Play Stream */}
      <div
        ref={logContainerRef}
        style={{
          background: '#F3F4F6',
          borderRadius: '8px',
          height: '240px',
          overflowY: 'auto',
          padding: '12px',
          border: '1px solid #E5E7EB',
          marginBottom: '16px'
        }}
      >
        {gameState.eventLog.map((ev, i) => (
          <div key={i} style={{ marginBottom: '8px', fontSize: '13px', lineHeight: '1.4' }}>
            <span style={{ fontWeight: 'bold', color: '#4B5563' }}>
              [Q{ev.quarter} - {Math.floor(ev.clockTimeRemainingSeconds / 60)}:
              {(ev.clockTimeRemainingSeconds % 60).toString().padStart(2, '0')}]
            </span>{' '}
            {ev.textCommentary}
          </div>
        ))}
      </div>

      {/* Leverage Modal Interrupt */}
      {leveragePrompt && !gameState.isGameOver && (
        <div style={{ background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#92400E' }}>⚡ 4th DOWN TACTICAL DECISION</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
            4th & {gameState.distance} at opponent {gameState.yardLine}-yard line. Choose your tactical call:
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleDecision('INSIDE_RUN')} style={btnStyle}>🏈 Power Run</button>
            <button onClick={() => handleDecision('SHORT_PASS')} style={btnStyle}>🎯 Quick Pass</button>
            <button onClick={() => handleDecision('FIELD_GOAL')} style={btnStyle}>👟 Field Goal</button>
            <button onClick={() => handleDecision('PUNT')} style={btnStyle}>🛡️ Punt</button>
          </div>
        </div>
      )}

      {/* Sim Controls */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {!gameState.isGameOver ? (
          <>
            <button onClick={() => simWorkerBridge.stepPlay()} disabled={autoPlay} style={controlBtnStyle}>Next Snap</button>
            <button onClick={() => setAutoPlay(!autoPlay)} style={controlBtnStyle}>
              {autoPlay ? '⏸️ Pause' : '▶️ Auto-Sim'}
            </button>
            <button onClick={() => simWorkerBridge.simToEnd()} style={controlBtnStyle}>⏩ Sim to Final</button>
          </>
        ) : (
          <button onClick={() => setShowBoxScore(true)} style={{ ...controlBtnStyle, background: '#10B981', color: '#fff' }}>
            📊 View Final Box Score & Stats
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

const controlBtnStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: '#3B82F6',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold'
};
