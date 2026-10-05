// ============================================================================
// HIGH SCHOOL FOOTBALL HEAD COACH (HSFHC) - MASTER DATA CONTRACTS
// ============================================================================

export type Position =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OT' | 'OG' | 'C'
  | 'DE' | 'DT' | 'LB' | 'CB' | 'S'  | 'K'  | 'P';

export type PlayerClass = 'Freshman' | 'Sophomore' | 'Junior' | 'Senior';
export type DepthChartTier = 1 | 2 | 3;
export type PotentialGrade = 'D' | 'C' | 'B' | 'A' | 'A+';
export type OffensiveScheme = 'TRIPLE_OPTION' | 'AIR_RAID' | 'POWER_I' | 'SPREAD';
export type DefensiveScheme = 'FOUR_THREE' | 'FOUR_FOUR' | 'THREE_THREE_FIVE' | 'DROP_EIGHT';
export type WeatherType = 'CLEAR' | 'HEAVY_RAIN' | 'HIGH_WIND' | 'EXTREME_HEAT' | 'FREEZING_SNOW';
export type MomentumTier = -2 | -1 | 0 | 1 | 2;
export type InjurySeverity = 'HEALTHY' | 'DINGED' | 'MODERATE' | 'SEASON_ENDING';
export type CollegeTier = 'POWER_4' | 'GROUP_OF_5' | 'FCS' | 'DIVISION_2' | 'DIVISION_3' | 'PWO'; // PWO = preferred walk-on at a Division I program

export type PlayConcept =
  | 'INSIDE_RUN'
  | 'OUTSIDE_RUN'
  | 'SHORT_PASS'
  | 'DEEP_PASS'
  | 'PUNT'
  | 'FIELD_GOAL'
  | 'PAT_KICK'
  | 'TWO_POINT_TRY';

/** Per-snap defensive call (user-selected on AI possessions, situational for the AI). */
export type DefensiveCall = 'BASE' | 'RUN_BLITZ' | 'PASS_COVERAGE' | 'BLITZ';

export type LeverageType =
  | 'FOURTH_DOWN'
  | 'RED_ZONE_GOAL_TO_GO'
  | 'TWO_MINUTE_DRILL'
  | 'PAT_DECISION';

export interface PlayerAttributes {
  speed: number;
  strength: number;
  agility: number;
  stamina: number;
  passingAccuracy: number;
  armStrength: number;
  carrying: number;
  vision: number;
  routeRunning: number;
  catching: number;
  runBlocking: number;
  passBlocking: number;
  passRush: number;
  tackling: number;
  coverage: number;
  kickingPower: number;
  kickingAccuracy: number;
  footballIQ: number;
  discipline: number;
  ego: number;
  leadership: number;
  clutch: number;
}

export interface PlayerCondition {
  inGameStamina: number;
  seasonWear: number;
  injuryStatus: InjurySeverity;
  injuryWeeksRemaining: number;
  injuredInWeek?: number; // hurt in this week's game: the week's healing skips him
  isSuspended?: boolean; // out for discipline (shown as suspended, heals like a 1-game injury)
  isHot: boolean;
  isCold: boolean;
}

export interface PlayerAcademics {
  gpa: number;
  isEligible: boolean;
  consecutiveFailingWeeks: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  passAttempts: number;
  passCompletions: number;
  passYards: number;
  passTDs: number;
  interceptionsThrown: number;
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  fumblesLost: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  tackles: number;
  tacklesForLoss: number;
  sacks: number;
  interceptionsCaught: number;
  fieldGoalsAttempted: number;
  fieldGoalsMade: number;
}

export interface CollegeOffer {
  collegeName: string;
  collegeId?: string;
  tier: CollegeTier;
  offerDateWeek: number;
  offerYear?: number;
}

export interface RecruitingProfile {
  starRating: 0 | 1 | 2 | 3 | 4 | 5;
  offers: CollegeOffer[];
  committedCollege?: string;
  committedCollegeId?: string;
  committedWeek?: number;
  decommitCount?: number;
  isNationalLetterOfIntentSigned: boolean;
  signedTier?: CollegeTier;
  visibility?: number; // 0-100: how much college coaches know about the player
  campBoost?: number; // evaluation bump earned at a summer camp
  filmSentYear?: number;
  campYear?: number;
  coachCalls?: number; // college calls made by the head coach this season
}

