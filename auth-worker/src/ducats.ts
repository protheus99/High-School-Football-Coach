import { COACH_DUCAT_PRICES, DucatPack, ducatPack, DUCAT_PACKS, formatDucats, MAX_COACHES_PER_PAYMENT } from '../../src/data/ducats';
import { hmacSha256Hex, safeEqual } from './crypto';
import type { D1Database } from './d1';

// ---------------------------------------------------------------------------
// Ducats (₾): the paid currency, kept on the player's account. Every change is a row in ducat_ledger and the
// balance is their sum, so nothing in a save (or the game's pages) can add ducats.
//   Buying: the game asks for a checkout, the player pays on Stripe's own page, and Stripe tells this server
//     (a signed webhook). Only then are the ducats added, once per checkout. US cards only: a card from anywhere
//     else is refunded straight away and adds nothing.
//   Refunds and chargebacks take the ducats back (the balance can go below zero; nothing can be bought until it's
//     back up). A chargeback the player loses is restored if we win it.
//   Spending: the game names the coaches it's paying for; the price comes from the shared price list
//     (src/data/ducats.ts), never from the game. A payment is taken once per id, so a retry can't charge twice.
// ---------------------------------------------------------------------------

export interface DucatEnv {
  DB: D1Database;
  APP_URL: string;
  STRIPE_SECRET_KEY?: string; // ducats are off without it
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_TAX?: string; // 'on': Stripe Tax adds sales tax where it's registered to collect it
}

export const ducatsOn = (env: DucatEnv) => !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET;

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2024-06-20';
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const PAYMENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CHECKOUT_ID = /^cs_[A-Za-z0-9_]{1,250}$/;

