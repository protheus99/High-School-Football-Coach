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
  PlayerRankingsAndStatsState
} from '../types/game';
import { generateDistrictTeams, generateProceduralPlayer } from '../generators/rosterGenerator';
import { generateWeeklyDilemma, executeDilemmaDecision } from '../sim/dilemmaEngine';
import { generateMiddleSchoolProspects, evaluateCollegeScoutExposure } from '../sim/scoutingEngine';
import { simulateMacroMatch } from '../sim/macroSim';
import {
  evaluateAcademicReport,
  processPostGameSeasonWear,
  processWeeklyInjuryHealing,
  processOffSeasonProgression
} from '../sim/playerEngine';
import { buildInitialPlayoffBracket, advancePlayoffRound, PlayoffBracketState } from '../sim/playoffEngine';
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
    const prospects = generateMiddleSchoolProspects(10);
    const initialNews = generateWeeklyNewsStream(1, teams[0]);
    const initialPolls = generateNationalAndStatePolls(teams, null, 1);
    const initialPlayerRankings = generatePlayerRankingsAndLeaderboards(teams, 1);

    set({
      currentWeek: 1,
      districtTeams: teams,
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
    const { currentWeek, districtTeams, userTeamId, practiceIntensity, newsArticles, polls } = get();
    const nextWeek = currentWeek + 1;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;

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

    // 2. Simulate other district matches
    for (let i = 1; i < districtTeams.length; i += 2) {
      if (districtTeams[i] && districtTeams[i + 1]) {
        simulateMacroMatch(`ai_gm_${nextWeek}_${i}`, nextWeek, districtTeams[i], districtTeams[i + 1]);
      }
    }

    // 3. Recalculate National & State Team Polls
    const updatedPolls = generateNationalAndStatePolls(districtTeams, polls, nextWeek);

    // 4. Recalculate Player Stats Leaderboards & Positional Prospect Rankings
    const updatedPlayerRankings = generatePlayerRankingsAndLeaderboards(districtTeams, nextWeek);

    // 5. College Scout Exposure & Weekly Dilemma
    evaluateCollegeScoutExposure(userTeam, nextWeek);
    const dilemma = generateWeeklyDilemma(nextWeek, userTeam);

    // 6. Generate Weekly Press Articles
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
      history: []
    });
  },

  startPostseason: () => {
    const { districtTeams } = get();
    const districtB = generateDistrictTeams('tx_6a_d27');
    const bracket = buildInitialPlayoffBracket(districtTeams, districtB);
    set({ currentWeek: 15, playoffBracket: bracket });
  },

  advancePlayoffGame: (userScore) => {
    const { playoffBracket, userTeamId, currentWeek } = get();
    if (!playoffBracket) return;

    const nextBracket = advancePlayoffRound(playoffBracket, userTeamId, userScore);
    set({ playoffBracket: nextBracket, currentWeek: currentWeek + 1 });
  },

  transitionToNextYear: () => {
    const { districtTeams, userTeamId, currentYear, scoutingPool } = get();
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

    districtTeams.forEach((t) => {
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
      districtTeams: [...districtTeams]
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

  // Applies a finished live game: team records (regular season only) and player season stats
  recordUserGame: (finalState) => {
    const { districtTeams, playoffBracket } = get();
    const home = districtTeams.find((t) => t.id === finalState.homeTeam.id);
    const away = districtTeams.find((t) => t.id === finalState.awayTeam.id);
    const { homeScore, awayScore } = finalState;

    if (!playoffBracket) {
      const cappedMargin = Math.max(-17, Math.min(17, homeScore - awayScore));
      const applyRecord = (team: Team | undefined, pointsFor: number, pointsAgainst: number, margin: number) => {
        if (!team) return;
        team.record.wins += pointsFor > pointsAgainst ? 1 : 0;
        team.record.losses += pointsFor < pointsAgainst ? 1 : 0;
        team.record.pointsFor += pointsFor;
        team.record.pointsAgainst += pointsAgainst;
        team.record.districtPointDifferential += margin;
      };
      applyRecord(home, homeScore, awayScore, cappedMargin);
      applyRecord(away, awayScore, homeScore, -cappedMargin);
    }

    [home, away].forEach((team) =>
      team?.roster.forEach((p) => {
        const line = finalState.playerGameStats?.[p.id];
        if (line) addPlayerStats(p.stats, line);
        if (line || p.depthChartTier === 1) p.stats.gamesPlayed += 1;
      })
    );

    set({ districtTeams: [...districtTeams] });
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