export interface ParentProfile {
  sentiment: number;
  isBoosterDonor: boolean;
  archetype: 'SUPPORTIVE' | 'HELICOPTER' | 'DEMANDING_BOOSTER';
  activeComplaint: string | null;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  secondaryPosition?: Position;
  classYear: PlayerClass;
  age: number;
  overallRating: number;
  potential: PotentialGrade;
  depthChartTier: DepthChartTier;
  depthOrder?: number; // order within the position group (0 = first starter); see sim/depthChart
  improperlyRecruited?: boolean; // joined through an illegal booster offer: ruled ineligible if the program is caught
  attributes: PlayerAttributes;
  condition: PlayerCondition;
  academics: PlayerAcademics;
  stats: PlayerStats;
  recruiting: RecruitingProfile;
  parent: ParentProfile;
}

export interface ProgramMeters {
  schoolBoardTrust: number;
  boosterApproval: number;
  lockerRoomDiscipline: number;
  complianceScore: number;
}

export interface CoachingStaff {
  headCoachId: string;
  headCoachName: string;
  reputation: number;
  offensiveCoordinator: { name: string; playCalling: number; qbWhispering: number };
  defensiveCoordinator: { name: string; schemeDiscipline: number; tacklingTech: number };
  strengthCoach: { name: string; conditioningRating: number };
}

export interface DistrictMatchupRecord {
  opponentTeamId: string;
  won: boolean;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferentialCapped: number;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  districtWins: number;
  districtLosses: number;
  pointsFor: number;
  pointsAgainst: number;
  districtPointDifferential: number;
  headToHeadHistory: Record<string, DistrictMatchupRecord>;
}

export interface Team {
  id: string;
  name: string;
  mascot: string;
  classification: '1A' | '2A' | '3A' | '4A' | '5A' | '6A';
  state?: string; // e.g. 'Texas'; ranking engines default to Texas when unset
  enrollment?: number; // drives the UIL 6A Division 1 / Division 2 playoff split
  nameProfile?: 'DEFAULT' | 'BORDER'; // regional name mix for generated players
  feederProfile?: FeederProfile;
  districtId: string;
  primaryColor: string;
  secondaryColor: string;
  prestige: number;
  playbookFamiliarity: number;
  schemeOffense: OffensiveScheme;
  schemeDefense: DefensiveScheme;
  programMeters: ProgramMeters;
  staff: CoachingStaff;
  roster: Player[];
  record: TeamRecord;
  lightRating?: number; // a light team (another state's league): its fixed game-day rating; the roster holds only its stat leaders
  gameDayEdge?: number; // the coach's paid staff: team-rating points added on game day (capped at +2)
  injuryResistance?: number; // the coach's paid staff: share of game injuries avoided (0-1)
}

export interface PlayEvent {
  playId: string;
  quarter: 1 | 2 | 3 | 4 | 'OT';
  clockTimeRemainingSeconds: number;
  down: 1 | 2 | 3 | 4; // after the play
  distance: number; // after the play
  yardLine: number; // 1 to 99 relative to offense goal line (after the play)
  snapDown?: 1 | 2 | 3 | 4; // down, distance and spot when the ball was snapped (for the play-by-play)
  snapDistance?: number;
  snapYardLine?: number;
  isTry?: boolean; // the snap was a PAT or two-point try
  possessionTeamId: string;
  playConcept: PlayConcept;
  yardsGained: number;
  passerPlayerId?: string;
  ballCarrierPlayerId?: string;
  receiverPlayerId?: string;
  tacklerPlayerId?: string;
  assistTacklerPlayerId?: string;
  sackerPlayerId?: string;
  intercepterPlayerId?: string;
  kickerPlayerId?: string;
  punterPlayerId?: string;
  isTurnover: boolean;
  turnoverType?: 'INTERCEPTION' | 'FUMBLE' | 'DOWNS' | 'MUFFED_PUNT';
  isScore: boolean;
  scoreType?: 'TOUCHDOWN' | 'FIELD_GOAL' | 'SAFETY' | 'PAT' | 'TWO_POINT';
  textCommentary: string;
  isLeverageMoment: boolean;
  defensiveCall?: DefensiveCall;
  leverageType?: LeverageType;
}

