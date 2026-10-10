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
import { buildCustomLeague, buildTexasLeague, Difficulty, findDistrict, GameWorld, leagueRegionTeams, LeagueStructure, pickSchoolForDifficulty, seasonLength, buildStateWorld, stateSchool, difficultyForPrestige } from '../sim/league';
import {
  applyGameResult,
  FEEDER_SIGNING_WEEK,
  FIRST_NON_DISTRICT_WEEK,
  forfeitMostRecentDistrictWin,
  generateSeasonSchedule,
  getSeasonPhase,
  getTeamGameForWeek,
  LAST_REGULAR_SEASON_WEEK
} from '../sim/scheduleEngine';
import { generateWeeklyDilemma, executeDilemmaDecision, DILEMMA_COOLDOWN_WEEKS, EXPOSURE_CHANCE } from '../sim/dilemmaEngine';
import { exposureNews } from '../sim/dilemmaExposures';
import { attributeLabel, awardGameBall } from '../sim/postGame';
import { NO_COMMENT, PressQuestion, PressRecord } from '../sim/pressConference';
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
  inUserPipeline,
  CONTACT_ACTIONS,
  ContactAction,
  contactProspect,
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
  CLEAN_ETHICS,
  onProbation,
  PROBATION_FRESHMAN_PENALTY,
  PROBATION_SEASONS,
  removeImproperRecruits,
  restrictedOnProbation,
  initialFeederProfile,
  COACHING_CHANGE_CHANCE,
  weeklyDetectionChance,
  yearEndDetectionChance
} from '../sim/feederCompetition';
import { simulateMacroMatch, rollGameInjuries, teamStarterRating } from '../sim/macroSim';
import {
  evaluateAcademicReport,
  isAcademicallyAtRisk,
  processWeeklyInjuryHealing
} from '../sim/playerEngine';
import { buildPlayoffBracket, advancePlayoffRound, BracketNode, bracketRoundForWeek, compactBracket, findUserNode, recordPlayoffResult, relinkBracketTeams, PlayoffBracketState } from '../sim/playoffEngine';
import { gameResultNews, generateWeeklyNewsStream, NewsArticle, rankingNews } from '../sim/newsEngine';
import { processStateRealignment } from '../sim/realignmentEngine';
import { generateNationalAndStatePolls } from '../sim/nationalRankingEngine';
import { collectResults } from '../sim/computerRankings';
import { advanceWidePool, generateWidePool, resolveWidePool } from '../sim/widePool';
import { HiredCoach, staffBonuses, staffGameDayEdge } from '../sim/coachingStaff';
import { Career, CareerLength, isCareerComplete, scoreSeason } from '../sim/careerScore';
import { ScenarioId, scenarioById } from '../data/scenarios';
import { recordCareer } from '../services/leaderboard';
import { applyRunAheadRound, gameKey, INTERSTATE, runAheadWeek, WeekResults } from '../sim/runAhead';
import { expandToFullRoster, INTERSTATE_WEEK, scheduleInterstateGames } from '../sim/interstate';
import {
  applyLightCalibration,
  buildNationalWorld,
  catchUpNationalWorld,
  LightCalibration,
  LightLeague,
  measureLightCalibration,
  nationalTeams,
  relinkNationalWorld,
  simulateLightWeek
} from '../sim/nationalWorld';
import { generatePlayerRankingsAndLeaderboards } from '../sim/playerRankingEngine';
import { persistSaveGame } from '../services/db';
import type { GameSaveRecord } from '../services/db';
import { addPlayerStats } from '../sim/playerStats';
import { addIncomingClass, graduateAndProgress } from '../sim/offseasonEngine';
import { NOTABLE_CLASS_WAVE, rollClassWave } from '../generators/rosterGenerator';
import { randomSurname } from '../generators/names';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { moveInDepthChart, normalizeDepthChart, setDepthTier } from '../sim/depthChart';
import { NO_BOOSTS, PHASE_TRAINING, PracticeIntensity, TrainingBoosts, TrainingReport, aiIntensity, migrateIntensity, runTrainingWeek, trainingBoosts } from '../sim/training';
import {
  COACH_TALENTS,
  STARTING_COACH_POINTS,
  TalentId,
  collegeActionCost,
  feederEventCost,
  offseasonConditioningBonus,
  talentBlocker,
  weeklyCpIncome,
  winBonus
} from '../sim/coachPoints';
import { BOARD_RESULT_DELTA, boardReview, pickSuspension, prestigeReversion } from '../sim/programMeters';
import { rulesForState } from '../sim/stateRules';

const COMPLIANCE_SANCTION_THRESHOLD = 40;
const INDUCEMENT_CP_COST = 20;
const BAN_HEAT_THRESHOLD = 50; // getting caught with this much evidence brings a postseason ban

const MID_SEASON_STAR_UPDATE_WEEK = 11;

/** Last season in brief (shown on the Hub in week 1). */
export interface SeasonRecap {
  year: number;
  wins: number;
  losses: number;
  districtFinish: number;
  graduated: number;
  returningStarters: number;
}
const CAMP_MORALE = 2; // training camp brings the team together: morale a week

/** The coach's training boosts (talents and paid staff), for the week's practice and its preview. */
export const userTrainingBoosts = (state: Pick<GameStoreState, 'coachTalents' | 'coachingStaff'>, team: Team): TrainingBoosts =>
  trainingBoosts(team, state.coachTalents.includes('ASSISTANT_UPGRADE'), staffBonuses(state.coachingStaff));

/** Whether a team has a game this week (regular season, out of state or a playoff round). */
export function playsThisWeek(state: Pick<GameStoreState, 'currentWeek' | 'seasonSchedule' | 'interstateGames' | 'playoffBracket'>, teamId: string): boolean {
  const week = state.currentWeek;
  if ([...state.seasonSchedule, ...state.interstateGames].some((g) => g.week === week && (g.homeTeamId === teamId || g.awayTeamId === teamId))) return true;
  const bracket = state.playoffBracket;
  return !!bracket?.isPlayoffsActive && bracketRoundForWeek(bracket, week) >= 0 && !!findUserNode(bracket, teamId);
}
/** How the coach's name reads on his team: "Coach Mike Smith" (a name typed with "Coach" keeps it as is). */
export function coachTitle(name: string): string {
  const n = name.trim();
  return !n ? 'Coach' : /^coach\b/i.test(n) ? n : `Coach ${n}`;
}
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
      headline: `College Signing Day: ${mine.length} ${userTeam.name} Seniors Sign With Colleges${d1.length ? ` (${d1.length} Division I)` : ''}`,
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
        content: `${s.team.name}'s standout makes it official on College signing day.`,
        impactSentiment: 'NEUTRAL',
        featuredTeamName: s.team.name
      })
    );
  return articles;
}

const recruitingContext = (state: { league: LeagueStructure | null; leagueTeams: Team[]; userTeamId: string }): RecruitingContext | undefined =>
  state.league ? buildRecruitingContext(state.league, state.leagueTeams, state.userTeamId) : undefined;

/** The roster side of a sanction, for the news: players ruled ineligible and the probation. */
const sanctionDetails = (ineligible: number, probationUntil: number) =>
  `${ineligible > 0 ? `, ${ineligible} improperly recruited ${ineligible === 1 ? 'player is' : 'players are'} ruled ineligible,` : ''} and the program is on recruiting probation through ${probationUntil}.`;

