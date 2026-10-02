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
  DilemmaRecord,
  FeederOutcome
} from '../types/game';
import {
  buildCustomLeague,
  buildTexasLeague,
  Difficulty,
  findDistrict,
  GameWorld, leagueRegionTeams, LeagueStructure, pickSchoolForDifficulty } from '../sim/league';
import { applyGameResult, forfeitMostRecentDistrictWin, generateSeasonSchedule, getTeamGameForWeek, LAST_REGULAR_SEASON_WEEK } from '../sim/scheduleEngine';
import { generateWeeklyDilemma, executeDilemmaDecision, DILEMMA_COOLDOWN_WEEKS, EXPOSURE_CHANCE } from '../sim/dilemmaEngine';
import { randomInt } from '../sim/math/variance';
import {
  COLLEGE_ACTION_COSTS,
  CollegeAction,
  CollegeActionResult,
  RecruitingEvent,
  Signing,
  TIER_LABELS,
  advanceCollegeRecruiting,
  classCounts,
  isDivisionOne,
  performCollegeAction,
  resetSeasonRecruiting,
  runSigningDay,
  updateStarRatings
} from '../sim/collegeRecruitingEngine';
import {
  FEEDER_EVENTS,
  FeederEventType,
  PROSPECT_ACTION_COSTS,
  generateFeederPool,
  maybeMoveInArrival,
  pitchStarRecruit,
  enforceVarsityRosterLimit,
  resolveFeederClass,
  runFeederEvent,
  scoutProspect,
  visitProspect,
  generateStatewideElite,
  resolveStatewideElite,
  RivalSigning
} from '../sim/feederEngine';
import {
  HEAT_DECAY,
  STRATEGY_FRESHMAN_ADJUSTMENT,
  RecruitingContext,
  advanceRivalRecruiting,
  buildRecruitingContext,
  chooseFeederStrategy,
  inducementHeat,
  initialFeederProfile,
  weeklyDetectionChance,
  yearEndDetectionChance
} from '../sim/feederCompetition';
import { simulateMacroMatch } from '../sim/macroSim';
import {
  evaluateAcademicReport,
  isAcademicallyAtRisk,
  processPostGameSeasonWear,
  processWeeklyInjuryHealing
} from '../sim/playerEngine';
import { buildPlayoffBracket, advancePlayoffRound, findUserNode, recordPlayoffResult, PlayoffBracketState } from '../sim/playoffEngine';
import { generateWeeklyNewsStream, NewsArticle } from '../sim/newsEngine';
import { processStateRealignment } from '../sim/realignmentEngine';
import { generateNationalAndStatePolls } from '../sim/nationalRankingEngine';
import { generatePlayerRankingsAndLeaderboards } from '../sim/playerRankingEngine';
import { persistSaveGame } from '../services/db';
import type { GameSaveRecord } from '../services/db';
import { addPlayerStats } from '../sim/playerStats';
import { advanceTeamToNextSeason } from '../sim/offseasonEngine';
import { moveInDepthChart, setDepthTier } from '../sim/depthChart';
import { ASSISTANT_DRILLS_PER_WEEK, DrillFocus, runAssistantDrills } from '../sim/drillEngine';
import {
  COACH_TALENTS,
  STARTING_COACH_POINTS,
  TalentId,
  collegeActionCost,
  drillsPerWeek,
  feederEventCost,
  offseasonConditioningBonus,
  talentBlocker,
  weeklyCpIncome,
  winBonus
} from '../sim/coachPoints';

const COMPLIANCE_SANCTION_THRESHOLD = 40;
const INDUCEMENT_CP_COST = 20;
const BAN_HEAT_THRESHOLD = 50; // getting caught with this much evidence brings a postseason ban

const MID_SEASON_STAR_UPDATE_WEEK = 8;
const STATEWIDE_RECRUITING_HEADLINES = 2; // five-star commitments elsewhere in the state, per week