export interface CompactPlayerLeader {
  playerId: string;
  name: string;
  line: string;
}

export interface CompactBoxScore {
  gameId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  weather: WeatherType;
  overtimePeriods?: number; // set when the game went to Kansas Plan overtime
  leaders: {
    passing: CompactPlayerLeader;
    rushing: CompactPlayerLeader;
    receiving: CompactPlayerLeader;
    defense: CompactPlayerLeader;
  };
  teamTotals: {
    homeTotalYards: number;
    homePassYards: number;
    homeRushYards: number;
    homeTurnovers: number;
    awayTotalYards: number;
    awayPassYards: number;
    awayRushYards: number;
    awayTurnovers: number;
  };
}

export interface GameSimulationState {
  gameId: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  weather: WeatherType;
  temperatureFahrenheit: number;
  windSpeedMph: number;
  teamMomentum: MomentumTier;
  currentQuarter: 1 | 2 | 3 | 4 | 'OT';
  clockSecondsRemaining: number;
  possessionTeamId: string;
  down: 1 | 2 | 3 | 4;
  distance: number;
  yardLine: number;
  isMercyRuleActive: boolean;
  isGameOver: boolean;
  eventLog: PlayEvent[];
  openingPossessionTeamId?: string; // receives the opening kickoff; kicks off the second half
  overtime?: OvertimeState;
  defensiveGamePlan?: Record<string, DefensiveCall>; // teamId -> default call when none is chosen
  offensiveGamePlan?: Record<string, OffensiveScheme>; // teamId -> scheme chosen for this game (defaults to the team's)
  playerGameStats?: Record<string, PlayerStats>; // playerId -> this game's stat line
  gameDayForm?: Record<string, number>; // teamId -> 'Any Given Friday' play-quality offset for this game
}

/** Kansas Plan overtime: one possession per team per period from the opponent's 10. */
export interface OvertimeState {
  period: number;
  possessionsCompleted: 0 | 1;
  firstOffenseTeamId: string;
}

/** One game on the season schedule; scores are filled in once it has been played. */
export interface ScheduledGame {
  gameId: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  isDistrictGame: boolean;
  homeScore?: number;
  awayScore?: number;
  forfeitedByTeamId?: string; // state association sanction: result recorded as a 1-0 forfeit loss
}

/** A resolved dilemma; risky/corrupt choices may be exposed by a whistleblower in a later week. */
export interface DilemmaRecord {
  templateId: string;
  title: string;
  year: number;
  week: number;
  tier: DilemmaChoice['tier'];
  exposureWeek?: number;
}

export interface DilemmaChoice {
  id: string;
  label: string;
  description: string;
  tier: 'GOOD' | 'COMPROMISE' | 'RISKY' | 'CORRUPT';
  impact: {
    schoolBoardTrustDelta: number;
    boosterApprovalDelta: number;
    lockerRoomDisciplineDelta: number;
    complianceScoreDelta: number;
    playerAvailabilityOverride?: { playerId: string; isEligible: boolean };
    sidelinePlayer?: { playerId: string; weeks: number }; // held out (injury protocol, suspension)
    promoteToStarterPlayerId?: string;
    addTransfer?: { position: Position; overallRating: number; name: string };
    injuryRisk?: { chance: number; weeks: number }; // a random first-string player may get hurt
    removePlayerId?: string; // the player leaves the program (transfers out, quits)
    gpaChanges?: { playerId: string; amount: number }[]; // tutoring / study hall (eligibility re-checked at 2.0)
  };
}

export interface NarrativeDilemma {
  id: string;
  templateId?: string; // which scenario template produced it (drives repeat cooldowns)
  weekTriggered: number;
  title: string;
  scenario: string;
  involvedPlayerId?: string;
  choices: DilemmaChoice[];
}

