import { Position } from '../types/game';

// ---------------------------------------------------------------------------
// The paid coaching staff. Each assistant has one overall rating (50-99) and a few named effects; an effect does
// nothing at rating 50 and its full amount at 99. Game-day effects are measured in team-rating points (+1 is
// about 62% against an equal team in the engine) and the whole staff's game-day edge is capped at +2.0 with
// diminishing returns past +1.0, so money can help a program but never guarantees a win. Everything else a
// coach does (Coach Points, development, injuries, recruiting) carries no game-day edge.
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

export type EffectKind = 'GAME_DAY' | 'DEVELOPMENT' | 'INJURY' | 'COACH_POINTS' | 'RECRUITING' | 'PROGRAM';

export interface CoachEffect {
  id: string;
  name: string;
  description: string;
  kind: EffectKind;
  gameDayEdge?: number; // GAME_DAY: team-rating points at rating 99 (situational effects already weighted by how often they apply)
  positions?: Position[]; // DEVELOPMENT: the position group that grows faster
  amount?: number; // DEVELOPMENT: +rating per season; INJURY: share fewer injuries; COACH_POINTS: share more CP; RECRUITING: share more interest
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
  description: `${positions.join('/')} players grow +1 rating a season`,
  kind: 'DEVELOPMENT',
  positions,
  amount: 1
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
    title: 'Quarterbacks Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'pocket_presence', name: 'Pocket Presence', description: 'Fewer sacks and interceptions', kind: 'GAME_DAY', gameDayEdge: 0.15 },
      { id: 'two_minute_maestro', name: 'Two-Minute Maestro', description: 'Sharper end-of-half drives', kind: 'GAME_DAY', gameDayEdge: 0.12 },
      { ...dev('qb_whisperer', ['QB']), name: 'QB Whisperer' }
    ]
  },
  {
    role: 'RUNNING_BACKS',
    title: 'Running Backs Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'ball_security', name: 'Ball Security', description: 'Fewer fumbles', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'workhorse', name: 'Workhorse', description: 'A stronger run game in the fourth quarter', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      dev('rb_development', ['RB'])
    ]
  },
  {
    role: 'WIDE_RECEIVERS',
    title: 'Wide Receivers Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'route_technician', name: 'Route Technician', description: 'More completions', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'sure_hands', name: 'Sure Hands', description: 'Fewer drops', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('wr_development', ['WR'])
    ]
  },
  {
    role: 'TIGHT_ENDS',
    title: 'Tight Ends Coach',
    edgeCap: 0.25,
    effects: [{ id: 'seam_threat', name: 'Seam Threat', description: 'A better third-down target', kind: 'GAME_DAY', gameDayEdge: 0.05 }, dev('te_development', ['TE'])]
  },
  {
    role: 'OFFENSIVE_LINE',
    title: 'Offensive Line Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'pass_pro_wall', name: 'Pass Pro Wall', description: 'Fewer sacks', kind: 'GAME_DAY', gameDayEdge: 0.12 },
      { id: 'short_yardage_mauler', name: 'Short-Yardage Mauler', description: 'Converts third and fourth and short', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      dev('ol_development', ['OT', 'OG', 'C'])
    ]
  },
  {
    role: 'DEFENSIVE_LINE',
    title: 'Defensive Line Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'pass_rush_guru', name: 'Pass Rush Guru', description: 'More sacks', kind: 'GAME_DAY', gameDayEdge: 0.12 },
      { id: 'run_stuffer', name: 'Run Stuffer', description: 'Better run defense', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      dev('dl_development', ['DE', 'DT'])
    ]
  },
  {
    role: 'LINEBACKERS',
    title: 'Linebackers Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'run_fits', name: 'Run Fits', description: 'Better run defense', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'coverage_linebacker', name: 'Coverage Linebacker', description: 'Better against short passes', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('lb_development', ['LB'])
    ]
  },
  {
    role: 'CORNERBACKS',
    title: 'Cornerbacks Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'lockdown', name: 'Lockdown', description: 'Fewer deep completions allowed', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'cb_ballhawk', name: 'Ballhawk', description: 'More interceptions', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('cb_development', ['CB'])
    ]
  },
  {
    role: 'SAFETIES',
    title: 'Safeties Coach',
    edgeCap: 0.25,
    effects: [
      { id: 'last_line', name: 'Last Line', description: 'Fewer big plays allowed', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 's_ballhawk', name: 'Ballhawk', description: 'More interceptions', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      dev('s_development', ['S'])
    ]
  },
  {
    role: 'SPECIAL_TEAMS',
    title: 'Special Teams Coordinator',
    edgeCap: 0.2,
    effects: [
      { id: 'special_teams_ace', name: 'Special Teams Ace', description: 'More accurate kicking', kind: 'GAME_DAY', gameDayEdge: 0.1 },
      { id: 'hidden_yardage', name: 'Hidden Yardage', description: 'Better field position on returns', kind: 'GAME_DAY', gameDayEdge: 0.08 },
      { id: 'coffin_corner', name: 'Coffin Corner', description: 'Better punts', kind: 'GAME_DAY', gameDayEdge: 0.05 }
    ]
  },
  {
    role: 'STRENGTH_CONDITIONING',
    title: 'Strength & Conditioning',
    edgeCap: 0.15,
    effects: [
      { id: 'fourth_quarter_legs', name: 'Fourth-Quarter Legs', description: 'Starters tire less late in games', kind: 'GAME_DAY', gameDayEdge: 0.15 },
      { id: 'iron_body', name: 'Iron Body', description: 'Fewer injuries', kind: 'INJURY', amount: 0.2 },
      { id: 'offseason_program', name: 'Off-Season Program', description: 'Every player grows +1 more in the off season', kind: 'DEVELOPMENT', amount: 1 }
    ]
  },
  {
    role: 'FOOTBALL_OPERATIONS',
    title: 'Director of Football Operations',
    edgeCap: 0,
    effects: [
      { id: 'front_office_hustle', name: 'Front Office Hustle', description: 'More weekly Coach Points', kind: 'COACH_POINTS', amount: 0.3 },
      { id: 'booster_liaison', name: 'Booster Liaison', description: 'Booster approval drifts up', kind: 'PROGRAM' },
      { id: 'compliance_officer', name: 'Compliance Officer', description: 'Compliance recovers faster', kind: 'PROGRAM' }
    ]
  },
  {
    role: 'JV_HEAD_COACH',
    title: 'JV Head Coach',
    edgeCap: 0,
    effects: [
      { id: 'feeder_pipeline', name: 'Feeder Pipeline', description: 'More interest from feeder programs', kind: 'RECRUITING', amount: 0.1 },
      { id: 'youth_development', name: 'Youth Development', description: 'Freshmen grow +1 a season', kind: 'DEVELOPMENT', amount: 1 }
    ]
  },
  {
    role: 'JV_OFFENSIVE_COORDINATOR',
    title: 'JV Offensive Coordinator',
    edgeCap: 0,
    effects: [{ id: 'young_offense', name: 'Young Offense', description: 'Freshman and sophomore offense grows +1 a season', kind: 'DEVELOPMENT', amount: 1 }]
  },
  {
    role: 'JV_DEFENSIVE_COORDINATOR',
    title: 'JV Defensive Coordinator',
    edgeCap: 0,
    effects: [{ id: 'young_defense', name: 'Young Defense', description: 'Freshman and sophomore defense grows +1 a season', kind: 'DEVELOPMENT', amount: 1 }]
  }
];

