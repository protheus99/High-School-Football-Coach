import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { OffensiveScheme } from '../types/game';
import { PreGameStrategyModal } from './PreGameStrategyModal';
import { AgendaTab, WeeklyAgenda } from './WeeklyAgenda';
import { FilmStudyModal } from './FilmStudyModal';
import { getSeasonPhase } from '../sim/scheduleEngine';
import { getUserMatchup } from '../sim/userMatchup';
import { findDistrict, findRegion, playoffRoundCount, seasonLength } from '../sim/league';

const PHASE_MESSAGES: Record<string, string> = {
  SPRING_EVALUATION: 'Spring evaluation: scout 8th-grade feeders and run 7-on-7 drills. No game this week.',
  SUMMER_CAMP: 'Summer two-a-days: install schemes and build conditioning. No game this week.',
  STATE_PLAYOFFS: 'Your playoff run is over. Follow the rest of the tournament in the Bracket.',
  OFF_SEASON: "Off-season: graduation, awards and next year's planning."
};

const TIER_COLORS: Record<string, string> = { GOOD: '#059669', COMPROMISE: '#2563EB', RISKY: '#D97706', CORRUPT: '#DC2626' };

export type DefensiveFocus = 'STOP_RUN' | 'STOP_PASS' | 'BALANCED';

