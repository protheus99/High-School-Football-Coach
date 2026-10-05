import {
  Player,
  Position,
  PlayerClass,
  PotentialGrade,
  Team,
  OffensiveScheme,
  DefensiveScheme
} from '../types/game';
import { calculateGaussianVariance, clamp, randomInt } from '../sim/math/variance';
import { DEPTH_TEMPLATE, rebuildDepthChart } from '../sim/depthChart';
import { NameProfile, randomPlayerName, randomSurname } from './names';
import { stateTalent } from '../sim/stateRules';

// Player and coach names come from ./names (realistic, region-aware pools)

const HIGH_SCHOOL_NAMES = [
  { name: 'Westlake', mascot: 'Chaparrals', primary: '#002D62', secondary: '#C4D600' },
  { name: 'Lake Travis', mascot: 'Cavaliers', primary: '#0C2340', secondary: '#BA0C2F' },
  { name: 'Bowie', mascot: 'Bulldogs', primary: '#8B0000', secondary: '#000000' },
  { name: 'Del Valle', mascot: 'Cardinals', primary: '#C8102E', secondary: '#FFFFFF' },
  { name: 'Austin High', mascot: 'Maroons', primary: '#500000', secondary: '#FFFFFF' },
  { name: 'Akins', mascot: 'Eagles', primary: '#003366', secondary: '#D4AF37' },
  { name: 'Anderson', mascot: 'Trojans', primary: '#000080', secondary: '#FFD700' },
  { name: 'Lehman', mascot: 'Lobos', primary: '#004D40', secondary: '#FFB300' }
];

// Neighboring district: non-district opponents and the other half of the playoff bracket
export const NEIGHBOR_DISTRICT_SCHOOLS = [
  { name: 'Round Rock', mascot: 'Dragons', primary: '#6A0DAD', secondary: '#FFFFFF' },
  { name: 'Cedar Ridge', mascot: 'Raiders', primary: '#8B0000', secondary: '#C0C0C0' },
  { name: 'Stony Point', mascot: 'Tigers', primary: '#FF6600', secondary: '#000000' },
  { name: 'Vista Ridge', mascot: 'Rangers', primary: '#00205B', secondary: '#C8102E' },
  { name: 'Vandegrift', mascot: 'Vipers', primary: '#006341', secondary: '#B3A369' },
  { name: 'Cedar Park', mascot: 'Timberwolves', primary: '#4B0082', secondary: '#FFD700' },
  { name: 'Leander', mascot: 'Lions', primary: '#1C3F94', secondary: '#FFC72C' },
  { name: 'McNeil', mascot: 'Mavericks', primary: '#00843D', secondary: '#FFFFFF' }
];

// Two more Region IV districts that only appear as playoff qualifiers
export const PLAYOFF_REGION_DISTRICT_SCHOOLS = [
  [
    { name: 'Smithson Valley', mascot: 'Rangers', primary: '#002855', secondary: '#C8102E' },
    { name: 'Steele', mascot: 'Knights', primary: '#4F2683', secondary: '#C0C0C0' },
    { name: 'Clemens', mascot: 'Buffaloes', primary: '#00205B', secondary: '#FFFFFF' },
    { name: 'New Braunfels', mascot: 'Unicorns', primary: '#003087', secondary: '#FFFFFF' },
    { name: 'Canyon', mascot: 'Cougars', primary: '#006747', secondary: '#C4B581' },
    { name: 'Judson', mascot: 'Rockets', primary: '#4B0082', secondary: '#FFD700' },
    { name: 'Wagner', mascot: 'Thunderbirds', primary: '#7C2529', secondary: '#B9975B' },
    { name: 'East Central', mascot: 'Hornets', primary: '#00338D', secondary: '#FFC72C' }
  ],
  [
    { name: 'Johnson', mascot: 'Jaguars', primary: '#00573F', secondary: '#B3A369' },
    { name: 'Reagan', mascot: 'Rattlers', primary: '#002D72', secondary: '#C8102E' },
    { name: 'Madison', mascot: 'Mavericks', primary: '#003DA5', secondary: '#FFFFFF' },
    { name: 'MacArthur', mascot: 'Brahmas', primary: '#6F263D', secondary: '#FFFFFF' },
    { name: 'Churchill', mascot: 'Chargers', primary: '#002F6C', secondary: '#A2AAAD' },
    { name: "O'Connor", mascot: 'Panthers', primary: '#000000', secondary: '#C8102E' },
    { name: 'Brandeis', mascot: 'Broncos', primary: '#00205B', secondary: '#B9975B' },
    { name: 'Roosevelt', mascot: 'Rough Riders', primary: '#BA0C2F', secondary: '#000000' }
  ]
];

