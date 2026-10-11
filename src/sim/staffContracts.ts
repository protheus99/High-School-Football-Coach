import { CoachGrade, coachGrade, HiredCoach } from './coachingStaff';
import { formatCP } from './coachPoints';
import { FIRST_NON_DISTRICT_WEEK, getSeasonPhase, STATE_FINAL_WEEK } from './scheduleEngine';

// ---------------------------------------------------------------------------
// Assistant coach contracts. A coach is hired for 1, 2 or 3 seasons and paid a year at a time: the first season
// when he's hired, each later one in the off-season. Coaches graded C+ and below cost Coach Points; B and above
// cost ducats (₾, bought with real money), which aren't on sale yet, so those coaches can't be hired. Hiring and
// releasing are only open in the off-season and pre-season (through training camp); the staff locks at the
// season opener. In the off-season every coach needs next season paid: coaches still under contract are paid
// automatically when there's enough, and expiring contracts are renewed or let go. Anyone not paid for by the
// end of the off-season leaves.
// ---------------------------------------------------------------------------

export type StaffCurrency = 'CP' | 'DUCATS';

export interface CoachPrice {
  currency: StaffCurrency;
  amount: number; // per season
}

/** Ducats can't be bought yet: ducat-priced coaches can't be hired, and those already on a staff renew for free. */
export const DUCATS_LIVE = false;

export const DUCAT_SIGN = '₾';
export const formatDucats = (amount: number) => `${DUCAT_SIGN}${amount.toLocaleString('en-US')}`;

/** Price per season by grade: ₾1 is one cent. */
export const COACH_PRICES: Record<CoachGrade, CoachPrice> = {
  'S+': { currency: 'DUCATS', amount: 20 },
  S: { currency: 'DUCATS', amount: 15 },
  'A+': { currency: 'DUCATS', amount: 10 },
  A: { currency: 'DUCATS', amount: 5 },
  'B+': { currency: 'DUCATS', amount: 2 },
  B: { currency: 'DUCATS', amount: 1 },
  'C+': { currency: 'CP', amount: 200 },
  C: { currency: 'CP', amount: 150 },
  'D+': { currency: 'CP', amount: 100 },
  D: { currency: 'CP', amount: 50 }
};

export const coachPrice = (rating: number): CoachPrice => COACH_PRICES[coachGrade(rating)];
export const formatPrice = (p: CoachPrice) => (p.currency === 'CP' ? formatCP(p.amount) : formatDucats(p.amount));

/** What a season actually costs right now: ducat coaches are free to keep until ducats go on sale. */
export const amountDue = (p: CoachPrice) => (p.currency === 'DUCATS' && !DUCATS_LIVE ? 0 : p.amount);

export const CONTRACT_YEARS = [1, 2, 3] as const;
export type ContractYears = (typeof CONTRACT_YEARS)[number];

/** The staff locks when the season opens and reopens with the off-season. */
export const STAFF_LOCK_WEEK = FIRST_NON_DISTRICT_WEEK;
export const FIRST_OFF_SEASON_WEEK = STATE_FINAL_WEEK + 2;

export const staffWindowOpen = (week: number) => week < STAFF_LOCK_WEEK || getSeasonPhase(week) === 'OFF_SEASON';

/** The first season a coach hired now works: next season when hired in the off-season. */
export const firstContractSeason = (week: number, year: number) => (getSeasonPhase(week) === 'OFF_SEASON' ? year + 1 : year);

/** A hired coach's contract: the seasons it covers, the first one paid. */
export function contractTerms(week: number, year: number, years: ContractYears): Pick<HiredCoach, 'contractEndSeason' | 'paidThroughSeason'> {
  const first = firstContractSeason(week, year);
  return { contractEndSeason: first + years - 1, paidThroughSeason: first };
}

/** Coaches from before contracts: their deal runs through this season. */
export function withContract(coach: HiredCoach, year: number): HiredCoach {
  return coach.contractEndSeason !== undefined ? coach : { ...coach, contractEndSeason: year, paidThroughSeason: year };
}

/** In the off-season: does next season still need paying for this coach? */
export const needsSettling = (coach: HiredCoach, week: number, year: number) => getSeasonPhase(week) === 'OFF_SEASON' && (coach.paidThroughSeason ?? year) <= year;

/** Still under contract next season (just needs paying), or the contract is up (renew or let go). */
export const settleKind = (coach: HiredCoach, year: number): 'PAYMENT' | 'RENEWAL' => ((coach.contractEndSeason ?? year) > year ? 'PAYMENT' : 'RENEWAL');

/** Next season paid for (a renewal adds one season at the same price). */
export function settled(coach: HiredCoach, year: number): HiredCoach {
  return { ...coach, paidThroughSeason: year + 1, contractEndSeason: Math.max(coach.contractEndSeason ?? year, year + 1) };
}
