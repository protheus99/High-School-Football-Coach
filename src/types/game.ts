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
export type CollegeTier = 'POWER_4' | 'GROUP_OF_5' | 'FCS' | 'DIVISION_2' | 'PWO';

export type PlayConcept =
  | 'INSIDE_RUN'
  | 'OUTSIDE_RUN'
  | 'SHORT_PASS'
  | 'DEEP_PASS'
  | 'PUNT'
  | 'FIELD_GOAL'
  | 'PAT_KICK'
  | 'TWO_POINT_TRY';

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
  isHot: boolean;
  isCold: boolean;
}

export interface PlayerAcademics {
  gpa: number;
  isEligible: boolean;
  consecutiveFailingWeeks: number;
  studyHallAssigned: boolean;
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
  tier: CollegeTier;
  offerDateWeek: number;
}

export interface RecruitingProfile {
  starRating: 0 | 1 | 2 | 3 | 4 | 5;
  offers: CollegeOffer[];
  committedCollege?: string;
  isNationalLetterOfIntentSigned: boolean;
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
}

export interface PlayEvent {
  playId: string;
  quarter: 1 | 2 | 3 | 4 | 'OT';
  clockTimeRemainingSeconds: number;
  down: 1 | 2 | 3 | 4;
  distance: number;
  yardLine: number;
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
  };
}

export interface NarrativeDilemma {
  id: string;
  weekTriggered: number;
  title: string;
  scenario: string;
  involvedPlayerId?: string;
  choices: DilemmaChoice[];
}

export interface FeederProspect {
  id: string;
  name: string;
  middleSchool: string;
  projectedPosition: Position;
  revealedPotential: PotentialGrade | 'UNKNOWN';
  scoutedSpeed: number | null;
  scoutedStrength: number | null;
  interestScore: number;
  isTransferRisk: boolean;
}
