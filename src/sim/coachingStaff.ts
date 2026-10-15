import { Position } from '../types/game';

// ---------------------------------------------------------------------------
// The coaching staff. Each assistant has a rating (50-99) that sets his grade, and his grade sets a whole-number
// level (D = 1, C = 2, B = 3, A = 4, S = 5) and how many effects he brings (D and C one, B and A two, S three; a
// plus grade adds one more). Every effect works at the coach's level, except on game day: a game-day effect never
// counts above level 2, a strong free coach, so paying buys breadth (more effects, stronger development, recruiting,
// Coach Points and program effects), not wins (balance review 2026-10-15: the best paid staff beats the best free
// staff about 56% of the time; game-day edges are in team-rating points, +1 is about 60% against an equal team).
// ---------------------------------------------------------------------------

export type CoachRole =
  | 'OFFENSIVE_COORDINATOR'
  | 'DEFENSIVE_COORDINATOR'
  | 'QUARTERBACKS'
  | 'RUNNING_BACKS'
  | 'WIDE_RECEIVERS'
  | 'TIGHT_ENDS'
  | 'OFFENSIVE_LINE'
  | 'DEFENSIVE_LINE'
  | 'LINEBACKERS'
  | 'CORNERBACKS'
  | 'SAFETIES'
  | 'SPECIAL_TEAMS'
  | 'STRENGTH_CONDITIONING'
  | 'FOOTBALL_OPERATIONS'
  | 'JV_HEAD_COACH'
  | 'JV_OFFENSIVE_COORDINATOR'
  | 'JV_DEFENSIVE_COORDINATOR';

export type EffectKind = 'GAME_DAY' | 'DEVELOPMENT' | 'INJURY' | 'COACH_POINTS' | 'RECRUITING' | 'PROGRAM' | 'RECOVERY';

export interface CoachEffect {
  id: string;
  name: string;
  description: string;
  kind: EffectKind;
  gameDayEdge?: number; // GAME_DAY: the effect's weight (situational effects already weighted by how often they apply)
  positions?: Position[]; // DEVELOPMENT and RECRUITING: the position group it works on
  amount?: number; // at level 5: INJURY share fewer; COACH_POINTS share more (or Coach Points a week); RECRUITING share more interest; PROGRAM points a week or share; RECOVERY fatigue a week
}

export interface CoachRoleInfo {
  role: CoachRole;
  title: string;
  edgeCap: number; // the most game-day edge this one coach can add
  effects: CoachEffect[];
}

const dev = (id: string, positions: Position[]): CoachEffect => ({
  id,
  name: 'Position Development',
  description: `${positions.join('/')} players grow faster in practice and the off season`,
  kind: 'DEVELOPMENT',
  positions,
  amount: 1
});

/** A position coach who also recruits: contacts and programs earn more interest from prospects at his positions. */
const recruiter = (id: string, name: string, positions: Position[]): CoachEffect => ({
  id,
  name,
  description: `Contacts and programs earn more interest from ${positions.join('/')} prospects`,
  kind: 'RECRUITING',
  positions,
  amount: 0.2
});