/** A school to generate: colors and mascot, plus optional real-world prestige (PPI) and schemes. */
export interface SchoolIdentity {
  name: string;
  mascot: string;
  primary: string;
  secondary: string;
  prestige?: number;
  offenseScheme?: OffensiveScheme;
  defenseScheme?: DefensiveScheme;
}

/** Stable pseudo-random enrollment (6A range) from the school name; used for the UIL D1/D2 split. */
export function schoolEnrollment(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 2300 + (hash % 2700);
}

let playerIdCounter = 0;

/** Pareto talent roll: most players are rotational or depth, a few are All-State or phenoms. */
export function rollTalent(): { ovr: number; potential: PotentialGrade } {
  const baseRoll = Math.random();
  if (baseRoll > 0.98) return { ovr: randomInt(88, 96), potential: 'A+' }; // 5-Star Phenom
  if (baseRoll > 0.9) return { ovr: randomInt(78, 87), potential: 'A' }; // 4-Star All-State
  if (baseRoll > 0.7) return { ovr: randomInt(68, 77), potential: 'B' }; // 3-Star Starter
  if (baseRoll > 0.3) return { ovr: randomInt(52, 67), potential: 'C' }; // Rotational Player
  return { ovr: randomInt(40, 51), potential: 'D' }; // Depth / JV
}

/** Fixed identity and ratings for a known prospect joining the roster. */
export interface PlayerOverrides {
  firstName?: string;
  lastName?: string;
  overall?: number;
  potential?: PotentialGrade;
  speed?: number;
  strength?: number;
  nameProfile?: NameProfile; // regional name mix (border regions lean Hispanic)
  takenNames?: Set<string>; // avoid duplicate full names on the same roster
}

