import { fromBase64Url, hmacSha256Base64Url, pkceChallenge, randomToken, safeEqual, sha256Hex } from './crypto';
import { safeReturn } from './paths';
import { authorizeUrl, configured, EmailEnv, fetchProfile, Provider, ProviderEnv, PROVIDERS, sendSignInEmail } from './providers';

// ---------------------------------------------------------------------------
// Player accounts (Cloudflare Worker + D1), served on the game's own domain at /api/auth/*:
//   GET  /api/auth/session                     who is signed in (and which sign-in options are on)
//   GET  /api/auth/signin/google|facebook      starts a sign-in (?marketing=1&return=/path)
//   GET  /api/auth/callback/google|facebook    the provider sends the player back here
//   POST /api/auth/email                       emails a sign-in link ({ email, marketing, return })
//   GET  /api/auth/email/verify?token=         the link in that email
//   POST /api/auth/signout                     signs this browser out
//   POST /api/auth/marketing                   game news on or off ({ optIn })
//   POST /api/auth/delete                      deletes the account and everything stored with it
//   POST /api/auth/facebook/delete             Facebook's data deletion callback (signed by Facebook)
//   GET  /api/auth/facebook/deletion?code=     the deletion status page Facebook links to
//   GET  /api/auth/saves                       the signed-in player's cloud saves (the load screen's lines)
//   GET  /api/auth/saves/<slot>                one save file (gzip)
//   PUT  /api/auth/saves/<slot>                stores a save (gzip body; its summary in X-Save-Summary)
//   DELETE /api/auth/saves/<slot>              removes one
// The Workers runtime treats every export of this file as an entry point: only the handler (and types) are exported.
// Sessions live in an HttpOnly cookie; only SHA-256 hashes of tokens are stored. Accounts with the same verified
// email are one player, whichever way they sign in. Sign-in is optional: the game plays without it.
// ---------------------------------------------------------------------------

interface D1Result<T> {
  results: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
}
interface R2Bucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface Env extends ProviderEnv, EmailEnv {
  DB: D1Database;
  SAVES?: R2Bucket; // cloud saves (off without the bucket)
  ALLOWED_ORIGINS: string; // the game's site, comma-separated (POSTs must come from one of them)
}

const SESSION_COOKIE = 'fc_session';
const OAUTH_COOKIE = 'fc_oauth';
const SESSION_DAYS = 30;
const EMAIL_LINK_MINUTES = 15;
const OAUTH_MINUTES = 10;
const EMAIL_LIMIT = 3; // sign-in emails per address per 10 minutes
const MAX_BODY_BYTES = 2048;
const MAX_SAVE_BYTES = 8 * 1024 * 1024; // a compressed save is ~2 MB
const MAX_SAVE_SLOTS = 10;
const SLOT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  marketing_opt_in: number;
}

const json = (data: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const allowedOrigins = (env: Env) => env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  return allowedOrigins(env).includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Save-Summary', Vary: 'Origin' }
    : { Vary: 'Origin' };
}


/** The game page to land on, with how the sign-in went (?signin=ok|failed|unavailable). */
function landing(env: Env, returnTo: string, result: string): string {
  const url = new URL(safeReturn(returnTo), env.APP_URL);
  url.searchParams.set('signin', result);
  return url.toString();
}

function cookie(name: string, value: string, maxAgeSeconds: number, path = '/'): string {
  return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  cookies.forEach((c) => headers.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers });
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The signed-in player for this request, or null. */
async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    'SELECT users.id, users.email, users.name, users.marketing_opt_in FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?'
  )
    .bind(await sha256Hex(token), Date.now())
    .first<UserRow>();
}

async function userJson(env: Env, user: UserRow) {
  const { results } = await env.DB.prepare('SELECT provider FROM identities WHERE user_id = ?').bind(user.id).all<{ provider: string }>();
  return { id: user.id, email: user.email, name: user.name, marketing: user.marketing_opt_in === 1, providers: results.map((r) => r.provider) };
}

/**
 * The player behind a sign-in: the same provider account as before, else the player with the same verified email
 * (one player, several ways in), else a new player. Ticking "game news" opts in; it never opts anyone out.
 */
