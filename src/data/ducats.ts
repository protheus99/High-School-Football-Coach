import type { CoachGrade } from '../sim/coachingStaff';

// ---------------------------------------------------------------------------
// Ducats (₾): the game's paid currency, bought with real money (US cards, through Stripe) and kept on the player's
// account by the sign-in server (auth-worker/), never in a save. This file is the one price list: the game shows it
// and the server charges by it, so the two can't disagree.
// ---------------------------------------------------------------------------

export const DUCAT_SIGN = '₾';
export const formatDucats = (amount: number) => `${DUCAT_SIGN}${amount.toLocaleString('en-US')}`;

export type DucatPackId = 'P3' | 'P5' | 'P10' | 'P20';

export interface DucatPack {
  id: DucatPackId;
  cents: number; // the price in US cents
  ducats: number; // what the player gets, bonus included
  bonus: number; // the part of it that's bonus (bigger packs get more)
}

/** The packs on sale: ₾100 a dollar, plus a bonus that grows with the pack. */
export const DUCAT_PACKS: DucatPack[] = [
  { id: 'P3', cents: 300, ducats: 300, bonus: 0 },
  { id: 'P5', cents: 500, ducats: 550, bonus: 50 },
  { id: 'P10', cents: 1000, ducats: 1200, bonus: 200 },
  { id: 'P20', cents: 2000, ducats: 2600, bonus: 600 }
];

export const ducatPack = (id: unknown): DucatPack | undefined => DUCAT_PACKS.find((p) => p.id === id);

/** A season of an assistant graded B or better, in ducats (C+ and below cost Coach Points). */
export const COACH_DUCAT_PRICES: Partial<Record<CoachGrade, number>> = { 'S+': 100, S: 75, 'A+': 50, A: 25, 'B+': 10, B: 5 };

/** The most coaches one payment can cover: every assistant role. */
export const MAX_COACHES_PER_PAYMENT = 17;