export function generateProceduralPlayer(
  position: Position,
  classYear: PlayerClass,
  tier: 1 | 2 | 3 = 1,
  ovrAdjustment = 0,
  overrides: PlayerOverrides = {}
): Player {
  const generated = overrides.firstName && overrides.lastName ? undefined : randomPlayerName(overrides.nameProfile, overrides.takenNames);
  const firstName = overrides.firstName ?? generated!.firstName;
  const lastName = overrides.lastName ?? generated!.lastName;

  // Age based on class
  const ageMap: Record<PlayerClass, number> = {
    Freshman: 14,
    Sophomore: 15,
    Junior: 16,
    Senior: 17
  };

  // Pareto Distribution base overall
  const talent = rollTalent();
  let ovr = talent.ovr;
  const potential: PotentialGrade = overrides.potential ?? talent.potential;

  // Adjust for tier
  if (tier === 2) ovr = Math.max(40, ovr - randomInt(6, 12));
  if (tier === 3) ovr = Math.max(35, ovr - randomInt(14, 22));
  ovr = Math.min(99, Math.max(35, ovr + ovrAdjustment)); // prestige bonuses never push a player past 99
  if (overrides.overall !== undefined) ovr = overrides.overall;

  const speed = overrides.speed ?? clamp(Math.floor(ovr + calculateGaussianVariance(0, 5)), 40, 99);
  const strength = overrides.strength ?? clamp(Math.floor(ovr + calculateGaussianVariance(0, 5)), 40, 99);
  const agility = clamp(Math.floor(ovr + calculateGaussianVariance(0, 4)), 40, 99);
  const stamina = clamp(Math.floor(randomInt(70, 95)), 50, 99);

  // Off-position skills scale with overall rating (same averages as before, but better athletes are better everywhere)
  const secondary = (min: number, max: number) => clamp(randomInt(min, max) + Math.round((ovr - 60) * 0.5), 20, 99);

  return {
    id: `ply_${Date.now()}_${++playerIdCounter}`,
    firstName,
    lastName,
    position,
    classYear,
    age: ageMap[classYear],
    overallRating: ovr,
    potential,
    depthChartTier: tier,
    attributes: {
      speed,
      strength,
      agility,
      stamina,
      passingAccuracy: position === 'QB' ? ovr : secondary(20, 50),
      armStrength: position === 'QB' ? ovr : secondary(25, 55),
      carrying: position === 'RB' ? ovr : secondary(30, 60),
      vision: position === 'RB' || position === 'QB' ? ovr : secondary(30, 65),
      routeRunning: position === 'WR' || position === 'TE' ? ovr : secondary(20, 50),
      catching: position === 'WR' || position === 'TE' ? ovr : secondary(30, 60),
      runBlocking: position === 'OT' || position === 'OG' || position === 'C' ? ovr : secondary(30, 60),
      passBlocking: position === 'OT' || position === 'OG' || position === 'C' ? ovr : secondary(30, 60),
      passRush: position === 'DE' || position === 'DT' ? ovr : secondary(25, 55),
      tackling: position === 'LB' || position === 'DT' || position === 'DE' ? ovr : secondary(30, 65),
      coverage: position === 'CB' || position === 'S' ? ovr : secondary(20, 50),
      kickingPower: position === 'K' || position === 'P' ? ovr : randomInt(20, 40),
      kickingAccuracy: position === 'K' || position === 'P' ? ovr : randomInt(20, 40),
      footballIQ: randomInt(45, 88),
      discipline: randomInt(50, 92),
      ego: randomInt(30, 90),
      leadership: classYear === 'Senior' ? randomInt(65, 95) : randomInt(35, 70),
      clutch: randomInt(40, 90)
    },
    condition: {
      inGameStamina: 100,
      seasonWear: 0,
      injuryStatus: 'HEALTHY',
      injuryWeeksRemaining: 0,
      isHot: false,
      isCold: false
    },
    academics: {
      gpa: Number((Math.random() * 1.8 + 2.2).toFixed(2)),
      isEligible: true,
      consecutiveFailingWeeks: 0
    },
    stats: {
      gamesPlayed: 0,
      passAttempts: 0,
      passCompletions: 0,
      passYards: 0,
      passTDs: 0,
      interceptionsThrown: 0,
      rushAttempts: 0,
      rushYards: 0,
      rushTDs: 0,
      fumblesLost: 0,
      receptions: 0,
      receivingYards: 0,
      receivingTDs: 0,
      tackles: 0,
      tacklesForLoss: 0,
      sacks: 0,
      interceptionsCaught: 0,
      fieldGoalsAttempted: 0,
      fieldGoalsMade: 0
    },
    recruiting: {
      starRating: ovr >= 90 ? 5 : ovr >= 82 ? 4 : ovr >= 74 ? 3 : ovr >= 66 ? 2 : 0,
      offers: [],
      isNationalLetterOfIntentSigned: false
    },
    parent: {
      sentiment: randomInt(65, 90),
      isBoosterDonor: Math.random() > 0.85,
      archetype: Math.random() > 0.7 ? 'HELICOPTER' : Math.random() > 0.85 ? 'DEMANDING_BOOSTER' : 'SUPPORTIVE',
      activeComplaint: null
    }
  };
}

/**
 * Rating points by class on a generated roster: high school players improve every year, so a starting roster
 * already has the shape the game's progression gives every roster later (seniors well ahead of freshmen).
 * Without it, ratings drifted up for the first four seasons as rosters grew into that shape.
 */
export const CLASS_AGE_CURVE: Record<PlayerClass, number> = { Freshman: -6, Sophomore: -2, Junior: 1, Senior: 3 };

/** Class mix of a roster's starters (mostly upperclassmen, as seasons of progression leave them) and of its depth. */
const STARTER_CLASS_WEIGHTS: [PlayerClass, number][] = [['Freshman', 0.18], ['Sophomore', 0.23], ['Junior', 0.27], ['Senior', 0.32]];
const DEPTH_CLASS_WEIGHTS: [PlayerClass, number][] = [['Freshman', 0.29], ['Sophomore', 0.26], ['Junior', 0.24], ['Senior', 0.21]];

function rollClass(weights: [PlayerClass, number][]): PlayerClass {
  let roll = Math.random();
  for (const [classYear, weight] of weights) {
    roll -= weight;
    if (roll < 0) return classYear;
  }
  return weights[weights.length - 1][0];
}

/**
 * How much rawer every newcomer arrives (generated freshmen and every feeder prospect) than the original tuning:
 * sets the level ratings hold at season after season.
 */
export const INTAKE_SHIFT = 2;