/** A rival program caught breaking recruiting rules: prestige hit, booster fallout, postseason ban, ineligible recruits, probation. */
function punishCaughtProgram(team: Team, bannedSeason: number, week: number): NewsArticle {
  const profile = team.feederProfile!;
  profile.bannedSeason = bannedSeason;
  profile.violationHeat = 0;
  profile.probationUntil = bannedSeason + PROBATION_SEASONS - 1;
  profile.strategy = 'BUILD_LOCAL'; // no chasing stars or transfers on probation
  profile.ethics = Math.max(profile.ethics, CLEAN_ETHICS); // the program cleans up: no more illegal offers
  team.prestige = Math.max(40, team.prestige - 8);
  team.programMeters.boosterApproval = Math.max(0, team.programMeters.boosterApproval - 10);
  const ineligible = removeImproperRecruits(team);
  return {
    id: `news_violation_${team.id}_${bannedSeason}_${week}`,
    week,
    outlet: 'STATE_SPORTS_CENTRAL',
    headline: `${team.name} Banned From ${bannedSeason} Playoffs Over Recruiting Violations`,
    content: `A state association investigation found ${team.name} boosters made improper offers to recruits. The program loses its postseason eligibility for ${bannedSeason}${sanctionDetails(ineligible.length, profile.probationUntil)}`,
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
    feederClassYear: state.feederClassYear,
    seasonRecap: state.seasonRecap,
    districtTeams: state.districtTeams,
    activeDilemma: state.activeDilemma,
    scoutingPool: state.scoutingPool,
    history: [],
    currentYear: state.currentYear,
    league: state.league ?? undefined,
    leagueTeams: state.leagueTeams,
    seasonSchedule: state.seasonSchedule,
    nationalLeagues: state.nationalLeagues.map((l) => ({ ...l, bracket: l.bracket && compactBracket(l.bracket) })),
    dilemmaLog: state.dilemmaLog,
    pressLog: state.pressLog,
    playoffBracket: state.playoffBracket && compactBracket(state.playoffBracket),
    sanctionLevel: state.sanctionLevel,
    statewideRecruits: state.statewideRecruits,
    widePool: state.widePool,
    weekResults: state.weekResults,
    interstateGames: state.interstateGames,
    coachingStaff: state.coachingStaff,
    career: state.career,
    userProbationUntil: state.userProbationUntil,
    lightCalibration: state.lightCalibration,
    userViolationHeat: state.userViolationHeat,
    pendingUserBan: state.pendingUserBan,
    onHotSeat: state.onHotSeat,
    ...(state.difficulty && { difficulty: state.difficulty })
  };
}

const AUTOSAVE_SLOT = 'current_save';

/**
 * The season's out-of-state games for every state. The league's own are added to its schedule (the same
 * objects, so a result shows in both), and the coach's out-of-state opponents get full rosters for a live game.
 */
function planInterstate(
  state: string,
  teams: Team[],
  schedule: ScheduledGame[],
  nationalLeagues: LightLeague[],
  year: number,
  userTeamId: string,
  openerRatings?: Record<string, number> // the league's ratings at the last opener (its rosters are between classes now)
): ScheduledGame[] {
  const ratingOf = (t: Team) => openerRatings?.[t.id] ?? teamStarterRating(t);
  const games = scheduleInterstateGames([{ state, teams, schedule }, ...nationalLeagues.map((l) => ({ state: l.state, teams: l.teams, schedule: l.schedule }))], year, userTeamId, ratingOf);
  const ids = new Set(teams.map((t) => t.id));
  schedule.push(...games.filter((g) => ids.has(g.homeTeamId) || ids.has(g.awayTeamId)));
  const lightTeams = new Map(nationalLeagues.flatMap((l) => l.teams).map((t) => [t.id, t]));
  games
    .filter((g) => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)
    .forEach((g) => {
      const opponent = lightTeams.get(g.homeTeamId === userTeamId ? g.awayTeamId : g.homeTeamId);
      if (opponent) expandToFullRoster(opponent);
    });
  return games;
}

/** After loading: the schedule's out-of-state games point at the national list's objects again. */
function relinkInterstate(schedule: ScheduledGame[], interstate: ScheduledGame[]): ScheduledGame[] {
  const byId = new Map(interstate.map((g) => [g.gameId, g]));
  return schedule.map((g) => byId.get(g.gameId) ?? g);
}

/**
 * Runs `work` when the browser is idle (after the coach's screen has updated): the run-ahead simulation of the
 * week's other games. Tests skip it; their games are simulated at Advance Week as before.
 */
function whenIdle(work: () => void): void {
  if (import.meta.env?.MODE === 'test' || typeof window === 'undefined') return;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(work, { timeout: 2000 });
  else setTimeout(work, 50);
}

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
  career: Career | null; // a scenario career: its seasons are scored for the starting program's leaderboard
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
  pressLog: PressRecord[]; // post-game press questions asked (rotation and cooldowns)
  sanctionLevel: 0 | 1 | 2 | 3; // state association sanctions this season (design spec 12.2)
  scoutingPool: FeederProspect[]; // next season's feeder pipeline (15-40 prospects)
  feederEventsThisWeek: FeederEventType[];
  lastFeederResults: FeederOutcome[] | null; // how last year's class turned out
  statewideRecruits: FeederProspect[]; // elite out-of-area recruits contested by the top AI programs
  widePool: FeederProspect[]; // prospects beyond the region: the rest of the state (Texas) and the other states
  weekResults: WeekResults | null; // this week's other games, simulated ahead (shown live during the coach's game)
  interstateGames: ScheduledGame[]; // the season's out-of-state games, every state (the league's are also in its schedule)
  coachingStaff: HiredCoach[]; // the coach's paid assistants (game-day edge, development, injuries, Coach Points)
  setCoachingStaff: (staff: HiredCoach[]) => void;
  runAhead: () => WeekResults; // simulates this week's other games now if they haven't been (idempotent)
  userViolationHeat: number; // hidden evidence of the user's recruiting violations
  pendingUserBan: boolean; // caught at year end: banned from next season's playoffs
  newsArticles: NewsArticle[];
  newsMark: number; // newsArticles.length when the week last advanced: everything after it is this week's news (the Hub's headlines)
  newsSeen: number; // newsArticles.length when the coach last opened News: the rest are unread
  markNewsSeen: () => void;
  polls: StateAndNationalPolls | null;
  playerRankings: PlayerRankingsAndStatsState | null;
  nationalLeagues: LightLeague[]; // every other playable state, on the same calendar (national polls and leaders)
  coachPoints: number; // Coach Points: the one currency (see sim/coachPoints)
  coachTalents: TalentId[]; // skill-tree talents bought with CP
  practiceIntensity: PracticeIntensity; // how hard the team practices: the coach's one training decision (sim/training)
  feederClassYear: number; // the season the current pipeline's class arrives (signing day is week 2 of that season)
  seasonRecap: SeasonRecap | null; // last season in brief, for the Hub's new-season headline
  viewedTeamId: string | null; // the team page that is open (not saved)
  openTeamProfile: (teamId: string | null) => void;
  viewedPlayerId: string | null; // the player card that is open (not saved): the same card from every screen
  openPlayerCard: (playerId: string | null) => void;
  lastTrainingReport: TrainingReport | null; // what last week's practice did

  // Postseason & Offseason state
  playoffBracket: PlayoffBracketState | null;
  graduatingSeniors: Player[];
  isBanquetActive: boolean;
  onHotSeat: boolean; // the board's warning: another season under 35 Board Trust ends the job
  firedFrom: string | null; // set when the board fires the coach (game over for this save)
  careerComplete: boolean; // the career's last season is done (game over for this save)
  userProbationUntil: number | null; // last season of the coach's recruiting probation after getting caught
  lightCalibration: LightCalibration | null; // how the other states' rolled ratings map onto the coach's league (measured each opener)

  // Actions
  startNewSeason: (world?: GameWorld) => void; // default: the Texas 6A world
  newGame: (difficulty: Difficulty, state?: string) => string; // random school in the state (Texas by default) for the difficulty; returns its name
  newScenarioGame: (scenario: ScenarioId, state: string, school: string, coachName: string, length: CareerLength) => void; // a scored career at a scenario program
  loadGame: (save: GameSaveRecord) => void;
  saveGame: (saveName?: string) => Promise<string>; // new save slot; returns its id
  advanceWeek: () => void;
  resolveDilemma: (choice: DilemmaChoice) => void;
  awardGameBall: (playerId: string, summary: { opponentName: string; won: boolean; score: string; line: string }) => void;
  answerPress: (question: PressQuestion, choice: DilemmaChoice) => void;
  setPracticeIntensity: (mode: PracticeIntensity) => void;
  setActiveGame: (game: GameSimulationState | null) => void;
  recordUserGame: (finalState: GameSimulationState) => void;
  unlockTalent: (id: TalentId) => string | null; // null on success, otherwise why not
  runFeederEvent: (type: FeederEventType) => FeederProspect[]; // returns newly discovered prospects
  scoutFeederProspect: (prospectId: string) => void;
  visitFeederProspect: (prospectId: string) => void;
  removeFeederProspect: (prospectId: string) => void; // drop a prospect the program doesn't want (frees a pipeline spot)
  contactFeederProspect: (prospectId: string, action: ContactAction) => void; // text, email, call, visit, invite, wine & dine
  pitchFeederStar: (prospectId: string) => void;
  offerFeederInducement: (prospectId: string) => void; // illegal booster offer: big pull, adds heat
  collegeRecruitAction: (playerId: string, action: CollegeAction) => CollegeActionResult; // promote a player to colleges
  updatePlayerTier: (playerId: string, tier: DepthChartTier) => void;
  moveDepthChartPlayer: (playerId: string, direction: -1 | 1) => void; // up/down one string in his slot
  runFeederSigningDay: () => void; // end of pre season week 2: prospects pick a school, newcomers join every roster
  startPostseason: () => void;
  advancePlayoffGame: (userScore?: { homeScore: number; awayScore: number }) => void;
  finishBanquet: () => void; // banquet done: on to the off-season week
  transitionToNextYear: () => void;
}