async function findOrCreateUser(env: Env, provider: Provider | 'email', providerId: string, email: string | null, name: string | null, marketing: boolean): Promise<string> {
  const now = Date.now();
  const identity = await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?').bind(provider, providerId).first<{ user_id: string }>();
  let userId = identity?.user_id ?? null;
  if (!userId && email) userId = (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>())?.id ?? null;
  if (!userId) {
    userId = randomToken(16);
    await env.DB.prepare('INSERT INTO users (id, email, name, marketing_opt_in, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)').bind(userId, email, name, now, now).run();
  }
  if (!identity) {
    await env.DB.prepare('INSERT INTO identities (provider, provider_id, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').bind(provider, providerId, userId, email, now).run();
  }
  // Fill in what was missing (a name from Google for an email-link player, an email for a Facebook player),
  // unless another player already has that email
  const taken = email ? await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').bind(email, userId).first() : null;
  await env.DB.prepare('UPDATE users SET name = COALESCE(name, ?), email = COALESCE(email, ?), updated_at = ? WHERE id = ?')
    .bind(name, taken ? null : email, now, userId)
    .run();
  if (marketing) await env.DB.prepare('UPDATE users SET marketing_opt_in = 1, marketing_opt_in_at = ? WHERE id = ? AND marketing_opt_in = 0').bind(now, userId).run();
  return userId;
}

async function startSession(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * DAY).run();
  return cookie(SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60);
}

async function deleteUser(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare('SELECT slot_id FROM saves WHERE user_id = ?').bind(userId).all<{ slot_id: string }>();
  if (env.SAVES && results.length) await env.SAVES.delete(results.map((r) => saveKey(userId, r.slot_id)));
  await env.DB.prepare('DELETE FROM saves WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM identities WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

// --- Google and Facebook -----------------------------------------------------

async function startSignIn(url: URL, env: Env, provider: Provider): Promise<Response> {
  const returnTo = safeReturn(url.searchParams.get('return'));
  if (!configured(env, provider)) return redirect(landing(env, returnTo, 'unavailable'));
  const now = Date.now();
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now).run();
  const state = randomToken();
  const verifier = provider === 'google' ? randomToken(48) : null;
  await env.DB.prepare('INSERT INTO oauth_states (state, provider, code_verifier, marketing, return_to, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(state, provider, verifier, url.searchParams.get('marketing') === '1' ? 1 : 0, returnTo, now + OAUTH_MINUTES * 60 * 1000)
    .run();
  // The state is also kept in this browser, so a sign-in can only finish where it started
  return redirect(authorizeUrl(env, provider, state, verifier ? await pkceChallenge(verifier) : null), [cookie(OAUTH_COOKIE, state, OAUTH_MINUTES * 60, '/api/auth')]);
}

async function finishSignIn(request: Request, url: URL, env: Env, provider: Provider): Promise<Response> {
  const state = url.searchParams.get('state') ?? '';
  const row = state
    ? await env.DB.prepare('SELECT provider, code_verifier, marketing, return_to, expires_at FROM oauth_states WHERE state = ?')
        .bind(state)
        .first<{ provider: string; code_verifier: string | null; marketing: number; return_to: string; expires_at: number }>()
    : null;
  if (row) await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  const clear = cookie(OAUTH_COOKIE, '', 0, '/api/auth');
  const browserState = readCookie(request, OAUTH_COOKIE) ?? '';
  const code = url.searchParams.get('code');
  if (!row || row.provider !== provider || row.expires_at < Date.now() || !safeEqual(browserState, state) || !code) {
    return redirect(landing(env, row?.return_to ?? '/', 'failed'), [clear]);
  }
  try {
    const profile = await fetchProfile(env, provider, code, row.code_verifier);
    const userId = await findOrCreateUser(env, provider, profile.id, profile.email, profile.name, row.marketing === 1);
    return redirect(landing(env, row.return_to, 'ok'), [clear, await startSession(env, userId)]);
  } catch {
    return redirect(landing(env, row.return_to, 'failed'), [clear]);
  }
}

// --- Email links -------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requestEmailLink(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const body = await readJson(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400, cors);
  if (!env.RESEND_API_KEY) return json({ error: 'Email sign-in is not available yet.' }, 503, cors);
  const now = Date.now();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE email = ? AND created_at > ?').bind(email, now - 10 * 60 * 1000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= EMAIL_LIMIT) return json({ error: 'Too many sign-in emails. Try again in a few minutes.' }, 429, cors);
  const token = randomToken();
  await env.DB.prepare('INSERT INTO email_tokens (token_hash, email, marketing, return_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), email, body?.marketing === true ? 1 : 0, safeReturn(typeof body?.return === 'string' ? body.return : '/'), now, now + EMAIL_LINK_MINUTES * 60 * 1000)
    .run();
  try {
    await sendSignInEmail(env, email, `${env.APP_URL}/api/auth/email/verify?token=${token}`);
  } catch {
    return json({ error: "We couldn't send the email. Try again in a minute." }, 502, cors);
  }
  return json({ ok: true }, 200, cors);
}

async function verifyEmailLink(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('token') ?? '';
  const row = token
    ? await env.DB.prepare('SELECT email, marketing, return_to, expires_at, used_at FROM email_tokens WHERE token_hash = ?')
        .bind(await sha256Hex(token))
        .first<{ email: string; marketing: number; return_to: string; expires_at: number; used_at: number | null }>()
    : null;
  if (!row || row.used_at || row.expires_at < Date.now()) return redirect(landing(env, row?.return_to ?? '/', 'expired'));
  await env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ?').bind(Date.now(), await sha256Hex(token)).run();
  const userId = await findOrCreateUser(env, 'email', row.email, row.email, null, row.marketing === 1);
  return redirect(landing(env, row.return_to, 'ok'), [await startSession(env, userId)]);
}

// --- Cloud saves --------------------------------------------------------------

const saveKey = (userId: string, slot: string) => `saves/${userId}/${slot}`;

async function listSaves(env: Env, user: UserRow, cors: Record<string, string>): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT slot_id, summary, size, updated_at FROM saves WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(user.id)
    .all<{ slot_id: string; summary: string; size: number; updated_at: number }>();
  return json({ saves: results.map((r) => ({ ...(JSON.parse(r.summary) as object), id: r.slot_id, size: r.size, updatedAt: r.updated_at })) }, 200, cors);
}

async function getSave(env: Env, user: UserRow, slot: string, cors: Record<string, string>): Promise<Response> {
  const file = await env.SAVES!.get(saveKey(user.id, slot));
  if (!file) return json({ error: 'Not found' }, 404, cors);
  return new Response(await file.arrayBuffer(), { status: 200, headers: { ...cors, 'Content-Type': 'application/gzip', 'Cache-Control': 'no-store' } });
}

async function putSave(request: Request, env: Env, user: UserRow, slot: string, cors: Record<string, string>): Promise<Response> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_SAVE_BYTES) return json({ error: 'Save too large' }, 413, cors);
  let summary: unknown;
  try {
    summary = JSON.parse(decodeURIComponent(request.headers.get('X-Save-Summary') ?? ''));
  } catch {
    return json({ error: 'Bad summary' }, 400, cors);
  }
  const summaryText = JSON.stringify(summary);
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) || summaryText.length > 2048) return json({ error: 'Bad summary' }, 400, cors);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_SAVE_BYTES) return json({ error: 'Bad save' }, 413, cors);
  const existing = await env.DB.prepare('SELECT slot_id FROM saves WHERE user_id = ? AND slot_id = ?').bind(user.id, slot).first();
  if (!existing) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM saves WHERE user_id = ?').bind(user.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_SAVE_SLOTS) return json({ error: `Up to ${MAX_SAVE_SLOTS} cloud saves. Delete one first.` }, 409, cors);
  }
  await env.SAVES!.put(saveKey(user.id, slot), body, { httpMetadata: { contentType: 'application/gzip' } });
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO saves (user_id, slot_id, summary, size, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, slot_id) DO UPDATE SET summary = excluded.summary, size = excluded.size, updated_at = excluded.updated_at'
  )
    .bind(user.id, slot, summaryText, body.byteLength, now)
    .run();
  return json({ ok: true, updatedAt: now }, 200, cors);
}

