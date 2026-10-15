// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
// Node's built-in SQLite, loaded directly (the test bundler doesn't know the node:sqlite module yet)
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
import worker, { Env } from '../src/index';
import { safeReturn } from '../src/paths';
import { hmacSha256Base64Url, hmacSha256Hex, pkceChallenge } from '../src/crypto';

const APP = 'https://footballcoachgame.com';

/** D1 over an in-memory SQLite database with the real migration. */
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_accounts.sql', '0002_saves.sql', '0003_ducats.sql', '0004_played_games.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const clean = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v) as null | number | string;
  const prepare = (sql: string) => {
    let args: (null | number | string)[] = [];
    const stmt = {
      bind: (...values: unknown[]) => ((args = values.map(clean)), stmt),
      first: async <T>() => ((sqlite.prepare(sql).get(...args) as T | undefined) ?? null),
      all: async <T>() => ({ results: sqlite.prepare(sql).all(...args) as T[] }),
      run: async () => sqlite.prepare(sql).run(...args)
    };
    return stmt;
  };
  return { sqlite, DB: { prepare } };
}

let db: ReturnType<typeof database>;
let bucket: Map<string, ArrayBuffer>;
let env: Env;
let sent: { to: string; link: string }[];
let googleUser: Record<string, unknown>;
let facebookUser: Record<string, unknown>;
let lastVerifier: string | null;
let stripeCalls: { method: string; path: string; params: URLSearchParams }[];
let cardCountry: string;

