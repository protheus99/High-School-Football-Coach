import React, { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { DashboardView, DefensiveFocus } from './components/DashboardView';
import { getUserMatchup } from './sim/userMatchup';
import { RosterDepthChartView } from './components/RosterDepthChartView';
import { DistrictStandingsView } from './components/DistrictStandingsView';
import { FeedersScoutingView } from './components/FeedersScoutingView';
import { CollegeRecruitingView } from './components/CollegeRecruitingView';
import { CoachesOfficeView } from './components/CoachesOfficeView';
import { NewsMediaView } from './components/NewsMediaView';
import { RankingsView } from './components/RankingsView';
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { LiveMatchScreen } from './components/LiveMatchScreen';
import { SaveLoadManagerModal } from './components/SaveLoadManagerModal';
import { SplashScreen } from './components/SplashScreen';
import { StatePlayoffBracketModal } from './components/StatePlayoffBracketModal';
import { OffSeasonBanquetView } from './components/OffSeasonBanquetView';
import { AllStateAwardsModal } from './components/AllStateAwardsModal';
import { HallOfFameTrophyModal } from './components/HallOfFameTrophyModal';
import { PlayerDrillsModal } from './components/PlayerDrillsModal';
import { calculateSeasonAwards, SeasonAwardsRecord } from './sim/awardsEngine';
import { GameSimulationState, OffensiveScheme, Player } from './types/game';

export const App: React.FC = () => {
  const [tab, setTab] = useState<'DASHBOARD' | 'ROSTER' | 'DISTRICT' | 'RANKINGS' | 'LEADERS' | 'FEEDERS' | 'COLLEGE' | 'NEWS' | 'OFFICE'>('DASHBOARD');
  const [activeMatch, setActiveMatch] = useState<GameSimulationState | null>(null);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [showTrophyModal, setShowTrophyModal] = useState(false);
  const [showDrillsModal, setShowDrillsModal] = useState(false);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<Player | null>(null);
  const [awardsRecord, setAwardsRecord] = useState<SeasonAwardsRecord | null>(null);
  const [awardsShownForYear, setAwardsShownForYear] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(true); // title screen until a game is started or loaded

  const {
    league,
    districtTeams,
    leagueTeams,
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

  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  const FOCUS_TO_DEFENSIVE_CALL = { STOP_RUN: 'RUN_BLITZ', STOP_PASS: 'PASS_COVERAGE', BALANCED: 'BASE' } as const;

  const handleLaunchMatch = (focus: DefensiveFocus = 'BALANCED', offensiveScheme?: OffensiveScheme) => {
    if (!userTeam) return;
    // This week's game: the scheduled game, or the current playoff game
    const matchup = getUserMatchup({ currentWeek, seasonSchedule, leagueTeams, userTeamId, playoffBracket });
    if (!matchup || matchup.isPlayed) return;
    const { home, away } = matchup;

    const newGame: GameSimulationState = {
      gameId: matchup.gameId,
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
      defensiveGamePlan: { [userTeam.id]: FOCUS_TO_DEFENSIVE_CALL[focus] },
      offensiveGamePlan: { [userTeam.id]: offensiveScheme ?? userTeam.schemeOffense }
    };

    setActiveMatch(newGame);
  };

  useEffect(() => {
    // Show the season's awards once at the banquet; closing the modal must not re-trigger it
    if (isBanquetActive && awardsShownForYear !== currentYear && leagueTeams.length > 0) {
      const calculated = calculateSeasonAwards(currentYear, leagueTeams);
      setAwardsRecord(calculated);
      setAwardsShownForYear(currentYear);
    }
  }, [isBanquetActive, awardsShownForYear, leagueTeams, currentYear]);

  // Title screen: new game, continue, or load a save
  if (showMenu) {
    return (
      <SplashScreen
        canContinue={league !== null}
        onEnterGame={() => {
          setShowMenu(false);
          setTab('DASHBOARD');
          setActiveMatch(null);
          setShowSaveLoadModal(false);
          setAwardsRecord(null);
        }}
      />
    );
  }

  // Render Postseason Tournament Modal
  if (playoffBracket && showBracketModal) {
    return (
      <StatePlayoffBracketModal
        bracketState={playoffBracket}
        userTeamId={userTeamId}
        onClose={() => setShowBracketModal(false)}
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
        <PlayerDrillsModal onClose={() => setShowDrillsModal(false)} />
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
        <PlayerDetailModal
          player={selectedPlayerDetail}
          isOwnPlayer={!!userTeam?.roster.some((p) => p.id === selectedPlayerDetail.id)}
          teamName={leagueTeams.find((t) => t.roster.some((p) => p.id === selectedPlayerDetail.id))?.name}
          onClose={() => setSelectedPlayerDetail(null)}
        />
      )}

      {/* Top Navigation Bar */}
      <div className="app-topbar">
        <div>
          <span className="app-title">
            🏈 <span className="hide-sm">HIGH SCHOOL FOOTBALL HEAD COACH</span>
            <span className="show-sm">HS Football Coach</span>
          </span>
          <span style={{ marginLeft: '12px', fontSize: '13px', color: '#94A3B8' }}>{currentYear} Season</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowDrillsModal(true)}
            aria-label="Practice plan"
            title="Practice plan"
            style={{ padding: '6px 12px', background: '#10B981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            🏋️ <span className="hide-sm">Practice</span>
          </button>
          <button
            onClick={() => setShowTrophyModal(true)}
            aria-label="Trophies"
            title="Trophies"
            style={{ padding: '6px 12px', background: '#D97706', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            🏆 <span className="hide-sm">Trophies</span>
          </button>
          {playoffBracket && (
            <button
              onClick={() => setShowBracketModal(true)}
              aria-label="Bracket"
              title="Bracket"
              style={{ padding: '6px 12px', background: '#F59E0B', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              🏆 <span className="hide-sm">Bracket</span>
            </button>
          )}
          <button
            onClick={() => setShowSaveLoadModal(true)}
            aria-label="Save / Load"
            title="Save / Load"
            style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            ⚙️ <span className="hide-sm">Save / Load</span>
          </button>
          <button
            onClick={() => setShowMenu(true)}
            aria-label="Main Menu"
            title="Main Menu"
            style={{ padding: '6px 12px', background: '#1E293B', color: '#fff', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            🏠 <span className="hide-sm">Main Menu</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div style={{ flex: 1, paddingBottom: '60px' }}>
        {tab === 'DASHBOARD' && (
          <DashboardView onLaunchGame={handleLaunchMatch} onNavigate={(t) => setTab(t)} onOpenPracticePlan={() => setShowDrillsModal(true)} />
        )}
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
        {tab === 'COLLEGE' && <CollegeRecruitingView />}
        {tab === 'NEWS' && <NewsMediaView articles={newsArticles} />}
        {tab === 'OFFICE' && <CoachesOfficeView />}
      </div>

      {/* Persistent Bottom Tab Navigation */}
      <nav className="app-tabbar" aria-label="Main sections">
        <button onClick={() => setTab('DASHBOARD')} style={navBtnStyle(tab === 'DASHBOARD')}>
          <span className="tab-icon">📊</span>
          <span>Dashboard</span>
        </button>
        <button onClick={() => setTab('ROSTER')} style={navBtnStyle(tab === 'ROSTER')}>
          <span className="tab-icon">📋</span>
          <span>Roster</span>
        </button>
        <button onClick={() => setTab('DISTRICT')} style={navBtnStyle(tab === 'DISTRICT')}>
          <span className="tab-icon">🏆</span>
          <span>District</span>
        </button>
        <button onClick={() => setTab('RANKINGS')} style={navBtnStyle(tab === 'RANKINGS')}>
          <span className="tab-icon">🥇</span>
          <span>Polls</span>
        </button>
        <button onClick={() => setTab('LEADERS')} style={navBtnStyle(tab === 'LEADERS')}>
          <span className="tab-icon">🌟</span>
          <span>Leaders</span>
        </button>
        <button onClick={() => setTab('FEEDERS')} style={navBtnStyle(tab === 'FEEDERS')}>
          <span className="tab-icon">🔍</span>
          <span>Feeders</span>
        </button>
        <button onClick={() => setTab('COLLEGE')} style={navBtnStyle(tab === 'COLLEGE')}>
          <span className="tab-icon">🎓</span>
          <span>College</span>
        </button>
        <button onClick={() => setTab('NEWS')} style={navBtnStyle(tab === 'NEWS')}>
          <span className="tab-icon">📰</span>
          <span>News</span>
        </button>
        <button onClick={() => setTab('OFFICE')} style={navBtnStyle(tab === 'OFFICE')}>
          <span className="tab-icon">🏢</span>
          <span>Office</span>
        </button>
      </nav>
    </div>
  );
};

const navBtnStyle = (active: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  fontWeight: active ? 'bold' : 'normal',
  color: active ? '#2563EB' : '#64748B',
  cursor: 'pointer'
});
