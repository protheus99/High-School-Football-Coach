import React, { useState, useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { DashboardView } from './components/DashboardView';
import { DefensiveFocus, FOCUS_CALL } from './sim/gamePlan';
import { getUserMatchup } from './sim/userMatchup';
import { FeederSection, FeedersScoutingView } from './components/FeedersScoutingView';
import { NewsMediaView } from './components/NewsMediaView';
import { TeamView, TeamSection } from './components/TeamView';
import { RankingsHub, RankingsSection } from './components/RankingsHub';
import { LeaderboardView } from './components/LeaderboardView';
import { BackToTop } from './components/ui/BackToTop';
import { PlayerLeaderboardView } from './components/PlayerLeaderboardView';
import { PlayerDetailModal } from './components/PlayerDetailModal';
import { TeamProfileSheet } from './components/TeamProfileSheet';
import { LiveMatchScreen } from './components/LiveMatchScreen';
import { SaveLoadManagerModal } from './components/SaveLoadManagerModal';
import { CoachRPGSkillTreeModal } from './components/CoachRPGSkillTreeModal';
import { formatCP } from './sim/coachPoints';
import { programRating } from './sim/programMeters';
import { SplashScreen } from './components/SplashScreen';
import { OffSeasonBanquetView } from './components/OffSeasonBanquetView';
import { AllStateAwardsModal } from './components/AllStateAwardsModal';
import { calculateSeasonAwards, SeasonAwardsRecord } from './sim/awardsEngine';
import { GameSimulationState, OffensiveScheme } from './types/game';

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
    newsSeen,
    markNewsSeen
  } = useGameStore();
  const unreadNews = Math.max(0, newsArticles.length - newsSeen);
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
        canContinue={league !== null && !firedFrom && !careerComplete}
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

  // Fired by the school board: this save's career is over
  if (firedFrom) {
    return (
      <div className="ui-screen" style={{ maxWidth: '560px', textAlign: 'center', paddingTop: '48px' }}>
        <div style={{ fontSize: '48px' }}>📉</div>
        <h1 style={{ margin: '8px 0', fontSize: '26px' }}>You&apos;ve been fired</h1>
        <p style={{ color: '#475569', fontSize: '15px' }}>
          After a second straight season without the board's confidence, the {firedFrom} school board has decided to make a change. Thank you for your service, Coach.
        </p>
        <button className="ui-btn ui-btn-primary ui-btn-block" style={{ marginTop: '16px', minHeight: '50px' }} onClick={() => setShowMenu(true)}>
          Back to the main menu
        </button>
      </div>
    );
  }

  // The career's last season is done: the final tally and where it ranks
  if (careerComplete && career) {
    return (
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="ui-screen" style={{ textAlign: 'center', paddingBottom: '8px' }}>
          <div style={{ fontSize: '48px' }}>🏁</div>
          <h1 style={{ margin: '8px 0', fontSize: '26px' }}>Career complete</h1>
          <p style={{ color: '#475569', fontSize: '15px', margin: 0 }}>
            {career.length} seasons at {career.startingProgram}. Here&apos;s how your career stacks up.
          </p>
        </div>
        <LeaderboardView />
        <div className="ui-screen" style={{ paddingTop: 0 }}>
          <button className="ui-btn ui-btn-primary ui-btn-block" style={{ minHeight: '50px' }} onClick={() => setShowMenu(true)}>
            Back to the main menu
          </button>
        </div>
      </div>
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
      {showSaveLoadModal && <SaveLoadManagerModal onClose={() => setShowSaveLoadModal(false)} />}
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

      {/* Top Navigation Bar */}
      <div className="app-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
          {/* Coach Points: the one currency */}
          <span
            aria-label={`Coach Points: ${coachPoints}`}
            title={`Coach Points: ${formatCP(coachPoints)}`}
            style={{ ...topBtn('#FACC15'), ...statStack, color: '#0F172A', padding: '2px 5px', cursor: 'default' }}
          >
            {/* Five figures shorten (₡12.3k) so the bar stays one line on the narrowest phones */}
            {coachPoints >= 10000 ? `₡${(coachPoints / 1000).toFixed(1)}k` : formatCP(coachPoints)}
            <span style={statLabel}>Coach PTS</span>
          </span>
          {userTeam && (
            <span title="Program prestige" aria-label={`Prestige ${userTeam.prestige}`} style={{ ...topPill, ...statStack }}>
              ⭐ {userTeam.prestige}
              <span style={statLabel}>Prestige</span>
            </span>
          )}
          {userTeam && (
            <span title="Program rating" aria-label={`Rating ${programRating(userTeam)}`} style={{ ...topPill, ...statStack }}>
              📊 {programRating(userTeam)}
              <span style={statLabel}>Rating</span>
            </span>
          )}
        </div>
        {/* Narrow icon buttons (full height for thumbs) keep the bar to one line, even with the playoff bracket */}
        <div style={{ display: 'flex', gap: '3px', flexWrap: 'nowrap', flex: '0 0 auto' }}>
          {/* News, with a count of the stories the coach hasn't seen */}
          <button
            onClick={openNews}
            aria-label={unreadNews > 0 ? `News: ${unreadNews} unread` : 'News'}
            title="News"
            style={{ ...iconBtn(tab === 'NEWS' ? '#2563EB' : '#334155'), position: 'relative' }}
          >
            📰 <span className="hide-sm">News</span>
            {unreadNews > 0 && tab !== 'NEWS' && <span style={unreadBadge}>{unreadNews > 9 ? '9+' : unreadNews}</span>}
          </button>
          <button onClick={() => setShowSaveLoadModal(true)} aria-label="Save / Load" title="Save / Load" style={iconBtn('#334155')}>
            ⚙️ <span className="hide-sm">Save / Load</span>
          </button>
          <button onClick={() => setShowMenu(true)} aria-label="Main Menu" title="Main Menu" style={{ ...iconBtn('#1E293B'), border: '1px solid #475569' }}>
            🏠 <span className="hide-sm">Menu</span>
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div style={{ flex: 1, paddingBottom: '88px' }}>
        {tab === 'DASHBOARD' && (
          <DashboardView
            onLaunchGame={handleLaunchMatch}
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

const unreadBadge: React.CSSProperties = {
  position: 'absolute',
  top: '-4px',
  right: '-5px',
  minWidth: '16px',
  height: '16px',
  borderRadius: '999px',
  background: '#DC2626',
  color: '#fff',
  fontSize: '10px',
  fontWeight: 'bold',
  lineHeight: '16px',
  textAlign: 'center',
  padding: '0 4px',
  boxSizing: 'border-box'
};