beforeEach(() => {
  db = database();
  bucket = new Map();
  env = {
    DB: db.DB,
    SAVES: {
      put: async (key: string, value: ArrayBuffer) => void bucket.set(key, value),
      get: async (key: string) => (bucket.has(key) ? { arrayBuffer: async () => bucket.get(key)! } : null),
      delete: async (keys: string | string[]) => [keys].flat().forEach((k) => bucket.delete(k))
    },
    APP_URL: APP,
    ALLOWED_ORIGINS: `${APP},http://localhost:3000`,
    GOOGLE_CLIENT_ID: 'google-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    FACEBOOK_APP_ID: 'fb-id',
    FACEBOOK_APP_SECRET: 'fb-secret',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Football Coach <signin@footballcoachgame.com>',
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_test'
  };
  stripeCalls = [];
  cardCountry = 'US';
  sent = [];
  lastVerifier = null;
  googleUser = { sub: 'g-123', email: 'Coach@Example.com', email_verified: true, given_name: 'Jean', name: 'Jean Coach' };
  facebookUser = { id: 'fb-9', first_name: 'Jean', email: 'coach@example.com' };
  // Google, Facebook and Resend stand-ins
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      lastVerifier = new URLSearchParams(String(init?.body)).get('code_verifier');
      return Response.json({ access_token: 'g-token' });
    }
    if (url.startsWith('https://openidconnect.googleapis.com/')) return Response.json(googleUser);
    if (url.includes('graph.facebook.com') && url.includes('/oauth/access_token')) return Response.json({ access_token: 'fb-token' });
    if (url.includes('graph.facebook.com') && url.includes('/me?')) return Response.json(facebookUser);
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(String(init?.body)) as { to: string[]; text: string };
      sent.push({ to: body.to[0], link: body.text.match(/https:\/\/\S+/)![0] });
      return Response.json({ id: 'email_1' });
    }
    if (url.startsWith('https://api.stripe.com/v1/')) {
      const path = url.slice('https://api.stripe.com/v1/'.length);
      stripeCalls.push({ method: init?.method ?? 'GET', path, params: new URLSearchParams(String(init?.body ?? '')) });
      if (path === 'checkout/sessions') return Response.json({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
      if (path.startsWith('payment_intents/')) return Response.json({ latest_charge: { payment_method_details: { card: { country: cardCountry } } } });
      if (path === 'refunds') return Response.json({ id: 're_1' });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

const call = (path: string, init: RequestInit & { cookie?: string; origin?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.origin) headers.set('Origin', init.origin);
  return worker.fetch(new Request(`${APP}${path}`, { ...init, headers }), env);
};
const post = (path: string, body: unknown, cookie?: string) => call(path, { method: 'POST', body: JSON.stringify(body), origin: APP, cookie, headers: { 'Content-Type': 'application/json' } });
const cookieValue = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
const session = async (cookie?: string) => ((await (await call('/api/auth/session', { cookie })).json()) as { user: null | Record<string, unknown>; options: Record<string, boolean> });

/** A full Google sign-in; returns the session cookie. */
async function googleSignIn(query = '') {
  const start = await call(`/api/auth/signin/google${query}`);
  const location = new URL(start.headers.get('Location')!);
  const state = location.searchParams.get('state')!;
  const back = await call(`/api/auth/callback/google?state=${state}&code=abc`, { cookie: cookieValue(start, 'fc_oauth') });
  return { start, location, back, cookie: cookieValue(back, 'fc_session') };
}

describe('Sign-in server', () => {
  it('reports no player and which sign-in options are on', async () => {
    expect(await session()).toEqual({ user: null, options: { google: true, facebook: true, email: true, cloudSaves: true, ducats: true, playedGames: true } });
    env.FACEBOOK_APP_SECRET = undefined;
    expect((await session()).options.facebook).toBe(false);
  });

  it('signs in with Google (PKCE, state tied to the browser) and opts in to news only when asked', async () => {
    const { start, location, back, cookie } = await googleSignIn('?marketing=1&return=/hub');
    expect(start.status).toBe(302);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(`${APP}/api/auth/callback/google`);
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(back.headers.get('Location')).toBe(`${APP}/hub?signin=ok`);
    expect(await pkceChallenge(lastVerifier!)).toBe(location.searchParams.get('code_challenge'));
    expect(back.headers.getSetCookie().find((c) => c.startsWith('fc_session='))).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect((await session(cookie)).user).toMatchObject({ email: 'coach@example.com', name: 'Jean', marketing: true, providers: ['google'] });
    const consent = db.sqlite.prepare('SELECT marketing_opt_in_at FROM users').get() as { marketing_opt_in_at: number };
    expect(consent.marketing_opt_in_at).toBeGreaterThan(0);
  });

  it('refuses a callback from another browser, a replayed state or a missing code', async () => {
    const start = await call('/api/auth/signin/google');
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!;
    const other = await call(`/api/auth/callback/google?state=${state}&code=abc`, { cookie: 'fc_oauth=someone-else' });
    expect(other.headers.get('Location')).toBe(`${APP}/?signin=failed`);
    const replay = await call(`/api/auth/callback/google?state=${state}&code=abc`, { cookie: cookieValue(start, 'fc_oauth') });
    expect(replay.headers.get('Location')).toContain('signin=failed');
    expect(cookieValue(replay, 'fc_session')).toBe('');
  });

  it('a Google email the provider has not verified is not used to link accounts', async () => {
    googleUser = { ...googleUser, email_verified: false };
    const { cookie } = await googleSignIn();
    expect((await session(cookie)).user).toMatchObject({ email: null });
  });

  it('Facebook with the same email is the same player', async () => {
    const google = await googleSignIn();
    const start = await call('/api/auth/signin/facebook');
    const location = new URL(start.headers.get('Location')!);
    expect(location.hostname).toBe('www.facebook.com');
    expect(location.searchParams.get('scope')).toBe('email,public_profile');
    const back = await call(`/api/auth/callback/facebook?state=${location.searchParams.get('state')}&code=xyz`, { cookie: cookieValue(start, 'fc_oauth') });
    const fb = (await session(cookieValue(back, 'fc_session'))).user!;
    expect(fb.id).toBe((await session(google.cookie)).user!.id);
    expect(fb.providers).toEqual(expect.arrayContaining(['google', 'facebook']));
    expect(fb.marketing).toBe(false);
  });

  it('a provider without its keys sends the player back with signin=unavailable', async () => {
    env.GOOGLE_CLIENT_ID = '';
    const res = await call('/api/auth/signin/google?return=/');
    expect(res.headers.get('Location')).toBe(`${APP}/?signin=unavailable`);
  });

  it('emails a single-use sign-in link, limited to three per address every ten minutes', async () => {
    const res = await post('/api/auth/email', { email: ' Coach@Example.com ', marketing: true, return: '/team' });
    expect(res.status).toBe(200);
    expect(sent[0].to).toBe('coach@example.com');
    const link = new URL(sent[0].link);
    expect(link.pathname).toBe('/api/auth/email/verify');
    const back = await call(`${link.pathname}${link.search}`);
    expect(back.headers.get('Location')).toBe(`${APP}/team?signin=ok`);
    expect((await session(cookieValue(back, 'fc_session'))).user).toMatchObject({ email: 'coach@example.com', marketing: true, providers: ['email'] });
    expect((await call(`${link.pathname}${link.search}`)).headers.get('Location')).toContain('signin=expired');

    await post('/api/auth/email', { email: 'coach@example.com' });
    await post('/api/auth/email', { email: 'coach@example.com' });
    expect((await post('/api/auth/email', { email: 'coach@example.com' })).status).toBe(429);
    expect((await post('/api/auth/email', { email: 'not-an-email' })).status).toBe(400);
  });

  it('refuses POSTs from other sites', async () => {
    const res = await call('/api/auth/email', { method: 'POST', body: JSON.stringify({ email: 'a@b.co' }), origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('turns game news on and off, signs out, and deletes everything on request', async () => {
    const { cookie } = await googleSignIn();
    expect(((await (await post('/api/auth/marketing', { optIn: true }, cookie)).json()) as { user: { marketing: boolean } }).user.marketing).toBe(true);
    expect(((await (await post('/api/auth/marketing', { optIn: false }, cookie)).json()) as { user: { marketing: boolean } }).user.marketing).toBe(false);
    expect((await post('/api/auth/marketing', { optIn: true })).status).toBe(401);

    const signout = await post('/api/auth/signout', {}, cookie);
    expect(signout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await session(cookie)).user).toBeNull();

    const again = await googleSignIn();
    expect((await post('/api/auth/delete', {}, again.cookie)).status).toBe(200);
    for (const table of ['users', 'identities', 'sessions']) expect((db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0);
  });

  it("answers Facebook's signed data deletion request and shows its status page", async () => {
    const start = await call('/api/auth/signin/facebook');
    const state = new URL(start.headers.get('Location')!).searchParams.get('state');
    await call(`/api/auth/callback/facebook?state=${state}&code=xyz`, { cookie: cookieValue(start, 'fc_oauth') });
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'fb-9' })).toString('base64url');
    const signed = `${await hmacSha256Base64Url('fb-secret', payload)}.${payload}`;
    const res = await worker.fetch(
      new Request(`${APP}/api/auth/facebook/delete`, { method: 'POST', body: new URLSearchParams({ signed_request: signed }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
      env
    );
    const body = (await res.json()) as { url: string; confirmation_code: string };
    expect(body.url).toBe(`${APP}/api/auth/facebook/deletion?code=${body.confirmation_code}`);
    expect((db.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(0);
    expect((await call(`/api/auth/facebook/deletion?code=${body.confirmation_code}`)).status).toBe(200);

    const forged = await worker.fetch(new Request(`${APP}/api/auth/facebook/delete`, { method: 'POST', body: new URLSearchParams({ signed_request: `bad.${payload}` }) }), env);
    expect(forged.status).toBe(400);
  });

  it('keeps the signed-in player’s cloud saves: store, list, download, replace and delete', async () => {
    const { cookie } = await googleSignIn();
    const summary = { saveName: 'Week 5', timestamp: 111, teamName: 'Odessa Permian', wins: 4, losses: 0, currentWeek: 5, currentYear: 2026, isAutosave: true };
    const put = (slot: string, bytes: number[], withCookie = cookie, origin = APP) =>
      call(`/api/auth/saves/${slot}`, { method: 'PUT', body: new Uint8Array(bytes), cookie: withCookie, origin, headers: { 'X-Save-Summary': encodeURIComponent(JSON.stringify(summary)) } });
    expect((await put('current_save', [1, 2, 3])).status).toBe(200);
    const list = (await (await call('/api/auth/saves', { cookie })).json()) as { saves: Record<string, unknown>[] };
    expect(list.saves).toHaveLength(1);
    expect(list.saves[0]).toMatchObject({ id: 'current_save', teamName: 'Odessa Permian', size: 3 });
    const file = await call('/api/auth/saves/current_save', { cookie });
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);
    await put('current_save', [9, 9]);
    expect((await (await call('/api/auth/saves', { cookie })).json() as { saves: unknown[] }).saves).toHaveLength(1);
    expect([...new Uint8Array(await (await call('/api/auth/saves/current_save', { cookie })).arrayBuffer())]).toEqual([9, 9]);

    // Signed in, from the game's pages, and a sensible slot name only
    expect((await put('slot_b', [1], '')).status).toBe(401);
    expect((await put('slot_b', [1], cookie, 'https://evil.example')).status).toBe(403);
    expect((await put('bad.slot', [1])).status).toBe(400);
    // Ten slots at most
    for (let i = 0; i < 9; i++) expect((await put(`slot_${i}`, [i + 1])).status).toBe(200);
    expect((await put('slot_extra', [1])).status).toBe(409);

    expect((await call('/api/auth/saves/slot_0', { method: 'DELETE', cookie, origin: APP })).status).toBe(200);
    expect((await call('/api/auth/saves/slot_0', { cookie })).status).toBe(404);
    // Deleting the account removes every cloud save
    await post('/api/auth/delete', {}, cookie);
    expect(bucket.size).toBe(0);
    expect((db.sqlite.prepare('SELECT COUNT(*) AS n FROM saves').get() as { n: number }).n).toBe(0);
  });

  it("keeps the player's played games: a final is permanent, a game in progress only gets newer", async () => {
    const { cookie } = await googleSignIn();
    const put = (games: unknown[], withCookie = cookie, origin = APP) =>
      call('/api/auth/played-games', { method: 'PUT', body: JSON.stringify({ games }), cookie: withCookie, origin, headers: { 'Content-Type': 'application/json' } });
    const list = async (career = 'ck_1') => ((await (await call(`/api/auth/played-games?career=${career}`, { cookie })).json()) as { games: Record<string, unknown>[] }).games;
    const game = (status: string, updated: number, homeScore = 0) => ({ key: 'ck_1|2026|8|team_b', careerKey: 'ck_1', year: 2026, week: 8, status, homeId: 'team_a', awayId: 'team_b', homeScore, awayScore: 0, updated });

    expect((await session(cookie)).options.playedGames).toBe(true);
    expect((await put([game('LIVE', 100, 7)])).status).toBe(200);
    expect(await list()).toMatchObject([{ status: 'LIVE', homeScore: 7 }]);
    await put([game('LIVE', 50, 0)]); // an older state of the same game: ignored
    expect(await list()).toMatchObject([{ homeScore: 7 }]);
    await put([game('FINAL', 200, 21)]);
    await put([game('LIVE', 300, 3)]); // after the final: ignored
    await put([game('FINAL', 400, 0)]); // a second final: the first one stands
    expect(await list()).toMatchObject([{ status: 'FINAL', homeScore: 21 }]);
    expect(await list('ck_other')).toEqual([]);

    // Signed in, from the game's pages, and well-formed games only
    expect((await put([game('LIVE', 1)], '')).status).toBe(401);
    expect((await put([game('LIVE', 1)], cookie, 'https://evil.example')).status).toBe(403);
    expect((await put([{ ...game('LIVE', 1), status: 'WON' }])).status).toBe(400);
    expect((await put([{ ...game('LIVE', 1), key: 'bad key <script>' }])).status).toBe(400);
    // Deleting the account removes them
    await post('/api/auth/delete', {}, cookie);
    expect((db.sqlite.prepare('SELECT COUNT(*) AS n FROM played_games').get() as { n: number }).n).toBe(0);
  });

  it('only returns players to pages on the game site', () => {
    expect(safeReturn('/team?x=1')).toBe('/team?x=1');
    expect(safeReturn('//evil.example')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn('/\\evil.example')).toBe('/');
    expect(safeReturn(null)).toBe('/');
  });
});

describe('Ducats', () => {
  /** Stripe's signed webhook call. */
  const stripeEvent = async (type: string, object: Record<string, unknown>, secret = 'whsec_test') => {
    const body = JSON.stringify({ id: `evt_${Math.random()}`, type, data: { object } });
    const t = Math.floor(Date.now() / 1000);
    const headers = { 'Stripe-Signature': `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}` };
    return call('/api/auth/stripe/webhook', { method: 'POST', body, headers });
  };
  const paid = (session: string, pack: string, userId: string, intent = `pi_${session}`) =>
    stripeEvent('checkout.session.completed', { id: session, client_reference_id: userId, metadata: { pack, user_id: userId }, payment_status: 'paid', payment_intent: intent });
  const store = async (cookie: string, query = '') =>
    (await (await call(`/api/auth/ducats${query}`, { cookie })).json()) as { balance: number; checkout?: { status: string; added?: number } };
  const userId = () => (db.sqlite.prepare('SELECT id FROM users').get() as { id: string }).id;

  it('opens a Stripe checkout for a pack: US dollars, cards, tied to the player', async () => {
    const { cookie } = await googleSignIn();
    expect((await post('/api/auth/ducats/checkout', { pack: 'P99' }, cookie)).status).toBe(400);
    expect((await post('/api/auth/ducats/checkout', { pack: 'P10' })).status).toBe(401);
    const res = await post('/api/auth/ducats/checkout', { pack: 'P10' }, cookie);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    const params = stripeCalls[0].params;
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('1000');
    expect(params.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(params.get('payment_method_types[0]')).toBe('card');
    expect(params.get('client_reference_id')).toBe(userId());
    expect(params.get('metadata[pack]')).toBe('P10');
    expect(params.get('customer_email')).toBe('coach@example.com');
    expect(params.get('success_url')).toBe(`${APP}/?ducats=paid&session={CHECKOUT_SESSION_ID}`);
    expect(params.get('automatic_tax[enabled]')).toBeNull();
    env.STRIPE_TAX = 'on';
    await post('/api/auth/ducats/checkout', { pack: 'P3' }, cookie);
    expect(stripeCalls[1].params.get('automatic_tax[enabled]')).toBe('true');
    env.STRIPE_SECRET_KEY = undefined;
    expect((await post('/api/auth/ducats/checkout', { pack: 'P3' }, cookie)).status).toBe(503);
  });

  it('adds the pack only when Stripe confirms the payment, once per checkout', async () => {
    const { cookie } = await googleSignIn();
    expect(await store(cookie, '?session=cs_a')).toMatchObject({ balance: 0, checkout: { status: 'pending' } });
    expect((await paid('cs_a', 'P10', userId())).status).toBe(200);
    expect((await paid('cs_a', 'P10', userId())).status).toBe(200); // Stripe sends it again
    expect(await store(cookie, '?session=cs_a')).toMatchObject({ balance: 1200, checkout: { status: 'paid', added: 1200 } });
  });

  it('refuses unsigned, wrongly signed or stale webhook calls', async () => {
    await googleSignIn();
    expect((await call('/api/auth/stripe/webhook', { method: 'POST', body: '{}' })).status).toBe(400);
    const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } });
    const old = Math.floor(Date.now() / 1000) - 3600;
    const stale = await call('/api/auth/stripe/webhook', { method: 'POST', body, headers: { 'Stripe-Signature': `t=${old},v1=${await hmacSha256Hex('whsec_test', `${old}.${body}`)}` } });
    expect(stale.status).toBe(400);
    expect((await stripeEvent('checkout.session.completed', { id: 'cs_x' }, 'whsec_wrong')).status).toBe(400);
  });

  it('refunds a card from outside the US straight away and adds nothing', async () => {
    const { cookie } = await googleSignIn();
    cardCountry = 'CA';
    await paid('cs_ca', 'P20', userId());
    expect(stripeCalls.find((c) => c.path === 'refunds')?.params.get('payment_intent')).toBe('pi_cs_ca');
    expect(await store(cookie, '?session=cs_ca')).toMatchObject({ balance: 0, checkout: { status: 'blocked' } });
  });

  it('pays for coaches at the shared prices, only with enough ducats, once per payment id', async () => {
    const { cookie } = await googleSignIn();
    await paid('cs_b', 'P3', userId()); // ₾300
    const spend = (id: string, grades: unknown) => post('/api/auth/ducats/spend', { id, grades }, cookie);
    expect((await spend('pay-00001', ['C+'])).status).toBe(400); // Coach Point grades aren't sold for ducats
    const first = await spend('pay-00002', ['S+', 'A+']); // 100 + 50
    expect(await first.json()).toEqual({ balance: 150 });
    expect(await (await spend('pay-00002', ['S+', 'A+'])).json()).toEqual({ balance: 150 }); // a retry isn't charged twice
    const short = await spend('pay-00003', ['S+', 'S']); // 175
    expect(short.status).toBe(402);
    expect(await short.json()).toEqual({ error: 'Needs ₾175', balance: 150 });
    expect((await store(cookie)).balance).toBe(150);
  });

  it('takes ducats back for refunds and chargebacks, and restores a chargeback we win', async () => {
    const { cookie } = await googleSignIn();
    await paid('cs_c', 'P10', userId(), 'pi_c'); // ₾1,200 for $10
    await stripeEvent('charge.refunded', { id: 'ch_c', payment_intent: 'pi_c', amount: 1000, amount_refunded: 500 });
    expect((await store(cookie)).balance).toBe(600);
    await stripeEvent('charge.refunded', { id: 'ch_c', payment_intent: 'pi_c', amount: 1000, amount_refunded: 500 }); // sent again
    expect((await store(cookie)).balance).toBe(600);
    await stripeEvent('charge.dispute.created', { id: 'dp_c', payment_intent: 'pi_c', status: 'needs_response' });
    expect((await store(cookie)).balance).toBe(0);
    await stripeEvent('charge.dispute.closed', { id: 'dp_c', payment_intent: 'pi_c', status: 'won' });
    expect((await store(cookie)).balance).toBe(600);
  });

  it("a refund after the ducats were spent leaves a negative balance, and nothing can be bought until it's back", async () => {
    const { cookie } = await googleSignIn();
    await paid('cs_d', 'P3', userId(), 'pi_d');
    await post('/api/auth/ducats/spend', { id: 'pay-00010', grades: ['S+', 'S+'] }, cookie);
    await stripeEvent('charge.refunded', { id: 'ch_d', payment_intent: 'pi_d', amount: 300, amount_refunded: 300 });
    expect((await store(cookie)).balance).toBe(-200);
    expect((await post('/api/auth/ducats/spend', { id: 'pay-00011', grades: ['B'] }, cookie)).status).toBe(402);
  });

  it('deleting the account deletes its ducats', async () => {
    const { cookie } = await googleSignIn();
    await paid('cs_e', 'P5', userId());
    await post('/api/auth/delete', {}, cookie);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM ducat_ledger').get()).toEqual({ n: 0 });
  });
});
