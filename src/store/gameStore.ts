import { create } from 'zustand';
import {
  Team,
  GameSimulationState,
  NarrativeDilemma,
  FeederProspect,
  DilemmaChoice,
  DepthChartTier,
  Player
} from '../types/game';
import { generateDistrictTeams, generateProceduralPlayer } from '../generators/rosterGenerator';
import { generateWeeklyDilemma, executeDilemmaDecision } from '../sim/dilemmaEngine';
import { generateMiddleSchoolProspects, evaluateCollegeScoutExposure } from '../sim/scoutingEngine';
import { simulateMacroMatch } from '../sim/macroSim';
import { evaluateAcademicReport, processPostGameSeasonWear, processWeeklyInjuryHealing, processOffSeasonProgression } from '../sim/playerEngine';
import { buildInitialPlayoffBracket, advancePlayoffRound, PlayoffBracketState } from '../sim/playoffEngine';
import { persistSaveGame } from '../services/db';

interface GameStoreState {
  currentWeek: number;
  currentYear: number;
  userTeamId: string;
  districtTeams: Team[];
  activeGame: GameSimulationState | null;
  activeDilemma: NarrativeDilemma | null;
  scoutingPool: FeederProspect[];
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
  coachingAP: 100,
  practiceIntensity: 'STANDARD',
  playoffBracket: null,
  graduatingSeniors: [],
  isBanquetActive: false,

  startNewSeason: () => {
    const teams = generateDistrictTeams();
    const prospects = generateMiddleSchoolProspects(10);
    set({
      currentWeek: 1,
      districtTeams: teams,
      userTeamId: teams[0].id,
      scoutingPool: prospects,
      coachingAP: 100,
      activeGame: null,
      activeDilemma: null,
      playoffBracket: null,
      graduatingSeniors: [],
      isBanquetActive: false
    });
  },

  advanceWeek: () => {
    const { currentWeek, districtTeams, userTeamId, practiceIntensity } = get();
    const nextWeek = currentWeek + 1;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;

    // Check for Postseason Trigger at Week 15
    if (nextWeek === 15) {
      get().startPostseason();
      return;
    }

    // Check for Offseason Banquet at Week 19
    if (nextWeek >= 19) {
      const seniors = userTeam.roster.filter((p) => p.classYear === 'Senior');
      set({ currentWeek: nextWeek, graduatingSeniors: seniors, isBanquetActive: true });
      return;
    }

    // Standard Regular Season Routine
    userTeam.roster.forEach((p) => {
      processWeeklyInjuryHealing(p);
      processPostGameSeasonWear(p, p.depthChartTier === 1 ? 52 : 12, practiceIntensity);
      if (nextWeek % 3 === 0) evaluateAcademicReport(p);
    });

    for (let i = 1; i < districtTeams.length; i += 2) {
      if (districtTeams[i] && districtTeams[i + 1]) {
        simulateMacroMatch(`ai_gm_${nextWeek}_${i}`, nextWeek, districtTeams[i], districtTeams[i + 1]);
      }
    }

    evaluateCollegeScoutExposure(userTeam, nextWeek);
    const dilemma = generateWeeklyDilemma(nextWeek, userTeam);

    set({
      currentWeek: nextWeek,
      activeDilemma: dilemma,
      coachingAP: 100,
      districtTeams: [...districtTeams]
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

    // 1. Purge Seniors & advance classes
    userTeam.roster = userTeam.roster.filter((p) => p.classYear !== 'Senior');
    userTeam.roster.forEach((p) => {
      if (p.classYear === 'Junior') p.classYear = 'Senior';
      else if (p.classYear === 'Sophomore') p.classYear = 'Junior';
      else if (p.classYear === 'Freshman') p.classYear = 'Sophomore';

      processOffSeasonProgression(p, userTeam.staff.strengthCoach.conditioningRating);
    });

    // 2. Influx scouted Freshmen
    scoutingPool.forEach((prospect) => {
      const newFreshman = generateProceduralPlayer(prospect.projectedPosition, 'Freshman', 2);
      userTeam.roster.push(newFreshman);
    });

    // 3. Reset records
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

    set({
      currentWeek: 1,
      currentYear: currentYear + 1,
      isBanquetActive: false,
      playoffBracket: null,
      graduatingSeniors: [],
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
