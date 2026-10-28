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
  TryoutSport,
  clearYearlyCooldowns,
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
  boostProspect,
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
import { calculateSeasonAwards, honoredPlayers, SeasonAwardsRecord } from '../sim/awardsEngine';
import { processStateRealignment } from '../sim/realignmentEngine';
import { generateNationalAndStatePolls } from '../sim/nationalRankingEngine';
import { collectResults } from '../sim/computerRankings';
import { advanceWidePool, generateWidePool, resolveWidePool } from '../sim/widePool';
import { HiredCoach, coachGrade, staffBonuses, staffGameDayEdge } from '../sim/coachingStaff';
import { entrySource, track } from '../services/analytics';
import { Career, CareerLength, careerPoints, isCareerComplete, scoreSeason, vacateSeason } from '../sim/careerScore';
import {
  BoosterOffer,
  COMPLIANCE_TRAINING,
  ComplianceEvent,
  ComplianceState,
  RECORDS_CLEANUP,
  SELF_REPORT,
  activeBoosterOffers,
  advanceComplianceWeek,
  clearedCompliance,
  complianceHint,
  complianceSeasonEnd,
  finalReviewChance,
  foundPenalty,
  initialCompliance,
  offerEvidence
} from '../sim/compliance';
import { JobOffer, jobOffers, newContract } from '../sim/jobMarket';
import { coachPrice, contractTerms, ContractYears, FIRST_OFF_SEASON_WEEK, needsSettling, seasonCost, settled, settleKind, staffWindowOpen, withContract } from '../sim/staffContracts';
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
import { finalRecord, liveRecord, lockKey, newCareerKey, PlayedGame, snapshotStats, statLines } from '../sim/gameLock';
import { loadPlayedGames, storeFinal, storeLive } from '../services/playedGames';
import { getUserMatchup } from '../sim/userMatchup';
import type { GameSaveRecord } from '../services/db';
import { addPlayerStats } from '../sim/playerStats';
import { addIncomingClass, graduateAndProgress } from '../sim/offseasonEngine';
import { NOTABLE_CLASS_WAVE, rollClassWave } from '../generators/rosterGenerator';
import { randomSurname } from '../generators/names';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { moveInDepthChart, normalizeDepthChart, setDepthTier } from '../sim/depthChart';
import { REST_STARTERS_LEAD } from '../sim/matchEngine';
import { NO_BOOSTS, PHASE_TRAINING, PracticeIntensity, PracticeSeason, TrainingBoosts, TrainingReport, addPracticeWeek, aiIntensity, migrateIntensity, runTrainingWeek, trainingBoosts } from '../sim/training';
import {
  COACH_TALENTS,
  STARTING_COACH_POINTS,
  TalentId,
  collegeActionCost,
  feederEventCost,
  formatCP,
  offseasonConditioningBonus,
  talentBlocker,
  weeklyCpIncome,
  winBonus
} from '../sim/coachPoints';
import { BOARD_RESULT_DELTA, boardReview, pickSuspension, prestigeReversion } from '../sim/programMeters';
import { rulesForState } from '../sim/stateRules';

const COMPLIANCE_SANCTION_THRESHOLD = 40;
const MAX_COMPLIANCE_HINTS = 8;

const MID_SEASON_STAR_UPDATE_WEEK = 11;

/** What a prospect program did, for its results pop-up: one kind of change each. */
export interface ProgramResult {
  type: FeederEventType;
  discovered: FeederProspect[]; // camps and the Multi-Sport Tryout
  warmed: { prospect: FeederProspect; before: number; after: number }[]; // position programs and Family Night
  scouted: FeederProspect[]; // the Combine: potential revealed
}

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
/** A game's final by its id: a scheduled game (league or out-of-state) or a playoff game ("po_" + its matchup). */
/** Where the career is, for game events: its season (1 = the first) and the week. */
const moment = (s: { currentYear: number; currentWeek: number }) => ({ season: s.currentYear - 2025, week: s.currentWeek });

/** The coach's side of a final, for game events. */
function gameOutcome(userTeamId: string, g: { homeId: string; homeScore: number; awayScore: number }) {
  const mine = g.homeId === userTeamId ? g.homeScore : g.awayScore;
  const theirs = g.homeId === userTeamId ? g.awayScore : g.homeScore;
  return { result: mine > theirs ? 'win' : mine < theirs ? 'loss' : 'tie', margin: mine - theirs };
}

function matchupResult(
  state: Pick<GameStoreState, 'seasonSchedule' | 'interstateGames' | 'playoffBracket'>,
  gameId: string
): { homeId: string; awayId: string; homeScore: number; awayScore: number } | null {
  if (gameId.startsWith('po_')) {
    const node = state.playoffBracket?.divisions.flatMap((d) => d.rounds.flat()).find((n) => `po_${n.matchupId}` === gameId);
    return node && node.team1Score !== undefined && node.team2Score !== undefined
      ? { homeId: node.team1.id, awayId: node.team2.id, homeScore: node.team1Score, awayScore: node.team2Score }
      : null;
  }
  const g = [...state.seasonSchedule, ...state.interstateGames].find((x) => x.gameId === gameId);
  return g && g.homeScore !== undefined && g.awayScore !== undefined ? { homeId: g.homeTeamId, awayId: g.awayTeamId, homeScore: g.homeScore, awayScore: g.awayScore } : null;
}

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
    secondStringLead: state.secondStringLead,
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
    careerHistory: state.careerHistory,
    userProbationUntil: state.userProbationUntil,
    lightCalibration: state.lightCalibration,
    compliance: state.compliance,
    pendingUserBan: state.pendingUserBan,
    onHotSeat: state.onHotSeat,
    ...(state.careerKey && { careerKey: state.careerKey }),
    shortlist: state.shortlist,
    programCooldowns: state.programCooldowns,
    practiceSeason: state.practiceSeason,
    ...(state.difficulty && { difficulty: state.difficulty })
  };
}