/** Where a prospect comes from (feeder pipeline). */
export type ProspectSource =
  | 'FEEDER_MIDDLE_SCHOOL' // 8th graders playing tackle at the district's middle schools
  | 'SEVEN_ON_SEVEN' // good athletes from 7-on-7 clubs who don't play tackle yet
  | 'MOVE_IN' // families relocating into the district
  | 'STAR_RECRUIT' // elite out-of-area talent; only top programs can try to coax them in
  | 'OUT_OF_DISTRICT' // players zoned to a rival program that you can try to pull away
  | 'TRYOUT'; // general students who come out for the team

/** What a prospect weighs when choosing a program; every prospect weights these differently. */
export type RecruitingFactor = 'PLAYING_TIME' | 'WINNING' | 'HOME' | 'RELATIONSHIP' | 'BOOSTERS';

/** A rival program recruiting a prospect. */
export interface ProspectSuitor {
  teamId: string;
  teamName: string;
  effort: number; // 0-100 relationship built by that program's coaches
  inducement: boolean; // boosters made an illegal offer
}

export interface FeederProspect {
  id: string;
  name: string;
  source: ProspectSource;
  middleSchool: string; // origin: middle school, 7-on-7 club, or hometown
  projectedPosition: Position;
  incomingClass: PlayerClass; // grade they would play next season
  trueOverall: number; // hidden until scouted
  truePotential: PotentialGrade; // hidden until scouted
  trueSpeed: number;
  trueStrength: number;
  revealedPotential: PotentialGrade | 'UNKNOWN';
  scoutedSpeed: number | null;
  scoutedStrength: number | null;
  interestScore: number; // 0-100: how likely they are to come play for the program
  coachContacts: number; // visits / pitches so far (diminishing returns)
  isTransferRisk: boolean; // family may leave the area before next season
  priorities: Record<RecruitingFactor, number>; // weights summing to 1
  suitors: ProspectSuitor[]; // rival programs also recruiting this player
  homeTeamId?: string; // the school the player is zoned to, when it isn't the user's
  userInducement?: boolean; // the user's boosters made an illegal offer
  actionsThisWeek?: string[]; // recruiting contacts the user already made this week (each once a week)
  scope?: 'STATE' | 'NATIONAL'; // a wide-pool prospect: elsewhere in the state, or in another state
  homeState?: string; // NATIONAL: the state he lives in
}

export type FeederOutcomeType = 'JOINED' | 'JV_TEAM' | 'NOT_PLAYING' | 'LEFT_AREA' | 'OTHER_SCHOOL';

/** What happened to a prospect when the class was decided at the end of the year. */
export interface FeederOutcome {
  prospectId: string;
  playerId?: string; // set when the prospect joined and became a player
  prospectName: string;
  source: ProspectSource;
  position: Position;
  outcome: FeederOutcomeType;
  overall?: number; // revealed for players who joined
  destinationTeamId?: string; // OTHER_SCHOOL: the program they chose, when known
  destinationName?: string;
}

/** An AI program's feeder approach and hidden integrity (no prospect lists are kept for AI teams). */
export type FeederStrategy = 'BUILD_LOCAL' | 'CHASE_TRANSFERS' | 'RECRUIT_STARS' | 'STAND_PAT';

export interface FeederProfile {
  strategy: FeederStrategy;
  ethics: number; // 0-100 hidden; low-ethics programs make illegal recruiting offers
  violationHeat: number; // accumulated evidence of recruiting violations; fades slowly
  bannedSeason?: number; // year the program is barred from the playoffs after getting caught
  probationUntil?: number; // last season of recruiting probation after getting caught
}

// ============================================================================
// STATE CHAMPIONSHIP RULES
// ============================================================================

export type StateGoverningBody =
  | 'UIL'      // Texas
  | 'FHSAA'    // Florida
  | 'GHSA'     // Georgia
  | 'CIF'      // California
  | 'OHSAA'    // Ohio
  | 'PIAA'     // Pennsylvania
  | 'MPSSAA'   // Maryland
  | 'LHSAA'    // Louisiana
  | 'AHSAA'    // Alabama
  | 'NJSIAA'   // New Jersey
  | 'NCHSAA'   // North Carolina
  | 'TSSAA';   // Tennessee