export const DashboardView: React.FC<{
  onLaunchGame: (focus: DefensiveFocus, offensiveScheme: OffensiveScheme) => void;
  onNavigate: (tab: AgendaTab) => void;
  onOpenPracticePlan: () => void;
}> = ({ onLaunchGame, onNavigate, onOpenPracticePlan }) => {
  const { currentWeek, districtTeams, leagueTeams, league, seasonSchedule, playoffBracket, userTeamId, activeDilemma, resolveDilemma, advanceWeek, sanctionLevel } = useGameStore();
  const [showPreGameModal, setShowPreGameModal] = useState(false);
  const [showFilmModal, setShowFilmModal] = useState(false);
  const [showSimWarning, setShowSimWarning] = useState(false);

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  const game = getUserMatchup({ currentWeek, seasonSchedule, leagueTeams, userTeamId, playoffBracket });
  const isHome = game?.home.id === userTeamId;
  const opponent = game && (isHome ? game.away : game.home);
  const isPlayed = game?.isPlayed ?? false;
  const userScore = isHome ? game?.homeScore : game?.awayScore;
  const opponentScore = isHome ? game?.awayScore : game?.homeScore;
  const district = league ? findDistrict(league, userTeamId) : undefined;
  const region = league ? findRegion(league, userTeamId) : undefined;
  const totalWeeks = league ? seasonLength(league) : 20;

  if (!userTeam) return <div>Loading Program Dashboard...</div>;

  // Skipping an unplayed game auto-simulates it, so confirm first
  const handleAdvanceWeek = () => {
    if (game && opponent && !isPlayed) setShowSimWarning(true);
    else advanceWeek();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showFilmModal && opponent && (
        <FilmStudyModal opponent={opponent} onClose={() => setShowFilmModal(false)} />
      )}

      {showSimWarning && opponent && (
        <div style={overlayStyle} onClick={() => setShowSimWarning(false)}>
          <div style={dialogStyle} role="dialog" aria-modal="true" aria-labelledby="sim-warning-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="sim-warning-title" style={{ margin: '0 0 8px 0', color: '#0F172A' }}>
              Game Not Played Yet
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#475569' }}>
              You haven&apos;t played this week&apos;s game {isHome ? 'vs' : 'at'} <strong>{opponent.name}</strong>. If you advance now, the game will be
              auto-simulated and the result will count.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button onClick={() => setShowSimWarning(false)} style={dialogBtn('#fff', '#334155', '1px solid #CBD5E1')}>
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSimWarning(false);
                  setShowPreGameModal(true);
                }}
                style={dialogBtn('#2563EB', '#fff')}
              >
                🏈 Play the Game
              </button>
              <button
                onClick={() => {
                  setShowSimWarning(false);
                  advanceWeek();
                }}
                style={dialogBtn('#334155', '#fff')}
              >
                ⏭️ Auto-Sim &amp; Advance
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreGameModal && opponent && (
        <PreGameStrategyModal
          userTeam={userTeam}
          opponentTeam={opponent}
          forecast={{ weather: 'CLEAR', temp: 68, wind: 8 }}
          onKickoff={(strategy) => {
            setShowPreGameModal(false);
            onLaunchGame(strategy.focusTarget, strategy.selectedOffScheme);
          }}
          onCancel={() => setShowPreGameModal(false)}
        />
      )}

      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 6vw, 32px)' }}>
            {userTeam.name} {userTeam.mascot}
          </h1>
          <div style={{ color: '#6B7280' }}>
            {district?.name ?? 'Class 6A'}{region ? ` · ${region.name}` : ''} | Record: {userTeam.record.wins}-{userTeam.record.losses} (District: {userTeam.record.districtWins}-{userTeam.record.districtLosses})
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ background: '#EEF2FF', color: '#4F46E5', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold' }}>
            WEEK {currentWeek} OF {totalWeeks}
          </div>
          <button
            onClick={handleAdvanceWeek}
            style={{ padding: '8px 14px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
          >
            ⏭️ Advance Week
          </button>
        </div>
      </div>

      {/* This week's to-do list: quick decisions and links */}
      <WeeklyAgenda
        game={
          game && opponent
            ? {
                opponentName: opponent.name,
                isHome,
                isPlayed,
                result: isPlayed ? `${userScore! > opponentScore! ? 'Won' : 'Lost'} ${userScore}-${opponentScore} ${isHome ? 'vs' : 'at'} ${opponent.name}` : undefined
              }
            : null
        }
        onPlayGame={() => setShowPreGameModal(true)}
        onAutoSim={advanceWeek}
        onAdvanceWeek={handleAdvanceWeek}
        onNavigate={onNavigate}
        onOpenPracticePlan={onOpenPracticePlan}
      />

      {/* Program Meters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <MeterCard label="Board Trust" val={userTeam.programMeters.schoolBoardTrust} color="#10B981" />
        <MeterCard label="Booster Approval" val={userTeam.programMeters.boosterApproval} color="#F59E0B" />
        <MeterCard label="Discipline" val={userTeam.programMeters.lockerRoomDiscipline} color="#3B82F6" />
        <MeterCard label="Compliance" val={userTeam.programMeters.complianceScore} color="#EC4899" />
      </div>

      {/* State Association Sanctions */}
      {sanctionLevel > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991B1B' }}>
          <strong>⚖️ STATE ASSOCIATION SANCTIONS:</strong>{' '}
          {['', 'Public reprimand issued.', 'A district win has been forfeited.', 'Program banned from the state playoffs.'][sanctionLevel]}{' '}
          {sanctionLevel < 3 && 'Raise Compliance above 40 to stop further penalties.'}
        </div>
      )}

      {/* Active Dilemma Banner */}
      {activeDilemma && (
        <div id="weekly-dilemma" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '16px', marginBottom: '24px', scrollMarginTop: '12px' }}>
          <h3 style={{ margin: '0 0 6px 0', color: '#B45309' }}>⚠️ THURSDAY DILEMMA: {activeDilemma.title}</h3>
          <p style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#4B5563' }}>{activeDilemma.scenario}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeDilemma.choices.map((c) => (
              <button
                key={c.id}
                onClick={() => resolveDilemma(c)}
                style={{ textAlign: 'left', padding: '10px 14px', background: '#fff', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff', background: TIER_COLORS[c.tier], borderRadius: '3px', padding: '1px 6px', marginRight: '8px' }}>
                    {c.tier}
                  </span>
                  {c.label}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>{c.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matchup & Strategy Launcher */}
      <div style={{ background: '#1E293B', color: '#fff', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
        {!game || !opponent ? (
          <>
            <h2 style={{ margin: '0 0 8px 0' }}>NO GAME THIS WEEK</h2>
            <p style={{ margin: 0, color: '#94A3B8' }}>
              {PHASE_MESSAGES[getSeasonPhase(currentWeek, league ? playoffRoundCount(league) : 6)] ?? 'Bye week.'}
            </p>
          </>
        ) : isPlayed ? (
          <>
            <h2 style={{ margin: '0 0 8px 0' }}>
              {userScore! > opponentScore! ? 'VICTORY' : 'DEFEAT'}: {userTeam.name} {userScore}, {opponent.name} {opponentScore}
            </h2>
            <p style={{ margin: 0, color: '#94A3B8' }}>Final is in the books. Advance the week to continue the season.</p>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 8px 0' }}>{game.isPlayoff ? 'STATE PLAYOFFS' : 'FRIDAY NIGHT SHOWDOWN'}</h2>
            <p style={{ margin: '0 0 16px 0', color: '#94A3B8' }}>
              {game.label} · {isHome ? 'vs.' : 'at'} {opponent.name} {opponent.mascot} ({opponent.record.wins}-{opponent.record.losses})
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                onClick={() => setShowFilmModal(true)}
                style={{ padding: '10px 20px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
              >
                🎥 Study Opponent Film
              </button>
              <button
                onClick={() => setShowPreGameModal(true)}
                style={{ padding: '10px 24px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
              >
                🏈 Set Gameplan & Kick Off
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const MeterCard: React.FC<{ label: string; val: number; color: string }> = ({ label, val, color }) => (
  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px' }}>
    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>{label}</div>
    <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>{val}%</div>
    <div style={{ background: '#E5E7EB', height: '6px', borderRadius: '3px', marginTop: '6px' }}>
      <div style={{ background: color, width: `${val}%`, height: '100%', borderRadius: '3px' }} />
    </div>
  </div>
);

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '16px'
};

const dialogStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '10px',
  padding: '20px',
  maxWidth: '440px',
  width: '100%',
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  fontFamily: 'sans-serif'
};

const dialogBtn = (background: string, color: string, border = 'none'): React.CSSProperties => ({
  padding: '8px 14px',
  background,
  color,
  border,
  borderRadius: '6px',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer'
});
