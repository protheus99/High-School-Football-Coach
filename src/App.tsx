import React, { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { DashboardView, DefensiveFocus } from './components/DashboardView';
import { getUserMatchup } from './sim/userMatchup';
import { FeedersScoutingView } from './components/FeedersScoutingView';
import { NewsMediaView } from './components/NewsMediaView';
import { TeamView, TeamSection } from './components/TeamView';
import { RankingsHub, RankingsSection } from './components/RankingsHub';
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { LiveMatchScreen } from './components/LiveMatchScreen';
import { SaveLoadManagerModal } from './components/SaveLoadManagerModal';
import { CoachRPGSkillTreeModal } from './components/CoachRPGSkillTreeModal';
import { formatCP } from './sim/coachPoints';
import { SplashScreen } from './components/SplashScreen';
import { StatePlayoffBracketModal } from './components/StatePlayoffBracketModal';
import { OffSeasonBanquetView } from './components/OffSeasonBanquetView';
import { AllStateAwardsModal } from './components/AllStateAwardsModal';
import { calculateSeasonAwards, SeasonAwardsRecord } from './sim/awardsEngine';
import { GameSimulationState, OffensiveScheme, Player } from './types/game';

type AppTab = 'DASHBOARD' | 'TEAM' | 'RANKINGS' | 'LEADERS' | 'FEEDERS' | 'NEWS';

/** Bottom tab bar (News lives in the top bar). */
const NAV_TABS: { id: AppTab; icon: string; label: string }[] = [
  { id: 'DASHBOARD', icon: '📊', label: 'Dashboard' },
  { id: 'TEAM', icon: '🧢', label: 'Team' },
  { id: 'RANKINGS', icon: '🏆', label: 'Rankings' },
  { id: 'LEADERS', icon: '🌟', label: 'Leaders' },
  { id: 'FEEDERS', icon: '🔍', label: 'Feeders' }
];

export const App: React.FC = () => {
  const [tab, setTab] = useState<AppTab>('DASHBOARD');
  const [teamSection, setTeamSection] = useState<TeamSection>('ROSTER');
  const [rankingsSection, setRankingsSection] = useState<RankingsSection>('HOME');
  const [activeMatch, setActiveMatch] = useState<GameSimulationState | null>(null);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [showTalents, setShowTalents] = useState(false);
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
    coachPoints,
    currentYear,
    newsArticles,
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
      {selectedPlayerDetail && (
        <PlayerDetailModal
          player={selectedPlayerDetail}
          isOwnPlayer={!!userTeam?.roster.some((p) => p.id === selectedPlayerDetail.id)}
          teamName={leagueTeams.find((t) => t.roster.some((p) => p.id === selectedPlayerDetail.id))?.name}
          onClose={() => setSelectedPlayerDetail(null)}
        />
      )}

      {showTalents && <CoachRPGSkillTreeModal onClose={() => setShowTalents(false)} />}

      {/* Top Navigation Bar */}
      <div className="app-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{ fontSize: '14px', color: '#CBD5E1', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {currentYear} · Wk {currentWeek}
          </div>
          {/* Coach Points: the one currency. Tap to spend it on coach talents. */}
          <button
            onClick={() => setShowTalents(true)}
            aria-label={`Coach Points: ${coachPoints}. Open coach talents`}
            title="Coach Points"
            style={{ ...topBtn('#FACC15'), color: '#0F172A', padding: '6px 10px', whiteSpace: 'nowrap' }}
          >
            {formatCP(coachPoints)}
          </button>
          {userTeam && (
            <span
              title="Program prestige"
              aria-label={`Prestige ${userTeam.prestige}`}
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: '40px', padding: '0 8px', borderRadius: '6px', background: '#334155', color: '#fff', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
            >
              ⭐ {userTeam.prestige}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setTab('NEWS')} aria-label="News" title="News" style={topBtn(tab === 'NEWS' ? '#2563EB' : '#334155')}>
            📰 <span className="hide-sm">News</span>
          </button>
          {playoffBracket && (
            <button onClick={() => setShowBracketModal(true)} aria-label="Bracket" title="Bracket" style={{ ...topBtn('#F59E0B'), color: '#000' }}>
              🗓️ <span className="hide-sm">Bracket</span>
            </button>
          )}
          <button onClick={() => setShowSaveLoadModal(true)} aria-label="Save / Load" title="Save / Load" style={topBtn('#334155')}>
            ⚙️ <span className="hide-sm">Save / Load</span>
          </button>
          <button onClick={() => setShowMenu(true)} aria-label="Main Menu" title="Main Menu" style={{ ...topBtn('#1E293B'), border: '1px solid #475569' }}>
            🏠 <span className="hide-sm">Menu</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div style={{ flex: 1, paddingBottom: '72px' }}>
        {tab === 'DASHBOARD' && (
          <DashboardView
            onLaunchGame={handleLaunchMatch}
            onNavigate={(target) => {
              if (target === 'FEEDERS') setTab('FEEDERS');
              else if (target === 'DISTRICT') {
                setRankingsSection('DISTRICT');
                setTab('RANKINGS');
              } else {
                setTeamSection(target);
                setTab('TEAM');
              }
            }}
          />
        )}
        {tab === 'TEAM' && <TeamView section={teamSection} onSection={setTeamSection} />}
        {tab === 'RANKINGS' && <RankingsHub section={rankingsSection} onSection={setRankingsSection} />}
        {tab === 'LEADERS' && playerRankings && (
          <PlayerLeaderboardView rankingsState={playerRankings} userTeamId={userTeamId} onSelectPlayer={(entry) => setSelectedPlayerDetail(entry.player)} />
        )}
        {tab === 'FEEDERS' && <FeedersScoutingView />}
        {tab === 'NEWS' && <NewsMediaView articles={newsArticles} />}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="app-tabbar" aria-label="Main sections">
        {NAV_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id === 'RANKINGS') setRankingsSection('HOME');
            }}
            aria-current={tab === t.id ? 'page' : undefined}
            style={navBtnStyle(tab === t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

const topBtn = (background: string): React.CSSProperties => ({
  minHeight: '40px',
  minWidth: '40px',
  padding: '6px 12px',
  background,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold'
});

const navBtnStyle = (active: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  fontWeight: active ? 'bold' : 'normal',
  color: active ? '#2563EB' : '#64748B',
  cursor: 'pointer'
});