export type PostseasonFormatType =
  | 'SPLIT_ENROLLMENT_D1_D2'     // Texas (Top 4 qualifiers split into D1 Big & D2 Small)
  | 'SELECT_NON_SELECT_SPLIT'    // Louisiana (Public vs Private/Charter separate brackets)
  | 'COMPETITIVE_EQUITY_BOWLS'   // California (Power rank placement -> State Bowl)
  | 'HARBIN_POINT_REGIONAL_16'   // Ohio (Level 1/2 computer points -> 4 16-team regions)
  | 'DISTRICT_CHAMP_AT_LARGE_PR' // Florida (District Champs 1-4 + MaxPreps PR Wildcards 5-8)
  | 'EAST_WEST_REGIONAL_BRACKET' // North Carolina & Pennsylvania
  | 'QUADRANT_REGION_32'         // Georgia & Tennessee (8 regions, 4 quadrants)
  | 'FOUR_REGION_FIXED_16'       // Alabama (4 8-team regions, 1v4/2v3 crossovers)
  | 'NON_PUBLIC_SUPER_GROUP';    // New Jersey (Non-Public A statewide + Group 5 Sections)

export interface StateChampionshipConfig {
  governingBody: StateGoverningBody;
  stateName: string;
  classificationName: string;
  formatType: PostseasonFormatType;
  championshipVenueName: string; // e.g. "AT&T Stadium (Arlington, TX)"
  championshipTrophyTitle: string; // e.g. "UIL 6A Division 1 State Championship"
  totalQualifyingTeams: number;
  hasSplitDivisionBrackets: boolean;
  seedingMethod: 'DISTRICT_FINISH' | 'HARBIN_POINTS' | 'POWER_RANKING_HYBRID' | 'COMPETITIVE_EQUITY';
}

// ============================================================================
// TEAM POLLS (NATIONAL TOP 25 & STATE RANKINGS)
// ============================================================================

export type RankMovement = 'UP' | 'DOWN' | 'UNCHANGED' | 'NEW_ENTRY' | 'UNRANKED';

export interface RankedTeamEntry {
  rank: number;
  previousRank: number | null; // null if unranked previously
  movement: RankMovement;
  movementDelta: number; // e.g. +3, -2, 0
  teamId: string;
  teamName: string;
  mascot: string;
  state: string;
  classification: string;
  record: { wins: number; losses: number };
  pollPoints: number; // computer rating: points better than an average team
  strengthOfSchedule: number; // average opponent rating
  firstPlaceVotes: number;
  qualityWinsCount: number;
}

export interface StateAndNationalPolls {
  week: number;
  nationalTop25: RankedTeamEntry[];
  stateRankings: Record<string, RankedTeamEntry[]>; // StateName -> Top 10/25
  bubbleTeams: RankedTeamEntry[]; // "Others Receiving Votes"
}

// ============================================================================
// PLAYER LEADERBOARDS & PROSPECT RANKINGS
// ============================================================================

export interface RankedPlayerEntry {
  rank: number;
  player: Player;
  teamId: string;
  teamName: string;
  state: string;
  classification: string;
  primaryStatLine: string;
  compositeRecruitScore: number; // 0 to 1000
}

export type StatCategory =
  | 'PASS_YARDS'
  | 'PASS_TDS'
  | 'RUSH_YARDS'
  | 'RUSH_TDS'
  | 'REC_YARDS'
  | 'TACKLES'
  | 'SACKS'
  | 'INTERCEPTIONS';

export interface PositionalProspectGroup {
  position: Position;
  nationalRankings: RankedPlayerEntry[];
  stateRankings: Record<string, RankedPlayerEntry[]>; // StateName -> RankedPlayerEntry[]
}

export interface PlayerRankingsAndStatsState {
  week: number;
  // 1. Stat Leaderboards
  nationalStatLeaders: Record<StatCategory, RankedPlayerEntry[]>;
  stateStatLeaders: Record<string, Record<StatCategory, RankedPlayerEntry[]>>; // StateName -> Category -> Entries

  // 2. Positional Prospect Rankings
  positionalProspects: Record<Position, PositionalProspectGroup>;
  nationalOverallTop100: RankedPlayerEntry[];
}
