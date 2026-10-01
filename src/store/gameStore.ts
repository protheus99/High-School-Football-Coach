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
  ScheduledGame
} from '../types/game';
import { generateDistrictTeams, generateProceduralPlayer, NEIGHBOR_DISTRICT_SCHOOLS, PLAYOFF_REGION_DISTRICT_SCHOOLS } from '../generators/rosterGenerator';
import { applyGameResult, generateSeasonSchedule, getTeamGameForWeek, simulateRegularSeason } from '../sim/scheduleEngine';
import { generateWeeklyDilemma, executeDilemmaDecision } from '../sim/dilemmaEngine';
import { generateMiddleSchoolProspects, evaluateCollegeScoutExposure } from '../sim/scoutingEngine';
import { simulateMacroMatch } from '../sim/macroSim';
import {
  evaluateAcademicReport,
  processPostGameSeasonWear,
  processWeeklyInjuryHealing,
  processOffSeasonProgression
} from '../sim/playerEngine';
import { buildInitialPlayoffBracket, advancePlayoffRound, recordPlayoffResult, PlayoffBracketState } from '../sim/playoffEngine';
import { generateWeeklyNewsStream, NewsArticle } from '../sim/newsEngine';
import { processStateRealignment } from '../sim/realignmentEngine';
import { generateNationalAndStatePolls } from '../sim/nationalRankingEngine';
import { generatePlayerRankingsAndLeaderboards } from '../sim/playerRankingEngine';
import { persistSaveGame } from '../services/db';
import { addPlayerStats } from '../sim/playerStats';

interface GameStoreState {
  currentWeek: number;
  currentYear: number;
  userTeamId: string;
  districtTeams: Team[];
  neighborDistrictTeams: Team[]; // non-district opponents and playoff District B
  seasonSchedule: ScheduledGame[];
  activeGame: GameSimulationState | null;
  activeDilemma: NarrativeDilemma | null;
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
  userTeamId: 'team_westlake',
  districtTeams: [],
  neighborDistrictTeams: [],
  seasonSchedule: [],
  activeGame: null,
  activeDilemma: null,
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
    const teams = generateDistrictTeams();
    const neighborTeams = generateDistrictTeams('tx_6a_d25', NEIGHBOR_DISTRICT_SCHOOLS);
    const prospects = generateMiddleSchoolProspects(10);
    const initialNews = generateWeeklyNewsStream(1, teams[0]);
    const initialPolls = generateNationalAndStatePolls(teams, null, 1);
    const initialPlayerRankings = generatePlayerRankingsAndLeaderboards(teams, 1);