export function generateCompleteTeamRoster(talentAdjustment = 0, nameProfile: NameProfile = 'DEFAULT'): Player[] {
  const roster: Player[] = [];
  const takenNames = new Set<string>();

  // Starter slots roll first-string talent, the rest of the core rolls backups and extra depth rolls
  // developmental (third-string) talent; then the best players at each position start
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    const { roster: size, starters, core } = DEPTH_TEMPLATE[pos];
    const corePlayers: Player[] = [];
    for (let i = 0; i < size; i++) {
      const tier = i < starters ? 1 : i < core ? 2 : 3;
      const classYear = rollClass(tier === 1 ? STARTER_CLASS_WEIGHTS : DEPTH_CLASS_WEIGHTS);
      let player = generateProceduralPlayer(pos, classYear, tier, talentAdjustment + CLASS_AGE_CURVE[classYear], { nameProfile, takenNames });
      if (i < core) corePlayers.push(player);
      else {
        // Developmental depth starts behind the core group at its position
        const ceiling = Math.min(...corePlayers.map((p) => p.overallRating)) - 1;
        if (player.overallRating > ceiling) {
          takenNames.delete(`${player.firstName} ${player.lastName}`);
          player = generateProceduralPlayer(pos, classYear, tier, 0, { nameProfile, takenNames, overall: Math.max(35, ceiling) });
        }
      }
      roster.push(player);
    }
  });

  rebuildDepthChart(roster);
  return roster;
}

/** The starters a light team keeps (another state's league): the players who collect the leader-board stats. */
export const LIGHT_STARTERS: [Position, number][] = [
  ['QB', 1],
  ['RB', 1],
  ['WR', 2],
  ['TE', 1],
  ['LB', 1],
  ['DE', 1],
  ['CB', 1],
  ['S', 1]
];

/**
 * A light team's roster: its game-day rating from rolled starter talent (the same rolls a full roster makes, the
 * best of each position's core group starting) and full players only for its stat leaders. About a tenth of the
 * work and size of a full roster.
 */
export function generateLightRoster(talentAdjustment = 0, nameProfile: NameProfile = 'DEFAULT', consistent = false): { roster: Player[]; lightRating: number } {
  const classes: PlayerClass[] = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
  const takenNames = new Set<string>();
  const starterRatings: number[] = [];
  const roster: Player[] = [];
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    const { starters, core } = DEPTH_TEMPLATE[pos];
    const rolls = Array.from({ length: core }, (_, i) => {
      let ovr = rollTalent().ovr;
      if (i >= starters) ovr = Math.max(40, ovr - randomInt(6, 12)); // the backups roll second-string talent
      return Math.min(99, Math.max(35, ovr + talentAdjustment));
    }).sort((a, b) => b - a);
    starterRatings.push(...rolls.slice(0, starters));
    const keep = LIGHT_STARTERS.find(([p]) => p === pos)?.[1] ?? 0;
    rolls.slice(0, keep).forEach((overall) =>
      roster.push(generateProceduralPlayer(pos, classes[randomInt(0, classes.length - 1)], 1, 0, { nameProfile, takenNames, overall }))
    );
  });
  const rating = starterRatings.reduce((s, r) => s + r, 0) / starterRatings.length;
  // An elite program reloads: its rating is the average of four classes' rolls (half the usual spread)
  const lightRating = consistent ? (rating + rollStarterRating(talentAdjustment) + rollStarterRating(talentAdjustment) + rollStarterRating(talentAdjustment)) / 4 : rating;
  return { roster, lightRating };
}

/** One roll of a team's game-day rating (the same rolls generateLightRoster makes), without building players. */
function rollStarterRating(talentAdjustment: number): number {
  const ratings: number[] = [];
  (Object.keys(DEPTH_TEMPLATE) as Position[]).forEach((pos) => {
    const { starters, core } = DEPTH_TEMPLATE[pos];
    const rolls = Array.from({ length: core }, (_, i) => {
      let ovr = rollTalent().ovr;
      if (i >= starters) ovr = Math.max(40, ovr - randomInt(6, 12));
      return Math.min(99, Math.max(35, ovr + talentAdjustment));
    }).sort((a, b) => b - a);
    ratings.push(...rolls.slice(0, starters));
  });
  return ratings.reduce((s, r) => s + r, 0) / ratings.length;
}

/**
 * The talent a program's players roll with (rating points added to each player): 0.3 per prestige point around
 * 75, plus a blue-blood boost of 0.4 per point above 90 (the national powers stand clear of merely good
 * programs), plus the state's national strength.
 */
