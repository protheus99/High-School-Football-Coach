import { CollegeOffer, CollegeTier, Player, Position, Team } from '../types/game';
import { COLLEGES, COLLEGES_BY_ID, COLLEGES_BY_NAME, College } from '../data/colleges';
import { clamp, randomInt } from './math/variance';
import { recruitShare } from './stateRules';

// ---------------------------------------------------------------------------
// College recruiting (design spec 15): every junior and senior in the state is
// evaluated weekly by fictional college programs. Offers depend on the player's
// evaluation (rating, potential, production), position value, college needs,
// exposure and, softly, academics. Players commit, sometimes flip, and sign on
// signing day (the banquet). Separate from feeder recruiting.
// ---------------------------------------------------------------------------

/** Recruiting lanes in descending order; national Power 4 brands only chase elite players. */
type Lane = 'P4_NATIONAL' | 'POWER_4' | 'GROUP_OF_5' | 'FCS' | 'DIVISION_2' | 'DIVISION_3';

const LANES: { lane: Lane; floor: number; base: number }[] = [
  { lane: 'P4_NATIONAL', floor: 89, base: 0.13 },
  { lane: 'POWER_4', floor: 81, base: 0.14 },
  { lane: 'GROUP_OF_5', floor: 73, base: 0.12 },
  { lane: 'FCS', floor: 66, base: 0.09 },
  { lane: 'DIVISION_2', floor: 61, base: 0.07 },
  { lane: 'DIVISION_3', floor: 55, base: 0.05 }
];

const LANE_TIER: Record<Lane, Exclude<CollegeTier, 'PWO'>> = {
  P4_NATIONAL: 'POWER_4',
  POWER_4: 'POWER_4',
  GROUP_OF_5: 'GROUP_OF_5',
  FCS: 'FCS',
  DIVISION_2: 'DIVISION_2',
  DIVISION_3: 'DIVISION_3'
};

export const TIER_LABELS: Record<CollegeTier, string> = {
  POWER_4: 'Power 4',
  GROUP_OF_5: 'Group of 5',
  FCS: 'FCS',
  DIVISION_2: 'Division II',
  DIVISION_3: 'Division III',
  PWO: 'Preferred Walk-On'
};

const TIER_RANK: Record<CollegeTier, number> = {
  POWER_4: 6,
  GROUP_OF_5: 5,
  PWO: 3.5,
  FCS: 4,
  DIVISION_2: 3,
  DIVISION_3: 2
};

export const isDivisionOne = (tier?: CollegeTier) => tier === 'POWER_4' || tier === 'GROUP_OF_5';

const MAX_OFFERS = 16;
const MIN_OFFER_WEEK = 2;
const LANES_CONSIDERED = 2; // a player hears from the top two levels he can reach
const JUNIOR_OFFER_FACTOR = 0.35;
const JUNIOR_OFFER_MIN_STARS = 3; // juniors hear from colleges only as 3-star prospects and up
const JUNIOR_COMMIT_MIN_STARS = 4; // only 4-star juniors and up commit early
const FLIP_MARGIN = 10;
const FLIP_CHANCE = 0.4;
export const CAMP_WEEKS = 7; // the summer camp circuit runs through pre season and training camp

export const COLLEGE_ACTION_COSTS = { FILM: 5, CALL: 10, CAMP: 20 };

/** Texas scholarships each college hands out per class; a full class stops offering. */
const CLASS_LIMITS: Record<Exclude<CollegeTier, 'PWO'>, number> = { POWER_4: 10, GROUP_OF_5: 14, FCS: 18, DIVISION_2: 24, DIVISION_3: 40 };
const NATIONAL_CLASS_LIMIT = 8;

export const classLimit = (college: College) => (college.national ? NATIONAL_CLASS_LIMIT : CLASS_LIMITS[college.tier]);