    set({
      currentWeek: 1,
      districtTeams: teams,
      neighborDistrictTeams: neighborTeams,
      seasonSchedule: generateSeasonSchedule(teams, neighborTeams, get().currentYear),
      userTeamId: teams[0].id,
      scoutingPool: prospects,
      newsArticles: initialNews,
      polls: initialPolls,
      playerRankings: initialPlayerRankings,
      coachingAP: 100,
      activeGame: null,
      activeDilemma: null,
      playoffBracket: null,
      graduatingSeniors: [],
      isBanquetActive: false
    });
  },

  advanceWeek: () => {
    const { currentWeek, districtTeams, neighborDistrictTeams, seasonSchedule, userTeamId, practiceIntensity, newsArticles, polls } = get();
    const nextWeek = currentWeek + 1;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;

    // Finish this week's schedule: every unplayed game (including the user's, if skipped) is simulated
    const allTeams = [...districtTeams, ...neighborDistrictTeams];
    seasonSchedule
      .filter((g) => g.week === currentWeek && g.homeScore === undefined)
      .forEach((g) => {
        const home = allTeams.find((t) => t.id === g.homeTeamId);
        const away = allTeams.find((t) => t.id === g.awayTeamId);
        if (!home || !away) return;
        const box = simulateMacroMatch(g.gameId, g.week, home, away);
        g.homeScore = box.homeScore;
        g.awayScore = box.awayScore;
        applyGameResult(home, away, box.homeScore, box.awayScore, g.isDistrictGame);
      });

    // Playoff weeks: finish the current round (simulating the user's game if skipped) and seed the next
    const { playoffBracket } = get();
    if (playoffBracket?.isPlayoffsActive) {
      set({ playoffBracket: advancePlayoffRound(playoffBracket, userTeamId) });
    }

    // Check Postseason Trigger (Week 15)
    if (nextWeek === 15) {
      get().startPostseason();
      return;
    }

    // Check Offseason Banquet Trigger (Week 19)
    if (nextWeek >= 19) {
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
    const updatedPolls = generateNationalAndStatePolls(districtTeams, polls, nextWeek);

    // 3. Recalculate Player Stats Leaderboards & Positional Prospect Rankings
    const updatedPlayerRankings = generatePlayerRankingsAndLeaderboards(districtTeams, nextWeek);

    // 4. College Scout Exposure & Weekly Dilemma
    evaluateCollegeScoutExposure(userTeam, nextWeek);
    const dilemma = generateWeeklyDilemma(nextWeek, userTeam);

    // 5. Generate Weekly Press Articles
    const newArticles = generateWeeklyNewsStream(nextWeek, userTeam, undefined, dilemma?.title);

    const updatedState = {
      currentWeek: nextWeek,
      activeDilemma: dilemma,
      coachingAP: 100,
      polls: updatedPolls,
      playerRankings: updatedPlayerRankings,
      newsArticles: [...newArticles, ...newsArticles],
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
      neighborDistrictTeams,
      seasonSchedule
    });
  },

  startPostseason: () => {
    const { districtTeams, neighborDistrictTeams, currentYear } = get();
    // Two more Region IV districts fill out the 16-team bracket; their season is played out in the background
    const [regionC, regionD] = PLAYOFF_REGION_DISTRICT_SCHOOLS.map((schools, i) => generateDistrictTeams(`tx_6a_d${27 + i}`, schools));
    simulateRegularSeason(regionC, regionD, currentYear);
    const bracket = buildInitialPlayoffBracket([districtTeams, neighborDistrictTeams, regionC, regionD]);
    set({ currentWeek: 15, playoffBracket: bracket });
  },

  // Records the user's live playoff result; Advance Week finishes the round
  advancePlayoffGame: (userScore) => {
    const { playoffBracket, userTeamId } = get();
    if (!playoffBracket || !userScore) return;
    set({ playoffBracket: recordPlayoffResult(playoffBracket, userTeamId, userScore) });
  },

  transitionToNextYear: () => {
    const { districtTeams, neighborDistrictTeams, userTeamId, currentYear, scoutingPool } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;

    // Purge Seniors & advance student-athlete classes
    userTeam.roster = userTeam.roster.filter((p) => p.classYear !== 'Senior');
    userTeam.roster.forEach((p) => {
      if (p.classYear === 'Junior') p.classYear = 'Senior';
      else if (p.classYear === 'Sophomore') p.classYear = 'Junior';
      else if (p.classYear === 'Freshman') p.classYear = 'Sophomore';

      processOffSeasonProgression(p, userTeam.staff.strengthCoach.conditioningRating);
    });

    // Influx Freshmen
    scoutingPool.forEach((prospect) => {
      const newFreshman = generateProceduralPlayer(prospect.projectedPosition, 'Freshman', 2);
      userTeam.roster.push(newFreshman);
    });

    if (currentYear % 2 === 0) {
      processStateRealignment(districtTeams);
    }

    [...districtTeams, ...neighborDistrictTeams].forEach((t) => {
      t.record = {
        wins: 0,
        losses: 0,
        districtWins: 0,
        districtLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        districtPointDifferential: 0,
        headToHeadHistory: {}
      };
    });

    const newPolls = generateNationalAndStatePolls(districtTeams, null, 1);
    const newPlayerRankings = generatePlayerRankingsAndLeaderboards(districtTeams, 1);

    set({
      currentWeek: 1,
      currentYear: currentYear + 1,
      isBanquetActive: false,
      playoffBracket: null,
      graduatingSeniors: [],
      polls: newPolls,
      playerRankings: newPlayerRankings,
      scoutingPool: generateMiddleSchoolProspects(10),
      districtTeams: [...districtTeams],
      neighborDistrictTeams: [...neighborDistrictTeams],
      seasonSchedule: generateSeasonSchedule(districtTeams, neighborDistrictTeams, currentYear + 1)
    });
  },

  resolveDilemma: (choice) => {
    const { districtTeams, userTeamId } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    executeDilemmaDecision(userTeam, choice);
    set({ activeDilemma: null, districtTeams: [...districtTeams] });
  },

  setPracticeIntensity: (mode) => set({ practiceIntensity: mode }),
  setActiveGame: (game) => set({ activeGame: game }),

  // Applies a finished live game: the scheduled result and team records (regular season only) and player season stats
  recordUserGame: (finalState) => {
    const { districtTeams, neighborDistrictTeams, seasonSchedule, currentWeek, userTeamId, playoffBracket } = get();
    const allTeams = [...districtTeams, ...neighborDistrictTeams];
    const home = allTeams.find((t) => t.id === finalState.homeTeam.id);
    const away = allTeams.find((t) => t.id === finalState.awayTeam.id);

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

    set({ districtTeams: [...districtTeams], neighborDistrictTeams: [...neighborDistrictTeams], seasonSchedule: [...seasonSchedule] });
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