async function deleteSave(env: Env, user: UserRow, slot: string, cors: Record<string, string>): Promise<Response> {
  await env.SAVES!.delete(saveKey(user.id, slot));
  await env.DB.prepare('DELETE FROM saves WHERE user_id = ? AND slot_id = ?').bind(user.id, slot).run();
  return json({ ok: true }, 200, cors);
}

// --- Facebook data deletion ---------------------------------------------------

/** Facebook's data deletion callback: verify the signed request, delete the player, answer with a status link. */
async function facebookDeletion(request: Request, env: Env): Promise<Response> {
  if (!env.FACEBOOK_APP_SECRET) return json({ error: 'Not configured' }, 503);
  const form = new URLSearchParams(await request.text());
  const [sig, payload] = (form.get('signed_request') ?? '').split('.');
  if (!sig || !payload || !safeEqual(sig, await hmacSha256Base64Url(env.FACEBOOK_APP_SECRET, payload))) return json({ error: 'Bad signature' }, 400);
  let facebookId = '';
  try {
    facebookId = String((JSON.parse(fromBase64Url(payload)) as { user_id?: string }).user_id ?? '');
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const identity = facebookId ? await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?').bind('facebook', facebookId).first<{ user_id: string }>() : null;
  if (identity) await deleteUser(env, identity.user_id);
  const code = randomToken(12);
  await env.DB.prepare('INSERT INTO deletions (confirmation_code, deleted_at) VALUES (?, ?)').bind(code, Date.now()).run();
  return json({ url: `${env.APP_URL}/api/auth/facebook/deletion?code=${code}`, confirmation_code: code }, 200);
}

async function deletionStatus(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code') ?? '';
  const row = code ? await env.DB.prepare('SELECT deleted_at FROM deletions WHERE confirmation_code = ?').bind(code).first<{ deleted_at: number }>() : null;
  const message = row ? `Data deletion request ${code}: completed on ${new Date(row.deleted_at).toISOString().slice(0, 10)}.` : 'No data deletion request with that code.';
  return new Response(`<!doctype html><meta charset="utf-8"><title>Data deletion</title><body style="font-family:sans-serif;padding:24px"><h1>Football Coach High School Edition</h1><p>${message}</p></body>`, {
    status: row ? 200 : 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// --- Router ------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/auth/, '') || '/';
    const provider = PROVIDERS.find((p) => path === `/signin/${p}` || path === `/callback/${p}`);
    try {
      if (request.method === 'GET') {
        if (path === '/health') return json({ ok: true }, 200, cors);
        if (path === '/session') {
          const user = await currentUser(request, env);
          return json(
            {
              user: user ? await userJson(env, user) : null,
              options: { google: configured(env, 'google'), facebook: configured(env, 'facebook'), email: !!env.RESEND_API_KEY, cloudSaves: !!env.SAVES }
            },
            200,
            cors
          );
        }
        if (provider && path.startsWith('/signin/')) return await startSignIn(url, env, provider);
        if (provider && path.startsWith('/callback/')) return await finishSignIn(request, url, env, provider);
        if (path === '/email/verify') return await verifyEmailLink(url, env);
        if (path === '/facebook/deletion') return await deletionStatus(url, env);
      }
      // Cloud saves: the signed-in player's own, from the game's pages
      const saveMatch = path.match(/^\/saves(?:\/([^/]+))?$/);
      if (saveMatch) {
        if (!env.SAVES) return json({ error: 'Cloud saves are off' }, 503, cors);
        if (request.method !== 'GET' && !allowedOrigins(env).includes(request.headers.get('Origin') ?? '')) return json({ error: 'Forbidden' }, 403, cors);
        const user = await currentUser(request, env);
        if (!user) return json({ error: 'Not signed in' }, 401, cors);
        const slot = saveMatch[1];
        if (!slot) return request.method === 'GET' ? await listSaves(env, user, cors) : json({ error: 'Not found' }, 404, cors);
        if (!SLOT_PATTERN.test(slot)) return json({ error: 'Bad slot' }, 400, cors);
        if (request.method === 'GET') return await getSave(env, user, slot, cors);
        if (request.method === 'PUT') return await putSave(request, env, user, slot, cors);
        if (request.method === 'DELETE') return await deleteSave(env, user, slot, cors);
      }
      if (request.method === 'POST') {
        // Facebook calls this one from its servers, signed with the app secret
        if (path === '/facebook/delete') return await facebookDeletion(request, env);
        // Everything else only from the game's own pages (no cross-site requests)
        if (!allowedOrigins(env).includes(request.headers.get('Origin') ?? '')) return json({ error: 'Forbidden' }, 403, cors);
        if (path === '/email') return await requestEmailLink(request, env, cors);
        if (path === '/signout') {
          const token = readCookie(request, SESSION_COOKIE);
          if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) } });
        }
        const user = await currentUser(request, env);
        if (!user) return json({ error: 'Not signed in' }, 401, cors);
        if (path === '/marketing') {
          const body = await readJson(request);
          const optIn = body?.optIn === true;
          await env.DB.prepare('UPDATE users SET marketing_opt_in = ?, marketing_opt_in_at = ?, updated_at = ? WHERE id = ?')
            .bind(optIn ? 1 : 0, optIn ? Date.now() : null, Date.now(), user.id)
            .run();
          return json({ user: await userJson(env, { ...user, marketing_opt_in: optIn ? 1 : 0 }) }, 200, cors);
        }
        if (path === '/delete') {
          await deleteUser(env, user.id);
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) } });
        }
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch {
      return json({ error: 'Server error' }, 500, cors);
    }
  }
};