export async function ducatBalance(db: D1Database, userId: string): Promise<number> {
  return (await db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM ducat_ledger WHERE user_id = ?').bind(userId).first<{ n: number }>())?.n ?? 0;
}

/** How a checkout went, as the game polls after Stripe sends the player back. */
export async function checkoutStatus(db: D1Database, userId: string, sessionId: string): Promise<{ status: 'paid' | 'blocked' | 'pending'; added?: number }> {
  if (!CHECKOUT_ID.test(sessionId)) return { status: 'pending' };
  const row = await db.prepare('SELECT kind, amount FROM ducat_ledger WHERE ref = ? AND user_id = ?').bind(sessionId, userId).first<{ kind: string; amount: number }>();
  if (!row) return { status: 'pending' };
  return row.kind === 'blocked' ? { status: 'blocked' } : { status: 'paid', added: row.amount };
}

/** A call to Stripe's API (form-encoded, with the secret key). Throws on an error answer. */
async function stripe<T>(env: DucatEnv, method: 'GET' | 'POST', path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(`${STRIPE_API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION, ...(params && { 'Content-Type': 'application/x-www-form-urlencoded' }) },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** A Stripe Checkout page for one pack, tied to this player. Returns its address. */
export async function createCheckout(env: DucatEnv, user: { id: string; email: string | null }, pack: DucatPack): Promise<string> {
  const description = `${formatDucats(pack.ducats)} for your Football Coach account${pack.bonus ? `, including a ${formatDucats(pack.bonus)} bonus` : ''}.`;
  const params: Record<string, string> = {
    mode: 'payment',
    submit_type: 'pay',
    'payment_method_types[0]': 'card', // cards (and Apple Pay or Google Pay, which are cards): the US-only check reads the card's country
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(pack.cents),
    'line_items[0][price_data][product_data][name]': `${pack.ducats.toLocaleString('en-US')} ducats`,
    'line_items[0][price_data][product_data][description]': description,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'metadata[pack]': pack.id,
    'payment_intent_data[metadata][user_id]': user.id,
    'payment_intent_data[metadata][pack]': pack.id,
    'payment_intent_data[description]': `Football Coach: ${pack.ducats} ducats`,
    success_url: `${env.APP_URL}/?ducats=paid&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/?ducats=cancelled`
  };
  if (user.email) params.customer_email = user.email;
  if (env.STRIPE_TAX === 'on') {
    params['automatic_tax[enabled]'] = 'true';
    params['line_items[0][price_data][tax_behavior]'] = 'exclusive';
    params.billing_address_collection = 'required';
  }
  const session = await stripe<{ url: string }>(env, 'POST', 'checkout/sessions', params);
  return session.url;
}

/**
 * Pays for coaches in ducats: the price of each grade from the shared list, taken once per payment id and only when
 * the balance covers it (checked in the same statement, so two payments at once can't both spend the same ducats).
 */
export async function spendDucats(db: D1Database, userId: string, paymentId: unknown, grades: unknown): Promise<{ ok: true; balance: number } | { ok: false; error: string; status: number; balance?: number }> {
  if (typeof paymentId !== 'string' || !PAYMENT_ID.test(paymentId)) return { ok: false, error: 'Bad payment id', status: 400 };
  if (!Array.isArray(grades) || grades.length === 0 || grades.length > MAX_COACHES_PER_PAYMENT) return { ok: false, error: 'Bad coaches', status: 400 };
  const prices = grades.map((g) => (typeof g === 'string' ? COACH_DUCAT_PRICES[g as keyof typeof COACH_DUCAT_PRICES] : undefined));
  if (prices.some((p) => p === undefined)) return { ok: false, error: 'Bad coaches', status: 400 };
  const cost = prices.reduce<number>((n, p) => n + p!, 0);
  const ref = `spend:${userId}:${paymentId}`;
  await db
    .prepare(
      "INSERT OR IGNORE INTO ducat_ledger (user_id, amount, kind, ref, detail, created_at) SELECT ?, ?, 'spend', ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM ducat_ledger WHERE user_id = ?) >= ?"
    )
    .bind(userId, -cost, ref, JSON.stringify({ coaches: grades }), Date.now(), userId, cost)
    .run();
  const taken = await db.prepare('SELECT id FROM ducat_ledger WHERE ref = ?').bind(ref).first();
  const balance = await ducatBalance(db, userId);
  return taken ? { ok: true, balance } : { ok: false, error: `Needs ${formatDucats(cost)}`, status: 402, balance };
}

// --- Stripe's webhook ----------------------------------------------------------

/** Checks Stripe's signature header (t=<time>,v1=<hex HMAC of "<time>.<body>">) and that it's recent. */
export async function verifyStripeSignature(secret: string, body: string, header: string | null, nowMs: number): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.split('='));
  const time = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(time) || signatures.length === 0 || Math.abs(nowMs / 1000 - time) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacSha256Hex(secret, `${time}.${body}`);
  return signatures.some((s) => safeEqual(s, expected));
}

interface CheckoutSession {
  id: string;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  payment_status: string;
  payment_intent: string | null;
  amount_subtotal: number | null;
}
interface Charge {
  id: string;
  payment_intent: string | null;
  amount: number;
  amount_refunded: number;
}
interface Dispute {
  id: string;
  payment_intent: string | null;
  status: string;
}

const record = (db: D1Database, userId: string, amount: number, kind: string, ref: string, paymentIntent: string | null, cents: number | null, detail: unknown) =>
  db
    .prepare('INSERT OR IGNORE INTO ducat_ledger (user_id, amount, kind, ref, payment_intent, cents, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, amount, kind, ref, paymentIntent, cents, detail === null ? null : JSON.stringify(detail), Date.now())
    .run();

/** A paid checkout: refunded if the card isn't American (or the account is gone), else the pack's ducats are added. */
async function creditCheckout(env: DucatEnv, session: CheckoutSession): Promise<void> {
  const pack = ducatPack(session.metadata?.pack);
  const userId = session.client_reference_id;
  if (session.payment_status !== 'paid' || !pack || !userId || !session.payment_intent) return;
  if (await env.DB.prepare('SELECT id FROM ducat_ledger WHERE ref = ?').bind(session.id).first()) return; // already counted
  const intent = await stripe<{ latest_charge: { payment_method_details?: { card?: { country?: string | null } } } | null }>(
    env,
    'GET',
    `payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge`
  );
  const country = intent.latest_charge?.payment_method_details?.card?.country ?? null;
  const account = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (country !== 'US' || !account) {
    await stripe(env, 'POST', 'refunds', { payment_intent: session.payment_intent, 'metadata[reason]': account ? 'non_us_card' : 'account_deleted' });
    if (account) await record(env.DB, userId, 0, 'blocked', session.id, session.payment_intent, pack.cents, { pack: pack.id, country });
    return;
  }
  await record(env.DB, userId, pack.ducats, 'purchase', session.id, session.payment_intent, pack.cents, { pack: pack.id });
}

const purchaseFor = (db: D1Database, paymentIntent: string | null) =>
  paymentIntent ? db.prepare("SELECT user_id, amount FROM ducat_ledger WHERE payment_intent = ? AND kind = 'purchase'").bind(paymentIntent).first<{ user_id: string; amount: number }>() : null;

/** Ducats already taken back from a purchase (refunds and chargebacks, less chargebacks won). */
async function takenBack(db: D1Database, paymentIntent: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM ducat_ledger WHERE payment_intent = ? AND kind IN ('refund', 'dispute', 'dispute_won')")
    .bind(paymentIntent)
    .first<{ n: number }>();
  return -(row?.n ?? 0);
}

/** A refund (full or partial): the same share of the pack's ducats comes back off the balance. */
async function reverseRefund(db: D1Database, charge: Charge): Promise<void> {
  const purchase = await purchaseFor(db, charge.payment_intent);
  if (!purchase || charge.amount <= 0) return;
  const owed = Math.round((purchase.amount * Math.min(charge.amount_refunded, charge.amount)) / charge.amount);
  const delta = owed - (await takenBack(db, charge.payment_intent!));
  if (delta > 0) await record(db, purchase.user_id, -delta, 'refund', `refund:${charge.id}:${charge.amount_refunded}`, charge.payment_intent, null, null);
}

/** A chargeback opened: whatever is left of the pack comes off. Won later: it goes back. */
async function reverseDispute(db: D1Database, dispute: Dispute, closed: boolean): Promise<void> {
  const purchase = await purchaseFor(db, dispute.payment_intent);
  if (!purchase) return;
  if (!closed) {
    const left = purchase.amount - (await takenBack(db, dispute.payment_intent!));
    if (left > 0) await record(db, purchase.user_id, -left, 'dispute', `dispute:${dispute.id}`, dispute.payment_intent, null, null);
    return;
  }
  if (dispute.status !== 'won') return;
  const taken = await db.prepare('SELECT amount FROM ducat_ledger WHERE ref = ?').bind(`dispute:${dispute.id}`).first<{ amount: number }>();
  if (taken) await record(db, purchase.user_id, -taken.amount, 'dispute_won', `dispute_won:${dispute.id}`, dispute.payment_intent, null, null);
}

/** Stripe's events, signed with the webhook secret. Anything else gets a 400; events we don't use, a 200. */
export async function stripeWebhook(request: Request, env: DucatEnv): Promise<Response> {
  if (!ducatsOn(env)) return new Response('Ducats are off', { status: 503 });
  const body = await request.text();
  if (!(await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET!, body, request.headers.get('Stripe-Signature'), Date.now()))) return new Response('Bad signature', { status: 400 });
  let event: { type?: string; data?: { object?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Bad event', { status: 400 });
  }
  const object = event.data?.object;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await creditCheckout(env, object as CheckoutSession);
  else if (event.type === 'charge.refunded') await reverseRefund(env.DB, object as Charge);
  else if (event.type === 'charge.dispute.created') await reverseDispute(env.DB, object as Dispute, false);
  else if (event.type === 'charge.dispute.closed') await reverseDispute(env.DB, object as Dispute, true);
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** What the game's store shows: the packs and the player's balance. */
export const storeJson = async (env: DucatEnv, userId: string) => ({ balance: await ducatBalance(env.DB, userId), packs: DUCAT_PACKS, on: ducatsOn(env) });
