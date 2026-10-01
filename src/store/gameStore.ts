import { create } from 'zustand';
import {
  Team,
  GameSimulationState,
  NarrativeDilemma,
  FeederProspect,
  DilemmaChoice,
  DepthChartTier,
  Player,
  StateAndNationalPolls,
  PlayerRankingsAndStatsState,
  ScheduledGame,
  DilemmaRecord
} from '../types/game';
import { buildTexasLeague, findDistrict, leagueRegionTeams, LeagueStructure } from '../sim/league';
import { applyGameResult, forfeitMostRecentDistrictWin, generateSeasonSchedule, getTeamGameForWeek, LAST_REGULAR_SEASON_WEEK } from '../sim/scheduleEngine';
import { generateWeeklyDilemma, executeDilemmaDecision, DILEMMA_COOLDOWN_WEEKS, EXPOSURE_CHANCE } from '../sim/dilemmaEngine';
import { randomInt } from '../sim/math/variance';
import { generateMiddleSchoolProspects, evaluateCollegeScoutExposure } from '../sim/scoutingEngine';
import { simulateMacroMatch } from '../sim/macroSim';
import {
  evaluateAcademicReport,
  processPostGameSeasonWear,
  processWeeklyInjuryHealing
} from '../sim/playerEngine';
import { buildPlayoffBracket, advancePlayoffRound, recordPlayoffResult, PlayoffBracketState } from '../sim/playoffEngine';
import { generateWeeklyNewsStream, NewsArticle } from '../sim/newsEngine';
import { processStateRealignment } from '../sim/realignmentEngine';
import { generateNationalAndStatePolls } from '../sim/nationalRankingEngine';
import { generatePlayerRankingsAndLeaderboards } from '../sim/playerRankingEngine';
import { persistSaveGame } from '../services/db';
import { addPlayerStats } from '../sim/playerStats';
import { advanceTeamToNextSeason } from '../sim/offseasonEngine';

const COMPLIANCE_SANCTION_THRESHOLD = 40;

/** The user's district as team objects (shared with leagueTeams). */
export function userDistrictTeams(league: LeagueStructure, teams: Team[], userTeamId: string): Team[] {
  const district = findDistrict(league, userTeamId);
  return district ? teams.filter((t) => district.teamIds.includes(t.id)) : [];
}

const emptyRecord = () => ({
  wins: 0,
  losses: 0,
  districtWins: 0,
  districtLosses: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  districtPointDifferential: 0,
  headToHeadHistory: {}
});

interface GameStoreState {
  currentWeek: number;
  currentYear: number;
  userTeamId: string;
  league: LeagueStructure | null; // regions and districts of the game world (Texas 6A by default)
  leagueTeams: Team[]; // every team in the world
  districtTeams: Team[]; // the user's district (same objects as in leagueTeams)
  seasonSchedule: ScheduledGame[];
  activeGame: GameSimulationState | null;
  activeDilemma: NarrativeDilemma | null;
  dilemmaLog: DilemmaRecord[];
  sanctionLevel: 0 | 1 | 2 | 3; // state association sanctions this season (design spec 12.2)
  scoutingPool: FeederProspect[];
  newsArticles: NewsArticle[];
  polls: StateAndNationalPolls | null;
  playerRankings: PlayerRankingsAndStatsState | null;
  coachingAP: number;
  practiceIntensity: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT';

  // Postseason & Offseason state
  playoffBracket: PlayoffBracketState | null;
  graduatingSeniors: Player[];
  isBanquetActive: boolean;