const AUTOSAVE_SLOT = 'current_save';
// A new coach's board trust starts at least here: a new hire isn't put on the hot seat before his first game
const NEW_JOB_BOARD_TRUST = 60;

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
  career: Career | null; // the current contract: its seasons are scored for its Hall of Fame entry
  careerHistory: Career[]; // the coach's finished contracts in this save (Team › Career)
  jobOffers: JobOffer[]; // offers waiting when a contract ends
  contractRenewable: boolean; // the board would extend the coach when his contract ends
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
  shortlist: string[]; // prospects the coach put on his list (Prospects › List › My List)
  careerKey: string | null; // this playthrough, across its saves: its played games are written down (sim/gameLock.ts)
  playedGames: Record<string, PlayedGame>; // the career's games that kicked off, live or final
  lockNotice: { year: number; week: number; opponentName: string; userScore: number; opponentScore: number; seen: boolean } | null; // a final put back after loading a save
  sanctionLevel: 0 | 1 | 2 | 3; // state association sanctions this season (design spec 12.2)
  scoutingPool: FeederProspect[]; // next season's feeder pipeline (15-40 prospects)
  feederEventsThisWeek: FeederEventType[];
  programCooldowns: Partial<Record<FeederEventType, number>>; // weeks before each program can run again
  lastFeederResults: FeederOutcome[] | null; // how last year's class turned out
  statewideRecruits: FeederProspect[]; // elite out-of-area recruits contested by the top AI programs
  widePool: FeederProspect[]; // prospects beyond the region: the rest of the state (Texas) and the other states
  weekResults: WeekResults | null; // this week's other games, simulated ahead (shown live during the coach's game)
  interstateGames: ScheduledGame[]; // the season's out-of-state games, every state (the league's are also in its schedule)
  coachingStaff: HiredCoach[]; // the coach's paid assistants (game-day edge, development, injuries, Coach Points)
  setCoachingStaff: (staff: HiredCoach[]) => void;
  hireCoach: (coach: HiredCoach, years: ContractYears, ducatsPaid?: boolean) => string | null; // null when hired, else why not (ducat coaches: paid on the account first)
  releaseCoach: (role: HiredCoach['role']) => void;
  settleStaff: (keep: HiredCoach['role'][], letGo: HiredCoach['role'][], ducatsPaid?: boolean) => string | null; // the off-season: pay or renew, and let go (the ducat part paid on the account first)
  runAhead: () => WeekResults; // simulates this week's other games now if they haven't been (idempotent)
  compliance: ComplianceState; // the coach's booster offers and the state's slow investigation (sim/compliance)
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
  secondStringLead: number | null; // the lead that sends in the coach's second string (null: never), from the strategy room
  setSecondStringLead: (lead: number | null) => void;
  feederClassYear: number; // the season the current pipeline's class arrives (signing day is week 2 of that season)
  seasonRecap: SeasonRecap | null; // last season in brief, for the Hub's new-season headline
  viewedTeamId: string | null; // the team page that is open (not saved)
  openTeamProfile: (teamId: string | null) => void;
  viewedPlayerId: string | null; // the player card that is open (not saved): the same card from every screen
  openPlayerCard: (playerId: string | null) => void;
  lastTrainingReport: TrainingReport | null; // what last week's practice did
  practiceSeason: PracticeSeason | null; // what practice has added up to this year

  // Postseason & Offseason state
  playoffBracket: PlayoffBracketState | null;
  graduatingSeniors: Player[];
  seasonAwards: SeasonAwardsRecord | null; // the state's honors, decided when the banquet opens
  isBanquetActive: boolean;
  onHotSeat: boolean; // the board's warning: another season under 35 Board Trust ends the job
  firedFrom: string | null; // set when the board fires the coach (game over for this save)
  careerComplete: boolean; // the contract's last season is done: extend, take a job, or leave the world
  extendContract: (length: CareerLength) => void; // a new contract at the same school (a new Hall of Fame entry)
  acceptJob: (teamId: string, length: CareerLength) => void; // a new contract at another school in the world
  userProbationUntil: number | null; // last season of the coach's recruiting probation after getting caught
  lightCalibration: LightCalibration | null; // how the other states' rolled ratings map onto the coach's league (measured each opener)

  // Actions
  startNewSeason: (world?: GameWorld) => void; // default: the Texas 6A world
  newGame: (difficulty: Difficulty, state?: string) => string; // random school in the state (Texas by default) for the difficulty; returns its name
  newScenarioGame: (scenario: ScenarioId, state: string, school: string, coachName: string, length: CareerLength) => void; // a scored career at a scenario program
  loadGame: (save: GameSaveRecord) => void;
  saveGame: (saveName?: string) => Promise<string>; // new save slot; returns its id
  autosave: () => Promise<void>; // the autosave slot, now (before leaving the page, e.g. to sign in)
  advanceWeek: () => void;
  resolveDilemma: (choice: DilemmaChoice) => void;
  awardGameBall: (playerId: string, summary: { opponentName: string; won: boolean; score: string; line: string }) => void;
  answerPress: (question: PressQuestion, choice: DilemmaChoice) => void;
  setPracticeIntensity: (mode: PracticeIntensity) => void;
  setActiveGame: (game: GameSimulationState | null) => void;
  recordUserGame: (finalState: GameSimulationState) => void;
  markGameLive: (state: GameSimulationState, now?: boolean) => void; // kickoff (now), then as the game is played
  markGameFinal: (finalState: GameSimulationState) => void; // a live game's final, kept outside the saves
  applyLockedGame: () => void; // this week's game already played in this career: its final stands
  dismissLockNotice: () => void;
  unlockTalent: (id: TalentId) => string | null; // null on success, otherwise why not
  runFeederEvent: (type: FeederEventType, sport?: TryoutSport) => ProgramResult | null; // what it did (null: it couldn't run)
  scoutFeederProspect: (prospectId: string) => void;
  visitFeederProspect: (prospectId: string) => void;
  removeFeederProspect: (prospectId: string) => void;
  toggleShortlist: (prospectId: string) => void; // "+ Add to List" / "✓ On List" // drop a prospect the program doesn't want (frees a pipeline spot)
  contactFeederProspect: (prospectId: string, action: ContactAction) => void; // text, email, call, visit, invite, wine & dine
  pitchFeederStar: (prospectId: string) => void;
  makeBoosterOffer: (prospectId: string, offer: BoosterOffer) => void; // free interest now, evidence for later
  holdComplianceTraining: () => void; // CP: suspicion cools (once a season)
  cleanUpRecords: () => void; // CP: less evidence (once a season)
  selfReport: () => void; // come clean: a fine and a penalty that grows with the stage
  deferComplianceDecision: () => void; // "Decide later" on a self-report pop-up
  dismissFinalReview: () => void; // the contract-end review has been seen
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
/** Programs run all year except the post season (the banquet and signing day week). */
export function feederEventsOpen(state: Pick<GameStoreState, 'currentWeek' | 'league'>): boolean {
  return getSeasonPhase(state.currentWeek) !== 'POST_SEASON';
}

/** A week passes: every program's cooldown is a week shorter. */
const tickCooldowns = (cooldowns: Partial<Record<FeederEventType, number>>) =>
  Object.fromEntries(
    Object.entries(cooldowns)
      .map(([type, weeks]) => [type, (weeks ?? 0) - 1] as const)
      .filter(([, weeks]) => weeks > 0)
  ) as Partial<Record<FeederEventType, number>>;

/** The last season of a probation that starts now: this season if its regular season isn't over, else the next. */
const probationEnd = (year: number, week: number, seasons: number) => (week <= LAST_REGULAR_SEASON_WEEK ? year + seasons - 1 : year + seasons);

