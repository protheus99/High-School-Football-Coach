import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { rulesForState } from '../sim/stateRules';
import { OffensiveScheme } from '../types/game';
import { PreGameStrategyModal } from './PreGameStrategyModal';
import { Sheet } from './ui/Sheet';
import { AgendaTab, WeeklyAgenda } from './WeeklyAgenda';
import { getSeasonPhase, SEASON_PHASE_LABELS } from '../sim/scheduleEngine';
import { getUserMatchup } from '../sim/userMatchup';
import { findDistrict, findRegion } from '../sim/league';

import type { DefensiveFocus } from '../sim/gamePlan';

export const DashboardView: React.FC<{
  onLaunchGame: (focus: DefensiveFocus, offensiveScheme: OffensiveScheme) => void;
  onNavigate: (tab: AgendaTab) => void;
}> = ({ onLaunchGame, onNavigate }) => {
  const { currentWeek, districtTeams, leagueTeams, league, seasonSchedule, playoffBracket, userTeamId, advanceWeek, nationalLeagues, activeDilemma } = useGameStore();
  const [showPreGameModal, setShowPreGameModal] = useState(false);
  const [showSimWarning, setShowSimWarning] = useState(false);

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  const game = getUserMatchup({ currentWeek, seasonSchedule, leagueTeams, userTeamId, playoffBracket, nationalLeagues });
  const isHome = game?.home.id === userTeamId;
  const opponent = game && (isHome ? game.away : game.home);
  const isPlayed = game?.isPlayed ?? false;
  const userScore = isHome ? game?.homeScore : game?.awayScore;
  const opponentScore = isHome ? game?.awayScore : game?.homeScore;
  const district = league ? findDistrict(league, userTeamId) : undefined;
  const region = league ? findRegion(league, userTeamId) : undefined;

  if (!userTeam) return <div>Loading Program Dashboard...</div>;

  // No moving on with a decision open: every way forward takes the coach to the dilemma instead
  const goToDecision = () => document.getElementById('agenda-dilemma')?.scrollIntoView({ block: 'start' });
  // Skipping an unplayed game auto-simulates it, so confirm first
  const handleAdvanceWeek = () => {
    if (activeDilemma) goToDecision();
    else if (game && opponent && !isPlayed) setShowSimWarning(true);
    else advanceWeek();
  };
  const handleSimGame = () => (activeDilemma ? goToDecision() : advanceWeek());

  return (
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
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
      {/* Team name (wrapping to a second line when long) with Advance Week always on the right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="ui-page-title" style={{ overflowWrap: 'anywhere' }} title={`${userTeam.name} ${userTeam.mascot}`}>
            {userTeam.name} {userTeam.mascot}
          </h1>
          <div style={{ color: '#6B7280', marginTop: '2px' }}>
            {district?.name ?? 'Class 6A'}
            {region ? ` · ${region.name}` : ''} · {userTeam.record.wins}-{userTeam.record.losses} ({userTeam.record.districtWins}-{userTeam.record.districtLosses})
          </div>
        </div>
        {activeDilemma ? (
          <button className="ui-btn" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', borderColor: '#F59E0B', color: '#92400E' }} onClick={goToDecision} aria-label="Decision needed before advancing">
            ⚠️ Decide first
          </button>
        ) : (
          <button className="ui-btn ui-btn-dark" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }} onClick={handleAdvanceWeek} aria-label="Advance Week">
            ⏭️ <span className="hide-sm">Advance Week</span>
            <span className="show-sm">Advance</span>
          </button>
        )}
      </div>

      {/* This week's to-do list: quick decisions and links */}
      <WeeklyAgenda
        game={
          game && opponent
            ? {
                opponent,
                isHome,
                isPlayed,
                isPlayoff: game.isPlayoff,
                label: game.isPlayoff ? game.label : undefined,
                result: isPlayed ? `${userScore! > opponentScore! ? 'Won' : 'Lost'} ${userScore}-${opponentScore} ${isHome ? 'vs' : 'at'} ${opponent.name}` : undefined
              }
            : null
        }
        onPlayGame={() => setShowPreGameModal(true)}
        onAutoSim={handleSimGame}
        onAdvanceWeek={handleAdvanceWeek}
        onNavigate={onNavigate}
        phaseLabel={SEASON_PHASE_LABELS[getSeasonPhase(currentWeek)].replace('District', rulesForState(league?.state).districtLabel)}
      />

    </div>
  );
};

