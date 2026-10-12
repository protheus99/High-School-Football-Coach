// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
// Node's built-in SQLite, loaded directly (the test bundler doesn't know the node:sqlite module yet)
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
import worker, { Env, safeReturn } from '../src/index';
import { hmacSha256Base64Url, pkceChallenge } from '../src/crypto';

const APP = 'https://footballcoachgame.com';

/** D1 over an in-memory SQLite database with the real migration. */
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8'));
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
let env: Env;
let sent: { to: string; link: string }[];
let googleUser: Record<string, unknown>;
let facebookUser: Record<string, unknown>;
let lastVerifier: string | null;

beforeEach(() => {
  db = database();
  env = {
    DB: db.DB,
    APP_URL: APP,
    ALLOWED_ORIGINS: `${APP},http://localhost:3000`,
    GOOGLE_CLIENT_ID: 'google-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    FACEBOOK_APP_ID: 'fb-id',
    FACEBOOK_APP_SECRET: 'fb-secret',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Football Coach <signin@footballcoachgame.com>'
  };
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
    expect(await session()).toEqual({ user: null, options: { google: true, facebook: true, email: true } });
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

  it('only returns players to pages on the game site', () => {
    expect(safeReturn('/team?x=1')).toBe('/team?x=1');
    expect(safeReturn('//evil.example')).toBe('/');
    expect(safeReturn('https://evil.example')).toBe('/');
    expect(safeReturn('/\\evil.example')).toBe('/');
    expect(safeReturn(null)).toBe('/');
  });
});
