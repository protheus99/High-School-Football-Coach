import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { OffensiveScheme } from '../types/game';
import { PreGameStrategyModal } from './PreGameStrategyModal';
import { FilmStudyModal } from './FilmStudyModal';
import { getSeasonPhase, getTeamGameForWeek } from '../sim/scheduleEngine';

const PHASE_MESSAGES: Record<string, string> = {
  SPRING_EVALUATION: 'Spring evaluation: scout 8th-grade feeders and run 7-on-7 drills. No game this week.',
  SUMMER_CAMP: 'Summer two-a-days: install schemes and build conditioning. No game this week.',
  STATE_PLAYOFFS: 'State playoffs: open the Bracket from the header to play your postseason game.',
  OFF_SEASON: "Off-season: graduation, awards and next year's planning."
};

export type DefensiveFocus = 'STOP_RUN' | 'STOP_PASS' | 'BALANCED';

export const DashboardView: React.FC<{ onLaunchGame: (focus: DefensiveFocus, offensiveScheme: OffensiveScheme) => void }> = ({ onLaunchGame }) => {
  const { currentWeek, districtTeams, neighborDistrictTeams, seasonSchedule, userTeamId, activeDilemma, resolveDilemma, advanceWeek } = useGameStore();
  const [showPreGameModal, setShowPreGameModal] = useState(false);
  const [showFilmModal, setShowFilmModal] = useState(false);

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  const game = getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
  const opponentId = game && (game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId);
  const opponent = [...districtTeams, ...neighborDistrictTeams].find((t) => t.id === opponentId);
  const isHome = game?.homeTeamId === userTeamId;
  const isPlayed = game?.homeScore !== undefined;
  const userScore = isHome ? game?.homeScore : game?.awayScore;
  const opponentScore = isHome ? game?.awayScore : game?.homeScore;

  if (!userTeam) return <div>Loading Program Dashboard...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showFilmModal && opponent && (
        <FilmStudyModal opponent={opponent} onClose={() => setShowFilmModal(false)} />
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0 }}>{userTeam.name} {userTeam.mascot}</h1>
          <div style={{ color: '#6B7280' }}>
            Class 6A - Region 4 | Record: {userTeam.record.wins}-{userTeam.record.losses} (District: {userTeam.record.districtWins}-{userTeam.record.districtLosses})
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ background: '#EEF2FF', color: '#4F46E5', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold' }}>
            WEEK {currentWeek} OF 20
          </div>
          <button
            onClick={advanceWeek}
            style={{ padding: '8px 14px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
          >
            ⏭️ Advance Week
          </button>
        </div>
      </div>

      {/* Program Meters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <MeterCard label="Board Trust" val={userTeam.programMeters.schoolBoardTrust} color="#10B981" />
        <MeterCard label="Booster Approval" val={userTeam.programMeters.boosterApproval} color="#F59E0B" />
        <MeterCard label="Discipline" val={userTeam.programMeters.lockerRoomDiscipline} color="#3B82F6" />
        <MeterCard label="Compliance" val={userTeam.programMeters.complianceScore} color="#EC4899" />
      </div>

      {/* Active Dilemma Banner */}
      {activeDilemma && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 6px 0', color: '#B45309' }}>⚠️ THURSDAY DILEMMA: {activeDilemma.title}</h3>
          <p style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#4B5563' }}>{activeDilemma.scenario}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeDilemma.choices.map((c) => (
              <button
                key={c.id}
                onClick={() => resolveDilemma(c)}
                style={{ textAlign: 'left', padding: '10px 14px', background: '#fff', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{c.label}</div>
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
            <p style={{ margin: 0, color: '#94A3B8' }}>{PHASE_MESSAGES[getSeasonPhase(currentWeek)] ?? 'Bye week.'}</p>
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
            <h2 style={{ margin: '0 0 8px 0' }}>FRIDAY NIGHT SHOWDOWN</h2>
            <p style={{ margin: '0 0 16px 0', color: '#94A3B8' }}>
              {game.isDistrictGame ? 'District game' : 'Non-district game'} · {isHome ? 'vs.' : 'at'} {opponent.name} {opponent.mascot} ({opponent.record.wins}-{opponent.record.losses})
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