/** A hired assistant: one overall rating and the effects they bring. */
export interface HiredCoach {
  role: CoachRole;
  name: string;
  rating: number; // 50-99
  effectIds: string[];
}

/** How much of an effect a coach delivers: nothing at 50, all of it at 99. */
export const effectStrength = (rating: number) => Math.max(0, Math.min(1, (rating - 50) / 49));

/** Effects a coach of this rating comes with: 1 (50-69), 2 (70-94), 3 (95-99). */
export const effectSlots = (rating: number) => (rating >= 95 ? 3 : rating >= 70 ? 2 : 1);

/** Most extra growth a season the staff can give one player: about +2 over a four-year roster cycle, matching the game-day cap. */
export const STAFF_DEVELOPMENT_CAP = 0.5;

/** Coach Points every hired assistant adds each week, whatever their effects. */
export const COACH_WEEKLY_CP = 5;

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
  developmentByPosition: Partial<Record<Position, number>>;
  allPlayersDevelopment: number;
  freshmanDevelopment: number;
  injuryReduction: number;
  coachPointMultiplier: number;
  weeklyCoachPoints: number;
  feederInterest: number;
} {
  const out = { developmentByPosition: {} as Partial<Record<Position, number>>, allPlayersDevelopment: 0, freshmanDevelopment: 0, injuryReduction: 0, coachPointMultiplier: 1, weeklyCoachPoints: 0, feederInterest: 0 };
  staff.forEach((coach) => {
    const info = COACH_ROLES.find((r) => r.role === coach.role);
    if (!info) return;
    const k = effectStrength(coach.rating);
    out.weeklyCoachPoints += COACH_WEEKLY_CP;
    info.effects
      .filter((e) => coach.effectIds.includes(e.id))
      .forEach((e) => {
        if (e.kind === 'DEVELOPMENT' && e.positions) e.positions.forEach((p) => (out.developmentByPosition[p] = (out.developmentByPosition[p] ?? 0) + (e.amount ?? 0) * k));
        else if (e.kind === 'DEVELOPMENT' && e.id === 'offseason_program') out.allPlayersDevelopment += (e.amount ?? 0) * k;
        else if (e.kind === 'DEVELOPMENT') out.freshmanDevelopment += (e.amount ?? 0) * k;
        else if (e.kind === 'INJURY') out.injuryReduction += (e.amount ?? 0) * k;
        else if (e.kind === 'COACH_POINTS') out.coachPointMultiplier += (e.amount ?? 0) * k;
        else if (e.kind === 'RECRUITING') out.feederInterest += (e.amount ?? 0) * k;
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

/** A coach's tier by rating (the price tier once purchases exist). */
export function coachTier(rating: number): 'Bronze' | 'Silver' | 'Gold' | 'Elite' {
  return rating >= 95 ? 'Elite' : rating >= 85 ? 'Gold' : rating >= 70 ? 'Silver' : 'Bronze';
}

/** One coach's game-day edge on its own (before the staff-wide cap). */
export function coachGameDayEdge(coach: HiredCoach): number {
  const info = COACH_ROLES.find((r) => r.role === coach.role);
  if (!info) return 0;
  const edge = info.effects.filter((e) => coach.effectIds.includes(e.id) && e.kind === 'GAME_DAY').reduce((s, e) => s + (e.gameDayEdge ?? 0), 0);
  return Math.min(info.edgeCap, edge * effectStrength(coach.rating));
}

/** Candidates for a role: a good, a strong and an elite coach, each with effects drawn from the role's list. */
export function generateCandidates(role: CoachRole, randomName: () => string): HiredCoach[] {
  const info = COACH_ROLES.find((r) => r.role === role)!;
  const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
  return [roll(60, 69), roll(76, 86), roll(93, 99)].map((rating) => {
    const shuffled = [...info.effects].sort(() => Math.random() - 0.5);
    return { role, name: randomName(), rating, effectIds: shuffled.slice(0, effectSlots(rating)).map((e) => e.id) };
  });
}