/** Headlines from a week of college recruiting: the user's players, plus five-star news statewide. */
function collegeRecruitingNews(events: RecruitingEvent[], userTeamId: string, week: number, year: number): NewsArticle[] {
  const name = (e: RecruitingEvent) => `${e.player.firstName} ${e.player.lastName}`;
  const stars = (e: RecruitingEvent) => `${e.player.recruiting.starRating}★`;
  const article = (e: RecruitingEvent, headline: string, content: string, i: number): NewsArticle => ({
    id: `news_college_${e.type}_${e.player.id}_${year}_${week}_${i}`,
    week,
    outlet: e.team.id === userTeamId ? 'TOWN_JOURNAL' : 'PREP_GRIDIRON_TALK',
    headline,
    content,
    impactSentiment: e.type === 'DECOMMIT' && e.team.id === userTeamId ? 'NEUTRAL' : 'POSITIVE',
    featuredTeamName: e.team.name,
    featuredPlayerName: name(e)
  });
  const mine = events.filter((e) => e.team.id === userTeamId && (e.type !== 'OFFER' || e.tier === 'POWER_4'));
  const statewide = events.filter((e) => e.team.id !== userTeamId && e.type !== 'OFFER' && e.player.recruiting.starRating === 5).slice(0, STATEWIDE_RECRUITING_HEADLINES);
  return [...mine, ...statewide].map((e, i) => {
      if (e.type === 'COMMIT')
        return article(
          e,
          `${e.team.name} ${e.player.position} ${name(e)} Commits to ${e.collegeName}`,
          `The ${stars(e)} ${e.player.classYear.toLowerCase()} gave a verbal commitment to ${e.collegeName} (${TIER_LABELS[e.tier]}).`,
          i
        );
      if (e.type === 'DECOMMIT')
        return article(
          e,
          `${name(e)} Flips From ${e.previousCollege} to ${e.collegeName}`,
          `The ${stars(e)} ${e.player.position} from ${e.team.name} reopened his recruitment and committed to ${e.collegeName}.`,
          i
        );
      return article(e, `${e.collegeName} Offers ${e.team.name} ${e.player.position} ${name(e)}`, `A Power 4 scholarship offer for the ${stars(e)} ${e.player.classYear.toLowerCase()}.`, i);
    });
}

/** Signing day coverage: the user's class and the state's top signees. */
function signingDayNews(signings: Signing[], prestigeChange: number, userTeam: Team, year: number, week: number): NewsArticle[] {
  const mine = signings.filter((s) => s.team.id === userTeam.id);
  const d1 = mine.filter((s) => isDivisionOne(s.offer.tier));
  const articles: NewsArticle[] = [];
  if (mine.length > 0) {
    articles.push({
      id: `news_signing_day_${year}`,
      week,
      outlet: 'TOWN_JOURNAL',
      headline: `Signing Day: ${mine.length} ${userTeam.name} Seniors Sign With Colleges${d1.length ? ` (${d1.length} Division I)` : ''}`,
      content: `${mine.map((s) => `${s.player.firstName} ${s.player.lastName} (${s.offer.collegeName})`).join(', ')}.${
        prestigeChange > 0 ? ' The class gives the program a boost in prestige.' : prestigeChange < 0 ? ' Program prestige slips after a thin class.' : ''
      }`,
      impactSentiment: d1.length > 0 ? 'POSITIVE' : 'NEUTRAL',
      featuredTeamName: userTeam.name
    });
  }
  signings
    .filter((s) => s.team.id !== userTeam.id && s.player.recruiting.starRating === 5)
    .slice(0, 3)
    .forEach((s, i) =>
      articles.push({
        id: `news_signing_star_${year}_${i}`,
        week,
        outlet: 'PREP_GRIDIRON_TALK',
        headline: `Five-Star ${s.player.position} ${s.player.firstName} ${s.player.lastName} Signs With ${s.offer.collegeName}`,
        content: `${s.team.name}'s standout makes it official on signing day.`,
        impactSentiment: 'NEUTRAL',
        featuredTeamName: s.team.name
      })
    );
  return articles;
}

const recruitingContext = (state: { league: LeagueStructure | null; leagueTeams: Team[]; userTeamId: string }): RecruitingContext | undefined =>
  state.league ? buildRecruitingContext(state.league, state.leagueTeams, state.userTeamId) : undefined;

/** A rival program caught breaking recruiting rules: prestige hit, booster fallout, postseason ban. */
function punishCaughtProgram(team: Team, bannedSeason: number, week: number): NewsArticle {
  const profile = team.feederProfile!;
  profile.bannedSeason = bannedSeason;
  profile.violationHeat = 0;
  team.prestige = Math.max(40, team.prestige - 8);
  team.programMeters.boosterApproval = Math.max(0, team.programMeters.boosterApproval - 10);
  return {
    id: `news_violation_${team.id}_${bannedSeason}_${week}`,
    week,
    outlet: 'STATE_SPORTS_CENTRAL',
    headline: `${team.name} Banned From ${bannedSeason} Playoffs Over Recruiting Violations`,
    content: `A state association investigation found ${team.name} boosters made improper offers to recruits. The program loses its postseason eligibility for ${bannedSeason}.`,
    impactSentiment: 'NEGATIVE',
    featuredTeamName: team.name
  };
}