/** Senior commitments (and signings) per college for the current class. */
export function classCounts(teams: Team[]): Map<string, number> {
  const counts = new Map<string, number>();
  teams.forEach((t) =>
    t.roster.forEach((p) => {
      if (p.classYear !== 'Senior' || !p.recruiting.committedCollege) return;
      const college = COLLEGES_BY_NAME.get(p.recruiting.committedCollege);
      if (college) counts.set(college.id, (counts.get(college.id) ?? 0) + 1);
    })
  );
  return counts;
}

const isFull = (college: College | undefined, counts?: Map<string, number>) =>
  !!college && !!counts && (counts.get(college.id) ?? 0) >= classLimit(college);

/** How much colleges at each level value a position (no Power 4 scholarships for punters). */
export function positionValue(position: Position, tier: CollegeTier): number {
  if (position === 'K' || position === 'P') {
    if (tier === 'POWER_4') return 0;
    if (tier === 'GROUP_OF_5') return 0.3;
    return 0.8;
  }
  if (position === 'QB') return 1.2;
  if (position === 'OT' || position === 'DE' || position === 'CB' || position === 'WR') return 1.1;
  if (position === 'OG' || position === 'C' || position === 'TE' || position === 'DT') return 0.9;
  return 1;
}

const POTENTIAL_BONUS: Record<Player['potential'], number> = {
  'A+': 4,
  A: 3,
  B: 1.5,
  C: 0,
  D: -1
};

/** On-field production this season, 0-6. Needs a few games before colleges trust it. */
export function productionScore(player: Player): number {
  const s = player.stats;
  const g = s.gamesPlayed;
  if (g < 3) return 0;
  let raw: number;
  switch (player.position) {
    case 'QB':
      raw = s.passYards / g / 45 + ((s.passTDs - s.interceptionsThrown) / g) * 1.2 + s.rushYards / g / 40;
      break;
    case 'RB':
      raw = s.rushYards / g / 25 + ((s.rushTDs + s.receivingTDs) / g) * 1.5;
      break;
    case 'WR':
    case 'TE':
      raw = s.receivingYards / g / 18 + (s.receivingTDs / g) * 2;
      break;
    case 'K':
    case 'P':
      raw = s.fieldGoalsAttempted > 0 ? (s.fieldGoalsMade / s.fieldGoalsAttempted) * 3 : 0;
      break;
    case 'OT':
    case 'OG':
    case 'C':
      return 0; // linemen are judged on film, not the box score
    default:
      raw = s.tackles / g / 2.5 + (s.tacklesForLoss / g) * 1.5 + (s.sacks / g) * 3 + (s.interceptionsCaught / g) * 4;
  }
  return clamp(raw, 0, 6);
}

/**
 * The college evaluation of a player (roughly on the overall-rating scale): rating, then potential
 * (worth more for juniors), production (once the season is underway) and any summer camp bump.
 */
export function recruitScore(player: Player, withProduction = true): number {
  const potential = POTENTIAL_BONUS[player.potential] * (player.classYear === 'Senior' ? 1 : 1.5);
  return player.overallRating + potential + (withProduction ? productionScore(player) : 0) + (player.recruiting.campBoost ?? 0) + (player.recruiting.exposure ?? 0);
}

/** Spec 15.1 star bands: 5 (90+), 4 (82-89), 3 (74-81), 2 (66-73), 1 (58-65), 0 below. */
export function starsFromScore(score: number): Player['recruiting']['starRating'] {
  if (score >= 90) return 5;
  if (score >= 82) return 4;
  if (score >= 74) return 3;
  if (score >= 66) return 2;
  if (score >= 58) return 1;
  return 0;
}

const SPECIALIST_MAX_STARS = 3; // recruiting services rarely rate kickers and punters higher

/** Each class nationally: about 35 five-stars, 365 four-stars and 1,300 three-stars (everyone else is two stars or unrated). */
export const NATIONAL_STAR_COUNTS = { 5: 35, 4: 365, 3: 1300 } as const;
/** The share of a state's rated recruits that play in its top class (the class the game simulates). */
const TOP_CLASS_COVERAGE = 0.7;
/** The lowest evaluation for each tier, so a thin class doesn't produce a paper five-star. */
const STAR_FLOORS = { 5: 86, 4: 80, 3: 72 } as const;