/** Feeder program events (clinics, 7-on-7, tryouts) run only in the off season. */
export function feederEventsOpen(state: Pick<GameStoreState, 'currentWeek' | 'league'>): boolean {
  return getSeasonPhase(state.currentWeek) === 'OFF_SEASON';
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  difficulty: null,
  career: null,
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
  pressLog: [],
  sanctionLevel: 0,
  scoutingPool: [],
  feederEventsThisWeek: [],
  lastFeederResults: null,
  statewideRecruits: [],
  widePool: [],
  weekResults: null,
  interstateGames: [],
  coachingStaff: [],
  userViolationHeat: 0,
  pendingUserBan: false,
  onHotSeat: false,
  firedFrom: null,
  careerComplete: false,
  userProbationUntil: null,
  lightCalibration: null,
  newsArticles: [],
  newsMark: 0,
  newsSeen: 0,
  polls: null,
  playerRankings: null,
  nationalLeagues: [],
  coachPoints: STARTING_COACH_POINTS,
  coachTalents: [],
  practiceIntensity: 'LIMITED',
  feederClassYear: 2027,
  seasonRecap: null,
  viewedTeamId: null,
  openTeamProfile: (teamId) => set({ viewedTeamId: teamId }),
  viewedPlayerId: null,
  openPlayerCard: (playerId) => set({ viewedPlayerId: playerId }),
  lastTrainingReport: null,
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
    const nationalLeagues = buildNationalWorld(league.state ?? 'Texas', get().currentYear);
    // The generated league is complete (freshmen in): put the country on its scale before pairing out-of-state games
    const lightCalibration = measureLightCalibration(league.state ?? 'Texas', teams);
    applyLightCalibration(nationalLeagues, lightCalibration);
    updateStarRatings(nationalLeagues.flatMap((l) => l.teams), false); // the other states' stars, by the same quotas
    const everyone = nationalTeams(teams, nationalLeagues);
    const seasonSchedule = generateSeasonSchedule(leagueRegionTeams(league, teams), get().currentYear, { reservedWeeks: [INTERSTATE_WEEK] });
    const interstateGames = planInterstate(league.state ?? 'Texas', teams, seasonSchedule, nationalLeagues, get().currentYear, userTeamId);

    set({
      currentWeek: 1,
      league,
      leagueTeams: teams,
      districtTeams,
      seasonSchedule,
      interstateGames,
      userTeamId,
      scoutingPool: generateFeederPool(userTeam, ctx),
      statewideRecruits: generateStatewideElite(ctx),
      widePool: generateWidePool(ctx, league.state ?? 'Texas', nationalLeagues),
      weekResults: null,
      feederClassYear: get().currentYear + 1,
      seasonRecap: null,
      userViolationHeat: 0,
      pendingUserBan: false,
      onHotSeat: false,
      firedFrom: null,
      careerComplete: false,
      userProbationUntil: null,
      lightCalibration,
      coachingStaff: [], // a new program starts without assistants
      feederEventsThisWeek: [],
      lastFeederResults: null,
      newsArticles: generateWeeklyNewsStream(1, userTeam),
      nationalLeagues,
      polls: generateNationalAndStatePolls(everyone, null, 1, [], league.state ?? 'Texas'),
      playerRankings: generatePlayerRankingsAndLeaderboards(everyone, 1),
      coachPoints: STARTING_COACH_POINTS,
      coachTalents: [],
      activeGame: null,
      activeDilemma: null,
      dilemmaLog: [],
      pressLog: [],
      sanctionLevel: 0,
      playoffBracket: null,
      graduatingSeniors: [],
      isBanquetActive: false
    });
  },

  newGame: (difficulty, state = 'Texas') => {
    const school = pickSchoolForDifficulty(difficulty, state);
    set({ currentYear: 2026, difficulty, career: null });
    get().startNewSeason(buildStateWorld(state, school));
    return school;
  },

  newScenarioGame: (scenarioId, state, school, coachName, length) => {
    const scenario = scenarioById(scenarioId);
    const program = scenario.programs.find((p) => p.state === state && p.school === school);
    const career: Career = {
      id: `career_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      coachName: coachName.trim() || 'Coach',
      scenario: scenarioId,
      state,
      startingSchool: school,
      startingProgram: program?.displayName ?? school,
      startedYear: 2026,
      length,
      token: crypto.randomUUID(),
      seasons: []
    };
    set({ currentYear: 2026, difficulty: scenarioId === 'OPEN' ? difficultyForPrestige(stateSchool(state, school)?.prestige ?? 75) : scenario.difficulty, career });
    get().startNewSeason(buildStateWorld(state, school, false, scenario.startingPrestige));
    // The coach's own name, on his team (profile, awards, news)
    const team = get().leagueTeams.find((t) => t.id === get().userTeamId);
    if (team) team.staff.headCoachName = coachTitle(career.coachName);
  },

  // League saves restore the whole world; older saves get a world built around their district
  loadGame: (save) => {
    const year = save.currentYear ?? 2026;
    const world = save.league && save.leagueTeams ? { league: save.league, teams: save.leagueTeams } : buildCustomLeague(save.districtTeams, 'Saved District');
    const userTeam = world.teams.find((t) => t.id === save.userTeamId) ?? world.teams[0];
    // A career's coach goes by his own name (saves from before it carry a generated one)
    if (save.career) userTeam.staff.headCoachName = coachTitle(save.career.coachName);
    // The other states: from the save, or (older saves) built and played up to this week
    const loadedWeek = save.league ? save.currentWeek : Math.min(save.currentWeek, LAST_REGULAR_SEASON_WEEK);
    let nationalLeagues = save.nationalLeagues ? relinkNationalWorld(save.nationalLeagues) : null;
    if (!nationalLeagues) {
      nationalLeagues = buildNationalWorld(world.league.state ?? 'Texas', year);
      applyLightCalibration(nationalLeagues, save.lightCalibration ?? measureLightCalibration(world.league.state ?? 'Texas', world.teams));
      catchUpNationalWorld(nationalLeagues, loadedWeek - 1);
    }
    const everyone = nationalTeams(world.teams, nationalLeagues);
    // Saves from before prestige history: each school's history comes from the data
    world.teams.forEach((t) => {
      if (t.historicalPrestige === undefined) t.historicalPrestige = stateSchool(world.league.state ?? 'Texas', t.name)?.prestige ?? t.prestige;
    });
    // Saves from before the third receiver: strings follow today's depth chart shape (the off-season fills the room)
    world.teams.forEach((t) => normalizeDepthChart(t.roster));
    // Saves from before star quotas get today's star ratings
    updateStarRatings(everyone, loadedWeek >= MID_SEASON_STAR_UPDATE_WEEK);
    set({
      difficulty: save.difficulty ?? null,
      currentYear: year,
      league: world.league,
      leagueTeams: world.teams,
      districtTeams: userDistrictTeams(world.league, world.teams, userTeam.id),
      // The league's out-of-state games are the same objects as the national list's
      seasonSchedule: save.league && save.seasonSchedule ? relinkInterstate(save.seasonSchedule, save.interstateGames ?? []) : generateSeasonSchedule(leagueRegionTeams(world.league, world.teams), year),
      interstateGames: save.interstateGames ?? [],
      coachingStaff: save.coachingStaff ?? [],
      career: save.career ?? null,
      playoffBracket: save.league && save.playoffBracket ? relinkBracketTeams(save.playoffBracket, world.teams) : null,
      sanctionLevel: save.sanctionLevel ?? 0,
      statewideRecruits: save.league ? save.statewideRecruits ?? [] : [],
      weekResults: save.weekResults?.week === save.currentWeek ? save.weekResults : null,
      widePool: save.widePool ?? generateWidePool(buildRecruitingContext(world.league, world.teams, userTeam.id), world.league.state ?? 'Texas', nationalLeagues),
      userViolationHeat: save.userViolationHeat ?? 0,
      pendingUserBan: save.pendingUserBan ?? false,
      onHotSeat: save.onHotSeat ?? false,
      firedFrom: null,
      careerComplete: false,
      userProbationUntil: save.userProbationUntil ?? null,
      lightCalibration: save.lightCalibration ?? null,
      dilemmaLog: save.dilemmaLog ?? [],
      pressLog: save.pressLog ?? [],
      currentWeek: save.league ? save.currentWeek : Math.min(save.currentWeek, LAST_REGULAR_SEASON_WEEK),
      userTeamId: userTeam.id,
      coachPoints: save.coachPoints ?? save.coachingAP ?? STARTING_COACH_POINTS,
      coachTalents: save.coachTalents ?? [],
      practiceIntensity: migrateIntensity(save.practiceIntensity),
      // Older saves: the pipeline was always next season's class
      feederClassYear: save.feederClassYear ?? year + 1,
      seasonRecap: save.seasonRecap ?? null,
      lastTrainingReport: null,
      activeDilemma: save.activeDilemma,
      activeGame: null,
      isBanquetActive: false,
      graduatingSeniors: [],
      feederEventsThisWeek: [],
      newsArticles: [],
      newsMark: 0,
      newsSeen: 0,
      nationalLeagues,
      polls: generateNationalAndStatePolls(everyone, null, save.currentWeek, collectResults({ seasonSchedule: save.seasonSchedule ?? [], nationalLeagues, interstateGames: save.interstateGames, playoffBracket: save.playoffBracket ?? null }), save.league?.state ?? 'Texas'),
      playerRankings: generatePlayerRankingsAndLeaderboards(everyone, save.currentWeek),
      // Pre-pipeline saves stored simple prospects; give those a fresh feeder pool
      scoutingPool: save.scoutingPool.every((p) => 'source' in p && 'suitors' in p) ? save.scoutingPool : generateFeederPool(userTeam)
    });
    whenIdle(() => get().runAhead());
  },

  saveGame: async (saveName) => {
    const state = get();
    const userTeam = state.leagueTeams.find((t) => t.id === state.userTeamId);
    const id = `save_${Date.now()}`;
    await persistSaveGame(buildSaveRecord(state, id, saveName?.trim() || `${userTeam?.name ?? 'Season'} - ${state.currentYear} Week ${state.currentWeek}`));
    return id;
  },

  advanceWeek: () => {
    const { currentWeek, districtTeams, leagueTeams, seasonSchedule, userTeamId, practiceIntensity, polls, league } = get();
    // Everything reported from here on is next week's news (the Hub's headlines)
    set({ newsMark: get().newsArticles.length });
    // Advancing out of the off-season week starts next year
    if (league && currentWeek >= seasonLength(league)) {
      get().transitionToNextYear();
      return;
    }
    const nextWeek = currentWeek + 1;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    const phase = getSeasonPhase(currentWeek);
    if (currentWeek === FEEDER_SIGNING_WEEK && get().currentYear >= get().feederClassYear) get().runFeederSigningDay();

    // Finish this week's schedule: every unplayed game (including the user's, if skipped) is simulated, or
    // takes its run-ahead result
    const ahead = get().weekResults?.week === currentWeek ? get().weekResults : null;
    const userState = league?.state ?? 'Texas';
    const teamsById = new Map(leagueTeams.map((t) => [t.id, t]));
    seasonSchedule
      .filter((g) => g.week === currentWeek && g.homeScore === undefined)
      .forEach((g) => {
        const home = teamsById.get(g.homeTeamId);
        const away = teamsById.get(g.awayTeamId);
        if (!home || !away) return;
        const box = ahead?.games[gameKey(userState, g.gameId)] ?? simulateMacroMatch(g.gameId, g.week, home, away);
        rollGameInjuries(home, g.week);
        rollGameInjuries(away, g.week);
        g.homeScore = box.homeScore;
        g.awayScore = box.awayScore;
        applyGameResult(home, away, box.homeScore, box.awayScore, g.isDistrictGame);
      });

    // The rest of the country plays the same week (regular season, then each state's playoffs)
    get().nationalLeagues.forEach((light) => simulateLightWeek(light, currentWeek, ahead));
    // Out-of-state games (the coach's own, if he skipped it, too)
    const everyTeam = new Map(nationalTeams(leagueTeams, get().nationalLeagues).map((t) => [t.id, t]));
    get().interstateGames
      .filter((g) => g.week === currentWeek && g.homeScore === undefined)
      .forEach((g) => {
        const home = everyTeam.get(g.homeTeamId);
        const away = everyTeam.get(g.awayTeamId);
        if (!home || !away) return;
        const box = ahead?.games[gameKey(INTERSTATE, g.gameId)] ?? simulateMacroMatch(g.gameId, g.week, home, away);
        [home, away].filter((t) => teamsById.has(t.id)).forEach((t) => rollGameInjuries(t, g.week));
        g.homeScore = box.homeScore;
        g.awayScore = box.awayScore;
        applyGameResult(home, away, box.homeScore, box.awayScore, false);
      });

    // Coach Points: the weekly allowance plus a bonus for a regular-season win; unspent CP carries over.
    // Program events can run once per week.
    const userGame = getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
    const userWon =
      userGame?.homeScore !== undefined &&
      (userGame.homeTeamId === userTeamId ? userGame.homeScore > userGame.awayScore! : userGame.awayScore! > userGame.homeScore);
    const { coachTalents } = get();
    const meters = userTeam.programMeters;
    // The board rewards wins and notices losses
    if (userGame?.homeScore !== undefined) {
      meters.schoolBoardTrust = Math.max(0, Math.min(100, meters.schoolBoardTrust + (userWon ? BOARD_RESULT_DELTA.win : BOARD_RESULT_DELTA.loss)));
    }
    set({
      coachPoints:
        get().coachPoints +
        Math.round(weeklyCpIncome(nextWeek, coachTalents, meters.schoolBoardTrust) * staffBonuses(get().coachingStaff).coachPointMultiplier) +
        staffBonuses(get().coachingStaff).weeklyCoachPoints +
        (userWon ? winBonus(false, coachTalents) : 0),
      feederEventsThisWeek: []
    });
    // Records and scores changed in place: new array references so every screen (standings, scoreboard) refreshes
    set({ leagueTeams: [...leagueTeams], seasonSchedule: [...seasonSchedule] });

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

    // Recruiting contacts can be made once a week each
    set({ scoutingPool: get().scoutingPool.map((p) => (p.actionsThisWeek?.length ? { ...p, actionsThisWeek: [] } : p)) });

    // Rival programs keep working their recruiting targets (and some bend the rules)
    if (ctx) {
      set({
        scoutingPool: advanceRivalRecruiting(get().scoutingPool, ctx, nextWeek),
        statewideRecruits: advanceRivalRecruiting(get().statewideRecruits, ctx, nextWeek)
      });
    }
    // The State and National lists: zoned schools keep working their kids, contacts reset
    set({ widePool: advanceWidePool(get().widePool) });

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
        const ineligible = removeImproperRecruits(userTeam);
        const probationUntil = year + PROBATION_SEASONS - 1;
        set({ userProbationUntil: probationUntil });
        caughtNews.push({
          id: `news_user_violation_${year}_${nextWeek}`,
          week: nextWeek,
          outlet: 'STATE_SPORTS_CENTRAL',
          headline: `Investigation Finds ${userTeam.name} Boosters Made Improper Recruiting Offers`,
          content: `State association investigators uncovered improper offers to recruits.${userViolationHeat >= BAN_HEAT_THRESHOLD ? ' The program is barred from the playoffs this season' : ' The program avoids a postseason ban this time'}${sanctionDetails(ineligible.length, probationUntil)}`,
          impactSentiment: 'NEGATIVE',
          featuredTeamName: userTeam.name
        });
        set({ userViolationHeat: 0, ...(userViolationHeat >= BAN_HEAT_THRESHOLD && { sanctionLevel: 3 as const }) });
      }
      if (caughtNews.length > 0) set({ newsArticles: [...caughtNews, ...get().newsArticles] });
    }

    // Playoff weeks: finish the current round (simulating the user's game if skipped) and seed the next
    const { playoffBracket } = get();
    // Who played this week: game fatigue for the week's practice
    const played = new Set<string>();
    [...seasonSchedule, ...get().interstateGames]
      .filter((g) => g.week === currentWeek && g.homeScore !== undefined)
      .forEach((g) => [g.homeTeamId, g.awayTeamId].forEach((id) => played.add(id)));
    let playoffResult: { node: BracketNode; label: string } | null = null; // the coach's playoff game this week, for the news
    if (playoffBracket?.isPlayoffsActive && bracketRoundForWeek(playoffBracket, currentWeek) >= 0) {
      const userNode = findUserNode(playoffBracket, userTeamId)?.node;
      const linked = relinkBracketTeams(playoffBracket, leagueTeams);
      // Games played ahead keep their results (their injuries are rolled here, as the round is decided)
      const before = new Set(linked.divisions.flatMap((d) => d.rounds[linked.currentRoundIndex] ?? []).filter((n) => n.winnerTeamId).map((n) => n.matchupId));
      applyRunAheadRound(linked, league?.state ?? 'Texas', get().weekResults, currentWeek);
      linked.divisions
        .flatMap((d) => d.rounds[linked.currentRoundIndex] ?? [])
        .filter((n) => n.winnerTeamId && !n.isBye && !before.has(n.matchupId))
        .forEach((n) => [n.team1, n.team2].forEach((t) => rollGameInjuries(t, currentWeek)));
      linked.divisions
        .flatMap((d) => d.rounds[linked.currentRoundIndex] ?? [])
        .filter((n) => !n.isBye)
        .forEach((n) => [n.team1, n.team2].forEach((t) => played.add(t.id)));
      const mine = linked.divisions.flatMap((d) => d.rounds[linked.currentRoundIndex] ?? []).find((n) => !n.isBye && (n.team1.id === userTeamId || n.team2.id === userTeamId));
      if (mine?.team1Score !== undefined) playoffResult = { node: mine, label: rulesForState(league?.state).playoffs.roundLabels[linked.roundNames[linked.currentRoundIndex]] };
      set({ playoffBracket: advancePlayoffRound(linked) });
      if (userNode?.winnerTeamId === userTeamId) {
        userTeam.programMeters.schoolBoardTrust = Math.min(100, userTeam.programMeters.schoolBoardTrust + BOARD_RESULT_DELTA.playoffWin);
        set({ coachPoints: get().coachPoints + winBonus(true, get().coachTalents) });
      }
    }

    // A dilemma's Friday edge is used up by the coach's game this week (camp and bye weeks keep it for the next one)
    const userPlayed =
      currentWeek > LAST_REGULAR_SEASON_WEEK ||
      [...seasonSchedule, ...get().interstateGames].some((g) => g.week === currentWeek && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
    if (userPlayed) userTeam.fridayEdge = 0;
    // What the coach said at the post-game press carries into next week's game
    if (userTeam.pendingFridayEdge) {
      userTeam.fridayEdge = Math.max(-3, Math.min(3, (userTeam.fridayEdge ?? 0) + userTeam.pendingFridayEdge));
      userTeam.pendingFridayEdge = 0;
    }

    // Whistleblowers: risky/corrupt decisions can surface in a later week (design spec 12.1)
    const { dilemmaLog, currentYear } = get();
    const exposures = dilemmaLog.filter((r) => r.year === currentYear && r.exposureWeek === nextWeek);
    const exposureArticles: NewsArticle[] = exposures.map((r) => {
      const meters = userTeam.programMeters;
      meters.complianceScore = Math.max(0, meters.complianceScore - 15);
      meters.schoolBoardTrust = Math.max(0, meters.schoolBoardTrust - 10);
      meters.boosterApproval = Math.max(0, meters.boosterApproval - 5);
      // The dilemma's own story (its "future reckoning"), then the call that was made
      const story = exposureNews(r, userTeam.name);
      return {
        id: `news_exposed_${r.templateId}_${nextWeek}`,
        week: nextWeek,
        outlet: 'TOWN_JOURNAL',
        headline: story.headline,
        content: story.content,
        impactSentiment: 'NEGATIVE',
        featuredTeamName: userTeam.name
      };
    });
    if (exposureArticles.length > 0) set({ newsArticles: [...exposureArticles, ...get().newsArticles] });

    // The Director of Football Operations works the boosters and the compliance office every week
    // (meters stay whole numbers: a fraction of a point lands as a full point that often)
    const programStaff = staffBonuses(get().coachingStaff);
    const wholePoints = (x: number) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);
    userTeam.programMeters.boosterApproval = Math.min(100, userTeam.programMeters.boosterApproval + wholePoints(programStaff.boosterDrift));
    userTeam.programMeters.complianceScore = Math.min(100, userTeam.programMeters.complianceScore + wholePoints(programStaff.complianceDrift));

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

    // Season opener: the other states develop at the same pace as the coach's fully simulated league
    // Season opener: measure the league against a rolled one (next season's light leagues are mapped with it)
    if (nextWeek === FIRST_NON_DISTRICT_WEEK && league) set({ lightCalibration: measureLightCalibration(league.state ?? 'Texas', leagueTeams) });

    // Practice: every program trains (and its players tire and recover). The coach picks the intensity;
    // computer programs push in weeks without a game and ease off in game weeks.
    const userBoosts = userTrainingBoosts(get(), userTeam);
    leagueTeams.forEach((team) => {
      const isUser = team.id === userTeamId;
      const intensity = isUser ? practiceIntensity : aiIntensity(played.has(team.id));
      const report = runTrainingWeek(team, intensity, phase, currentWeek, played.has(team.id), isUser ? userBoosts : NO_BOOSTS);
      if (isUser && PHASE_TRAINING[phase] > 0) set({ lastTrainingReport: report });
    });

    // Postseason starts the week after the regular season
    if (nextWeek === LAST_REGULAR_SEASON_WEEK + 1) {
      get().startPostseason();
      return;
    }

    // Banquet once the state championship games are decided: signing day for every senior in the state
    if (phase === 'STATE_PLAYOFFS' && get().playoffBracket?.isPlayoffsActive === false) {
      const seniors = userTeam.roster.filter((p) => p.classYear === 'Senior');
      const { signings, prestigeChanges } = runSigningDay(leagueTeams, get().currentYear);
      const news = signingDayNews(signings, prestigeChanges.get(userTeamId) ?? 0, userTeam, get().currentYear, nextWeek);
      // The final polls and leaders, with every state's title game in
      const everyone = nationalTeams(leagueTeams, get().nationalLeagues);
      // The full year is in: score it for the career's leaderboard
      const career = get().career;
      const scored = career && !isCareerComplete(career) && !career.seasons.some((s) => s.year === get().currentYear) ? { ...career, seasons: [...career.seasons, scoreSeason(userTeam, get().playoffBracket, get().currentYear)] } : career;
      if (scored && scored !== career) recordCareer(scored);
      set({
        career: scored,
        currentWeek: nextWeek,
        graduatingSeniors: seniors,
        isBanquetActive: true,
        newsArticles: [...news, ...get().newsArticles],
        polls: generateNationalAndStatePolls(everyone, polls, nextWeek, collectResults(get()), league?.state ?? 'Texas'),
        playerRankings: generatePlayerRankingsAndLeaderboards(everyone, nextWeek),
        leagueTeams: [...leagueTeams]
      });
      return;
    }

    // 1. Weekly triage for every program: injuries heal, and every third week brings
    // report cards ("No Pass, No Play"). AI programs keep their struggling students in study hall; the
    // user handles grades through dilemmas.
    const stateRules = rulesForState(league?.state);
    const inCamp = phase === 'SUMMER_CAMP';
    leagueTeams.forEach((team) => {
      const isUser = team.id === userTeamId;
      team.roster.forEach((p) => {
        processWeeklyInjuryHealing(p, currentWeek);
        // Report cards every third week once the school year and season are under way
        if (nextWeek % 3 === 0 && nextWeek >= FIRST_NON_DISTRICT_WEEK) evaluateAcademicReport(p, !isUser && isAcademicallyAtRisk(p, stateRules) ? 0.1 : 0, stateRules);
      });
    });
    // Morale: training camp brings the team together. Below 50, starters get suspended.
    if (inCamp) meters.lockerRoomDiscipline = Math.min(100, meters.lockerRoomDiscipline + CAMP_MORALE);
    const suspended = currentWeek < LAST_REGULAR_SEASON_WEEK + 6 ? pickSuspension(userTeam) : undefined;
    if (suspended) {
      Object.assign(suspended.condition, { injuryStatus: 'DINGED', injuryWeeksRemaining: 1, injuredInWeek: currentWeek, isSuspended: true });
      set({
        newsArticles: [
          {
            id: `news_suspension_${suspended.id}_${nextWeek}`,
            week: nextWeek,
            outlet: 'TOWN_JOURNAL',
            headline: `${userTeam.name} Suspends ${suspended.position} ${suspended.firstName} ${suspended.lastName}`,
            content: `Sagging locker-room morale costs ${userTeam.name} a starter: ${suspended.lastName} sits this week's game.`,
            impactSentiment: 'NEGATIVE',
            featuredTeamName: userTeam.name
          },
          ...get().newsArticles
        ]
      });
    }

    // 2. Recalculate National & State Team Polls
    const everyone = nationalTeams(leagueTeams, get().nationalLeagues);
    const updatedPolls = generateNationalAndStatePolls(everyone, polls, nextWeek, collectResults(get()), league?.state ?? 'Texas');
    // The coach's result and any real move in the polls lead next week's headlines
    const headlineNews: NewsArticle[] = [];
    if (userGame?.homeScore !== undefined && userGame.awayScore !== undefined) {
      const home = userGame.homeTeamId === userTeamId;
      const opponent = everyone.find((t) => t.id === (home ? userGame.awayTeamId : userGame.homeTeamId));
      if (opponent) headlineNews.push(gameResultNews(nextWeek, userTeam, opponent, home ? userGame.homeScore : userGame.awayScore, home ? userGame.awayScore : userGame.homeScore, polls));
    } else if (playoffResult) {
      const { node, label } = playoffResult;
      const first = node.team1.id === userTeamId;
      headlineNews.push(gameResultNews(nextWeek, userTeam, first ? node.team2 : node.team1, (first ? node.team1Score : node.team2Score) ?? 0, (first ? node.team2Score : node.team1Score) ?? 0, polls, label));
    }
    const pollStory = rankingNews(polls, updatedPolls, userTeam, league?.state ?? 'Texas', nextWeek);
    if (pollStory) headlineNews.push(pollStory);

    // 3. Recalculate Player Stats Leaderboards & Positional Prospect Rankings
    const updatedPlayerRankings = generatePlayerRankingsAndLeaderboards(everyone, nextWeek);

    // 4. College recruiting statewide (offers, commitments, flips) & Weekly Dilemma
    if (nextWeek === MID_SEASON_STAR_UPDATE_WEEK) updateStarRatings(nationalTeams(leagueTeams, get().nationalLeagues), true);
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
      newsArticles: [...headlineNews, ...collegeNews, ...newArticles, ...get().newsArticles],
      districtTeams: [...districtTeams],
      leagueTeams: [...leagueTeams] // sanctions/forfeits above can change records too
    };

    set({ ...updatedState, weekResults: null });

    // Auto-save state to IndexedDB in background
    persistSaveGame(buildSaveRecord(get(), AUTOSAVE_SLOT, `Week ${nextWeek} - ${userTeam.name}`));
    // The rest of the week's games play out in the background while the coach makes his decisions
    whenIdle(() => get().runAhead());
  },

  // The paid staff: its game-day edge and injury resistance live on the coach's team (the engines read them there)
  setCoachingStaff: (staff) => {
    const team = get().leagueTeams.find((t) => t.id === get().userTeamId);
    if (team) {
      team.gameDayEdge = staffGameDayEdge(staff);
      team.injuryResistance = staffBonuses(staff).injuryReduction;
    }
    set({ coachingStaff: staff, weekResults: null });
  },

  runAhead: () => {
    const { weekResults, currentWeek } = get();
    if (weekResults?.week === currentWeek) return weekResults;
    const results = runAheadWeek(get());
    set({ weekResults: results });
    return results;
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
        rules: rulesForState(league.state),
        schedule: get().seasonSchedule,
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

  finishBanquet: () => {
    const { currentWeek, coachPoints, coachTalents } = get();
    set({ isBanquetActive: false, currentWeek: currentWeek + 1, feederEventsThisWeek: [], coachPoints: coachPoints + weeklyCpIncome(currentWeek + 1, coachTalents, get().districtTeams.find((t) => t.id === get().userTeamId)?.programMeters.schoolBoardTrust) });
  },

  transitionToNextYear: () => {
    const { districtTeams, leagueTeams, league, userTeamId, currentYear } = get();
    // Every program graduates seniors, moves classes up and progresses; newcomers arrive after feeder signing
    // day (pre season week 2), when the pipeline's prospects pick their schools
    const userTeam = leagueTeams.find((t) => t.id === userTeamId)!;
    // The career's last season is in the books
    const career = get().career;
    if (career && isCareerComplete(career)) {
      set({ careerComplete: true });
      return;
    }
    // The school board's season-end review
    const review = boardReview(userTeam.programMeters.schoolBoardTrust, get().onHotSeat);
    if (review === 'FIRED') {
      set({ firedFrom: userTeam.name });
      return;
    }
    const boardNews: NewsArticle[] =
      review === 'HOT_SEAT'
        ? [
            {
              id: `news_hot_seat_${currentYear}`,
              week: 1,
              outlet: 'TOWN_JOURNAL',
              headline: `School Board Puts ${userTeam.name} Coach on the Hot Seat`,
              content: `Board members say confidence in the program is low. Another season like this one and the board will make a change.`,
              impactSentiment: 'NEGATIVE',
              featuredTeamName: userTeam.name
            }
          ]
        : [];
    const seasonRecap: SeasonRecap = {
      year: currentYear,
      wins: userTeam.record.wins,
      losses: userTeam.record.losses,
      districtFinish: calculateDistrictStandings(districtTeams).findIndex((r) => r.teamId === userTeamId) + 1,
      graduated: userTeam.roster.filter((p) => p.classYear === 'Senior').length,
      returningStarters: userTeam.roster.filter((p) => p.depthChartTier === 1 && p.classYear !== 'Senior').length
    };
    const staff = staffBonuses(get().coachingStaff);
    leagueTeams.forEach((team) =>
      team.id === userTeamId
        ? graduateAndProgress(team, offseasonConditioningBonus(get().coachTalents), { byPosition: staff.developmentByPosition, allPlayers: staff.allPlayersDevelopment, young: staff.freshmanDevelopment })
        : graduateAndProgress(team, 0)
    );
    // New recruiting cycle: offers carry over, exposure and calls reset, stars re-evaluated after progression
    resetSeasonRecruiting(leagueTeams);
    updateStarRatings(leagueTeams, false);

    // AI programs' prestige drifts back toward their history (the coach's program is his to build or lose)
    leagueTeams.forEach((team) => {
      if (team.id === userTeamId) return;
      team.prestige = Math.max(40, Math.min(99, team.prestige + prestigeReversion(team.prestige, team.historicalPrestige ?? team.prestige)));
    });

    // Year-end investigations: some programs get caught, the rest see their evidence fade
    const investigationNews: NewsArticle[] = [];
    leagueTeams.forEach((team) => {
      const profile = team.feederProfile;
      if (!profile || team.id === userTeamId) return;
      // Coaching changes: a new head coach brings his own integrity (a cleaned-up program can slip again)
      if (Math.random() < COACHING_CHANGE_CHANCE) {
        profile.ethics = initialFeederProfile().ethics;
        team.staff.headCoachName = `Coach ${randomSurname(team.nameProfile)}`;
      }
      if (profile.violationHeat > 0 && Math.random() < yearEndDetectionChance(profile.violationHeat)) {
        investigationNews.push(punishCaughtProgram(team, currentYear + 1, 1));
      } else {
        profile.violationHeat = Math.round(profile.violationHeat * HEAT_DECAY);
      }
      profile.strategy = onProbation(profile.probationUntil, currentYear + 1) ? 'BUILD_LOCAL' : chooseFeederStrategy(team);
    });
    let { userViolationHeat } = get();
    let pendingUserBan = false;
    let { userProbationUntil } = get();
    if (userViolationHeat > 0 && Math.random() < yearEndDetectionChance(userViolationHeat)) {
      pendingUserBan = userViolationHeat >= BAN_HEAT_THRESHOLD;
      userTeam.programMeters.complianceScore = Math.max(0, userTeam.programMeters.complianceScore - 35);
      userTeam.prestige = Math.max(40, userTeam.prestige - 6);
      const ineligible = removeImproperRecruits(userTeam);
      userProbationUntil = currentYear + PROBATION_SEASONS;
      investigationNews.push({
        id: `news_user_violation_${currentYear}_offseason`,
        week: 1,
        outlet: 'STATE_SPORTS_CENTRAL',
        headline: `Off-Season Investigation Lands on ${userTeam.name}`,
        content: `Investigators found improper recruiting offers by ${userTeam.name} boosters.${pendingUserBan ? ' The program is barred from the playoffs next season' : ' The program avoids a postseason ban'}${sanctionDetails(ineligible.length, userProbationUntil)}`,
        impactSentiment: 'NEGATIVE',
        featuredTeamName: userTeam.name
      });
      userViolationHeat = 0;
    } else {
      userViolationHeat = Math.round(userViolationHeat * HEAT_DECAY);
    }
    if (currentYear % 2 === 0) {
      processStateRealignment(districtTeams);
    }

    leagueTeams.forEach((t) => {
      t.record = emptyRecord();
    });

    // The other states start their new season too (programs keep their prestige, nudged by last season)
    const nationalLeagues = buildNationalWorld(league?.state ?? 'Texas', currentYear + 1, get().nationalLeagues);
    // Mapped with this season's opener measurement (rosters are between classes now), before the pairing below
    applyLightCalibration(nationalLeagues, get().lightCalibration ?? measureLightCalibration(league?.state ?? 'Texas', leagueTeams));
    updateStarRatings(nationalLeagues.flatMap((l) => l.teams), false);
    const everyone = nationalTeams(leagueTeams, nationalLeagues);
    const nextSchedule = league ? generateSeasonSchedule(leagueRegionTeams(league, leagueTeams), currentYear + 1, { reservedWeeks: [INTERSTATE_WEEK] }) : [];
    // Paired on last opener's ratings: this year's freshmen haven't arrived, and the thinned rosters would have drawn
    // weaker opponents (the league then opened every season as a favorite and inflated its national rankings)
    const interstateGames = league
      ? planInterstate(league.state ?? 'Texas', leagueTeams, nextSchedule, nationalLeagues, currentYear + 1, userTeamId, get().lightCalibration?.teamRatings)
      : [];
    const newPolls = generateNationalAndStatePolls(everyone, null, 1, [], get().league?.state ?? 'Texas');
    const newPlayerRankings = generatePlayerRankingsAndLeaderboards(everyone, 1);

    set({
      currentWeek: 1,
      currentYear: currentYear + 1,
      isBanquetActive: false,
      playoffBracket: null,
      sanctionLevel: pendingUserBan ? 3 : 0,
      graduatingSeniors: [],
      nationalLeagues,
      polls: newPolls,
      playerRankings: newPlayerRankings,
      userViolationHeat,
      pendingUserBan,
      userProbationUntil,
      feederEventsThisWeek: [],
      coachPoints: get().coachPoints + weeklyCpIncome(1, get().coachTalents, userTeam.programMeters.schoolBoardTrust),
      onHotSeat: review === 'HOT_SEAT',
      seasonRecap,
      newsArticles: [...boardNews, ...investigationNews, ...get().newsArticles],
      districtTeams: [...districtTeams],
      leagueTeams: [...leagueTeams],
      seasonSchedule: nextSchedule,
      interstateGames
    });
  },

  // Player of the Game: +1 to a key skill and college exposure, and a story in the paper
  awardGameBall: (playerId, summary) => {
    const { districtTeams, userTeamId, currentYear, currentWeek } = get();
    const team = districtTeams.find((t) => t.id === userTeamId);
    const player = team?.roster.find((p) => p.id === playerId);
    if (!team || !player) return;
    const { skill, exposure } = awardGameBall(player, currentYear);
    const article: NewsArticle = {
      id: `news_gameball_${player.id}_${currentYear}_${currentWeek}`,
      week: currentWeek,
      outlet: 'TOWN_JOURNAL',
      headline: `${player.firstName} ${player.lastName} Earns the Game Ball ${summary.won ? 'in' : 'Despite'} ${summary.won ? 'Win Over' : 'Loss to'} ${summary.opponentName}`,
      content: `${player.position} ${player.firstName} ${player.lastName} was ${team.name}'s Player of the Game (${summary.score}): ${summary.line}. ${attributeLabel(skill)} +1${exposure ? ', and more college exposure' : ''}.`,
      impactSentiment: 'POSITIVE',
      featuredPlayerName: `${player.firstName} ${player.lastName}`,
      featuredTeamName: team.name
    };
    set({ districtTeams: [...districtTeams], newsArticles: [article, ...get().newsArticles] });
  },

  // The post-game press: the answer works like a dilemma choice; its Friday edge waits for next week's game
  answerPress: (question, choice) => {
    const { districtTeams, userTeamId, currentYear, currentWeek, pressLog } = get();
    const team = districtTeams.find((t) => t.id === userTeamId);
    if (!team) return;
    const { fridayEdgeDelta, ...rest } = choice.impact;
    executeDilemmaDecision(team, { ...choice, impact: rest });
    if (fridayEdgeDelta) team.pendingFridayEdge = (team.pendingFridayEdge ?? 0) + fridayEdgeDelta;
    const quote: NewsArticle = {
      id: `news_press_${question.id}_${currentYear}_${currentWeek}`,
      week: currentWeek,
      outlet: question.outlet,
      headline: choice.id === NO_COMMENT.id ? `${team.name} Coach Skips the Press Conference` : `Coach on the Record: ${choice.label}`,
      content: choice.id === NO_COMMENT.id ? `Asked "${question.question}", the ${team.name} coach left without taking questions.` : `Asked "${question.question}", the ${team.name} coach said ${choice.label}`,
      impactSentiment: choice.id === NO_COMMENT.id ? 'NEGATIVE' : 'NEUTRAL',
      featuredTeamName: team.name
    };
    set({
      districtTeams: [...districtTeams],
      pressLog: [...pressLog, { questionId: question.id, year: currentYear, week: currentWeek, phrasing: question.phrasing }],
      coachPoints: Math.max(0, get().coachPoints + (choice.impact.coachPointsDelta ?? 0)),
      newsArticles: [quote, ...get().newsArticles]
    });
  },

  resolveDilemma: (choice) => {
    const { districtTeams, userTeamId, activeDilemma, dilemmaLog, currentWeek, currentYear } = get();
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    // Named before the decision runs: a player who leaves the program is still the one the story is about
    const involved = userTeam.roster.find((p) => p.id === activeDilemma?.involvedPlayerId);
    executeDilemmaDecision(userTeam, choice);

    const record: DilemmaRecord = {
      templateId: activeDilemma?.templateId ?? activeDilemma?.id ?? 'UNKNOWN',
      title: activeDilemma?.title ?? choice.label,
      year: currentYear,
      week: currentWeek,
      tier: choice.tier,
      choiceLabel: choice.label,
      ...(involved && { playerName: `${involved.firstName} ${involved.lastName}` }),
      ...(Math.random() < EXPOSURE_CHANCE[choice.tier] && { exposureWeek: currentWeek + randomInt(1, 3) })
    };
    set({
      activeDilemma: null,
      districtTeams: [...districtTeams],
      dilemmaLog: [...dilemmaLog, record],
      coachPoints: Math.max(0, get().coachPoints + (choice.impact.coachPointsDelta ?? 0)) // a booster's thanks, or tutors paid for
    });
  },

  setPracticeIntensity: (mode) => set({ practiceIntensity: mode }),
  markNewsSeen: () => set({ newsSeen: get().newsArticles.length }),
  setActiveGame: (game) => set({ activeGame: game }),

  // Applies a finished live game: the scheduled result and team records (regular season only) and player season stats
  recordUserGame: (finalState) => {
    const { districtTeams, leagueTeams, seasonSchedule, currentWeek, userTeamId, playoffBracket } = get();
    const everyTeam = nationalTeams(leagueTeams, get().nationalLeagues);
    const home = everyTeam.find((t) => t.id === finalState.homeTeam.id);
    const away = everyTeam.find((t) => t.id === finalState.awayTeam.id);

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
    // Live games cause injuries too
    [home, away].forEach((team) => team && rollGameInjuries(team, currentWeek));

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
    if (coachPoints < cost || feederEventsThisWeek.includes(type) || !feederEventsOpen(get())) return [];
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

  removeFeederProspect: (prospectId) =>
    set({ scoutingPool: get().scoutingPool.filter((p) => p.id !== prospectId), widePool: get().widePool.filter((p) => p.id !== prospectId) }),

  contactFeederProspect: (prospectId, action) => {
    const { coachPoints, scoutingPool, widePool } = get();
    const prospect = scoutingPool.find((p) => p.id === prospectId) ?? widePool.find((p) => p.id === prospectId);
    const { cost } = CONTACT_ACTIONS[action];
    if (!prospect || coachPoints < cost || prospect.actionsThisWeek?.includes(action)) return;
    if (onProbation(get().userProbationUntil, get().currentYear) && restrictedOnProbation(prospect)) return;
    const bonus = staffBonuses(get().coachingStaff).feederInterest;
    const contact = (p: FeederProspect) => (p.id === prospectId ? contactProspect(p, action, bonus) : p);
    set({ coachPoints: coachPoints - cost, ...(prospect.scope ? { widePool: widePool.map(contact) } : { scoutingPool: scoutingPool.map(contact) }) });
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
    if (!prospect || prospect.userInducement || coachPoints < INDUCEMENT_CP_COST || onProbation(get().userProbationUntil, get().currentYear)) return;
    set({
      coachPoints: coachPoints - INDUCEMENT_CP_COST,
      userViolationHeat: userViolationHeat + inducementHeat(prospect),
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? { ...p, userInducement: true } : p))
    });
  },

  pitchFeederStar: (prospectId) => {
    const { coachPoints, scoutingPool, districtTeams, userTeamId } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.PITCH_STAR || onProbation(get().userProbationUntil, get().currentYear)) return;
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


  // Feeder signing day: the user's pipeline and the statewide elite pick their schools, every program's
  // incoming class joins (open spots filled with freshmen), and the next cycle's pipeline opens
  runFeederSigningDay: () => {
    const { leagueTeams, districtTeams, userTeamId, scoutingPool, currentYear, currentWeek } = get();
    const userTeam = leagueTeams.find((t) => t.id === userTeamId)!;
    const ctx = recruitingContext(get());
    const feederClass = resolveFeederClass(scoutingPool, userTeam, ctx);
    const elite = ctx ? resolveStatewideElite(get().statewideRecruits, ctx) : { signings: [] as RivalSigning[], headlines: [] as string[] };
    // The State and National lists sign too: the user's wins join the class
    const wide = ctx ? resolveWidePool(get().widePool, ctx) : { joined: [] as Player[], rivalSignings: [] as RivalSigning[], outcomes: [] as FeederOutcome[] };
    feederClass.joined.push(...wide.joined);
    feederClass.outcomes.push(...wide.outcomes);
    const rivalIncoming = new Map<string, Player[]>();
    [...feederClass.rivalSignings, ...wide.rivalSignings, ...elite.signings].forEach(({ teamId, player }) => {
      rivalIncoming.set(teamId, [...(rivalIncoming.get(teamId) ?? []), player]);
    });
    const probationPenalty = (until: number | null | undefined) => (onProbation(until, currentYear) ? PROBATION_FRESHMAN_PENALTY : 0);
    // Every program's walk-on class rides its own talent wave this year
    const userWave = rollClassWave();
    leagueTeams.forEach((team) => {
      if (team.id === userTeamId) addIncomingClass(team, feederClass.joined, userWave - probationPenalty(get().userProbationUntil));
      else
        addIncomingClass(
          team,
          rivalIncoming.get(team.id) ?? [],
          rollClassWave() + STRATEGY_FRESHMAN_ADJUSTMENT[team.feederProfile?.strategy ?? 'BUILD_LOCAL'] - probationPenalty(team.feederProfile?.probationUntil),
          true
        );
    });
    enforceVarsityRosterLimit(userTeam, feederClass.joined, feederClass.outcomes);
    // The pool is shared across the region: report only on the user's own pipeline (and anyone who chose the user)
    const pipelineIds = new Set([...scoutingPool.filter(inUserPipeline), ...get().widePool.filter((p) => p.coachContacts > 0)].map((p) => p.id));
    const outcomes = feederClass.outcomes.filter((o) => pipelineIds.has(o.prospectId) || o.outcome === 'JOINED' || o.outcome === 'JV_TEAM');
    updateStarRatings(leagueTeams, false);

    const week = currentWeek + 1;
    const eliteNews: NewsArticle[] = elite.headlines.map((headline, i) => ({
      id: `news_elite_${currentYear}_${i}`,
      week,
      outlet: 'PREP_GRIDIRON_TALK',
      headline,
      content: 'One of the most sought-after newcomers in the state has picked a program.',
      impactSentiment: 'NEUTRAL'
    }));
    const joinedCount = outcomes.filter((o) => o.outcome === 'JOINED').length;
    const classArticle: NewsArticle = {
      id: `news_feeder_class_${currentYear}`,
      week,
      outlet: 'TOWN_JOURNAL',
      headline: `Prospect Signing Day: ${userTeam.name} Welcomes ${joinedCount} Newcomers to the Program`,
      content: `${joinedCount} of ${outcomes.length} prospects in your pipeline chose ${userTeam.name}. ${
        outcomes.filter((o) => o.outcome === 'OTHER_SCHOOL').length
      } enrolled elsewhere and ${outcomes.filter((o) => o.outcome === 'LEFT_AREA').length} moved away.${
        userWave >= NOTABLE_CLASS_WAVE
          ? ' Coaches say the walk-on freshmen are the deepest group in years.'
          : userWave <= -NOTABLE_CLASS_WAVE
            ? ' The walk-on freshman class is thin this year.'
            : ''
      }`,
      impactSentiment: joinedCount >= outcomes.length / 2 ? 'POSITIVE' : 'NEUTRAL',
      featuredTeamName: userTeam.name
    };
    set({
      scoutingPool: generateFeederPool(userTeam, ctx),
      statewideRecruits: ctx ? generateStatewideElite(ctx) : [],
      widePool: ctx ? generateWidePool(ctx, get().league?.state ?? 'Texas', get().nationalLeagues) : [],
      lastFeederResults: outcomes,
      feederClassYear: currentYear + 1,
      newsArticles: [classArticle, ...eliteNews, ...get().newsArticles],
      districtTeams: [...districtTeams],
      leagueTeams: [...leagueTeams]
    });
  },


}));