export const useGameStore = create<GameStoreState>((set, get) => {
  /** The week's compliance events: news, hints for Team › Compliance, and a finding's penalties. */
  const complianceNews = (events: ComplianceEvent[], team: Team, week: number) => {
    if (events.length === 0) return;
    const year = get().currentYear;
    const article = (id: string, outlet: NewsArticle['outlet'], headline: string, content: string): NewsArticle => ({
      id: `news_compliance_${id}_${year}_${week}`,
      week,
      outlet,
      headline,
      content,
      impactSentiment: 'NEGATIVE',
      featuredTeamName: team.name
    });
    const news: NewsArticle[] = [];
    let hint: string | null = null;
    for (const event of events) {
      if (event === 'WHISPERS') {
        hint = complianceHint('WHISPERS', team.name);
        news.push(article('whispers', 'PREP_GRIDIRON_TALK', `Rivals Whisper About ${team.name} Recruiting`, hint));
      } else if (event === 'QUESTIONS') {
        hint = `The state association asked ${team.name} for its recruiting records.`;
        news.push(article('questions', 'STATE_SPORTS_CENTRAL', `State Asks ${team.name} for Recruiting Records`, `${hint} Nothing official has been opened yet.`));
      } else if (event === 'INQUIRY') {
        hint = `State investigators opened an inquiry into ${team.name} recruiting.`;
        news.push(article('inquiry', 'STATE_SPORTS_CENTRAL', `State Opens Inquiry Into ${team.name} Recruiting`, `${hint} It can run for up to three seasons.`));
      } else if (event === 'INQUIRY_CLOSED') {
        hint = `The inquiry into ${team.name} recruiting closed without findings.`;
        const closed = article('closed', 'STATE_SPORTS_CENTRAL', `Inquiry Into ${team.name} Recruiting Closes`, `${hint}`);
        news.push({ ...closed, impactSentiment: 'POSITIVE' });
      } else if (event === 'HINT') {
        hint = complianceHint(get().compliance.stage, team.name);
      } else if (event === 'FOUND') {
        news.push(complianceFound(team, week));
        hint = `The inquiry found improper booster offers at ${team.name}.`;
      }
    }
    const compliance = get().compliance;
    set({
      compliance: hint ? { ...compliance, hints: [{ year, week, text: hint }, ...compliance.hints].slice(0, MAX_COMPLIANCE_HINTS) } : compliance,
      ...(news.length > 0 && { newsArticles: [...news, ...get().newsArticles] })
    });
  };

  /** The inquiry found the booster offers: the paid players are ruled ineligible, probation, maybe a playoff ban. */
  const complianceFound = (team: Team, week: number): NewsArticle => {
    const { currentYear, compliance } = get();
    const { probationSeasons, playoffBan } = foundPenalty(compliance.evidence);
    const meters = team.programMeters;
    meters.complianceScore = Math.max(0, meters.complianceScore - 35);
    meters.boosterApproval = Math.max(0, meters.boosterApproval - 15);
    team.prestige = Math.max(40, team.prestige - 6);
    const ineligible = removeImproperRecruits(team);
    const probationUntil = Math.max(get().userProbationUntil ?? 0, probationEnd(currentYear, week, probationSeasons));
    const banNow = playoffBan && week <= LAST_REGULAR_SEASON_WEEK;
    const report = (p: FeederProspect) => (activeBoosterOffers(p) ? { ...p, boosterReported: true } : p);
    set({
      userProbationUntil: probationUntil,
      compliance: clearedCompliance(compliance),
      scoutingPool: get().scoutingPool.map(report),
      widePool: get().widePool.map(report),
      ...(banNow && { sanctionLevel: 3 as const }),
      ...(playoffBan && !banNow && { pendingUserBan: true })
    });
    return {
      id: `news_user_violation_${currentYear}_${week}`,
      week,
      outlet: 'STATE_SPORTS_CENTRAL',
      headline: `Inquiry Finds ${team.name} Boosters Made Improper Recruiting Offers`,
      content: `State association investigators uncovered improper offers to recruits.${
        playoffBan ? (banNow ? ' The program is barred from the playoffs this season' : ' The program is barred from the playoffs next season') : ' The program avoids a postseason ban'
      }${sanctionDetails(ineligible.length, probationUntil)}`,
      impactSentiment: 'NEGATIVE',
      featuredTeamName: team.name
    };
  };

  /** A contract's final review: what booster evidence is left may be found, and the seasons with offers lose their wins. */
  const runFinalReview = (career: Career, team: Team) => {
    const { compliance, currentYear } = get();
    if (compliance.offerSeasons.length === 0 && compliance.evidence <= 0) return;
    const found = Math.random() < finalReviewChance(compliance.evidence);
    const scoreBefore = careerPoints(career);
    let updated = career;
    if (found) {
      updated = { ...career, seasons: career.seasons.map((s) => (compliance.offerSeasons.includes(s.year) ? vacateSeason(s) : s)) };
      removeImproperRecruits(team);
      recordCareer(updated);
    }
    const vacatedWins = updated.seasons.reduce((n, s) => n + (s.vacated ? s.vacated.wins + s.vacated.playoffWins : 0), 0);
    const finalReview = { school: team.name, found, vacatedWins, scoreBefore, scoreAfter: careerPoints(updated) };
    set({
      career: updated,
      compliance: { ...clearedCompliance(compliance), finalReview },
      ...(found && { userProbationUntil: Math.max(get().userProbationUntil ?? 0, currentYear + 1) }),
      ...(found && {
        newsArticles: [
          {
            id: `news_final_review_${currentYear}`,
            week: get().currentWeek,
            outlet: 'STATE_SPORTS_CENTRAL',
            headline: `${team.name} Vacates ${vacatedWins} Wins Over Booster Violations`,
            content: `A review as ${coachTitle(career.coachName)}'s contract ended found improper booster offers to recruits. ${team.name} vacates ${vacatedWins} wins and serves recruiting probation next season.`,
            impactSentiment: 'NEGATIVE',
            featuredTeamName: team.name
          },
          ...get().newsArticles
        ]
      })
    });
  };

  return {
  difficulty: null,
  career: null,
  careerHistory: [],
  jobOffers: [],
  contractRenewable: true,
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
  shortlist: [],
  careerKey: null,
  playedGames: {},
  lockNotice: null,
  sanctionLevel: 0,
  scoutingPool: [],
  feederEventsThisWeek: [],
  programCooldowns: {},
  lastFeederResults: null,
  statewideRecruits: [],
  widePool: [],
  weekResults: null,
  interstateGames: [],
  coachingStaff: [],
  compliance: initialCompliance(),
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
  secondStringLead: REST_STARTERS_LEAD,
  feederClassYear: 2027,
  seasonRecap: null,
  viewedTeamId: null,
  openTeamProfile: (teamId) => set({ viewedTeamId: teamId }),
  viewedPlayerId: null,
  openPlayerCard: (playerId) => set({ viewedPlayerId: playerId }),
  lastTrainingReport: null,
  practiceSeason: null,
  playoffBracket: null,
  graduatingSeniors: [],
  seasonAwards: null,
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
      shortlist: [],
      programCooldowns: {},
      practiceSeason: null,
      feederClassYear: get().currentYear + 1,
      seasonRecap: null,
      compliance: initialCompliance(),
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
      seasonAwards: null,
      isBanquetActive: false
    });
  },

  newGame: (difficulty, state = 'Texas') => {
    const school = pickSchoolForDifficulty(difficulty, state);
    set({ currentYear: 2026, difficulty, career: null, careerHistory: [], careerKey: newCareerKey(), playedGames: {}, lockNotice: null });
    get().startNewSeason(buildStateWorld(state, school));
    track('new_game', { mode: 'quick', state, difficulty });
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
      coachId: `coach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      seasons: []
    };
    set({ currentYear: 2026, difficulty: scenarioId === 'OPEN' ? difficultyForPrestige(stateSchool(state, school)?.prestige ?? 75) : scenario.difficulty, career, careerHistory: [], careerKey: newCareerKey(), playedGames: {}, lockNotice: null });
    get().startNewSeason(buildStateWorld(state, school, false, scenario.startingPrestige));
    // The coach's own name, on his team (profile, awards, news); the contract's starting prestige sets its Hall of Fame bonus
    const team = get().leagueTeams.find((t) => t.id === get().userTeamId);
    if (team) team.staff.headCoachName = coachTitle(career.coachName);
    if (team) set({ career: { ...career, startingPrestige: team.prestige } });
    track('new_game', { mode: 'career', scenario: scenarioId, state, length, ...entrySource() });
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
      coachingStaff: (save.coachingStaff ?? []).map((c) => withContract(c, year)),
      career: save.career ?? null,
      careerHistory: save.careerHistory ?? [],
      playoffBracket: save.league && save.playoffBracket ? relinkBracketTeams(save.playoffBracket, world.teams) : null,
      sanctionLevel: save.sanctionLevel ?? 0,
      statewideRecruits: save.league ? save.statewideRecruits ?? [] : [],
      weekResults: save.weekResults?.week === save.currentWeek ? save.weekResults : null,
      widePool: save.widePool ?? generateWidePool(buildRecruitingContext(world.league, world.teams, userTeam.id), world.league.state ?? 'Texas', nationalLeagues),
      compliance: { ...initialCompliance(), ...save.compliance },
      pendingUserBan: save.pendingUserBan ?? false,
      onHotSeat: save.onHotSeat ?? false,
      firedFrom: null,
      careerComplete: false,
      userProbationUntil: save.userProbationUntil ?? null,
      lightCalibration: save.lightCalibration ?? null,
      dilemmaLog: save.dilemmaLog ?? [],
      pressLog: save.pressLog ?? [],
      shortlist: save.shortlist ?? [],
      programCooldowns: save.programCooldowns ?? {},
      practiceSeason: save.practiceSeason ?? null,
      currentWeek: save.league ? save.currentWeek : Math.min(save.currentWeek, LAST_REGULAR_SEASON_WEEK),
      userTeamId: userTeam.id,
      coachPoints: save.coachPoints ?? save.coachingAP ?? STARTING_COACH_POINTS,
      coachTalents: save.coachTalents ?? [],
      practiceIntensity: migrateIntensity(save.practiceIntensity),
      secondStringLead: save.secondStringLead === undefined ? REST_STARTERS_LEAD : save.secondStringLead,
      // Older saves: the pipeline was always next season's class
      feederClassYear: save.feederClassYear ?? year + 1,
      seasonRecap: save.seasonRecap ?? null,
      lastTrainingReport: null,
      activeDilemma: save.activeDilemma,
      activeGame: null,
      isBanquetActive: false,
      graduatingSeniors: [],
      seasonAwards: null,
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
    // The career's played games: the ones already known here, then the ones written down in this browser. Saves from
    // before this get a new key, so they start counting now
    const careerKey = save.careerKey ?? newCareerKey();
    set({ careerKey, playedGames: careerKey === get().careerKey ? get().playedGames : {}, lockNotice: null });
    get().applyLockedGame();
    void loadPlayedGames(careerKey).then((games) => {
      if (get().careerKey !== careerKey || games.length === 0) return;
      set({ playedGames: { ...Object.fromEntries(games.map((g) => [g.key, g])), ...get().playedGames } });
      get().applyLockedGame();
    });
    whenIdle(() => get().runAhead());
    track('load_game', moment(get()));
  },

  autosave: async () => {
    const state = get();
    const userTeam = state.leagueTeams.find((t) => t.id === state.userTeamId);
    if (!state.league || !userTeam) return;
    await persistSaveGame(buildSaveRecord(state, AUTOSAVE_SLOT, `Week ${state.currentWeek} - ${userTeam.name}`));
  },

  saveGame: async (saveName) => {
    const state = get();
    const userTeam = state.leagueTeams.find((t) => t.id === state.userTeamId);
    const id = `save_${Date.now()}`;
    track('save_game', moment(state));
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
    track('week_advance', { ...moment(get()), week: nextWeek, phase: getSeasonPhase(nextWeek) });
    if (currentWeek === FEEDER_SIGNING_WEEK && get().currentYear >= get().feederClassYear) get().runFeederSigningDay();

    // The coach's game, if it's simmed now: its players' stats before, so its final is written down with their lines
    const simmed = get().careerKey ? getUserMatchup(get()) : undefined;
    const simmedBefore = simmed && !simmed.isPlayed ? snapshotStats([simmed.home, simmed.away]) : null;

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
      feederEventsThisWeek: [],
      programCooldowns: tickCooldowns(get().programCooldowns)
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
      if (caughtNews.length > 0) set({ newsArticles: [...caughtNews, ...get().newsArticles] });
    }
    // The coach's booster money: suspicion grows with the evidence, and the state may come asking
    if (get().compliance.evidence > 0 || get().compliance.suspicion > 0 || get().compliance.stage !== 'QUIET') {
      const { state: compliance, events } = advanceComplianceWeek(get().compliance);
      set({ compliance });
      complianceNews(events, userTeam, nextWeek);
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
    // Each one marks the career: an invalid playthrough on the Hall of Fame
    const reckoningCareer = get().career;
    if (exposures.length > 0 && reckoningCareer && !get().careerComplete) {
      const marks = exposures.map((r) => ({ year: currentYear, week: nextWeek, title: r.title }));
      set({ career: { ...reckoningCareer, reckonings: [...(reckoningCareer.reckonings ?? []), ...marks] } });
    }

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
      if (isUser && PHASE_TRAINING[phase] > 0) set({ lastTrainingReport: report, practiceSeason: addPracticeWeek(get().practiceSeason, get().currentYear, report, team.roster) });
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
      const finalPolls = generateNationalAndStatePolls(everyone, polls, nextWeek, collectResults(get()), league?.state ?? 'Texas');
      // Last season, for recruits who want to win: each state's champions and the final national Top 25
      const champions = new Set(
        [get().playoffBracket, ...get().nationalLeagues.map((l) => l.bracket)].flatMap((b) => b?.divisions.map((d) => d.championTeamId) ?? []).filter((id): id is string => !!id)
      );
      const nationalRank = new Map(finalPolls.nationalTop25.map((e) => [e.teamId, e.rank]));
      everyone.forEach((t) => (t.lastSeason = { year: get().currentYear, stateChampion: champions.has(t.id), ...(nationalRank.has(t.id) && { nationalRank: nationalRank.get(t.id) }) }));
      // The full year is in: score it for the career's Hall of Fame entry (#1 in the final national poll is a national title)
      const career = get().career;
      const nationalTitle = finalPolls.nationalTop25[0]?.teamId === userTeamId;
      const scored =
        career && !isCareerComplete(career) && !career.seasons.some((s) => s.year === get().currentYear)
          ? { ...career, seasons: [...career.seasons, scoreSeason(userTeam, get().playoffBracket, get().currentYear, nationalTitle)] }
          : career;
      if (scored && scored !== career) recordCareer(scored);
      track('season_end', {
        season: get().currentYear - 2025,
        wins: userTeam.record.wins,
        losses: userTeam.record.losses,
        state_champion: champions.has(userTeamId),
        national_rank: nationalRank.get(userTeamId),
        national_title: nationalTitle
      });
      // The state's honors: every All-State player and award winner gets a little more college exposure
      const seasonAwards = calculateSeasonAwards(get().currentYear, leagueTeams, get().playoffBracket);
      honoredPlayers(seasonAwards).forEach((p) => (p.recruiting.exposure = (p.recruiting.exposure ?? 0) + 1));
      set({
        career: scored,
        seasonAwards,
        currentWeek: nextWeek,
        graduatingSeniors: seniors,
        isBanquetActive: true,
        newsArticles: [...news, ...get().newsArticles],
        polls: finalPolls,
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
    // Suspensions count games: they run down only for teams that played this week (any playoff week counts)
    const weekGames = [...seasonSchedule, ...get().interstateGames];
    leagueTeams.forEach((team) => {
      const isUser = team.id === userTeamId;
      const playedGame = phase === 'STATE_PLAYOFFS' || getTeamGameForWeek(weekGames, currentWeek, team.id) !== undefined;
      team.roster.forEach((p) => {
        processWeeklyInjuryHealing(p, currentWeek, playedGame);
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
            content: `Sagging locker-room morale costs ${userTeam.name} a starter: ${suspended.lastName} sits the next game.`,
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

    // The coach's simmed game counts like a played one: its final and lines are written down
    if (simmed && simmedBefore && get().careerKey) {
      const result = matchupResult(get(), simmed.gameId);
      if (result) {
        const game = finalRecord(get().careerKey!, get().currentYear, currentWeek, userTeamId, { ...result, lines: statLines([simmed.home, simmed.away], simmedBefore) });
        track('game_played', { mode: 'sim', ...gameOutcome(userTeamId, result), playoff: !!simmed.isPlayoff, season: get().currentYear - 2025, week: currentWeek });
        set({ playedGames: { ...get().playedGames, [game.key]: game } });
        void storeFinal(game);
      }
    }
    // Next week's game, if this career already played it (an older save): its final stands
    get().applyLockedGame();

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

  // Hiring: only while the staff window is open; the first season is paid now (in ducats, by the account beforehand)
  hireCoach: (coach, years, ducatsPaid = false) => {
    const { currentWeek, currentYear, coachPoints, coachingStaff } = get();
    if (!staffWindowOpen(currentWeek)) return 'The staff is locked until the off-season.';
    const price = coachPrice(coach.rating);
    if (price.currency === 'DUCATS') {
      if (!ducatsPaid) return 'Pay the first season in ducats first.';
    } else {
      if (coachPoints < price.amount) return `Needs ${formatCP(price.amount)}`;
      set({ coachPoints: coachPoints - price.amount });
    }
    get().setCoachingStaff([...coachingStaff.filter((c) => c.role !== coach.role), { ...coach, ...contractTerms(currentWeek, currentYear, years) }]);
    track('coach_hired', { role: coach.role, grade: coachGrade(coach.rating), currency: price.currency === 'DUCATS' ? 'ducats' : 'coach_points', price: price.amount, years });
    return null;
  },

  releaseCoach: (role) => {
    if (!staffWindowOpen(get().currentWeek)) return;
    get().setCoachingStaff(get().coachingStaff.filter((c) => c.role !== role));
    track('coach_released', { role });
  },

  // The off-season: pay next season for the coaches kept (renewals add a season at the same price) and let the rest go
  settleStaff: (keep, letGo, ducatsPaid = false) => {
    const { coachingStaff, currentWeek, currentYear, coachPoints } = get();
    const kept = coachingStaff.filter((c) => keep.includes(c.role) && needsSettling(c, currentWeek, currentYear));
    const cost = seasonCost(kept);
    if (cost.ducats > 0 && !ducatsPaid) return 'Pay the ducats first.';
    if (cost.cp > coachPoints) return `Needs ${formatCP(cost.cp)}`;
    set({ coachPoints: coachPoints - cost.cp });
    get().setCoachingStaff(coachingStaff.filter((c) => !letGo.includes(c.role)).map((c) => (kept.includes(c) ? settled(c, currentYear) : c)));
    return null;
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
    track('playoffs_start', { made: !!findUserNode(bracket, userTeamId), season: get().currentYear - 2025 });
  },

  // Records the user's live playoff result; Advance Week finishes the round
  advancePlayoffGame: (userScore) => {
    const { playoffBracket, userTeamId } = get();
    if (!playoffBracket || !userScore) return;
    set({ playoffBracket: recordPlayoffResult(playoffBracket, userTeamId, userScore) });
  },

  finishBanquet: () => {
    const { currentWeek, coachPoints, coachTalents } = get();
    // Once-a-year programs come back after the banquet
    set({ isBanquetActive: false, currentWeek: currentWeek + 1, feederEventsThisWeek: [], programCooldowns: clearYearlyCooldowns(tickCooldowns(get().programCooldowns)), coachPoints: coachPoints + weeklyCpIncome(currentWeek + 1, coachTalents, get().districtTeams.find((t) => t.id === get().userTeamId)?.programMeters.schoolBoardTrust) });
    // The off-season opens: Coach Point coaches still under contract are paid for next season when there's enough; the rest
    // (and every ducat coach: real money is only spent on a tap) wait for the coach
    if (get().currentWeek === FIRST_OFF_SEASON_WEEK) {
      const year = get().currentYear;
      let cp = get().coachPoints;
      const staff = get().coachingStaff.map((c) => {
        if (!needsSettling(c, FIRST_OFF_SEASON_WEEK, year) || settleKind(c, year) !== 'PAYMENT') return c;
        const price = coachPrice(c.rating);
        if (price.currency === 'DUCATS' || price.amount > cp) return c;
        cp -= price.amount;
        return settled(c, year);
      });
      set({ coachPoints: cp });
      get().setCoachingStaff(staff);
    }
  },

  // The contract is done and the board will keep him: a new contract at the same school, then next season
  extendContract: (length) => {
    const { career, leagueTeams, userTeamId, currentYear } = get();
    const team = leagueTeams.find((t) => t.id === userTeamId);
    if (!career || !team) return;
    set({ careerHistory: [...get().careerHistory, career], career: newContract(career, team, length, currentYear + 1, true), careerComplete: false, jobOffers: [], compliance: initialCompliance() });
    track('contract_extended', { years: length });
    get().transitionToNextYear();
  },

  // A new job in the same world: the coach takes over another program (its roster, district and pipeline)
  acceptJob: (teamId, length) => {
    const { career, leagueTeams, league, userTeamId, currentYear, nationalLeagues } = get();
    const oldTeam = leagueTeams.find((t) => t.id === userTeamId);
    const team = leagueTeams.find((t) => t.id === teamId);
    if (!career || !oldTeam || !team || !league) return;
    // The old school hires a new coach and recruits like every other program
    track('job_accepted', { years: length });
    oldTeam.staff.headCoachName = `Coach ${randomSurname(oldTeam.nameProfile)}`;
    oldTeam.feederProfile = initialFeederProfile();
    oldTeam.feederProfile.strategy = chooseFeederStrategy(oldTeam);
    const leftProbation = get().userProbationUntil;
    if (onProbation(leftProbation, currentYear + 1)) oldTeam.feederProfile.probationUntil = leftProbation!;
    delete oldTeam.gameDayEdge;
    delete oldTeam.fridayEdge;
    delete oldTeam.pendingFridayEdge;
    // The new school: the coach's name, a board that gives him time, and any probation it is already serving
    const probation = team.feederProfile?.probationUntil;
    delete team.feederProfile;
    team.staff.headCoachName = coachTitle(career.coachName);
    team.programMeters.schoolBoardTrust = Math.max(team.programMeters.schoolBoardTrust, NEW_JOB_BOARD_TRUST);
    const ctx = buildRecruitingContext(league, leagueTeams, team.id);
    const article: NewsArticle = {
      id: `news_new_job_${currentYear}`,
      week: 1,
      outlet: 'STATE_SPORTS_CENTRAL',
      headline: `${coachTitle(career.coachName)} Takes Over at ${team.name}`,
      content: `After ${career.length} seasons at ${oldTeam.name}, ${coachTitle(career.coachName)} signs a ${length}-year contract with ${team.name}.`,
      impactSentiment: 'POSITIVE',
      featuredTeamName: team.name
    };
    set({
      userTeamId: team.id,
      districtTeams: userDistrictTeams(league, leagueTeams, team.id),
      scoutingPool: generateFeederPool(team, ctx),
      statewideRecruits: generateStatewideElite(ctx),
      widePool: generateWidePool(ctx, league.state ?? 'Texas', nationalLeagues),
      compliance: initialCompliance(),
      pendingUserBan: false,
      userProbationUntil: probation != null && probation > currentYear ? probation : null,
      onHotSeat: false,
      careerHistory: [...get().careerHistory, career],
      career: newContract(career, team, length, currentYear + 1, false),
      careerComplete: false,
      jobOffers: [],
      newsArticles: [article, ...get().newsArticles]
    });
    get().transitionToNextYear();
  },

  transitionToNextYear: () => {
    const { districtTeams, leagueTeams, league, userTeamId, currentYear } = get();
    // Every program graduates seniors, moves classes up and progresses; newcomers arrive after feeder signing
    // day (pre season week 2), when the pipeline's prospects pick their schools
    const userTeam = leagueTeams.find((t) => t.id === userTeamId)!;
    // The career's last season is in the books
    const career = get().career;
    if (career && isCareerComplete(career)) {
      runFinalReview(career, userTeam);
      track('career_complete', { seasons: career.length, season: currentYear - 2025 });
      set({
        careerComplete: true,
        jobOffers: jobOffers(career, leagueTeams, userTeamId),
        contractRenewable: boardReview(userTeam.programMeters.schoolBoardTrust, get().onHotSeat) !== 'FIRED'
      });
      return;
    }
    // The school board's season-end review
    const review = boardReview(userTeam.programMeters.schoolBoardTrust, get().onHotSeat);
    if (review === 'FIRED') {
      set({ firedFrom: userTeam.name });
      return;
    }
    // Assistants nobody paid for next season leave the staff
    const leaving = get().coachingStaff.filter((c) => (c.paidThroughSeason ?? currentYear) <= currentYear);
    if (leaving.length > 0) get().setCoachingStaff(get().coachingStaff.filter((c) => !leaving.includes(c)));
    const staffNews: NewsArticle[] = leaving.length
      ? [
          {
            id: `news_staff_leave_${currentYear}`,
            week: 1,
            outlet: 'TOWN_JOURNAL',
            headline: `${leaving.length === 1 ? 'An Assistant Leaves' : `${leaving.length} Assistants Leave`} the ${userTeam.name} Staff`,
            content: `${leaving.map((c) => c.name).join(', ')} ${leaving.length === 1 ? 'was' : 'were'} not signed for next season and ${leaving.length === 1 ? 'has' : 'have'} moved on.`,
            impactSentiment: 'NEGATIVE',
            featuredTeamName: userTeam.name
          }
        ]
      : [];
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
    // The coach's booster evidence fades by a quarter; a playoff ban found after last season's regular season starts now
    const { pendingUserBan, userProbationUntil } = get();
    const compliance = complianceSeasonEnd(get().compliance);
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
      seasonAwards: null,
      nationalLeagues,
      polls: newPolls,
      playerRankings: newPlayerRankings,
      compliance,
      pendingUserBan: false,
      userProbationUntil,
      feederEventsThisWeek: [],
      coachPoints: get().coachPoints + weeklyCpIncome(1, get().coachTalents, userTeam.programMeters.schoolBoardTrust),
      onHotSeat: review === 'HOT_SEAT',
      seasonRecap,
      newsArticles: [...staffNews, ...boardNews, ...investigationNews, ...get().newsArticles],
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
    track('game_ball', { position: player.position });
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
    track('press_answer', { question: question.id, answer: choice.id });
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
    const before = new Set(userTeam.roster.map((p) => p.id));
    executeDilemmaDecision(userTeam, choice);
    // A transfer who joins is a newcomer this season
    userTeam.roster.filter((p) => !before.has(p.id)).forEach((p) => (p.joinedYear = currentYear));

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
    track('dilemma_choice', { dilemma: record.templateId, tier: choice.tier, ...moment(get()) });
    set({
      activeDilemma: null,
      districtTeams: [...districtTeams],
      dilemmaLog: [...dilemmaLog, record],
      coachPoints: Math.max(0, get().coachPoints + (choice.impact.coachPointsDelta ?? 0)) // a booster's thanks, or tutors paid for
    });
  },

  setSecondStringLead: (lead) => set({ secondStringLead: lead }),
  setPracticeIntensity: (mode) => {
    if (mode !== get().practiceIntensity) track('practice_set', { intensity: mode, ...moment(get()) });
    set({ practiceIntensity: mode });
  },
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

  markGameLive: (state, now = false) => {
    const { careerKey, currentYear, currentWeek, userTeamId } = get();
    if (!careerKey) return;
    const game = liveRecord(careerKey, currentYear, currentWeek, userTeamId, state);
    if (get().playedGames[game.key]?.status === 'FINAL') return;
    set({ playedGames: { ...get().playedGames, [game.key]: game } });
    void storeLive(game, state, now);
  },

  markGameFinal: (finalState) => {
    const { careerKey, currentYear, currentWeek, userTeamId } = get();
    const outcome = gameOutcome(userTeamId, { homeId: finalState.homeTeam.id, homeScore: finalState.homeScore, awayScore: finalState.awayScore });
    track('game_played', { mode: 'live', ...outcome, playoff: !!get().playoffBracket, ...moment(get()) });
    if (!careerKey) return;
    const game = finalRecord(careerKey, currentYear, currentWeek, userTeamId, {
      homeId: finalState.homeTeam.id,
      awayId: finalState.awayTeam.id,
      homeScore: finalState.homeScore,
      awayScore: finalState.awayScore,
      lines: finalState.playerGameStats ?? {}
    });
    set({ playedGames: { ...get().playedGames, [game.key]: game } });
    void storeFinal(game);
  },

  applyLockedGame: () => {
    const state = get();
    if (!state.careerKey) return;
    const matchup = getUserMatchup(state);
    if (!matchup || matchup.isPlayed) return;
    const opponent = matchup.home.id === state.userTeamId ? matchup.away : matchup.home;
    const played = state.playedGames[lockKey(state.careerKey, state.currentYear, state.currentWeek, opponent.id)];
    if (played?.status !== 'FINAL') return;
    // The final as it was: the same score, box score lines and records (the press and the game ball were done then)
    const flipped = played.homeId !== matchup.home.id;
    const homeScore = flipped ? played.awayScore : played.homeScore;
    const awayScore = flipped ? played.homeScore : played.awayScore;
    get().recordUserGame({
      homeTeam: matchup.home,
      awayTeam: matchup.away,
      homeScore,
      awayScore,
      playerGameStats: played.lines as GameSimulationState['playerGameStats']
    } as GameSimulationState);
    if (matchup.isPlayoff) get().advancePlayoffGame({ homeScore, awayScore });
    const home = matchup.home.id === state.userTeamId;
    set({
      lockNotice: { year: state.currentYear, week: state.currentWeek, opponentName: opponent.name, userScore: home ? homeScore : awayScore, opponentScore: home ? awayScore : homeScore, seen: false }
    });
  },

  dismissLockNotice: () => {
    const notice = get().lockNotice;
    if (notice) set({ lockNotice: { ...notice, seen: true } });
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
    track('talent_unlocked', { talent: id, cost: talent.cost });
    return null;
  },

  runFeederEvent: (type, sport) => {
    const { coachPoints, feederEventsThisWeek, scoutingPool, districtTeams, userTeamId, programCooldowns, shortlist } = get();
    const staff = staffBonuses(get().coachingStaff);
    const cost = feederEventCost(FEEDER_EVENTS[type].cost, get().coachTalents, staff.programDiscount);
    if (coachPoints < cost || (programCooldowns[type] ?? 0) > 0 || !feederEventsOpen(get())) return null;
    const userTeam = districtTeams.find((t) => t.id === userTeamId)!;
    const family = type === 'FAMILY_NIGHT' ? staff.familyBoost : 0;
    const result = runFeederEvent(scoutingPool, type, userTeam, recruitingContext(get()), (p) => 1 + (staff.feederInterestByPosition[p.projectedPosition] ?? 0) + family, {
      sport,
      shortlist
    });
    set({
      coachPoints: coachPoints - cost,
      scoutingPool: result.pool,
      feederEventsThisWeek: [...feederEventsThisWeek, type],
      programCooldowns: { ...programCooldowns, [type]: FEEDER_EVENTS[type].every }
    });
    track('program_run', { program: type, cost, found: result.discovered.length, warmed: result.warmed.length, scouted: result.scouted.length, ...(sport && { sport }), ...moment(get()) });
    // The results pop-up: the prospects as they are now
    const byId = new Map(result.pool.map((p) => [p.id, p]));
    return {
      type,
      discovered: result.discovered,
      warmed: result.warmed.flatMap((w) => (byId.has(w.id) ? [{ prospect: byId.get(w.id)!, before: w.before, after: w.after }] : [])),
      scouted: result.scouted.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    };
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
    if (result.ok) track('college_recruit', { action, cost });
    return result;
  },

  scoutFeederProspect: (prospectId) => {
    const { coachPoints, scoutingPool } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.SCOUT) return;
    track('prospect_scout');
    set({
      coachPoints: coachPoints - PROSPECT_ACTION_COSTS.SCOUT,
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? scoutProspect(p) : p))
    });
  },

  removeFeederProspect: (prospectId) =>
    set({
      scoutingPool: get().scoutingPool.filter((p) => p.id !== prospectId),
      widePool: get().widePool.filter((p) => p.id !== prospectId),
      shortlist: get().shortlist.filter((id) => id !== prospectId)
    }),

  toggleShortlist: (prospectId) => {
    const { shortlist } = get();
    track('my_list', { list: 'prospects', added: !shortlist.includes(prospectId) });
    set({ shortlist: shortlist.includes(prospectId) ? shortlist.filter((id) => id !== prospectId) : [...shortlist, prospectId] });
  },

  contactFeederProspect: (prospectId, action) => {
    const { coachPoints, scoutingPool, widePool } = get();
    const prospect = scoutingPool.find((p) => p.id === prospectId) ?? widePool.find((p) => p.id === prospectId);
    const { cost } = CONTACT_ACTIONS[action];
    if (!prospect || coachPoints < cost || prospect.actionsThisWeek?.includes(action)) return;
    if (onProbation(get().userProbationUntil, get().currentYear) && restrictedOnProbation(prospect)) return;
    const staff = staffBonuses(get().coachingStaff);
    const bonus = staff.feederInterest + (staff.feederInterestByPosition[prospect.projectedPosition] ?? 0);
    const contact = (p: FeederProspect) => (p.id === prospectId ? contactProspect(p, action, bonus) : p);
    track('prospect_contact', { method: action, cost, pool: prospect.scope ?? 'DISTRICT' });
    set({ coachPoints: coachPoints - cost, ...(prospect.scope ? { widePool: widePool.map(contact) } : { scoutingPool: scoutingPool.map(contact) }) });
  },

  visitFeederProspect: (prospectId) => {
    const { coachPoints, scoutingPool } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.VISIT) return;
    track('prospect_visit');
    set({
      coachPoints: coachPoints - PROSPECT_ACTION_COSTS.VISIT,
      scoutingPool: scoutingPool.map((p) => (p.id === prospectId ? visitProspect(p) : p))
    });
  },

  makeBoosterOffer: (prospectId, offer) => {
    const { scoutingPool, widePool, compliance, currentYear } = get();
    const prospect = scoutingPool.find((p) => p.id === prospectId) ?? widePool.find((p) => p.id === prospectId);
    if (!prospect || prospect.source === 'TRYOUT' || prospect.source === 'MULTI_SPORT' || prospect.boosterOffers?.includes(offer) || onProbation(get().userProbationUntil, currentYear)) return;
    const boost = (p: FeederProspect) => (p.id === prospectId ? boostProspect(p, offer) : p);
    track('booster_offer', { offer });
    const record = compliance.offers.find((r) => r.prospectId === prospectId);
    const offers = record
      ? compliance.offers.map((r) => (r === record ? { ...r, offers: [...r.offers, offer] } : r))
      : [{ prospectId, name: prospect.name, position: prospect.projectedPosition, offers: [offer], season: currentYear }, ...compliance.offers];
    set({
      ...(prospect.scope ? { widePool: widePool.map(boost) } : { scoutingPool: scoutingPool.map(boost) }),
      compliance: {
        ...compliance,
        evidence: compliance.evidence + offerEvidence(offer, prospect.source === 'STAR_RECRUIT'),
        offers,
        offerSeasons: compliance.offerSeasons.includes(currentYear) ? compliance.offerSeasons : [...compliance.offerSeasons, currentYear]
      }
    });
  },

  holdComplianceTraining: () => {
    const { compliance, coachPoints, currentYear } = get();
    if (coachPoints < COMPLIANCE_TRAINING.cost || compliance.trainingSeason === currentYear) return;
    track('compliance_action', { action: 'training' });
    set({
      coachPoints: coachPoints - COMPLIANCE_TRAINING.cost,
      compliance: { ...compliance, suspicion: Math.max(0, compliance.suspicion - COMPLIANCE_TRAINING.suspicion), trainingSeason: currentYear }
    });
  },

  cleanUpRecords: () => {
    const { compliance, coachPoints, currentYear } = get();
    if (coachPoints < RECORDS_CLEANUP.cost || compliance.cleanupSeason === currentYear) return;
    track('compliance_action', { action: 'records_cleanup' });
    set({
      coachPoints: coachPoints - RECORDS_CLEANUP.cost,
      compliance: { ...compliance, evidence: compliance.evidence * RECORDS_CLEANUP.evidenceKept, cleanupSeason: currentYear }
    });
  },

  // Coming clean: the fine (Coach Points can go below zero), then the stage's penalty, and the slate is wiped
  selfReport: () => {
    const { compliance, coachPoints, currentYear, currentWeek, leagueTeams, userTeamId, scoutingPool, widePool } = get();
    const team = leagueTeams.find((t) => t.id === userTeamId);
    if (!team) return;
    const terms = SELF_REPORT[compliance.stage];
    track('compliance_action', { action: 'self_report', stage: compliance.stage });
    const paid = team.roster.filter((p) => p.improperlyRecruited);
    let ineligible: Player[] = [];
    if (terms.ineligible) ineligible = removeImproperRecruits(team);
    else
      paid.forEach((p) => {
        Object.assign(p.condition, { injuryStatus: 'DINGED', injuryWeeksRemaining: terms.gamesOut, injuredInWeek: currentWeek, isSuspended: true });
        p.improperlyRecruited = false; // reported and served: he stays
      });
    const report = (p: FeederProspect) => (activeBoosterOffers(p) ? { ...p, boosterReported: true } : p);
    const probationUntil = terms.probationSeasons > 0 ? probationEnd(currentYear, currentWeek, terms.probationSeasons) : null;
    const names = (terms.ineligible ? ineligible : paid).map((p) => `${p.firstName} ${p.lastName}`);
    const article: NewsArticle = {
      id: `news_self_report_${currentYear}_${currentWeek}`,
      week: currentWeek,
      outlet: 'STATE_SPORTS_CENTRAL',
      headline: `${team.name} Self-Reports Recruiting Violations`,
      content: `${team.name} told the state association its boosters made improper offers to recruits and paid a fine.${
        names.length ? ` ${names.join(', ')} ${terms.ineligible ? (names.length === 1 ? 'is ruled ineligible' : 'are ruled ineligible') : `${names.length === 1 ? 'sits' : 'sit'} ${terms.gamesOut} games`}.` : ''
      }${probationUntil ? ` The program is on recruiting probation through ${probationUntil}.` : ''}`,
      impactSentiment: 'NEGATIVE',
      featuredTeamName: team.name
    };
    set({
      coachPoints: coachPoints - terms.fine,
      compliance: { ...clearedCompliance(compliance), hints: [] },
      scoutingPool: scoutingPool.map(report),
      widePool: widePool.map(report),
      ...(probationUntil && { userProbationUntil: Math.max(get().userProbationUntil ?? 0, probationUntil) }),
      districtTeams: [...get().districtTeams],
      leagueTeams: [...leagueTeams],
      newsArticles: [article, ...get().newsArticles]
    });
  },

  deferComplianceDecision: () => set({ compliance: { ...get().compliance, decisionDeferred: true } }),

  dismissFinalReview: () => set({ compliance: { ...get().compliance, finalReview: null } }),

  pitchFeederStar: (prospectId) => {
    const { coachPoints, scoutingPool, districtTeams, userTeamId } = get();
    if (coachPoints < PROSPECT_ACTION_COSTS.PITCH_STAR || onProbation(get().userProbationUntil, get().currentYear)) return;
    track('prospect_pitch');
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
    const returning = new Set(userTeam.roster.map((p) => p.id));
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
    track('signing_day', { signees: feederClass.joined.length, season: currentYear - 2025 });
    // Everyone new on the coach's roster (signees and walk-on freshmen) is a newcomer this season
    userTeam.roster.filter((p) => !returning.has(p.id)).forEach((p) => (p.joinedYear = currentYear));
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
      content: `${joinedCount} of ${outcomes.length} prospects in your pool chose ${userTeam.name}. ${
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


};
});
