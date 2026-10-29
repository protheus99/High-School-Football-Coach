import React, { useState, useEffect } from 'react';
import { useScrollTopOnScreenChange } from './utils/pageScroll';
import { useGameStore } from './store/gameStore';
import { DashboardView } from './components/DashboardView';
import { DefensiveFocus, FOCUS_CALL } from './sim/gamePlan';
import { getUserMatchup } from './sim/userMatchup';
import { FeederSection, FeedersScoutingView } from './components/FeedersScoutingView';
import { NewsMediaView } from './components/NewsMediaView';
import { TeamView, TeamSection } from './components/TeamView';
import { RankingsHub, RankingsSection } from './components/RankingsHub';
import { CareerCompleteView } from './components/CareerCompleteView';
import { ComplianceDecisionSheet } from './components/ComplianceSheets';
import { showNowPlaying } from './utils/nowPlayingRequests';
import { BackToTop } from './components/ui/BackToTop';
import { musicPlayer } from './utils/musicPlayer';
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { TeamProfileSheet } from './components/TeamProfileSheet';
import { LiveMatchScreen } from './components/LiveMatchScreen';
import { SaveLoadManagerModal } from './components/SaveLoadManagerModal';
import { CoachRPGSkillTreeModal } from './components/CoachRPGSkillTreeModal';
import { programRating } from './sim/programMeters';
import { SplashScreen } from './components/SplashScreen';
import { OffSeasonBanquetView } from './components/OffSeasonBanquetView';
import { AllStateHonorsPage } from './components/AllStateHonorsPage';
import { calculateSeasonAwards, SeasonAwardsRecord, topPerformers } from './sim/awardsEngine';
import { GameSimulationState, OffensiveScheme } from './types/game';
import { rulesForState } from './sim/stateRules';
import { DucatCheckoutSheet } from './components/DucatStore';
import { returnedFromCheckout } from './services/ducats';
import { ADVANCE_LABEL, advanceBlocker } from './sim/advanceGate';
import { isCoachBenched } from './sim/billyMartin';
import { FiredScreen } from './components/FiredScreen';
import { track } from './services/analytics';
import { AUTOSAVE_ID, loadSaveGame } from './services/db';
import { loadLiveState } from './services/playedGames';
import { lockKey } from './sim/gameLock';
import { Sheet } from './components/ui/Sheet';
import { CoachPointsBadge, DucatChip } from './components/CurrencyFloats';

type AppTab = 'DASHBOARD' | 'TEAM' | 'RANKINGS' | 'LEADERS' | 'FEEDERS' | 'NEWS';

/** Bottom tab bar (News lives in the top bar). */
const NAV_TABS: { id: AppTab; icon: string; label: string }[] = [
  { id: 'DASHBOARD', icon: '🧭', label: 'Hub' },
  { id: 'TEAM', icon: '🧢', label: 'Team' },
  { id: 'RANKINGS', icon: '🏆', label: 'Rankings' },
  { id: 'LEADERS', icon: '🌟', label: 'Leaders' },
  { id: 'FEEDERS', icon: '🔍', label: 'Prospects' }
];