export function programTalent(prestige: number, state?: string): number {
  return Math.round((prestige - 75) * 0.3 + Math.max(0, prestige - BLUE_BLOOD_PRESTIGE) * 0.4 + stateTalent(state));
}
const BLUE_BLOOD_PRESTIGE = 90;

/** Prestige at which a program reloads every year: its talent varies about half as much as everyone else's. */
export const ELITE_PRESTIGE = 90;

/** An elite program's full roster: the middle of five rolled rosters by game-day rating (about half the spread). */
function consistentRoster(talentAdjustment: number, nameProfile: NameProfile): Player[] {
  const starterAverage = (roster: Player[]) => {
    const starters = roster.filter((p) => p.depthChartTier === 1);
    return starters.reduce((s, p) => s + p.overallRating, 0) / Math.max(1, starters.length);
  };
  const rosters = Array.from({ length: 5 }, () => generateCompleteTeamRoster(talentAdjustment, nameProfile)).sort((a, b) => starterAverage(a) - starterAverage(b));
  return rosters[2];
}

/**
 * Generates a district's teams. When `talentFromPrestige` is set, schools with a real prestige rating get
 * rosters that lean toward it (a PPI-95 powerhouse rolls about +6 OVR, a PPI-50 program about -8).
 */
export function generateDistrictTeams(
  districtId = 'tx_6a_d26',
  schools: SchoolIdentity[] = HIGH_SCHOOL_NAMES,
  options: { talentFromPrestige?: boolean; state?: string; nameProfile?: NameProfile; light?: boolean } = {}
): Team[] {
  const schemesOffense: OffensiveScheme[] = ['TRIPLE_OPTION', 'AIR_RAID', 'POWER_I', 'SPREAD'];
  const schemesDefense: DefensiveScheme[] = ['FOUR_THREE', 'FOUR_FOUR', 'THREE_THREE_FIVE', 'DROP_EIGHT'];

  return schools.map((hs, i) => {
    const prestige = hs.prestige ?? randomInt(68, 92);
    const nameProfile = options.nameProfile ?? 'DEFAULT';
    // Talent leans toward the school's prestige (within its state) plus its state's national strength
    const talent = options.talentFromPrestige ? programTalent(prestige, options.state) : 0;
    const elite = !!options.talentFromPrestige && prestige >= ELITE_PRESTIGE;
    const light = options.light ? generateLightRoster(talent, nameProfile, elite) : undefined;
    const roster = light?.roster ?? (elite ? consistentRoster(talent, nameProfile) : generateCompleteTeamRoster(talent, nameProfile));

    return {
      id: `team_${hs.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      name: hs.name,
      mascot: hs.mascot,
      classification: '6A',
      districtId,
      primaryColor: hs.primary,
      secondaryColor: hs.secondary,
      prestige,
      playbookFamiliarity: randomInt(70, 90),
      schemeOffense: hs.offenseScheme ?? schemesOffense[i % schemesOffense.length],
      schemeDefense: hs.defenseScheme ?? schemesDefense[i % schemesDefense.length],
      enrollment: schoolEnrollment(hs.name),
      nameProfile,
      ...(options.state && { state: options.state }),
      programMeters: {
        schoolBoardTrust: randomInt(75, 90),
        boosterApproval: randomInt(70, 92),
        lockerRoomDiscipline: randomInt(68, 88),
        complianceScore: randomInt(85, 98)
      },
      staff: {
        headCoachId: `coach_${i}`,
        headCoachName: `Coach ${randomSurname(nameProfile)}`,
        reputation: prestige - randomInt(0, 10),
        offensiveCoordinator: { name: `OC ${randomSurname(nameProfile)}`, playCalling: randomInt(65, 88), qbWhispering: randomInt(60, 85) },
        defensiveCoordinator: { name: `DC ${randomSurname(nameProfile)}`, schemeDiscipline: randomInt(65, 88), tacklingTech: randomInt(60, 85) },
        strengthCoach: { name: `Trainer ${randomSurname(nameProfile)}`, conditioningRating: randomInt(70, 90) }
      },
      roster,
      ...(light && { lightRating: light.lightRating }),
      record: {
        wins: 0,
        losses: 0,
        districtWins: 0,
        districtLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        districtPointDifferential: 0,
        headToHeadHistory: {}
      }
    };
  });
}