  // Actions
  startNewSeason: () => void;
  advanceWeek: () => void;
  resolveDilemma: (choice: DilemmaChoice) => void;
  setPracticeIntensity: (mode: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT') => void;
  setActiveGame: (game: GameSimulationState | null) => void;
  recordUserGame: (finalState: GameSimulationState) => void;
  spendAP: (amount: number) => boolean;
  updatePlayerTier: (playerId: string, tier: DepthChartTier) => void;
  togglePlayerStudyHall: (playerId: string) => void;
  startPostseason: () => void;
  advancePlayoffGame: (userScore?: { homeScore: number; awayScore: number }) => void;
  transitionToNextYear: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  currentWeek: 1,
  currentYear: 2026,
  userTeamId: 'team_austin_westlake',
  league: null,
  leagueTeams: [],
  districtTeams: [],
  seasonSchedule: [],
  activeGame: null,
  activeDilemma: null,
  dilemmaLog: [],
  sanctionLevel: 0,
  scoutingPool: [],
  newsArticles: [],
  polls: null,
  playerRankings: null,
  coachingAP: 100,
  practiceIntensity: 'STANDARD',
  playoffBracket: null,
  graduatingSeniors: [],
  isBanquetActive: false,

  startNewSeason: () => {
    const { league, teams, userTeamId } = buildTexasLeague();
    const districtTeams = userDistrictTeams(league, teams, userTeamId);
    const userTeam = teams.find((t) => t.id === userTeamId)!;

    set({
      currentWeek: 1,
      league,
      leagueTeams: teams,
      districtTeams,
      seasonSchedule: generateSeasonSchedule(leagueRegionTeams(league, teams), get().currentYear),
      userTeamId,
      scoutingPool: generateMiddleSchoolProspects(10),
      newsArticles: generateWeeklyNewsStream(1, userTeam),
      polls: generateNationalAndStatePolls(teams, null, 1),
      playerRankings: generatePlayerRankingsAndLeaderboards(teams, 1),
      coachingAP: 100,
      activeGame: null,
      activeDilemma: null,
      dilemmaLog: [],
      sanctionLevel: 0,
      playoffBracket: null,
      graduatingSeniors: [],
      isBanquetActive: false
    });
  },

  advanceWeek: () => {
    const { currentWeek, districtTeams, leagueTeams, seasonSchedule, userTeamId, practiceIntensity, polls } = get();
    const nextWeek = currentWeek + 1;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;

    // Finish this week's schedule: every unplayed game (including the user's, if skipped) is simulated
    const teamsById = new Map(leagueTeams.map((t) => [t.id, t]));
    seasonSchedule
      .filter((g) => g.week === currentWeek && g.homeScore === undefined)
      .forEach((g) => {
        const home = teamsById.get(g.homeTeamId);
        const away = teamsById.get(g.awayTeamId);
        if (!home || !away) return;
        const box = simulateMacroMatch(g.gameId, g.week, home, away);
        g.homeScore = box.homeScore;
        g.awayScore = box.awayScore;
        applyGameResult(home, away, box.homeScore, box.awayScore, g.isDistrictGame);
      });

    // Playoff weeks: finish the current round (simulating the user's game if skipped) and seed the next
    const { playoffBracket } = get();
    if (playoffBracket?.isPlayoffsActive) {
      set({ playoffBracket: advancePlayoffRound(playoffBracket) });
    }

    // Whistleblowers: risky/corrupt decisions can surface in a later week (design spec 12.1)
    const { dilemmaLog, currentYear } = get();
    const exposures = dilemmaLog.filter((r) => r.year === currentYear && r.exposureWeek === nextWeek);
    const exposureArticles: NewsArticle[] = exposures.map((r) => {
      const meters = userTeam.programMeters;
      meters.complianceScore = Math.max(0, meters.complianceScore - 15);
      meters.schoolBoardTrust = Math.max(0, meters.schoolBoardTrust - 10);
      meters.boosterApproval = Math.max(0, meters.boosterApproval - 5);
      return {
        id: `news_exposed_${r.templateId}_${nextWeek}`,
        week: nextWeek,
        outlet: 'TOWN_JOURNAL',
        headline: `State Association Opens Inquiry Into ${userTeam.name} Football`,
        content: `A whistleblower has come forward about the program's handling of "${r.title}" in Week ${r.week}. Compliance officials are reviewing the decision.`,
        impactSentiment: 'NEGATIVE',
        featuredTeamName: userTeam.name
      };
    });
    if (exposureArticles.length > 0) set({ newsArticles: [...exposureArticles, ...get().newsArticles] });

    // State association sanctions escalate each regular-season week compliance stays below 40
    const { sanctionLevel } = get();
    if (currentWeek <= LAST_REGULAR_SEASON_WEEK && userTeam.programMeters.complianceScore < COMPLIANCE_SANCTION_THRESHOLD && sanctionLevel < 3) {
      const level = (sanctionLevel + 1) as 1 | 2 | 3;
      let content = '';
      if (level === 1) {
        userTeam.programMeters.boosterApproval = Math.max(0, userTeam.programMeters.boosterApproval - 10);
        content = 'The state association issued a public reprimand. Booster donations are drying up.';
      } else if (level === 2) {
        const forfeited = forfeitMostRecentDistrictWin(seasonSchedule, leagueTeams, userTeamId);
        content = forfeited
          ? `The program must forfeit its Week ${forfeited.week} district win, recorded as a 1-0 loss.`
          : 'The program was placed on probation; any further violation brings a postseason ban.';
      } else {
        content = 'The program is barred from the state playoffs this season.';
      }
      const article: NewsArticle = {
        id: `news_sanction_${level}_${currentWeek}`,
        week: nextWeek,
        outlet: 'STATE_SPORTS_CENTRAL',
        headline: ['', 'State Association Reprimands', 'State Association Orders Forfeit for', 'Postseason Ban Handed to'][level] + ` ${userTeam.name}`,
        content,
        impactSentiment: 'NEGATIVE',
        featuredTeamName: userTeam.name
      };
      set({ sanctionLevel: level, newsArticles: [article, ...get().newsArticles] });
    }

    // Postseason starts the week after the regular season
    if (nextWeek === LAST_REGULAR_SEASON_WEEK + 1) {
      get().startPostseason();
      return;
    }

    // Banquet once the state championship games are decided
    if (get().playoffBracket?.isPlayoffsActive === false) {
      const seniors = userTeam.roster.filter((p) => p.classYear === 'Senior');
      set({ currentWeek: nextWeek, graduatingSeniors: seniors, isBanquetActive: true });
      return;
    }

    // 1. Weekly Triage & Health Updates
    userTeam.roster.forEach((p) => {
      processWeeklyInjuryHealing(p);
      processPostGameSeasonWear(p, p.depthChartTier === 1 ? 52 : 12, practiceIntensity);
      if (nextWeek % 3 === 0) evaluateAcademicReport(p);
    });

    // 2. Recalculate National & State Team Polls
    const updatedPolls = generateNationalAndStatePolls(leagueTeams, polls, nextWeek);

    // 3. Recalculate Player Stats Leaderboards & Positional Prospect Rankings
    const updatedPlayerRankings = generatePlayerRankingsAndLeaderboards(leagueTeams, nextWeek);

    // 4. College Scout Exposure & Weekly Dilemma
    evaluateCollegeScoutExposure(userTeam, nextWeek);
    const recentTemplates = dilemmaLog
      .filter((r) => r.year === currentYear && nextWeek - r.week < DILEMMA_COOLDOWN_WEEKS)
      .map((r) => r.templateId);
    const dilemma = generateWeeklyDilemma(nextWeek, userTeam, recentTemplates);


    // 5. Generate Weekly Press Articles
    const newArticles = generateWeeklyNewsStream(nextWeek, userTeam, undefined, dilemma?.title);

    const updatedState = {
      currentWeek: nextWeek,
      activeDilemma: dilemma,
      coachingAP: 100,
      polls: updatedPolls,
      playerRankings: updatedPlayerRankings,
      newsArticles: [...newArticles, ...get().newsArticles],
      districtTeams: [...districtTeams]
    };

    set(updatedState);

    // Auto-save state to IndexedDB in background
    persistSaveGame({
      id: 'current_save',
      saveName: `Week ${nextWeek} - ${userTeam.name}`,
      timestamp: Date.now(),
      currentWeek: nextWeek,
      userTeamId,
      coachingAP: 100,
      practiceIntensity,
      districtTeams: updatedState.districtTeams,
      activeDilemma: dilemma,
      scoutingPool: get().scoutingPool,
      history: [],
      currentYear: get().currentYear,
      league: get().league ?? undefined,
      leagueTeams,
      seasonSchedule,
      dilemmaLog: get().dilemmaLog,
      playoffBracket: get().playoffBracket,
      sanctionLevel: get().sanctionLevel
    });
  },

  startPostseason: () => {
    const { league, leagueTeams, sanctionLevel, userTeamId } = get();
    if (!league) return;
    const regionTeams = leagueRegionTeams(league, leagueTeams);
    // A postseason ban removes the user's team from seeding; the next team in the standings qualifies
    const bracket = buildPlayoffBracket(
      league.regions.map((region, i) => ({ name: region.name, districts: regionTeams[i] })),
      { splitDivisions: league.splitDivisions, excludeTeamIds: sanctionLevel >= 3 ? [userTeamId] : [] }
    );
    set({ currentWeek: LAST_REGULAR_SEASON_WEEK + 1, playoffBracket: bracket });
  },

  // Records the user's live playoff result; Advance Week finishes the round
  advancePlayoffGame: (userScore) => {
    const { playoffBracket, userTeamId } = get();
    if (!playoffBracket || !userScore) return;
    set({ playoffBracket: recordPlayoffResult(playoffBracket, userTeamId, userScore) });
  },

  transitionToNextYear: () => {
    const { districtTeams, leagueTeams, league, userTeamId, currentYear, scoutingPool } = get();
    // Every program graduates seniors, moves classes up, progresses, refills positions and resets its depth chart;
    // the user's signed feeder prospects arrive as freshmen at their projected positions
    leagueTeams.forEach((team) => {
      const incoming = team.id === userTeamId ? scoutingPool.map((prospect) => prospect.projectedPosition) : [];
      advanceTeamToNextSeason(team, incoming);
    });

    if (currentYear % 2 === 0) {
      processStateRealignment(districtTeams);
    }

    leagueTeams.forEach((t) => {
      t.record = emptyRecord();
    });

    const newPolls = generateNationalAndStatePolls(leagueTeams, null, 1);
    const newPlayerRankings = generatePlayerRankingsAndLeaderboards(leagueTeams, 1);

    set({
      currentWeek: 1,
      currentYear: currentYear + 1,
      isBanquetActive: false,
      playoffBracket: null,
      sanctionLevel: 0,
      graduatingSeniors: [],
      polls: newPolls,
      playerRankings: newPlayerRankings,
      scoutingPool: generateMiddleSchoolProspects(10),
      districtTeams: [...districtTeams],
      leagueTeams: [...leagueTeams],
      seasonSchedule: league ? generateSeasonSchedule(leagueRegionTeams(league, leagueTeams), currentYear + 1) : []
    });
  },

  resolveDilemma: (choice) => {
    const { districtTeams, userTeamId, activeDilemma, dilemmaLog, currentWeek, currentYear } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    executeDilemmaDecision(userTeam, choice);

    const record: DilemmaRecord = {
      templateId: activeDilemma?.templateId ?? activeDilemma?.id ?? 'UNKNOWN',
      title: activeDilemma?.title ?? choice.label,
      year: currentYear,
      week: currentWeek,
      tier: choice.tier,
      ...(Math.random() < EXPOSURE_CHANCE[choice.tier] && { exposureWeek: currentWeek + randomInt(1, 3) })
    };
    set({ activeDilemma: null, districtTeams: [...districtTeams], dilemmaLog: [...dilemmaLog, record] });
  },

  setPracticeIntensity: (mode) => set({ practiceIntensity: mode }),
  setActiveGame: (game) => set({ activeGame: game }),

  // Applies a finished live game: the scheduled result and team records (regular season only) and player season stats
  recordUserGame: (finalState) => {
    const { districtTeams, leagueTeams, seasonSchedule, currentWeek, userTeamId, playoffBracket } = get();
    const home = leagueTeams.find((t) => t.id === finalState.homeTeam.id);
    const away = leagueTeams.find((t) => t.id === finalState.awayTeam.id);

    const scheduled = playoffBracket ? undefined : getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
    if (scheduled && scheduled.homeScore === undefined && home && away) {
      const sameOrientation = scheduled.homeTeamId === home.id;
      scheduled.homeScore = sameOrientation ? finalState.homeScore : finalState.awayScore;
      scheduled.awayScore = sameOrientation ? finalState.awayScore : finalState.homeScore;
      applyGameResult(home, away, finalState.homeScore, finalState.awayScore, scheduled.isDistrictGame);
    }

    [home, away].forEach((team) =>
      team?.roster.forEach((p) => {
        const line = finalState.playerGameStats?.[p.id];
        if (line) addPlayerStats(p.stats, line);
        if (line || p.depthChartTier === 1) p.stats.gamesPlayed += 1;
      })
    );

    set({ districtTeams: [...districtTeams], leagueTeams: [...leagueTeams], seasonSchedule: [...seasonSchedule] });
  },
  spendAP: (amount) => {
    const { coachingAP } = get();
    if (coachingAP >= amount) {
      set({ coachingAP: coachingAP - amount });
      return true;
    }
    return false;
  },

  updatePlayerTier: (playerId, tier) => {
    const { districtTeams, userTeamId } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId);
    if (!userTeam) return;

    const ply = userTeam.roster.find((p) => p.id === playerId);
    if (ply) {
      ply.depthChartTier = tier;
      set({ districtTeams: [...districtTeams] });
    }
  },

  togglePlayerStudyHall: (playerId) => {
    const { districtTeams, userTeamId } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId);
    if (!userTeam) return;

    const ply = userTeam.roster.find((p) => p.id === playerId);
    if (ply) {
      ply.academics.studyHallAssigned = !ply.academics.studyHallAssigned;
      set({ districtTeams: [...districtTeams] });
    }
  }
}));