export const App: React.FC = () => {
  const [tab, setTab] = useState<AppTab>('DASHBOARD');
  const [teamSection, setTeamSection] = useState<TeamSection>('ROSTER');
  const [feederSection, setFeederSection] = useState<FeederSection>('STUDENTS');
  const [rankingsSection, setRankingsSection] = useState<RankingsSection>('DISTRICT');
  const [activeMatch, setActiveMatch] = useState<GameSimulationState | null>(null);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showTalents, setShowTalents] = useState(false);
  const [collegeFocusId, setCollegeFocusId] = useState<string | null>(null); // the College page opens on this player
  const [awardsRecord, setAwardsRecord] = useState<SeasonAwardsRecord | null>(null);
  const [awardsShownForYear, setAwardsShownForYear] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(true); // title screen until a game is started or loaded
  // Advance from the top bar while something blocks the week: the Hub takes over (the decision, or the game's choice)
  const [advanceRequest, setAdvanceRequest] = useState(0);

  const {
    league,
    districtTeams,
    leagueTeams,
    nationalLeagues,
    seasonSchedule,
    userTeamId,
    currentWeek,
    coachPoints,
    currentYear,
    newsArticles,
    playerRankings,
    playoffBracket,
    isBanquetActive,
    firedFrom,
    firedForMisconduct,
    careerComplete,
    career,
    viewedTeamId,
    openTeamProfile,
    viewedPlayerId,
    openPlayerCard,
    updatePlayerTier,
    graduatingSeniors,
    finishBanquet,
    advancePlayoffGame,
    recordUserGame,
    markGameFinal,
    lockNotice,
    dismissLockNotice,
    markNewsSeen,
    careerKey
  } = useGameStore();
  // Every new screen opens at the top (a tab, a section, the menu, a game, the wrap-up pages)
  useScrollTopOnScreenChange(
    [showMenu, tab, teamSection, rankingsSection, feederSection, !!activeMatch, isBanquetActive, !!awardsRecord, careerComplete, firedFrom].join('|')
  );
  const openNews = () => {
    markNewsSeen();
    setTab('NEWS');
  };

  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  // The open player card: a player in the league or another state's (stat leaders)
  const viewedPlayer = (() => {
    if (!viewedPlayerId) return null;
    for (const team of [...leagueTeams, ...nationalLeagues.flatMap((l) => l.teams)]) {
      const player = team.roster.find((p) => p.id === viewedPlayerId);
      if (player) return { player, team };
    }
    return null;
  })();

  const handleLaunchMatch = (focus: DefensiveFocus = 'BALANCED', offensiveScheme?: OffensiveScheme) => {
    if (!userTeam) return;
    // A suspended coach doesn't coach: his coordinator's games are simulated
    if (isCoachBenched(useGameStore.getState().coachBench, currentYear)) return;
    // This week's game: the scheduled game, or the current playoff game
    const matchup = getUserMatchup({ currentWeek, seasonSchedule, leagueTeams, userTeamId, playoffBracket, nationalLeagues });
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
      // Balanced: the staff calls the defense by down and distance (no fixed call)
      ...(FOCUS_CALL[focus] && { defensiveGamePlan: { [userTeam.id]: FOCUS_CALL[focus]! } }),
      offensiveGamePlan: { [userTeam.id]: offensiveScheme ?? userTeam.schemeOffense },
      secondStringLead: { [userTeam.id]: useGameStore.getState().secondStringLead }
    };

    // A game counts once it kicks off: it's written down outside the saves right away
    useGameStore.getState().markGameLive(newGame, true);
    setActiveMatch(newGame);
  };

  // Advance from any screen: straight on when nothing blocks the week; otherwise the Hub, which shows the decision or
  // the game's choice (play it, auto-sim it, or resume it)
  const blocker = advanceBlocker(useGameStore.getState());
  const advanceFace = ADVANCE_LABEL[blocker ?? 'CLEAR'];
  const handleTopAdvance = () => {
    if (!blocker) {
      useGameStore.getState().advanceWeek();
      return;
    }
    // Starters who could be ineligible: straight to Team › Grades (opening it is the week's review)
    if (blocker === 'GRADES') {
      setTeamSection('GRADES');
      setTab('TEAM');
      return;
    }
    setTab('DASHBOARD');
    setAdvanceRequest((n) => n + 1);
  };

  // A game that kicked off before this save was loaded (or before the browser closed): back where it left off
  const handleResumeMatch = async () => {
    const s = useGameStore.getState();
    const matchup = getUserMatchup(s);
    if (!matchup || matchup.isPlayed || !s.careerKey) return;
    const opponentId = matchup.home.id === s.userTeamId ? matchup.away.id : matchup.home.id;
    const saved = await loadLiveState(lockKey(s.careerKey, s.currentYear, s.currentWeek, opponentId));
    if (saved) setActiveMatch(saved);
    else handleLaunchMatch(); // nothing stored on this device (storage cleared): a fresh kickoff
  };

  // Back from Stripe's checkout (a page load): reopen the game where the coach left it, on the Staff screen
  useEffect(() => {
    if (!returnedFromCheckout()) return;
    void loadSaveGame(AUTOSAVE_ID).then((save) => {
      if (!save) return;
      useGameStore.getState().loadGame(save);
      setTeamSection('STAFF');
      setTab('TEAM');
      setShowMenu(false);
    });
  }, []);

  // The soundtrack plays everywhere but a live game, which has its own sound effects
  useEffect(() => musicPlayer.setInGame(!!activeMatch), [activeMatch]);

  // Game events: each screen the coach opens (the tab and its section), once a game is on
  const section = tab === 'TEAM' ? teamSection : tab === 'FEEDERS' ? feederSection : tab === 'RANKINGS' ? rankingsSection : undefined;
  const inMatch = !!activeMatch;
  useEffect(() => {
    if (!showMenu && !inMatch) track('open_screen', { screen: tab, section });
  }, [tab, section, showMenu, inMatch]);

  useEffect(() => {
    // Show the season's awards once at the banquet; closing the modal must not re-trigger it
    if (isBanquetActive && awardsShownForYear !== currentYear && leagueTeams.length > 0) {
      // Decided when the banquet opened (a save loaded at the banquet works them out again)
      setAwardsRecord(useGameStore.getState().seasonAwards ?? calculateSeasonAwards(currentYear, leagueTeams, playoffBracket));
      setAwardsShownForYear(currentYear);
    }
  }, [isBanquetActive, awardsShownForYear, leagueTeams, currentYear, playoffBracket]);

  // Title screen: new game, continue, or load a save
  if (showMenu) {
    return (
      <>
        <DucatCheckoutSheet />
        <SplashScreen
          canContinue={league !== null && !firedFrom && !careerComplete}
          onEnterGame={() => {
            setShowMenu(false);
            setTab('DASHBOARD');
            setActiveMatch(null);
            setShowSaveLoadModal(false);
            setAwardsRecord(null);
          }}
        />
      </>
    );
  }

  // Fired by the school board (its season review, or the 3rd strike): game over for this save
  if (firedFrom) {
    return <FiredScreen school={firedFrom} misconduct={firedForMisconduct} career={career} onMainMenu={() => setShowMenu(true)} />;
  }

  // The contract's last season is done: the Hall of Fame score, then extend, move on, or leave the world
  if (careerComplete && career) {
    return <CareerCompleteView onMainMenu={() => setShowMenu(true)} />;
  }

  // The season wrap-up, step 1: the state's All-State honors
  if (awardsRecord && userTeam) {
    return (
      <AllStateHonorsPage
        awards={awardsRecord}
        userTeam={userTeam}
        stateName={league ? `${league.state ?? 'Texas'} ${rulesForState(league.state).classification}` : 'The state'}
        performers={topPerformers(userTeam, leagueTeams, awardsRecord)}
        onContinue={() => {
          setAwardsRecord(null);
          document.getElementById('root')?.scrollTo({ top: 0 });
        }}
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
          finishBanquet();
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
          markGameFinal(finalState);
          if (playoffBracket) {
            advancePlayoffGame({ homeScore: finalState.homeScore, awayScore: finalState.awayScore });
          }
          setActiveMatch(null);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
      {showSaveLoadModal && (
        <SaveLoadManagerModal
          onClose={() => setShowSaveLoadModal(false)}
          onMainMenu={() => {
            setShowSaveLoadModal(false);
            setShowMenu(true);
          }}
        />
      )}
      {viewedTeamId && <TeamProfileSheet teamId={viewedTeamId} onClose={() => openTeamProfile(null)} onOpenPlayer={(p) => openPlayerCard(p.id)} />}
      {viewedPlayer && (
        <PlayerDetailModal
          player={viewedPlayer.player}
          isOwnPlayer={viewedPlayer.team.id === userTeamId}
          teamName={viewedPlayer.team.name}
          onSetString={viewedPlayer.team.id === userTeamId ? (tier) => updatePlayerTier(viewedPlayer.player.id, tier) : undefined}
          onOpenRecruiting={
            viewedPlayer.team.id === userTeamId && (viewedPlayer.player.classYear === 'Junior' || viewedPlayer.player.classYear === 'Senior')
              ? () => {
                  openPlayerCard(null);
                  setCollegeFocusId(viewedPlayer.player.id);
                  setTeamSection('COLLEGE');
                  setTab('TEAM');
                }
              : undefined
          }
          onClose={() => openPlayerCard(null)}
        />
      )}

      {showTalents && <CoachRPGSkillTreeModal onClose={() => setShowTalents(false)} />}
      <ComplianceDecisionSheet />
      {lockNotice && !lockNotice.seen && lockNotice.year === currentYear && lockNotice.week === currentWeek && (
        <Sheet title="This game was already played" onClose={dismissLockNotice} footer={<button className="ui-btn ui-btn-primary ui-btn-block" onClick={dismissLockNotice}>Got it</button>}>
          <p style={{ margin: 0, fontSize: '14.5px', color: '#334155' }}>
            You played Week {lockNotice.week} against {lockNotice.opponentName} and {lockNotice.userScore > lockNotice.opponentScore ? 'won' : 'lost'} {lockNotice.userScore}-{lockNotice.opponentScore}. A game
            counts once it kicks off, so the result stands. Everything else this week is yours to redo.
          </p>
        </Sheet>
      )}
      <DucatCheckoutSheet />

      {/* Top Navigation Bar */}
      <div className="app-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
          {/* Coach Points: a spend floats up in red and the badge squeezes and counts down (CurrencyFloats) */}
          <CoachPointsBadge
            coachPoints={coachPoints}
            resetKey={careerKey ?? ''}
            style={{ ...topBtn(coachPoints < 0 ? '#DC2626' : '#FACC15'), ...statStack, color: coachPoints < 0 ? '#fff' : '#0F172A', padding: '2px 5px', cursor: 'default' }}
            labelStyle={statLabel}
          />
          {userTeam && (
            // Ducats have no badge: one slides in over Prestige and Rating while they're spent
            <span className="ducat-chip-slot">
              <span title="Program prestige" aria-label={`Prestige ${userTeam.prestige}`} style={{ ...topPill, ...statStack }}>
                ⭐ {userTeam.prestige}
                <span style={statLabel}>Prestige</span>
              </span>
              <span title="Program rating" aria-label={`Rating ${programRating(userTeam)}`} style={{ ...topPill, ...statStack }}>
                📊 {programRating(userTeam)}
                <span style={statLabel}>Rating</span>
              </span>
              <DucatChip />
            </span>
          )}
        </div>
        {/* Narrow icon buttons (full height for thumbs) keep the bar to one line; Advance, in the corner, on every screen */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap', flex: '0 0 auto', alignItems: 'center' }}>
          {/* Music: brings up the Now Playing pop-up (mute and next song) */}
          <button onClick={showNowPlaying} aria-label="Music" title="Music: mute or next song" style={iconBtn('#334155')}>
            🎵 <span className="hide-sm">Music</span>
          </button>
          <button onClick={() => setShowSaveLoadModal(true)} aria-label="Settings" title="Settings: music, saves, main menu" style={iconBtn('#334155')}>
            ⚙️ <span className="hide-sm">Settings</span>
          </button>
          <button onClick={handleTopAdvance} aria-label={advanceFace.title} title={advanceFace.title} style={advanceBtn(blocker)}>
            {advanceFace.label}
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div style={{ flex: 1, paddingBottom: '88px' }}>
        {tab === 'DASHBOARD' && (
          <DashboardView
            onLaunchGame={handleLaunchMatch}
            onResumeGame={() => void handleResumeMatch()}
            advanceRequest={advanceRequest}
            onAdvanceHandled={() => setAdvanceRequest(0)}
            onNavigate={(target) => {
              if (target === 'FEEDERS' || target === 'FEEDER_PROGRAMS' || target === 'FEEDER_NEEDS') {
                setFeederSection(target === 'FEEDER_PROGRAMS' ? 'PROGRAMS' : target === 'FEEDER_NEEDS' ? 'NEEDS' : 'STUDENTS');
                setTab('FEEDERS');
              } else if (target === 'SCOREBOARD') {
                setRankingsSection('SCORES');
                setTab('RANKINGS');
              } else if (target === 'DISTRICT' || target === 'POLLS' || target === 'PLAYOFFS') {
                setRankingsSection(target);
                setTab('RANKINGS');
              } else if (target === 'NEWS') {
                openNews();
              } else if (target === 'TALENTS') {
                setShowTalents(true);
              } else {
                setTeamSection(target);
                setTab('TEAM');
              }
            }}
          />
        )}
        {tab === 'TEAM' && <TeamView
            section={teamSection}
            onSection={(section) => {
              setCollegeFocusId(null);
              setTeamSection(section);
            }}
            collegeFocusId={collegeFocusId}
          />}
        {tab === 'RANKINGS' && <RankingsHub section={rankingsSection} onSection={setRankingsSection} onGoToGame={() => setTab('DASHBOARD')} />}
        {tab === 'LEADERS' && playerRankings && (
          <PlayerLeaderboardView rankingsState={playerRankings} userTeamId={userTeamId} onSelectPlayer={(entry) => openPlayerCard(entry.player.id)} />
        )}
        {tab === 'FEEDERS' && <FeedersScoutingView section={feederSection} onSection={setFeederSection} onOpenPlayer={(p) => openPlayerCard(p.id)} />}
        {tab === 'NEWS' && <NewsMediaView articles={newsArticles} />}
      </div>

      {/* Bottom Tab Bar */}
      <BackToTop />
      <nav className="app-tabbar" aria-label="Main sections">
        {NAV_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setCollegeFocusId(null);
              if (t.id === 'RANKINGS') setRankingsSection('DISTRICT');
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

// Header stats: the value with a small label underneath
const statStack: React.CSSProperties = { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1, whiteSpace: 'nowrap' };
const statLabel: React.CSSProperties = { fontSize: '10px', fontWeight: 'bold', opacity: 0.9 }; // 11px wraps the bar to two rows on a 375px phone

const topPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '40px',
  padding: '0 5px',
  borderRadius: '6px',
  background: '#334155',
  color: '#fff',
  fontSize: '13px',
  fontWeight: 'bold',
  whiteSpace: 'nowrap'
};

// The bar's icon buttons: narrow on phones (the labels show on wider screens), full height for thumbs
const iconBtn = (background: string): React.CSSProperties => ({
  minHeight: '38px',
  minWidth: '28px',
  padding: '0 6px',
  background,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  whiteSpace: 'nowrap'
});

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
  background: active ? '#EFF6FF' : '#F8FAFC',
  border: `${active ? 2 : 1}px solid ${active ? '#2563EB' : '#CBD5E1'}`,
  borderRadius: '10px',
  fontWeight: active ? 'bold' : 600,
  color: active ? '#1D4ED8' : '#334155',
  cursor: 'pointer'
});

// The Advance button: green when the week can move on, amber for a decision, blue for this week's game
const advanceBtn = (blocker: ReturnType<typeof advanceBlocker>): React.CSSProperties => {
  const [background, color, edge] =
    blocker === 'DECISION' || blocker === 'GRADES' ? ['#F59E0B', '#422006', '#92400E'] : blocker === 'GAME' || blocker === 'LIVE' ? ['#2563EB', '#fff', '#1E3A8A'] : ['#16A34A', '#fff', '#14532D'];
  return {
    minHeight: '40px',
    padding: '0 10px',
    background,
    color,
    border: 'none',
    borderRadius: '8px',
    boxShadow: `0 2px 0 ${edge}`,
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 800,
    whiteSpace: 'nowrap'
  };
};
