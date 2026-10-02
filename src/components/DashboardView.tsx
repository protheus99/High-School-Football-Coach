import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { OffensiveScheme } from '../types/game';
import { PreGameStrategyModal } from './PreGameStrategyModal';
import { Sheet } from './ui/Sheet';
import { AgendaTab, WeeklyAgenda } from './WeeklyAgenda';
import { FilmStudyModal } from './FilmStudyModal';
import { getSeasonPhase, SEASON_PHASE_LABELS } from '../sim/scheduleEngine';
import { getUserMatchup } from '../sim/userMatchup';
import { findDistrict, findRegion, playoffRoundCount } from '../sim/league';

const PHASE_MESSAGES: Record<string, string> = {
  SPRING_EVALUATION: 'Spring evaluation: scout 8th-grade feeders and run 7-on-7 drills. No game this week.',
  SUMMER_CAMP: 'Summer two-a-days: install schemes and build conditioning. No game this week.',
  STATE_PLAYOFFS: 'Your playoff run is over. Follow the rest of the tournament in the Bracket.',
  POST_SEASON: 'Post season: awards banquet and signing day.',
  OFF_SEASON: 'Off season: last chance to grow the feeder pipeline. Advance Week to graduate the seniors and start next season.'
};

export type DefensiveFocus = 'STOP_RUN' | 'STOP_PASS' | 'BALANCED';

export const DashboardView: React.FC<{
  onLaunchGame: (focus: DefensiveFocus, offensiveScheme: OffensiveScheme) => void;
  onNavigate: (tab: AgendaTab) => void;
}> = ({ onLaunchGame, onNavigate }) => {
  const { currentWeek, districtTeams, leagueTeams, league, seasonSchedule, playoffBracket, userTeamId, advanceWeek, sanctionLevel } = useGameStore();
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

  if (!userTeam) return <div>Loading Program Dashboard...</div>;

  // Skipping an unplayed game auto-simulates it, so confirm first
  const handleAdvanceWeek = () => {
    if (game && opponent && !isPlayed) setShowSimWarning(true);
    else advanceWeek();
  };

  return (
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
      {showFilmModal && opponent && (
        <FilmStudyModal opponent={opponent} onClose={() => setShowFilmModal(false)} />
      )}

      {showSimWarning && opponent && (
        <Sheet
          title="Game not played yet"
          onClose={() => setShowSimWarning(false)}
          footer={
            <div className="ui-stack">
              <button
                className="ui-btn ui-btn-primary"
                onClick={() => {
                  setShowSimWarning(false);
                  setShowPreGameModal(true);
                }}
              >
                🏈 Play the Game
              </button>
              <button
                className="ui-btn ui-btn-dark"
                onClick={() => {
                  setShowSimWarning(false);
                  advanceWeek();
                }}
              >
                ⏭️ Auto-Sim &amp; Advance
              </button>
              <button className="ui-btn" onClick={() => setShowSimWarning(false)}>
                Cancel
              </button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: '15px', color: '#475569' }}>
            You haven&apos;t played this week&apos;s game {isHome ? 'vs' : 'at'} <strong>{opponent.name}</strong>. If you advance now, the game will be
            auto-simulated and the result will count.
          </p>
        </Sheet>
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
          <button className="ui-btn ui-btn-dark" onClick={handleAdvanceWeek}>
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
        phaseLabel={SEASON_PHASE_LABELS[getSeasonPhase(currentWeek, league ? playoffRoundCount(league) : 6)]}
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
            {/* Primary action first and full width on phones */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <button
                className="ui-btn"
                style={{ background: '#10B981', borderColor: '#10B981', color: '#fff', minHeight: '48px', fontSize: '15px' }}
                onClick={() => setShowPreGameModal(true)}
              >
                🏈 Set Game Plan &amp; Kick Off
              </button>
              <button className="ui-btn" style={{ background: '#475569', borderColor: '#475569', color: '#fff' }} onClick={() => setShowFilmModal(true)}>
                🎥 Study Opponent Film
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
