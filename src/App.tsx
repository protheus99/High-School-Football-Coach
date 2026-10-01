import React, { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { DashboardView, DefensiveFocus } from './components/DashboardView';
import { getTeamGameForWeek } from './sim/scheduleEngine';
import { RosterDepthChartView } from './components/RosterDepthChartView';
import { DistrictStandingsView } from './components/DistrictStandingsView';
import { FeedersScoutingView } from './components/FeedersScoutingView';
import { CoachesOfficeView } from './components/CoachesOfficeView';
import { NewsMediaView } from './components/NewsMediaView';
import { RankingsView } from './components/RankingsView';
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { LiveMatchScreen } from './components/LiveMatchScreen';
import { SaveLoadManagerModal } from './components/SaveLoadManagerModal';
import { StatePlayoffBracketModal } from './components/StatePlayoffBracketModal';
import { OffSeasonBanquetView } from './components/OffSeasonBanquetView';
import { AllStateAwardsModal } from './components/AllStateAwardsModal';
import { HallOfFameTrophyModal } from './components/HallOfFameTrophyModal';
import { PlayerDrillsModal } from './components/PlayerDrillsModal';
import { calculateSeasonAwards, SeasonAwardsRecord } from './sim/awardsEngine';
import { GameSimulationState, Player } from './types/game';

export const App: React.FC = () => {
  const [tab, setTab] = useState<'DASHBOARD' | 'ROSTER' | 'DISTRICT' | 'RANKINGS' | 'LEADERS' | 'FEEDERS' | 'NEWS' | 'OFFICE'>('DASHBOARD');
  const [activeMatch, setActiveMatch] = useState<GameSimulationState | null>(null);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [showTrophyModal, setShowTrophyModal] = useState(false);
  const [showDrillsModal, setShowDrillsModal] = useState(false);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<Player | null>(null);
  const [awardsRecord, setAwardsRecord] = useState<SeasonAwardsRecord | null>(null);

  const {
    startNewSeason,
    districtTeams,
    neighborDistrictTeams,
    seasonSchedule,
    userTeamId,
    currentWeek,
    currentYear,
    newsArticles,
    polls,
    playerRankings,
    playoffBracket,
    isBanquetActive,
    graduatingSeniors,
    transitionToNextYear,
    advancePlayoffGame,
    recordUserGame
  } = useGameStore();

  useEffect(() => {
    startNewSeason();
  }, [startNewSeason]);

  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  const FOCUS_TO_DEFENSIVE_CALL = { STOP_RUN: 'RUN_BLITZ', STOP_PASS: 'PASS_COVERAGE', BALANCED: 'BASE' } as const;

  const handleLaunchMatch = (focus: DefensiveFocus = 'BALANCED') => {
    if (!userTeam) return;
    const scheduled = getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
    if (!scheduled || scheduled.homeScore !== undefined) return;
    const allTeams = [...districtTeams, ...neighborDistrictTeams];
    const home = allTeams.find((t) => t.id === scheduled.homeTeamId);
    const away = allTeams.find((t) => t.id === scheduled.awayTeamId);
    if (!home || !away) return;

    const newGame: GameSimulationState = {
      gameId: scheduled.gameId,
      homeTeam: home,
      awayTeam: away,
      homeScore: 0,
      awayScore: 0,
      weather: 'CLEAR',
      temperatureFahrenheit: 68,
      windSpeedMph: 8,
      teamMomentum: 0,
      currentQuarter: 1,
      clockSecondsRemaining: 720,
      possessionTeamId: Math.random() < 0.5 ? home.id : away.id, // opening coin toss
      down: 1,
      distance: 10,
      yardLine: 25,
      isMercyRuleActive: false,
      isGameOver: false,
      eventLog: [],
      defensiveGamePlan: { [userTeam.id]: FOCUS_TO_DEFENSIVE_CALL[focus] }
    };

    setActiveMatch(newGame);
  };

  useEffect(() => {
    if (currentWeek === 19 && !awardsRecord && districtTeams.length > 0) {
      const calculated = calculateSeasonAwards(currentYear, districtTeams);
      setAwardsRecord(calculated);
    }
  }, [currentWeek, awardsRecord, districtTeams, currentYear]);

  // Render Postseason Tournament Modal
  if (playoffBracket && showBracketModal) {
    return (
      <StatePlayoffBracketModal
        bracketState={playoffBracket}
        userTeamId={userTeamId}
        onClose={() => setShowBracketModal(false)}
        onLaunchPlayoffGame={(node) => {
          setShowBracketModal(false);
          setActiveMatch({
            gameId: `po_gm_${Date.now()}`,
            homeTeam: node.team1,
            awayTeam: node.team2,
            homeScore: 0,
            awayScore: 0,
            weather: 'CLEAR',
            temperatureFahrenheit: 54,
            windSpeedMph: 12,
            teamMomentum: 0,
            currentQuarter: 1,
            clockSecondsRemaining: 720,
            possessionTeamId: node.team1.id,
            down: 1,
            distance: 10,
            yardLine: 25,
            isMercyRuleActive: false,
            isGameOver: false,
            eventLog: []
          });
        }}
      />
    );
  }

  // Render All-State Awards Modal
  if (awardsRecord) {
    return (
      <AllStateAwardsModal
        awards={awardsRecord}
        onClose={() => setAwardsRecord(null)}
      />
    );
  }

  // Render Off-Season Banquet Screen
  if (isBanquetActive && userTeam) {
    return (
      <OffSeasonBanquetView
        userTeam={userTeam}
        graduatingSeniors={graduatingSeniors}
        onStartNextYear={() => {
          setAwardsRecord(null);
          transitionToNextYear();
        }}
      />
    );
  }

  // Render Active Match Screen
  if (activeMatch) {
    return (
      <LiveMatchScreen
        initialState={activeMatch}
        userTeamId={userTeamId}
        onExit={(finalState) => {
          recordUserGame(finalState);
          if (playoffBracket) {
            advancePlayoffGame({ homeScore: finalState.homeScore, awayScore: finalState.awayScore });
          }
          setActiveMatch(null);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
      {showSaveLoadModal && <SaveLoadManagerModal onClose={() => setShowSaveLoadModal(false)} />}
      {showDrillsModal && userTeam && (
        <PlayerDrillsModal roster={userTeam.roster} onClose={() => setShowDrillsModal(false)} />
      )}
      {showTrophyModal && userTeam && (
        <HallOfFameTrophyModal
          trophies={[{ year: currentYear - 1, type: 'DISTRICT_TITLE', name: 'District 26-6A Trophy' }]}
          alumniSigningsCount={4}
          schoolPrestige={userTeam.prestige}
          onClose={() => setShowTrophyModal(false)}
        />
      )}
      {selectedPlayerDetail && (
        <PlayerDetailModal player={selectedPlayerDetail} onClose={() => setSelectedPlayerDetail(null)} />
      )}

      {/* Top Navigation Bar */}
      <div style={{ background: '#0F172A', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>🏈 HIGH SCHOOL FOOTBALL HEAD COACH</span>
          <span style={{ marginLeft: '12px', fontSize: '13px', color: '#94A3B8' }}>{currentYear} Season</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowDrillsModal(true)}
            style={{ padding: '6px 12px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            🏋️ Drills
          </button>
          <button
            onClick={() => setShowTrophyModal(true)}
            style={{ padding: '6px 12px', background: '#D97706', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            🏆 Trophies
          </button>
          {playoffBracket && (
            <button
              onClick={() => setShowBracketModal(true)}
              style={{ padding: '6px 12px', background: '#F59E0B', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              🏆 Bracket
            </button>
          )}
          <button
            onClick={() => setShowSaveLoadModal(true)}
            style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            ⚙️ Save / Load
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div style={{ flex: 1, paddingBottom: '60px' }}>
        {tab === 'DASHBOARD' && <DashboardView onLaunchGame={handleLaunchMatch} />}
        {tab === 'ROSTER' && <RosterDepthChartView />}
        {tab === 'DISTRICT' && <DistrictStandingsView />}
        {tab === 'RANKINGS' && polls && <RankingsView polls={polls} userTeamId={userTeamId} />}
        {tab === 'LEADERS' && playerRankings && (
          <PlayerLeaderboardView
            rankingsState={playerRankings}
            userTeamId={userTeamId}
            onSelectPlayer={(entry) => setSelectedPlayerDetail(entry.player)}
          />
        )}
        {tab === 'FEEDERS' && <FeedersScoutingView />}
        {tab === 'NEWS' && <NewsMediaView articles={newsArticles} />}
        {tab === 'OFFICE' && <CoachesOfficeView />}
      </div>

      {/* Persistent Bottom Tab Navigation */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-around', padding: '10px 0', zIndex: 100 }}>
        <button onClick={() => setTab('DASHBOARD')} style={navBtnStyle(tab === 'DASHBOARD')}>📊 Dashboard</button>
        <button onClick={() => setTab('ROSTER')} style={navBtnStyle(tab === 'ROSTER')}>📋 Roster</button>
        <button onClick={() => setTab('DISTRICT')} style={navBtnStyle(tab === 'DISTRICT')}>🏆 District</button>
        <button onClick={() => setTab('RANKINGS')} style={navBtnStyle(tab === 'RANKINGS')}>🥇 Polls</button>
        <button onClick={() => setTab('LEADERS')} style={navBtnStyle(tab === 'LEADERS')}>🌟 Leaders</button>
        <button onClick={() => setTab('FEEDERS')} style={navBtnStyle(tab === 'FEEDERS')}>🔍 Feeders</button>
        <button onClick={() => setTab('NEWS')} style={navBtnStyle(tab === 'NEWS')}>📰 News</button>
        <button onClick={() => setTab('OFFICE')} style={navBtnStyle(tab === 'OFFICE')}>🏢 Office</button>
      </div>
    </div>
  );
};

const navBtnStyle = (active: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  fontWeight: active ? 'bold' : 'normal',
  color: active ? '#2563EB' : '#64748B',
  cursor: 'pointer',
  fontSize: '13px'
});