export const COACH_ROLES: CoachRoleInfo[] = [
  {
    role: 'OFFENSIVE_COORDINATOR',
    title: 'Offensive Coordinator',
    edgeCap: 0.6,
    effects: [
      { id: 'play_caller', name: 'Play Caller', description: 'Better play success on every offensive snap', kind: 'GAME_DAY', gameDayEdge: 0.4 },
      { id: 'red_zone_architect', name: 'Red Zone Architect', description: 'More touchdowns, fewer field goals in the red zone', kind: 'GAME_DAY', gameDayEdge: 0.25 },
      { id: 'oc_halftime', name: 'Halftime Adjuster', description: 'The offense improves after halftime', kind: 'GAME_DAY', gameDayEdge: 0.15 },
      { id: 'tempo_master', name: 'Tempo Master', description: 'An extra possession when trailing', kind: 'GAME_DAY', gameDayEdge: 0.15 },
      { id: 'scheme_expert', name: 'Scheme Expert', description: 'Sharper when running the preferred playbook', kind: 'GAME_DAY', gameDayEdge: 0.25 }
    ]
  },
  {
    role: 'DEFENSIVE_COORDINATOR',
    title: 'Defensive Coordinator',
    edgeCap: 0.6,
    effects: [
      { id: 'defensive_mastermind', name: 'Defensive Mastermind', description: 'Better stops on every defensive snap', kind: 'GAME_DAY', gameDayEdge: 0.4 },
      { id: 'blitz_architect', name: 'Blitz Architect', description: 'Stronger on third and fourth down', kind: 'GAME_DAY', gameDayEdge: 0.25 },
      { id: 'turnover_machine', name: 'Turnover Machine', description: 'More takeaways', kind: 'GAME_DAY', gameDayEdge: 0.2 },
      { id: 'red_zone_wall', name: 'Red Zone Wall', description: 'Forces field goals in the red zone', kind: 'GAME_DAY', gameDayEdge: 0.25 },
      { id: 'dc_halftime', name: 'Halftime Adjuster', description: 'The defense improves after halftime', kind: 'GAME_DAY', gameDayEdge: 0.15 }
    ]
  },
  {
    role: 'QUARTERBACKS',
    title: 'Quarterbacks',
    edgeCap: 0.25,
    effects: [
      { id: 'pocket_presence', name: 'Pocket Presence', description: 'Fewer sacks and interceptions', kind: 'GAME_DAY', gameDayEdge: 0.15 },
      { id: 'two_minute_maestro', name: 'Two-Minute Maestro', description: 'Sharper end-of-half drives', kind: 'GAME_DAY', gameDayEdge: 0.12 },
      { ...dev('qb_whisperer', ['QB']), name: 'QB Whisperer' },
      recruiter('qb_recruiter', 'QB Recruiter', ['QB'])
    ]
  },
  {
    role: 'RUNNING_BACKS',
    title: 'Running Backs',
    edgeCap: 0.25,
    effects: [
      { id: 'ball_security', name: 'Ball Security', description: 'Fewer fumbles', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'workhorse', name: 'Workhorse', description: 'A stronger run game in the fourth quarter', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      dev('rb_development', ['RB']),
      recruiter('rb_recruiter', 'RB Recruiter', ['RB'])
    ]
  },
  {
    role: 'WIDE_RECEIVERS',
    title: 'Wide Receivers',
    edgeCap: 0.25,
    effects: [
      { id: 'route_technician', name: 'Route Technician', description: 'More completions', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'sure_hands', name: 'Sure Hands', description: 'Fewer drops', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('wr_development', ['WR']),
      recruiter('wr_recruiter', 'WR Recruiter', ['WR'])
    ]
  },
  {
    role: 'TIGHT_ENDS',
    title: 'Tight Ends',
    edgeCap: 0.25,
    effects: [
      { id: 'seam_threat', name: 'Seam Threat', description: 'A better third-down target', kind: 'GAME_DAY', gameDayEdge: 0.05 },
      { id: 'blocking_tight_ends', name: 'Blocking Tight Ends', description: 'A better run game', kind: 'GAME_DAY', gameDayEdge: 0.05 },
      dev('te_development', ['TE']),
      recruiter('te_recruiter', 'TE Recruiter', ['TE'])
    ]
  },
  {
    role: 'OFFENSIVE_LINE',
    title: 'Offensive Line',
    edgeCap: 0.25,
    effects: [
      { id: 'pass_pro_wall', name: 'Pass Pro Wall', description: 'Fewer sacks', kind: 'GAME_DAY', gameDayEdge: 0.12 },
      { id: 'short_yardage_mauler', name: 'Short-Yardage Mauler', description: 'Converts third and fourth and short', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      dev('ol_development', ['OT', 'OG', 'C']),
      recruiter('ol_recruiter', 'O-Line Recruiter', ['OT', 'OG', 'C'])
    ]
  },
  {
    role: 'DEFENSIVE_LINE',
    title: 'Defensive Line',
    edgeCap: 0.25,
    effects: [
      { id: 'pass_rush_guru', name: 'Pass Rush Guru', description: 'More sacks', kind: 'GAME_DAY', gameDayEdge: 0.12 },
      { id: 'run_stuffer', name: 'Run Stuffer', description: 'Better run defense', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      dev('dl_development', ['DE', 'DT']),
      recruiter('dl_recruiter', 'D-Line Recruiter', ['DE', 'DT'])
    ]
  },
  {
    role: 'LINEBACKERS',
    title: 'Linebackers',
    edgeCap: 0.25,
    effects: [
      { id: 'run_fits', name: 'Run Fits', description: 'Better run defense', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'coverage_linebacker', name: 'Coverage Linebacker', description: 'Better against short passes', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('lb_development', ['LB']),
      recruiter('lb_recruiter', 'LB Recruiter', ['LB'])
    ]
  },
  {
    role: 'CORNERBACKS',
    title: 'Cornerbacks',
    edgeCap: 0.25,
    effects: [
      { id: 'lockdown', name: 'Lockdown', description: 'Fewer deep completions allowed', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'cb_ballhawk', name: 'Ballhawk', description: 'More interceptions', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('cb_development', ['CB']),
      recruiter('cb_recruiter', 'CB Recruiter', ['CB'])
    ]
  },
  {
    role: 'SAFETIES',
    title: 'Safeties',
    edgeCap: 0.25,
    effects: [
      { id: 'last_line', name: 'Last Line', description: 'Fewer big plays allowed', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 's_ballhawk', name: 'Ballhawk', description: 'More interceptions', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('s_development', ['S']),
      recruiter('s_recruiter', 'Safety Recruiter', ['S'])
    ]
  },
  {
    role: 'SPECIAL_TEAMS',
    title: 'Special Teams Coordinator',
    edgeCap: 0.2,
    effects: [
      { id: 'special_teams_ace', name: 'Special Teams Ace', description: 'More accurate kicking', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'hidden_yardage', name: 'Hidden Yardage', description: 'Better field position on returns', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      { id: 'coffin_corner', name: 'Coffin Corner', description: 'Better punts', kind: 'GAME_DAY', gameDayEdge: 0.05 },
      recruiter('specialist_recruiter', 'Specialist Recruiter', ['K', 'P'])
    ]
  },
  {
    role: 'STRENGTH_CONDITIONING',
    title: 'Strength & Conditioning',
    edgeCap: 0.15,
    effects: [
      { id: 'fourth_quarter_legs', name: 'Fourth-Quarter Legs', description: 'Starters tire less late in games', kind: 'GAME_DAY', gameDayEdge: 0.15 },
      { id: 'iron_body', name: 'Iron Body', description: 'Fewer injuries', kind: 'INJURY', amount: 0.2 },
      { id: 'offseason_program', name: 'Off-Season Program', description: 'Every player grows more in the off season', kind: 'DEVELOPMENT', amount: 1 },
      { id: 'recovery_science', name: 'Recovery Science', description: 'Players recover faster from practice', kind: 'RECOVERY', amount: 2 }
    ]
  },
  {
    role: 'FOOTBALL_OPERATIONS',
    title: 'Director of Football Operations',
    edgeCap: 0,
    effects: [
      { id: 'front_office_hustle', name: 'Front Office Hustle', description: 'More weekly Coach Points', kind: 'COACH_POINTS', amount: 0.3 },
      { id: 'booster_liaison', name: 'Booster Liaison', description: 'Keeps the boosters happy: approval rises a little every week', kind: 'PROGRAM', amount: 1 },
      { id: 'compliance_officer', name: 'Compliance Officer', description: 'Keeps the program clean: compliance recovers a little every week', kind: 'PROGRAM', amount: 1 },
      { id: 'fundraiser', name: 'Fundraiser', description: 'Extra Coach Points every week', kind: 'COACH_POINTS', amount: 15 }
    ]
  },
  {
    role: 'JV_HEAD_COACH',
    title: 'JV Head Coach',
    edgeCap: 0,
    effects: [
      { id: 'feeder_pipeline', name: 'Prospect Pipeline', description: 'Every contact with a prospect earns more interest', kind: 'RECRUITING', amount: 0.2 },
      { id: 'youth_development', name: 'Youth Development', description: 'Freshmen and sophomores grow faster', kind: 'DEVELOPMENT', amount: 1 },
      { id: 'camp_director', name: 'Camp Director', description: 'Programs cost less', kind: 'PROGRAM', amount: 0.2 },
      { id: 'family_ties', name: 'Family Ties', description: 'Family Night and Tryout Day earn more interest', kind: 'PROGRAM', amount: 0.5 }
    ]
  },
  {
    role: 'JV_OFFENSIVE_COORDINATOR',
    title: 'JV Offensive Coordinator',
    edgeCap: 0.05,
    effects: [
      { id: 'young_offense', name: 'Young Offense', description: 'Freshman and sophomore offense grows faster', kind: 'DEVELOPMENT', amount: 1 },
      recruiter('offense_recruiter', 'Offense Recruiter', ['QB', 'RB', 'WR', 'TE']),
      { id: 'scout_team_offense', name: 'Scout Team', description: 'The varsity defense practices against a sharper scout offense', kind: 'GAME_DAY', gameDayEdge: 0.05 },
      { ...{ id: 'camp_director', name: 'Camp Director', description: 'Programs cost less', kind: 'PROGRAM', amount: 0.2 }, id: 'camp_director_offense' }
    ]
  },
  {
    role: 'JV_DEFENSIVE_COORDINATOR',
    title: 'JV Defensive Coordinator',
    edgeCap: 0.05,
    effects: [
      { id: 'young_defense', name: 'Young Defense', description: 'Freshman and sophomore defense grows faster', kind: 'DEVELOPMENT', amount: 1 },
      recruiter('defense_recruiter', 'Defense Recruiter', ['DE', 'DT', 'LB', 'CB', 'S']),
      { id: 'scout_team_defense', name: 'Scout Team', description: 'The varsity offense practices against a sharper scout defense', kind: 'GAME_DAY', gameDayEdge: 0.05 },
      { ...{ id: 'camp_director', name: 'Camp Director', description: 'Programs cost less', kind: 'PROGRAM', amount: 0.2 }, id: 'camp_director_defense' }
    ]
  }
];

/** A hired assistant: one overall rating and the effects they bring. */
export interface HiredCoach {
  role: CoachRole;
  name: string;
  rating: number; // 50-99
  effectIds: string[];
  contractEndSeason?: number; // the last season the contract covers (see sim/staffContracts)
  paidThroughSeason?: number; // seasons are paid one at a time: the last one paid for
}

/** A coach's level, from his grade's letter: D 1, C 2, B 3, A 4, S 5. */
export const coachLevel = (rating: number): number => ({ D: 1, C: 2, B: 3, A: 4, S: 5 })[coachGrade(rating).charAt(0) as 'D' | 'C' | 'B' | 'A' | 'S'];

/** Effects a coach brings: D and C one, B and A two, S three; a plus grade one more. */
export const effectSlots = (rating: number) => {
  const grade = coachGrade(rating);
  return ({ D: 1, C: 1, B: 2, A: 2, S: 3 })[grade.charAt(0) as 'D' | 'C' | 'B' | 'A' | 'S'] + (grade.endsWith('+') ? 1 : 0);
};

/** Game-day effects never count above this level: a strong free coach. */
export const GAME_DAY_LEVEL_CAP = 2;
/** A game-day effect's edge per level, as a share of its weight. */
const GAME_DAY_PER_LEVEL = 0.08;
/** Off-season growth per level from a development effect (practice gains are boosted by level too, in sim/training). */
const DEVELOPMENT_PER_LEVEL = 0.01;

/** The level an effect works at for this coach (game-day effects stop at GAME_DAY_LEVEL_CAP). */
export const effectLevel = (effect: CoachEffect, rating: number) => (effect.kind === 'GAME_DAY' ? Math.min(GAME_DAY_LEVEL_CAP, coachLevel(rating)) : coachLevel(rating));

/** An effect's share of its full (level 5) amount for a coach of this rating. */
export const effectStrength = (rating: number) => coachLevel(rating) / 5;

/** Most extra off-season growth a season the staff can give one player. */
export const STAFF_DEVELOPMENT_CAP = 0.45;

/** Coach Points every hired assistant adds each week, whatever their effects. */
export const COACH_WEEKLY_CP = 2;

const MAX_GAME_DAY_EDGE = 2;
// Past +1.0 each point counts for 1/2.2: a perfect staff (every coach 99, raw +3.2 within the per-coach caps)
// lands on the +2.0 cap
const DIMINISHING = 2.2;

/**
 * The staff's game-day edge in team-rating points: each coach's game-day effects (scaled by rating, up to the
 * coach's cap), added up, counted in full to +1.0 and at 1/2.2 beyond, never more than +2.0.
 */
export function staffGameDayEdge(staff: HiredCoach[]): number {
  const raw = staff.reduce((total, coach) => total + coachGameDayEdge(coach), 0);
  return Math.min(MAX_GAME_DAY_EDGE, raw <= 1 ? raw : 1 + (raw - 1) / DIMINISHING);
}

/** The staff's other effects, scaled by rating: development by position, injury and Coach Point multipliers. */
export function staffBonuses(staff: HiredCoach[]): {
  developmentByPosition: Partial<Record<Position, number>>; // off-season growth a season
  allPlayersDevelopment: number;
  freshmanDevelopment: number;
  practiceByPosition: Partial<Record<Position, number>>; // practice-gain boost share (0-1, level / 5)
  practiceYoung: number;
  feederInterestByPosition: Partial<Record<Position, number>>; // extra interest share from recruiters, by position
  programDiscount: number; // share off program costs
  familyBoost: number; // extra interest share from Family Night and Tryout Day
  recovery: number; // fatigue recovered a week
  injuryReduction: number;
  coachPointMultiplier: number;
  weeklyCoachPoints: number;
  feederInterest: number;
  boosterDrift: number; // booster approval points a week
  complianceDrift: number; // compliance points a week
} {
  const out = {
    developmentByPosition: {} as Partial<Record<Position, number>>,
    allPlayersDevelopment: 0,
    freshmanDevelopment: 0,
    practiceByPosition: {} as Partial<Record<Position, number>>,
    practiceYoung: 0,
    feederInterestByPosition: {} as Partial<Record<Position, number>>,
    programDiscount: 0,
    familyBoost: 0,
    recovery: 0,
    injuryReduction: 0,
    coachPointMultiplier: 1,
    weeklyCoachPoints: 0,
    feederInterest: 0,
    boosterDrift: 0,
    complianceDrift: 0
  };
  staff.forEach((coach) => {
    const info = COACH_ROLES.find((r) => r.role === coach.role);
    if (!info) return;
    const level = coachLevel(coach.rating);
    const k = level / 5; // share of an effect's full (level 5) amount
    const grow = DEVELOPMENT_PER_LEVEL * level;
    const practice = level / 12; // under half the old practice boost: development is breadth, not a runaway
    out.weeklyCoachPoints += COACH_WEEKLY_CP;
    info.effects
      .filter((e) => coach.effectIds.includes(e.id))
      .forEach((e) => {
        const amount = e.amount ?? 0;
        if (e.kind === 'DEVELOPMENT' && e.positions)
          e.positions.forEach((p) => {
            out.developmentByPosition[p] = (out.developmentByPosition[p] ?? 0) + grow;
            out.practiceByPosition[p] = Math.min(1, (out.practiceByPosition[p] ?? 0) + practice);
          });
        else if (e.kind === 'DEVELOPMENT' && e.id === 'offseason_program') out.allPlayersDevelopment += grow;
        else if (e.kind === 'DEVELOPMENT') {
          out.freshmanDevelopment += grow;
          out.practiceYoung = Math.min(0.3, out.practiceYoung + practice); // the JV staff doesn't stack past one strong coach
        } else if (e.kind === 'INJURY') out.injuryReduction += amount * k;
        else if (e.id === 'fundraiser') out.weeklyCoachPoints += Math.round(amount * k);
        else if (e.kind === 'COACH_POINTS') out.coachPointMultiplier += amount * k;
        else if (e.kind === 'RECRUITING' && e.positions) e.positions.forEach((p) => (out.feederInterestByPosition[p] = (out.feederInterestByPosition[p] ?? 0) + amount * k));
        else if (e.kind === 'RECRUITING') out.feederInterest += amount * k;
        else if (e.kind === 'RECOVERY') out.recovery += amount * k;
        else if (e.id === 'booster_liaison') out.boosterDrift += amount * k;
        else if (e.id === 'compliance_officer') out.complianceDrift += amount * k;
        else if (e.id.startsWith('camp_director')) out.programDiscount = Math.min(0.5, out.programDiscount + amount * k);
        else if (e.id === 'family_ties') out.familyBoost += amount * k;
      });
  });
  return out;
}

/** The best possible staff: every role filled by a 99 with its strongest effects (for balance tests). */
export function eliteStaff(): HiredCoach[] {
  return COACH_ROLES.map((info) => {
    const best = [...info.effects].sort((a, b) => (b.gameDayEdge ?? 0) - (a.gameDayEdge ?? 0)).slice(0, effectSlots(99));
    return { role: info.role, name: info.title, rating: 99, effectIds: best.map((e) => e.id) };
  });
}

/** One coach's game-day edge on its own (before the staff-wide cap). */
export function coachGameDayEdge(coach: HiredCoach): number {
  const info = COACH_ROLES.find((r) => r.role === coach.role);
  if (!info) return 0;
  const edge = info.effects.filter((e) => coach.effectIds.includes(e.id) && e.kind === 'GAME_DAY').reduce((s, e) => s + (e.gameDayEdge ?? 0), 0);
  return Math.min(info.edgeCap, edge * GAME_DAY_PER_LEVEL * Math.min(GAME_DAY_LEVEL_CAP, coachLevel(coach.rating)));
}

/** Candidates for a role: two Coach Point coaches (D to C+), a strong one and an elite one, with effects drawn from the role's list. */
export function generateCandidates(role: CoachRole, randomName: () => string): HiredCoach[] {
  const info = COACH_ROLES.find((r) => r.role === role)!;
  const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  return [roll(93, 99), roll(76, 86), roll(61, 69), roll(50, 60)].map((rating) => {
    const shuffled = [...info.effects].sort(() => Math.random() - 0.5);
    return { role, name: randomName(), rating, effectIds: shuffled.slice(0, effectSlots(rating)).map((e) => e.id) };
  });
}

export type CoachGrade = 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D';

/** Grade bands by rating (the lowest rating each grade starts at). */
const GRADE_BANDS: [number, CoachGrade][] = [
  [96, 'S+'],
  [91, 'S'],
  [86, 'A+'],
  [81, 'A'],
  [76, 'B+'],
  [71, 'B'],
  [66, 'C+'],
  [61, 'C'],
  [56, 'D+'],
  [0, 'D']
];

/** The grade players see for a coach (the rating and multipliers stay behind the scenes). */
export function coachGrade(rating: number): CoachGrade {
  return GRADE_BANDS.find(([min]) => Math.round(rating) >= min)![1];
}

/** The staff's overall grade: its coaches' average rating, with empty roles counting as the lowest grade. */
export function staffGrade(staff: HiredCoach[]): CoachGrade | null {
  if (staff.length === 0) return null;
  const total = COACH_ROLES.reduce((s, r) => s + (staff.find((c) => c.role === r.role)?.rating ?? 50), 0);
  return coachGrade(total / COACH_ROLES.length);
}