/** A full save of the current game in a given slot. */
function buildSaveRecord(state: GameStoreState, id: string, saveName: string): GameSaveRecord {
  return {
    id,
    saveName,
    timestamp: Date.now(),
    currentWeek: state.currentWeek,
    userTeamId: state.userTeamId,
    coachPoints: state.coachPoints,
    coachTalents: state.coachTalents,
    practiceIntensity: state.practiceIntensity,
    drillFocus: state.drillFocus,
    districtTeams: state.districtTeams,
    activeDilemma: state.activeDilemma,
    scoutingPool: state.scoutingPool,
    history: [],
    currentYear: state.currentYear,
    league: state.league ?? undefined,
    leagueTeams: state.leagueTeams,
    seasonSchedule: state.seasonSchedule,
    dilemmaLog: state.dilemmaLog,
    playoffBracket: state.playoffBracket,
    sanctionLevel: state.sanctionLevel,
    statewideRecruits: state.statewideRecruits,
    userViolationHeat: state.userViolationHeat,
    pendingUserBan: state.pendingUserBan,
    ...(state.difficulty && { difficulty: state.difficulty })
  };
}

const AUTOSAVE_SLOT = 'current_save';

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
  difficulty: Difficulty | null; // chosen at New Game
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
  scoutingPool: FeederProspect[]; // next season's feeder pipeline (15-40 prospects)
  feederEventsThisWeek: FeederEventType[];
  lastFeederResults: FeederOutcome[] | null; // how last year's class turned out
  statewideRecruits: FeederProspect[]; // elite out-of-area recruits contested by the top AI programs
  userViolationHeat: number; // hidden evidence of the user's recruiting violations
  pendingUserBan: boolean; // caught at year end: banned from next season's playoffs
  newsArticles: NewsArticle[];
  polls: StateAndNationalPolls | null;
  playerRankings: PlayerRankingsAndStatsState | null;
  coachPoints: number; // Coach Points: the one currency (see sim/coachPoints)
  coachTalents: TalentId[]; // skill-tree talents bought with CP
  practiceIntensity: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT';
  drillFocus: DrillFocus; // assistants run position drills each week with this focus
  lastDrillReport: string[]; // who the assistants worked with last week

  // Postseason & Offseason state
  playoffBracket: PlayoffBracketState | null;
  graduatingSeniors: Player[];
  isBanquetActive: boolean;

  // Actions
  startNewSeason: (world?: GameWorld) => void; // default: the Texas 6A world
  newGame: (difficulty: Difficulty) => string; // random Texas school for the difficulty; returns its name
  loadGame: (save: GameSaveRecord) => void;
  saveGame: (saveName?: string) => Promise<string>; // new save slot; returns its id
  advanceWeek: () => void;
  resolveDilemma: (choice: DilemmaChoice) => void;
  setPracticeIntensity: (mode: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT') => void;
  setActiveGame: (game: GameSimulationState | null) => void;
  recordUserGame: (finalState: GameSimulationState) => void;
  unlockTalent: (id: TalentId) => string | null; // null on success, otherwise why not
  runFeederEvent: (type: FeederEventType) => FeederProspect[]; // returns newly discovered prospects
  scoutFeederProspect: (prospectId: string) => void;
  visitFeederProspect: (prospectId: string) => void;
  pitchFeederStar: (prospectId: string) => void;
  offerFeederInducement: (prospectId: string) => void; // illegal booster offer: big pull, adds heat
  collegeRecruitAction: (playerId: string, action: CollegeAction) => CollegeActionResult; // promote a player to colleges
  updatePlayerTier: (playerId: string, tier: DepthChartTier) => void;
  moveDepthChartPlayer: (playerId: string, direction: -1 | 1) => void; // up/down one string in his slot
  togglePlayerStudyHall: (playerId: string) => void;
  setDrillFocus: (focus: DrillFocus) => void;
  assignStudyHallToAtRisk: () => number; // study hall for every struggling student not already assigned; returns how many
  startPostseason: () => void;
  advancePlayoffGame: (userScore?: { homeScore: number; awayScore: number }) => void;
  transitionToNextYear: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  difficulty: null,
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
  feederEventsThisWeek: [],
  lastFeederResults: null,
  statewideRecruits: [],
  userViolationHeat: 0,
  pendingUserBan: false,
  newsArticles: [],
  polls: null,
  playerRankings: null,
  coachPoints: STARTING_COACH_POINTS,
  coachTalents: [],
  practiceIntensity: 'STANDARD',
  drillFocus: 'BALANCED',
  lastDrillReport: [],
  playoffBracket: null,
  graduatingSeniors: [],
  isBanquetActive: false,

  startNewSeason: (world) => {
    const { league, teams, userTeamId } = world ?? buildTexasLeague();
    const districtTeams = userDistrictTeams(league, teams, userTeamId);
    const userTeam = teams.find((t) => t.id === userTeamId)!;
    // Every rival program gets a hidden integrity rating and a feeder strategy
    teams.filter((t) => t.id !== userTeamId).forEach((t) => {
      t.feederProfile = initialFeederProfile();
      t.feederProfile.strategy = chooseFeederStrategy(t);
    });
    const ctx = buildRecruitingContext(league, teams, userTeamId);
    updateStarRatings(teams, false);

    set({
      currentWeek: 1,
      league,
      leagueTeams: teams,
      districtTeams,
      seasonSchedule: generateSeasonSchedule(leagueRegionTeams(league, teams), get().currentYear),
      userTeamId,
      scoutingPool: generateFeederPool(userTeam, ctx),
      statewideRecruits: generateStatewideElite(ctx),
      userViolationHeat: 0,
      pendingUserBan: false,
      feederEventsThisWeek: [],
      lastFeederResults: null,
      newsArticles: generateWeeklyNewsStream(1, userTeam),
      polls: generateNationalAndStatePolls(teams, null, 1),
      playerRankings: generatePlayerRankingsAndLeaderboards(teams, 1),
      coachPoints: STARTING_COACH_POINTS,
      coachTalents: [],
      activeGame: null,
      activeDilemma: null,
      dilemmaLog: [],
      sanctionLevel: 0,
      playoffBracket: null,
      graduatingSeniors: [],
      isBanquetActive: false
    });
  },

  newGame: (difficulty) => {
    const school = pickSchoolForDifficulty(difficulty);
    set({ currentYear: 2026, difficulty });
    get().startNewSeason(buildTexasLeague(school));
    return school;
  },

  // League saves restore the whole world; older saves get a world built around their district
  loadGame: (save) => {
    const year = save.currentYear ?? 2026;
    const world = save.league && save.leagueTeams ? { league: save.league, teams: save.leagueTeams } : buildCustomLeague(save.districtTeams, 'Saved District');
    const userTeam = world.teams.find((t) => t.id === save.userTeamId) ?? world.teams[0];
    set({
      difficulty: save.difficulty ?? null,
      currentYear: year,
      league: world.league,
      leagueTeams: world.teams,
      districtTeams: userDistrictTeams(world.league, world.teams, userTeam.id),
      seasonSchedule: save.league && save.seasonSchedule ? save.seasonSchedule : generateSeasonSchedule(leagueRegionTeams(world.league, world.teams), year),
      playoffBracket: save.league ? save.playoffBracket ?? null : null,
      sanctionLevel: save.sanctionLevel ?? 0,
      statewideRecruits: save.league ? save.statewideRecruits ?? [] : [],
      userViolationHeat: save.userViolationHeat ?? 0,
      pendingUserBan: save.pendingUserBan ?? false,
      dilemmaLog: save.dilemmaLog ?? [],
      currentWeek: save.league ? save.currentWeek : Math.min(save.currentWeek, LAST_REGULAR_SEASON_WEEK),
      userTeamId: userTeam.id,
      coachPoints: save.coachPoints ?? save.coachingAP ?? STARTING_COACH_POINTS,
      coachTalents: save.coachTalents ?? [],
      practiceIntensity: save.practiceIntensity,
      drillFocus: save.drillFocus ?? 'BALANCED',
      lastDrillReport: [],
      activeDilemma: save.activeDilemma,
      activeGame: null,
      isBanquetActive: false,
      graduatingSeniors: [],
      feederEventsThisWeek: [],
      newsArticles: [],
      polls: generateNationalAndStatePolls(world.teams, null, save.currentWeek),
      playerRankings: generatePlayerRankingsAndLeaderboards(world.teams, save.currentWeek),
      // Pre-pipeline saves stored simple prospects; give those a fresh feeder pool
      scoutingPool: save.scoutingPool.every((p) => 'source' in p && 'suitors' in p) ? save.scoutingPool : generateFeederPool(userTeam)
    });
  },

  saveGame: async (saveName) => {
    const state = get();
    const userTeam = state.leagueTeams.find((t) => t.id === state.userTeamId);
    const id = `save_${Date.now()}`;
    await persistSaveGame(buildSaveRecord(state, id, saveName?.trim() || `${userTeam?.name ?? 'Season'} - ${state.currentYear} Week ${state.currentWeek}`));
    return id;
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

    // Coach Points: the weekly allowance plus a bonus for a regular-season win; unspent CP carries over.
    // Program events can run once per week.
    const userGame = getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
    const userWon =
      userGame?.homeScore !== undefined &&
      (userGame.homeTeamId === userTeamId ? userGame.homeScore > userGame.awayScore! : userGame.awayScore! > userGame.homeScore);
    const { coachTalents } = get();
    set({ coachPoints: get().coachPoints + weeklyCpIncome(nextWeek, coachTalents) + (userWon ? winBonus(false, coachTalents) : 0), feederEventsThisWeek: [] });

    // Families occasionally move into the district during the year
    const ctx = recruitingContext(get());
    const arrival = maybeMoveInArrival(get().scoutingPool, userTeam, nextWeek, ctx);
    if (arrival) {
      set({
        scoutingPool: [...get().scoutingPool, arrival],
        newsArticles: [
          {
            id: `news_movein_${arrival.id}`,
            week: nextWeek,
            outlet: 'TOWN_JOURNAL',
            headline: `New Family in Town: ${arrival.incomingClass} ${arrival.projectedPosition} ${arrival.name}`,
            content: `${arrival.name} (${arrival.middleSchool.replace('Moving from ', 'from ')}) is enrolling in the district. Coaches should reach out before another program does.`,
            impactSentiment: 'POSITIVE',
            featuredTeamName: userTeam.name
          },
          ...get().newsArticles
        ]
      });
    }

    // Rival programs keep working their recruiting targets (and some bend the rules)
    if (ctx) {
      set({
        scoutingPool: advanceRivalRecruiting(get().scoutingPool, ctx, nextWeek),
        statewideRecruits: advanceRivalRecruiting(get().statewideRecruits, ctx, nextWeek)
      });
    }

    // In-season investigations: evidence of recruiting violations can surface any week
    if (currentWeek <= LAST_REGULAR_SEASON_WEEK) {
      const year = get().currentYear;
      const caughtNews = leagueTeams
        .filter((t) => t.id !== userTeamId && t.feederProfile && t.feederProfile.violationHeat > 0)
        .filter((t) => Math.random() < weeklyDetectionChance(t.feederProfile!.violationHeat))
        .map((t) => punishCaughtProgram(t, year, nextWeek));
      const { userViolationHeat } = get();
      if (userViolationHeat > 0 && Math.random() < weeklyDetectionChance(userViolationHeat)) {
        const meters = userTeam.programMeters;
        meters.complianceScore = Math.max(0, meters.complianceScore - 35);
        meters.boosterApproval = Math.max(0, meters.boosterApproval - 15);
        userTeam.prestige = Math.max(40, userTeam.prestige - 6);
        caughtNews.push({
          id: `news_user_violation_${year}_${nextWeek}`,
          week: nextWeek,
          outlet: 'STATE_SPORTS_CENTRAL',
          headline: `Investigation Finds ${userTeam.name} Boosters Made Improper Recruiting Offers`,
          content: `State association investigators uncovered improper offers to recruits.${userViolationHeat >= BAN_HEAT_THRESHOLD ? ' The program is barred from the playoffs this season.' : ' Further violations will bring heavier penalties.'}`,
          impactSentiment: 'NEGATIVE',
          featuredTeamName: userTeam.name
        });
        set({ userViolationHeat: 0, ...(userViolationHeat >= BAN_HEAT_THRESHOLD && { sanctionLevel: 3 as const }) });
      }
      if (caughtNews.length > 0) set({ newsArticles: [...caughtNews, ...get().newsArticles] });
    }

    // Playoff weeks: finish the current round (simulating the user's game if skipped) and seed the next
    const { playoffBracket } = get();
    if (playoffBracket?.isPlayoffsActive) {
      const userNode = findUserNode(playoffBracket, userTeamId)?.node;
      set({ playoffBracket: advancePlayoffRound(playoffBracket) });
      if (userNode?.winnerTeamId === userTeamId) set({ coachPoints: get().coachPoints + winBonus(true, get().coachTalents) });
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

    // Banquet once the state championship games are decided: signing day for every senior in the state
    if (get().playoffBracket?.isPlayoffsActive === false) {
      const seniors = userTeam.roster.filter((p) => p.classYear === 'Senior');
      const { signings, prestigeChanges } = runSigningDay(leagueTeams, get().currentYear);
      const news = signingDayNews(signings, prestigeChanges.get(userTeamId) ?? 0, userTeam, get().currentYear, nextWeek);
      set({ currentWeek: nextWeek, graduatingSeniors: seniors, isBanquetActive: true, newsArticles: [...news, ...get().newsArticles] });
      return;
    }

    // 1. Weekly Triage & Health Updates
    userTeam.roster.forEach((p) => {
      processWeeklyInjuryHealing(p);
      processPostGameSeasonWear(p, p.depthChartTier === 1 ? 52 : 12, practiceIntensity);
      if (nextWeek % 3 === 0) evaluateAcademicReport(p);
    });
    // Assistants run this week's position drills with the coach's focus
    const lastDrillReport = runAssistantDrills(userTeam.roster, get().drillFocus, drillsPerWeek(ASSISTANT_DRILLS_PER_WEEK, get().coachTalents));

    // 2. Recalculate National & State Team Polls
    const updatedPolls = generateNationalAndStatePolls(leagueTeams, polls, nextWeek);

    // 3. Recalculate Player Stats Leaderboards & Positional Prospect Rankings
    const updatedPlayerRankings = generatePlayerRankingsAndLeaderboards(leagueTeams, nextWeek);

    // 4. College recruiting statewide (offers, commitments, flips) & Weekly Dilemma
    if (nextWeek === MID_SEASON_STAR_UPDATE_WEEK) updateStarRatings(leagueTeams, true);
    const collegeNews = collegeRecruitingNews(advanceCollegeRecruiting(leagueTeams, nextWeek, currentYear), userTeamId, nextWeek, currentYear);
    const recentTemplates = dilemmaLog
      .filter((r) => r.year === currentYear && nextWeek - r.week < DILEMMA_COOLDOWN_WEEKS)
      .map((r) => r.templateId);
    // Once the user's season is over (eliminated or not in the playoffs), program dilemmas stop until next year
    const bracket = get().playoffBracket;
    const seasonOver = !!bracket?.isPlayoffsActive && !findUserNode(bracket, userTeamId);
    const dilemma = seasonOver ? null : generateWeeklyDilemma(nextWeek, userTeam, recentTemplates);


    // 5. Generate Weekly Press Articles
    const newArticles = generateWeeklyNewsStream(nextWeek, userTeam, undefined, dilemma?.title);

    const updatedState = {
      currentWeek: nextWeek,
      activeDilemma: dilemma,
      polls: updatedPolls,
      playerRankings: updatedPlayerRankings,
      lastDrillReport,
      newsArticles: [...collegeNews, ...newArticles, ...get().newsArticles],
      districtTeams: [...districtTeams]
    };

    set(updatedState);

    // Auto-save state to IndexedDB in background
    persistSaveGame(buildSaveRecord(get(), AUTOSAVE_SLOT, `Week ${nextWeek} - ${userTeam.name}`));
  },

  startPostseason: () => {
    const { league, leagueTeams, sanctionLevel, userTeamId } = get();
    if (!league) return;
    const regionTeams = leagueRegionTeams(league, leagueTeams);
    // A postseason ban removes the user's team from seeding; the next team in the standings qualifies
    const bracket = buildPlayoffBracket(
      league.regions.map((region, i) => ({ name: region.name, districts: regionTeams[i] })),
      {
        splitDivisions: league.splitDivisions,
        excludeTeamIds: [
          ...(sanctionLevel >= 3 ? [userTeamId] : []),
          ...leagueTeams.filter((t) => t.feederProfile?.bannedSeason === get().currentYear).map((t) => t.id)
        ]
      }
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
    // The user's feeder class decides (rivals compete for many of them); elite recruits pick among top programs
    const userTeam = leagueTeams.find((t) => t.id === userTeamId)!;
    const ctx = recruitingContext(get());
    const feederClass = resolveFeederClass(scoutingPool, userTeam, ctx);
    const elite = ctx ? resolveStatewideElite(get().statewideRecruits, ctx) : { signings: [] as RivalSigning[], headlines: [] as string[] };
    const rivalIncoming = new Map<string, Player[]>();
    [...feederClass.rivalSignings, ...elite.signings].forEach(({ teamId, player }) => {
      rivalIncoming.set(teamId, [...(rivalIncoming.get(teamId) ?? []), player]);
    });
    leagueTeams.forEach((team) => {
      if (team.id === userTeamId) advanceTeamToNextSeason(team, feederClass.joined, 0, offseasonConditioningBonus(get().coachTalents));
      else advanceTeamToNextSeason(team, rivalIncoming.get(team.id) ?? [], STRATEGY_FRESHMAN_ADJUSTMENT[team.feederProfile?.strategy ?? 'BUILD_LOCAL']);
    });
    // New recruiting cycle: offers carry over, exposure and calls reset, stars re-evaluated after progression
    resetSeasonRecruiting(leagueTeams);
    updateStarRatings(leagueTeams, false);

    // Year-end investigations: some programs get caught, the rest see their evidence fade
    const investigationNews: NewsArticle[] = [];
    leagueTeams.forEach((team) => {
      const profile = team.feederProfile;
      if (!profile || team.id === userTeamId) return;
      if (profile.violationHeat > 0 && Math.random() < yearEndDetectionChance(profile.violationHeat)) {
        investigationNews.push(punishCaughtProgram(team, currentYear + 1, 1));
      } else {
        profile.violationHeat = Math.round(profile.violationHeat * HEAT_DECAY);
      }
      profile.strategy = chooseFeederStrategy(team);
    });
    let { userViolationHeat } = get();
    let pendingUserBan = false;
    if (userViolationHeat > 0 && Math.random() < yearEndDetectionChance(userViolationHeat)) {
      pendingUserBan = userViolationHeat >= BAN_HEAT_THRESHOLD;
      userTeam.programMeters.complianceScore = Math.max(0, userTeam.programMeters.complianceScore - 35);
      userTeam.prestige = Math.max(40, userTeam.prestige - 6);
      investigationNews.push({
        id: `news_user_violation_${currentYear}_offseason`,
        week: 1,
        outlet: 'STATE_SPORTS_CENTRAL',
        headline: `Off-Season Investigation Lands on ${userTeam.name}`,
        content: `Investigators found improper recruiting offers by ${userTeam.name} boosters.${pendingUserBan ? ' The program is barred from the playoffs next season.' : ''}`,
        impactSentiment: 'NEGATIVE',
        featuredTeamName: userTeam.name
      });
      userViolationHeat = 0;
    } else {
      userViolationHeat = Math.round(userViolationHeat * HEAT_DECAY);
    }
    const eliteNews: NewsArticle[] = elite.headlines.map((headline, i) => ({
      id: `news_elite_${currentYear}_${i}`,
      week: 1,
      outlet: 'PREP_GRIDIRON_TALK',
      headline,
      content: 'One of the most sought-after newcomers in the state has picked a program.',
      impactSentiment: 'NEUTRAL'
    }));
    enforceVarsityRosterLimit(userTeam, feederClass.joined, feederClass.outcomes);
    const joinedCount = feederClass.outcomes.filter((o) => o.outcome === 'JOINED').length;
    const classArticle: NewsArticle = {
      id: `news_feeder_class_${currentYear + 1}`,
      week: 1,
      outlet: 'TOWN_JOURNAL',
      headline: `${userTeam.name} Welcomes ${joinedCount} Newcomers to the Program`,
      content: `${joinedCount} of ${scoutingPool.length} prospects in the pipeline came out for the team. ${
        feederClass.outcomes.filter((o) => o.outcome === 'OTHER_SCHOOL').length
      } enrolled elsewhere and ${feederClass.outcomes.filter((o) => o.outcome === 'LEFT_AREA').length} moved away.`,
      impactSentiment: joinedCount >= scoutingPool.length / 2 ? 'POSITIVE' : 'NEUTRAL',
      featuredTeamName: userTeam.name
    };

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
      sanctionLevel: pendingUserBan ? 3 : 0,
      graduatingSeniors: [],
      polls: newPolls,
      playerRankings: newPlayerRankings,
      scoutingPool: generateFeederPool(userTeam, ctx),
      statewideRecruits: ctx ? generateStatewideElite(ctx) : [],
      userViolationHeat,
      pendingUserBan,
      lastFeederResults: feederClass.outcomes,
      feederEventsThisWeek: [],
      coachPoints: get().coachPoints + weeklyCpIncome(1, get().coachTalents),
      newsArticles: [classArticle, ...investigationNews, ...eliteNews, ...get().newsArticles],
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
  unlockTalent: (id) => {
    const { coachPoints, coachTalents, districtTeams, userTeamId } = get();
    const blocker = talentBlocker(id, coachTalents, coachPoints);
    if (blocker) return blocker;
    const talent = COACH_TALENTS.find((t) => t.id === id)!;
    // Politician talents pay off immediately
    const meters = districtTeams.find((t) => t.id === userTeamId)?.programMeters;
    if (meters && id === 'BOARD_ROOM_SHIELD') meters.schoolBoardTrust = Math.min(100, meters.schoolBoardTrust + 15);
    if (meters && id === 'BOOSTER_BREAKFASTS') meters.boosterApproval = Math.min(100, meters.boosterApproval + 10);
    set({ coachPoints: coachPoints - talent.cost, coachTalents: [...coachTalents, id], districtTeams: [...districtTeams] });
    return null;
  },

  runFeederEvent: (type) => {
    const { coachPoints, feederEventsThisWeek, scoutingPool, districtTeams, userTeamId } = get();
    const cost = feederEventCost(FEEDER_EVENTS[type].cost, get().coachTalents);
    if (coachPoints < cost || feederEventsThisWeek.includes(type)) return [];
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    const result = runFeederEvent(scoutingPool, type, userTeam, recruitingContext(get()));
    set({ coachPoints: coachPoints - cost, scoutingPool: result.pool, feederEventsThisWeek: [...feederEventsThisWeek, type] });
    return result.discovered;
  },

  collegeRecruitAction: (playerId, action) => {
    const { coachPoints, leagueTeams, userTeamId, currentWeek, currentYear, districtTeams } = get();
    const cost = collegeActionCost(COLLEGE_ACTION_COSTS[action], get().coachTalents);
    if (coachPoints < cost) return { ok: false, message: 'Not enough Coach Points' };
    const userTeam = leagueTeams.find((t) => t.id === userTeamId)!;
    const player = userTeam.roster.find((p) => p.id === playerId);
    if (!player) return { ok: false, message: 'Player not found' };
    const result = performCollegeAction(player, userTeam, action, currentWeek, currentYear, classCounts(leagueTeams));
    if (result.ok) set({ coachPoints: coachPoints - cost, districtTeams: [...districtTeams], leagueTeams: [...leagueTeams] });
    return result;
  },

  scoutFeederProspect: (prospectId) => {
    const { coachPoints, scoutingPool } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.SCOUT) return;
    set({
      coachPoints: coachPoints - PROSPECT_ACTION_COSTS.SCOUT,
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? scoutProspect(p) : p))
    });
  },

  visitFeederProspect: (prospectId) => {
    const { coachPoints, scoutingPool } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.VISIT) return;
    set({
      coachPoints: coachPoints - PROSPECT_ACTION_COSTS.VISIT,
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? visitProspect(p) : p))
    });
  },

  offerFeederInducement: (prospectId) => {
    const { coachPoints, scoutingPool, userViolationHeat } = get();
    const prospect = scoutingPool.find((p) => p.id === prospectId);
    if (!prospect || prospect.userInducement || coachPoints < INDUCEMENT_CP_COST) return;
    set({
      coachPoints: coachPoints - INDUCEMENT_CP_COST,
      userViolationHeat: userViolationHeat + inducementHeat(prospect),
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? { ...p, userInducement: true } : p))
    });
  },

  pitchFeederStar: (prospectId) => {
    const { coachPoints, scoutingPool, districtTeams, userTeamId } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.PITCH_STAR) return;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    set({
      coachPoints: coachPoints - PROSPECT_ACTION_COSTS.PITCH_STAR,
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? pitchStarRecruit(p, userTeam) : p))
    });
  },

  updatePlayerTier: (playerId, tier) => {
    const { districtTeams, userTeamId } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId);
    if (!userTeam) return;

    setDepthTier(userTeam.roster, playerId, tier);
    set({ districtTeams: [...districtTeams] });
  },

  moveDepthChartPlayer: (playerId, direction) => {
    const { districtTeams, leagueTeams, userTeamId } = get();
    const userTeam = leagueTeams.find((t) => t.id === userTeamId);
    if (!userTeam || !moveInDepthChart(userTeam.roster, playerId, direction)) return;
    set({ districtTeams: [...districtTeams], leagueTeams: [...leagueTeams] });
  },

  setDrillFocus: (focus) => set({ drillFocus: focus }),

  assignStudyHallToAtRisk: () => {
    const { districtTeams, userTeamId } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId);
    if (!userTeam) return 0;
    const atRisk = userTeam.roster.filter((p) => isAcademicallyAtRisk(p) && !p.academics.studyHallAssigned);
    atRisk.forEach((p) => (p.academics.studyHallAssigned = true));
    if (atRisk.length > 0) set({ districtTeams: [...districtTeams] });
    return atRisk.length;
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