/** How many five-, four- and three-stars one class in a state's top class gets. */
export function stateStarQuota(state: string | undefined, stars: 3 | 4 | 5): number {
  return Math.round(NATIONAL_STAR_COUNTS[stars] * recruitShare(state) * TOP_CLASS_COVERAGE);
}

/**
 * Star ratings the way recruiting services hand them out: by rank. Within each state and class, the best
 * evaluations take the state's five-star spots, then its four- and three-star spots (each tier has a minimum
 * evaluation); everyone else is two stars, one star or unrated by the spec bands. Kickers and punters top
 * out at three stars.
 */
export function updateStarRatings(teams: Team[], withProduction: boolean): void {
  const classes = new Map<string, { player: Player; score: number }[]>();
  teams.forEach((t) =>
    t.roster.forEach((player) => {
      const key = `${t.state ?? 'Texas'}|${player.classYear}`;
      if (!classes.has(key)) classes.set(key, []);
      classes.get(key)!.push({ player, score: recruitScore(player, withProduction) });
    })
  );
  classes.forEach((players, key) => {
    const state = key.split('|')[0];
    const left = { 5: stateStarQuota(state, 5), 4: stateStarQuota(state, 4), 3: stateStarQuota(state, 3) };
    players
      .sort((a, b) => b.score - a.score)
      .forEach(({ player, score }) => {
        const specialist = player.position === 'K' || player.position === 'P';
        const tier = ([5, 4, 3] as const).find((stars) => left[stars] > 0 && score >= STAR_FLOORS[stars] && !(specialist && stars > SPECIALIST_MAX_STARS));
        if (tier) left[tier]--;
        player.recruiting.starRating = tier ?? (Math.min(starsFromScore(score), 2) as Player['recruiting']['starRating']);
      });
  });
}

/** Exposure college coaches have to a player before the head coach does anything. */
export function baselineVisibility(team: Team): number {
  return clamp(20 + (team.prestige - 70) * 0.8, 5, 50);
}

const visibilityOf = (player: Player, team: Team) => player.recruiting.visibility ?? baselineVisibility(team);
const visibilityFactor = (visibility: number) => 0.6 + visibility / 125; // 0.6 - 1.4

/** Positions a college needs this cycle (stable for a college within a year). */
export function collegeNeeds(college: College, year: number): Position[] {
  const all: Position[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'LB', 'CB', 'S'];
  let h = year * 31;
  for (let i = 0; i < college.id.length; i++) h = (h * 33 + college.id.charCodeAt(i)) % 1000003;
  const needs: Position[] = [];
  for (let i = 0; needs.length < 4; i++) {
    const pos = all[(h + i * 7919) % all.length];
    if (!needs.includes(pos)) needs.push(pos);
    h = (h * 17 + 13) % 1000003;
  }
  return needs;
}

/** Soft academic effect: selective colleges cool on low-GPA players but never refuse outright. */
export function academicFit(college: College, gpa: number): number {
  if (college.academics < 70) return 1;
  if (gpa < 2.5) return 0.3;
  if (gpa < 3.0) return 0.65;
  return college.academics >= 80 && gpa >= 3.5 ? 1.2 : 1;
}

function weightedPick<T>(items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const i of items) {
    roll -= i.weight;
    if (roll <= 0) return i.item;
  }
  return items[items.length - 1].item;
}

const collegeOf = (offer: { collegeId?: string; collegeName: string }) =>
  (offer.collegeId && COLLEGES_BY_ID.get(offer.collegeId)) || COLLEGES_BY_NAME.get(offer.collegeName);

/** The top levels a player can reach (skipping levels that don't recruit his position). */
function lanesFor(score: number, position: Position): typeof LANES {
  return LANES.filter((l) => score >= l.floor && positionValue(position, LANE_TIER[l.lane]) > 0).slice(0, LANES_CONSIDERED);
}

