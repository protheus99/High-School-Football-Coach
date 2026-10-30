import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { rulesForState } from '../sim/stateRules';
import { OffensiveScheme } from '../types/game';
import { PreGameStrategyModal, PregameSpeech } from './PreGameStrategyModal';
import { Sheet } from './ui/Sheet';
import { AgendaTab, WeeklyAgenda } from './WeeklyAgenda';
import { StaffWindowCard } from './StaffWindowCard';
import { needsSettling } from '../sim/staffContracts';
import { getSeasonPhase, SEASON_PHASE_LABELS } from '../sim/scheduleEngine';
import { getUserMatchup } from '../sim/userMatchup';
import { findDistrict, findRegion } from '../sim/league';
import { liveClockLabel, lockKey } from '../sim/gameLock';
import { gradesNeedReview } from '../sim/advanceGate';
import { benchNote, isCoachBenched } from '../sim/billyMartin';

import type { DefensiveFocus } from '../sim/gamePlan';

export const DashboardView: React.FC<{
  onLaunchGame: (focus: DefensiveFocus, offensiveScheme: OffensiveScheme, speech?: PregameSpeech) => void;
  onResumeGame: () => void;
  onNavigate: (tab: AgendaTab) => void;
  advanceRequest?: number; // the top bar's Advance, while something blocks the week: this screen takes it from here
  onAdvanceHandled?: () => void;
}> = ({ onLaunchGame, onResumeGame, onNavigate, advanceRequest = 0, onAdvanceHandled }) => {
  const { currentWeek, currentYear, districtTeams, leagueTeams, league, seasonSchedule, playoffBracket, userTeamId, advanceWeek, nationalLeagues, activeDilemma, coachingStaff, careerKey, playedGames, lockNotice } =
    useGameStore();
  const [showPreGameModal, setShowPreGameModal] = useState(false);
  const [showSimWarning, setShowSimWarning] = useState(false);
  // A suspended coach's games are coached by his coordinator: simulated only
  const coachBench = useGameStore((s) => s.coachBench);
  const benched = isCoachBenched(coachBench, currentYear) ? benchNote(coachBench, currentYear) : undefined;
  const gradesBlocked = gradesNeedReview(useGameStore.getState());

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  const game = getUserMatchup({ currentWeek, seasonSchedule, leagueTeams, userTeamId, playoffBracket, nationalLeagues });
  const isHome = game?.home.id === userTeamId;
  const opponent = game && (isHome ? game.away : game.home);
  const isPlayed = game?.isPlayed ?? false;
  const userScore = isHome ? game?.homeScore : game?.awayScore;
  const opponentScore = isHome ? game?.awayScore : game?.homeScore;
  // A game counts once it kicks off: one in progress (from before a load, or a closed browser) can only be resumed,
  // and one already played in this career has its final put back
  const written = careerKey && opponent ? playedGames[lockKey(careerKey, currentYear, currentWeek, opponent.id)] : undefined;
  const inProgress = !isPlayed && written?.status === 'LIVE' ? written : undefined;
  const resultStands = isPlayed && lockNotice?.year === currentYear && lockNotice.week === currentWeek;
  const district = league ? findDistrict(league, userTeamId) : undefined;
  const region = league ? findRegion(league, userTeamId) : undefined;

  // No moving on with a decision open: every way forward takes the coach to the dilemma instead (lit up for a moment)
  const goToDecision = () => {
    const card = document.getElementById('agenda-dilemma');
    if (!card) return;
    card.scrollIntoView({ block: 'start' });
    card.classList.remove('agenda-flash');
    void card.offsetWidth; // restart the glow if it's still running
    card.classList.add('agenda-flash');
  };
  // The top bar's Advance on another screen, with something blocking: the same as Advance here. A moment later, so
  // the new screen's jump to the top (checked again at 150 ms) doesn't scroll the decision back out of sight
  useEffect(() => {
    if (!advanceRequest) return;
    const t = setTimeout(() => {
      onAdvanceHandled?.();
      handleAdvanceWeek();
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceRequest]);

  if (!userTeam) return <div>Loading Program Dashboard...</div>;
  const staffDue = coachingStaff.some((c) => needsSettling(c, currentWeek, currentYear));

  // Skipping an unplayed game auto-simulates it, so confirm first
  // Starters who could be ineligible: Team › Grades first (opening it is the week's review)
  function handleAdvanceWeek() {
    if (activeDilemma) goToDecision();
    else if (gradesBlocked) onNavigate('GRADES');
    else if (game && opponent && !isPlayed) setShowSimWarning(true);
    else advanceWeek();
  }
  const handleSimGame = () => (activeDilemma ? goToDecision() : gradesBlocked ? onNavigate('GRADES') : advanceWeek());

  return (
    <div className="ui-screen" style={{ maxWidth: '1000px' }}>
      {showSimWarning && opponent && inProgress && (
        <Sheet
          title="Game in progress"
          onClose={() => setShowSimWarning(false)}
          footer={
            <div className="ui-stack">
              <button
                className="ui-btn ui-btn-primary"
                onClick={() => {
                  setShowSimWarning(false);
                  onResumeGame();
                }}
              >
                ▶ Resume Game
              </button>
              <button className="ui-btn" onClick={() => setShowSimWarning(false)}>
                Cancel
              </button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: '15px', color: '#475569' }}>
            This week&apos;s game {isHome ? 'vs' : 'at'} <strong>{opponent.name}</strong> already kicked off. A game counts once it kicks off, so finish it
            before moving on.
          </p>
        </Sheet>
      )}
      {showSimWarning && opponent && !inProgress && (
        <Sheet
          title="Game not played yet"
          onClose={() => setShowSimWarning(false)}
          footer={
            <div className="ui-stack">
              {!benched && (
                <button
                  className="ui-btn ui-btn-primary"
                  onClick={() => {
                    setShowSimWarning(false);
                    setShowPreGameModal(true);
                  }}
                >
                  🏈 Play the Game
                </button>
              )}
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

      {showPreGameModal && opponent && !benched && (
        <PreGameStrategyModal
          userTeam={userTeam}
          opponentTeam={opponent}
          forecast={{ weather: 'CLEAR', temp: 68, wind: 8 }}
          onKickoff={(strategy) => {
            setShowPreGameModal(false);
            onLaunchGame(strategy.focusTarget, strategy.selectedOffScheme, strategy.speech);
          }}
          onCancel={() => setShowPreGameModal(false)}
        />
      )}

      {/* Header Banner: the team (Advance is in the top bar, on every screen) */}
      <div style={{ marginBottom: '20px' }}>
        <h1 className="ui-page-title" style={{ overflowWrap: 'anywhere' }} title={`${userTeam.name} ${userTeam.mascot}`}>
          {userTeam.name} {userTeam.mascot}
        </h1>
        <div style={{ color: '#6B7280', marginTop: '2px' }}>
          {district?.name ?? 'Class 6A'}
          {region ? ` · ${region.name}` : ''}
        </div>
      </div>

      {/* Staff contracts waiting on the coach come first; otherwise the staff's status follows the week's to-do list */}
      {staffDue && <StaffWindowCard onOpenStaff={() => onNavigate('STAFF')} />}

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
                result: isPlayed ? `${userScore! > opponentScore! ? 'Won' : 'Lost'} ${userScore}-${opponentScore} ${isHome ? 'vs' : 'at'} ${opponent.name}` : undefined,
                resultStands,
                benched,
                inProgress: inProgress && {
                  userScore: isHome ? inProgress.homeScore : inProgress.awayScore,
                  opponentScore: isHome ? inProgress.awayScore : inProgress.homeScore,
                  clock: liveClockLabel(inProgress)
                }
              }
            : null
        }
        onPlayGame={() => setShowPreGameModal(true)}
        onResumeGame={onResumeGame}
        onAutoSim={handleSimGame}
        onAdvanceWeek={handleAdvanceWeek}
        onNavigate={onNavigate}
        phaseLabel={SEASON_PHASE_LABELS[getSeasonPhase(currentWeek)].replace('District', rulesForState(league?.state).districtLabel)}
      />
      {!staffDue && <StaffWindowCard onOpenStaff={() => onNavigate('STAFF')} />}

    </div>
  );
};

