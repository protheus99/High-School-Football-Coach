import { useSyncExternalStore } from 'react';
import { accountState, subscribeAccount } from './account';
import { DUCAT_PACKS, DucatPackId, ducatPack } from '../data/ducats';
import { track } from './analytics';
import type { CoachGrade } from '../sim/coachingStaff';
import { useGameStore } from '../store/gameStore';

// ---------------------------------------------------------------------------
// Ducats in the game: the balance, buying a pack and paying for coaches. The balance lives on the account (the
// sign-in server, auth-worker/); this keeps a copy to show. Buying leaves for Stripe's own checkout page and comes
// back to /?ducats=paid&session=… (or ?ducats=cancelled); the game then reopens the save on the Staff screen while
// the server waits for Stripe's word that the payment went through.
// ---------------------------------------------------------------------------

const API = '/api/auth/ducats';
const POLL_MS = 2000;
const POLL_TRIES = 15; // about 30 seconds before "still confirming"

/** How the trip to Stripe went: shown in a sheet when the player is back. */
export type CheckoutPhase = 'confirming' | 'paid' | 'blocked' | 'cancelled' | 'slow';

interface DucatState {
  balance: number | null; // null until known (signed out, or the server couldn't be reached)
  checkout: { phase: CheckoutPhase; added?: number } | null;
}

let state: DucatState = { balance: null, checkout: null };
const listeners = new Set<() => void>();
const update = (patch: Partial<DucatState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useDucats(): DucatState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

const signedIn = () => !!accountState().user;

/** Asks the server for the balance (and, with a checkout id, how that checkout went). */
async function fetchStore(session?: string): Promise<{ balance: number; checkout?: { status: 'paid' | 'blocked' | 'pending'; added?: number } } | null> {
  try {
    const res = await fetch(`${API}${session ? `?session=${encodeURIComponent(session)}` : ''}`, { credentials: 'same-origin', cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function refreshDucats(): Promise<void> {
  if (!signedIn()) return update({ balance: null });
  const store = await fetchStore();
  if (store) update({ balance: store.balance });
}

/**
 * Off to Stripe's checkout for a pack (the game in progress is saved first). Resolves only if it couldn't go,
 * with the reason to show.
 */
export async function buyDucats(pack: DucatPackId): Promise<string> {
  try {
    const res = await fetch(`${API}/checkout`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack }) });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) return body.error ?? "Checkout couldn't open. Try again in a minute.";
    const cents = ducatPack(pack)?.cents ?? 0;
    track('begin_checkout', { currency: 'USD', value: cents / 100, pack });
    await useGameStore.getState().autosave().catch(() => undefined);
    location.assign(body.url);
    return '';
  } catch {
    return "We couldn't reach the server. Check your connection and try again.";
  }
}

const paymentId = () => `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Pays a season for each coach (by grade) from the account's ducats. Resolves to null when paid, else the reason.
 * A dropped connection is retried with the same payment id, which the server only ever charges once.
 */
export async function spendDucats(grades: CoachGrade[]): Promise<string | null> {
  const id = paymentId();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}/spend`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, grades }) });
      const body = (await res.json().catch(() => ({}))) as { balance?: number; error?: string };
      if (typeof body.balance === 'number') update({ balance: body.balance });
      if (res.ok) return null;
      if (res.status === 401) return 'Sign in to pay in ducats.';
      return body.error ?? "The payment didn't go through. Try again.";
    } catch {
      // try once more, same id
    }
  }
  return "We couldn't reach the server. Check your connection and try again.";
}

export const clearCheckout = () => update({ checkout: null });

/** Back from Stripe with a paid checkout: wait (briefly) for the server to hear from Stripe. */
async function confirm(session: string): Promise<void> {
  for (let i = 0; i < POLL_TRIES; i++) {
    const store = await fetchStore(session);
    if (store) update({ balance: store.balance });
    if (store?.checkout?.status === 'paid') {
      // The pack is known by the ducats it added (a pack's ducats include its bonus)
      const pack = DUCAT_PACKS.find((p) => p.ducats === store.checkout?.added);
      track('purchase', { transaction_id: session, currency: 'USD', value: (pack?.cents ?? 0) / 100, pack: pack?.id, ducats: store.checkout.added });
      return update({ checkout: { phase: 'paid', added: store.checkout.added } });
    }
    if (store?.checkout?.status === 'blocked') return update({ checkout: { phase: 'blocked' } });
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  update({ checkout: { phase: 'slow' } });
}

/** Reads ?ducats= (and ?session=) from the page address after Stripe sends the player back, and removes them. */
function takeCheckoutReturn(): { phase: 'confirming' | 'cancelled'; session: string | null } | null {
  const url = new URL(location.href);
  const value = url.searchParams.get('ducats');
  if (!value) return null;
  const session = url.searchParams.get('session');
  url.searchParams.delete('ducats');
  url.searchParams.delete('session');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return { phase: value === 'paid' && session ? 'confirming' : 'cancelled', session };
}

/** Whether the page opened on the way back from Stripe (the game reopens the save on the Staff screen). */
export const returnedFromCheckout = () => state.checkout !== null;

/** Runs once as the game loads (after the account's own start-up). */
export function initDucats(): void {
  const back = takeCheckoutReturn();
  if (back) update({ checkout: { phase: back.phase } });
  let lastUser: string | null | undefined;
  subscribeAccount(() => {
    const { ready, user } = accountState();
    if (!ready || user?.id === lastUser) return;
    lastUser = user?.id ?? null;
    if (!user) return update({ balance: null, ...(state.checkout?.phase === 'confirming' && { checkout: { phase: 'slow' as const } }) });
    if (back?.phase === 'confirming' && back.session && state.checkout?.phase === 'confirming') void confirm(back.session);
    else void refreshDucats();
  });
}