/**
 * The evaluation colleges act on, kept within the player's star tier: five-stars are national Power 4
 * targets, four- and three-stars are Power 4 targets (most Power 4 signees nationally are three-stars), and
 * two-stars top out at Group of 5.
 */
export function offerScore(player: Player): number {
  const score = recruitScore(player);
  const stars = player.recruiting.starRating;
  if (stars === 5) return Math.max(score, 89);
  if (stars === 4) return Math.max(score, 83);
  if (stars === 3) return clamp(score, 81, 88);
  return Math.min(score, 80);
}

/** Rolls the colleges that might offer this week (skipping full classes); returns any new offer. */
export function rollOffer(player: Player, team: Team, week: number, year: number, boost = 1, counts?: Map<string, number>): CollegeOffer | null {
  const r = player.recruiting;
  if (r.isNationalLetterOfIntentSigned || r.offers.length >= MAX_OFFERS) return null;
  if (player.classYear !== 'Senior' && player.classYear !== 'Junior') return null;
  const score = offerScore(player);
  if (player.classYear === 'Junior' && r.starRating < JUNIOR_OFFER_MIN_STARS) return null;
  const visibility = visibilityFactor(visibilityOf(player, team));
  const classFactor = player.classYear === 'Senior' ? 1 : JUNIOR_OFFER_FACTOR;
  const offered = new Set(r.offers.map((o) => collegeOf(o)?.id ?? o.collegeName));

  for (const { lane, floor, base } of lanesFor(score, player.position)) {
    const tier = LANE_TIER[lane];
    const chance = Math.min(0.6, base * (1 + (score - floor) / 5)) * visibility * classFactor * positionValue(player.position, tier) * boost;
    if (Math.random() >= chance) continue;
    const college = weightedPick(
      COLLEGES.filter(
        (col) =>
          col.tier === tier && (lane === 'P4_NATIONAL' ? col.national : !col.national || score >= 89) && !offered.has(col.id) && !isFull(col, counts)
      ).map((col) => ({
        item: col,
        weight: (collegeNeeds(col, year).includes(player.position) ? 1.6 : 1) * academicFit(col, player.academics.gpa)
      }))
    );
    if (!college) continue;
    const offer: CollegeOffer = {
      collegeName: college.name,
      collegeId: college.id,
      tier,
      offerDateWeek: week,
      offerYear: year
    };
    r.offers.push(offer);
    return offer;
  }

  // Late in the year, Division I programs invite overlooked seniors to walk on
  if (
    player.classYear === 'Senior' &&
    week >= 15 &&
    score >= 66 &&
    score < 81 &&
    !r.offers.some((o) => isDivisionOne(o.tier)) &&
    Math.random() < 0.04 * visibility * boost
  ) {
    const college = weightedPick(
      COLLEGES.filter((col) => isDivisionOne(col.tier) && !offered.has(col.id) && !isFull(col, counts)).map((col) => ({ item: col, weight: 1 }))
    );
    if (college) {
      const offer: CollegeOffer = {
        collegeName: college.name,
        collegeId: college.id,
        tier: 'PWO',
        offerDateWeek: week,
        offerYear: year
      };
      r.offers.push(offer);
      return offer;
    }
  }
  return null;
}

/** A player's personal taste for a school (staff relationships, campus, family ties): stable, -8 to +8. */
export function personalFit(playerId: string, collegeId: string): number {
  let h = 7;
  const key = `${playerId}|${collegeId}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000003;
  return (h % 17) - 8;
}

/** How much a player values an offer: level, program prestige, staying in Texas, a clear need, personal fit. */
export function offerValue(player: Player, offer: CollegeOffer, year?: number): number {
  const college = collegeOf(offer);
  const tierBase = TIER_RANK[offer.tier] * 10;
  if (!college) return tierBase;
  const scholarship = offer.tier === 'PWO' ? -25 : 0;
  const need = year !== undefined && collegeNeeds(college, year).includes(player.position) ? 3 : 0;
  return tierBase + college.prestige * 0.5 + (college.inState ? 4 : 0) + need + scholarship + personalFit(player.id, college.id);
}

export function bestOffer(player: Player, year?: number): CollegeOffer | undefined {
  return [...player.recruiting.offers].sort((a, b) => offerValue(player, b, year) - offerValue(player, a, year))[0];
}

export function committedOffer(player: Player): CollegeOffer | undefined {
  const r = player.recruiting;
  if (!r.committedCollege) return undefined;
  return r.offers.find((o) => o.collegeName === r.committedCollege);
}

/** The level an offer represents, for sorting and display. */
export const tierRank = (tier: CollegeTier) => TIER_RANK[tier];

export interface RecruitingEvent {
  type: 'COMMIT' | 'DECOMMIT' | 'OFFER';
  player: Player;
  team: Team;
  collegeName: string;
  tier: CollegeTier;
  previousCollege?: string;
}

function commitTo(player: Player, offer: CollegeOffer, week: number): void {
  const r = player.recruiting;
  r.committedCollege = offer.collegeName;
  r.committedCollegeId = offer.collegeId;
  r.committedWeek = week;
}

function commitChance(player: Player, week: number): number {
  const r = player.recruiting;
  if (r.offers.length === 0) return 0;
  const score = offerScore(player);
  if (player.classYear === 'Junior') {
    return r.starRating >= JUNIOR_COMMIT_MIN_STARS && r.offers.some((o) => o.tier === 'POWER_4') ? 0.03 : 0;
  }
  let chance = 0.03 + 0.012 * r.offers.length + (week >= 13 ? 0.05 : 0) + (week >= 18 ? 0.08 : 0);
  // Players who expect a higher level wait for it
  const top = lanesFor(score, player.position)[0];
  const best = bestOffer(player);
  if (top && best && TIER_RANK[best.tier] < TIER_RANK[LANE_TIER[top.lane]]) chance *= 0.5;
  return chance;
}

/**
 * Weekly college recruiting across the state: offers, commitments and flips. Every team follows the same
 * rules; the user's coach actions work through the exposure and camp bumps stored on each player.
 */
export function advanceCollegeRecruiting(teams: Team[], week: number, year: number): RecruitingEvent[] {
  if (week < MIN_OFFER_WEEK) return [];
  const events: RecruitingEvent[] = [];
  const counts = classCounts(teams);
  const track = (player: Player, from: CollegeOffer | undefined, to: CollegeOffer) => {
    if (player.classYear !== 'Senior') return;
    const fromCol = from && collegeOf(from);
    const toCol = collegeOf(to);
    if (fromCol) counts.set(fromCol.id, (counts.get(fromCol.id) ?? 1) - 1);
    if (toCol) counts.set(toCol.id, (counts.get(toCol.id) ?? 0) + 1);
  };
  teams.forEach((team) =>
    team.roster.forEach((player) => {
      if (player.classYear !== 'Senior' && player.classYear !== 'Junior') return;
      const r = player.recruiting;
      if (r.isNationalLetterOfIntentSigned) return;
      const offer = rollOffer(player, team, week, year, 1, counts);
      if (offer)
        events.push({
          type: 'OFFER',
          player,
          team,
          collegeName: offer.collegeName,
          tier: offer.tier
        });

      const current = committedOffer(player);
      if (current) {
        // A clearly better new offer can flip a commitment
        if (offer && offerValue(player, offer, year) - offerValue(player, current, year) >= FLIP_MARGIN) {
          const chance = FLIP_CHANCE * ((r.decommitCount ?? 0) > 0 ? 0.5 : 1);
          if (Math.random() < chance) {
            r.decommitCount = (r.decommitCount ?? 0) + 1;
            track(player, current, offer);
            commitTo(player, offer, week);
            events.push({
              type: 'DECOMMIT',
              player,
              team,
              collegeName: offer.collegeName,
              tier: offer.tier,
              previousCollege: current.collegeName
            });
          }
        }
        return;
      }
      // Schools whose class has filled pull their offers off the table
      const open = r.offers.filter((o) => !isFull(collegeOf(o), counts));
      if (open.length > 0 && Math.random() < commitChance(player, week)) {
        const choice = open.sort((a, b) => offerValue(player, b, year) + randomInt(-4, 4) - (offerValue(player, a, year) + randomInt(-4, 4)))[0];
        track(player, undefined, choice);
        commitTo(player, choice, week);
        events.push({
          type: 'COMMIT',
          player,
          team,
          collegeName: choice.collegeName,
          tier: choice.tier
        });
      }
    })
  );
  return events;
}

export interface Signing {
  player: Player;
  team: Team;
  offer: CollegeOffer;
}

/** Alumni prestige points per signee (spec 15.2): Power 4 +3..5, Group of 5 +2..3. */
export function signeePrestigePoints(tier: CollegeTier): number {
  if (tier === 'POWER_4') return randomInt(3, 5);
  if (tier === 'GROUP_OF_5') return randomInt(2, 3);
  return 0;
}

/**
 * Converts this year's alumni points into a program prestige change. Points are compared with what
 * programs of the same reputation produced this year (a line fitted across the state), so out-producing
 * your reputation raises it and a dry spell lets it slide; changes are capped so one class never swings a
 * program wildly, and the league as a whole doesn't drift.
 */
export function alumniPrestigeChanges(results: { prestige: number; points: number }[]): number[] {
  const n = results.length;
  const meanX = results.reduce((s, r) => s + r.prestige, 0) / n;
  const meanY = results.reduce((s, r) => s + r.points, 0) / n;
  const sxx = results.reduce((s, r) => s + (r.prestige - meanX) ** 2, 0);
  const slope = sxx > 0 ? results.reduce((s, r) => s + (r.prestige - meanX) * (r.points - meanY), 0) / sxx : 0;
  return results.map((r) => clamp(Math.round((r.points - (meanY + slope * (r.prestige - meanX))) * 0.3), -3, 3) || 0);
}

/**
 * Signing day at the banquet: every senior with an offer signs, with the school he committed to or his
 * best available offer. Signing is final. Each program earns alumni prestige from its Division I signees.
 */
export function runSigningDay(teams: Team[], year: number): { signings: Signing[]; prestigeChanges: Map<string, number> } {
  const signings: Signing[] = [];
  const prestigeChanges = new Map<string, number>();
  const counts = classCounts(teams);
  const points = teams.map((team) => {
    let total = 0;
    team.roster.forEach((player) => {
      if (player.classYear !== 'Senior' || player.recruiting.offers.length === 0) return;
      const r = player.recruiting;
      // Uncommitted seniors take the best offer from a school with room; if every school that offered him
      // has filled its class, he still signs with his best offer (classes can run over on signing day)
      let offer = committedOffer(player);
      if (!offer) {
        const offers = sortedOffers(player, year);
        offer = offers.find((o) => !isFull(collegeOf(o), counts)) ?? offers[0];
        const col = collegeOf(offer);
        if (col) counts.set(col.id, (counts.get(col.id) ?? 0) + 1);
      }
      if (!r.isNationalLetterOfIntentSigned) {
        commitTo(player, offer, r.committedWeek ?? 0);
        r.isNationalLetterOfIntentSigned = true;
        r.signedTier = offer.tier;
      }
      signings.push({ player, team, offer });
      total += signeePrestigePoints(offer.tier);
    });
    return { prestige: team.prestige, points: total };
  });
  alumniPrestigeChanges(points).forEach((change, i) => {
    const team = teams[i];
    team.prestige = clamp(team.prestige + change, 40, 99);
    prestigeChanges.set(team.id, change);
  });
  return { signings, prestigeChanges };
}

/** New season: underclassmen keep their offers; season-only coach actions reset. */
export function resetSeasonRecruiting(teams: Team[]): void {
  teams.forEach((t) =>
    t.roster.forEach((p) => {
      p.recruiting.coachCalls = 0;
      p.recruiting.visibility = undefined;
    })
  );
}

// ---------------------------------------------------------------------------
// Head coach actions (user team only; paid with Coach Points)
// ---------------------------------------------------------------------------

export type CollegeAction = 'FILM' | 'CALL' | 'CAMP';

export interface CollegeActionResult {
  ok: boolean;
  message: string;
  offer?: CollegeOffer;
}

/** Whether an action is available for this player now (ignores CP). */
export function collegeActionBlocker(player: Player, action: CollegeAction, week: number, year: number): string | null {
  const r = player.recruiting;
  if (player.classYear !== 'Senior' && player.classYear !== 'Junior') return 'Only juniors and seniors are recruited';
  if (r.isNationalLetterOfIntentSigned) return 'Already signed';
  if (action === 'FILM' && r.filmSentYear === year) return 'Film already sent this year';
  if (action === 'CAMP') {
    if (week > CAMP_WEEKS) return `Camps run weeks 1-${CAMP_WEEKS}`;
    if (r.campYear === year) return 'Already attended a camp this year';
  }
  return null;
}

/**
 * Highlight film (+15 exposure, once a year), calls to college coaches (+10 exposure with diminishing
 * returns and an immediate look), or a summer camp (+20 exposure, a chance to impress evaluators and
 * an immediate look). Returns any offer that comes out of it.
 */
export function performCollegeAction(
  player: Player,
  team: Team,
  action: CollegeAction,
  week: number,
  year: number,
  counts?: Map<string, number>
): CollegeActionResult {
  const blocker = collegeActionBlocker(player, action, week, year);
  if (blocker) return { ok: false, message: blocker };
  const r = player.recruiting;
  const visibility = visibilityOf(player, team);
  const name = `${player.firstName} ${player.lastName}`;
  if (action === 'FILM') {
    r.filmSentYear = year;
    r.visibility = clamp(visibility + 15, 0, 100);
    return {
      ok: true,
      message: `Highlight film for ${name} sent to college staffs.`
    };
  }
  if (action === 'CALL') {
    const calls = r.coachCalls ?? 0;
    r.coachCalls = calls + 1;
    r.visibility = clamp(visibility + Math.round(10 * Math.pow(0.6, calls)), 0, 100);
    const offer = rollOffer(player, team, week, year, 1.5 * Math.pow(0.7, calls), counts);
    return {
      ok: true,
      offer: offer ?? undefined,
      message: offer ? `${offer.collegeName} offered ${name} after your call!` : `College coaches will keep an eye on ${name}.`
    };
  }
  r.campYear = year;
  r.visibility = clamp(visibility + 20, 0, 100);
  // Camp performance: most players hold steady, some impress, a few disappoint
  r.campBoost = clamp((r.campBoost ?? 0) + randomInt(-1, 3), -2, 4);
  const offer = rollOffer(player, team, week, year, 2, counts);
  const impression = r.campBoost >= 2 ? 'impressed evaluators' : r.campBoost <= 0 ? 'had an uneven camp' : 'held his own';
  return {
    ok: true,
    offer: offer ?? undefined,
    message: `${name} ${impression} at camp.${offer ? ` ${offer.collegeName} offered on the spot!` : ''}`
  };
}

/** A short recruiting status for display. */
export function recruitingStatus(player: Player): {
  label: string;
  color: string;
} {
  const r = player.recruiting;
  if (r.isNationalLetterOfIntentSigned && r.committedCollege) return { label: `Signed: ${r.committedCollege}`, color: '#15803D' };
  if (r.committedCollege) return { label: `Committed: ${r.committedCollege}`, color: '#2563EB' };
  if (r.offers.length > 0)
    return {
      label: `Uncommitted (${r.offers.length} offer${r.offers.length === 1 ? '' : 's'})`,
      color: '#B45309'
    };
  return { label: 'No offers', color: '#64748B' };
}

/** Offers ordered from most to least attractive to the player. */
export function sortedOffers(player: Player, year?: number): CollegeOffer[] {
  return [...player.recruiting.offers].sort((a, b) => offerValue(player, b, year) - offerValue(player, a, year));
}
