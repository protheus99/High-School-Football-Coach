import { firstContractPrestige, validate } from './validate';

// ---------------------------------------------------------------------------
// The global leaderboard API (Cloudflare Worker + D1).
//   POST /api/hof/careers                       a career's latest totals (created, or updated by its owner); the
//                                               player must be signed in (the game's session cookie, footballcoachgame.com)
//   GET  /leaderboard?length=                   a Hall of Fame board: the top careers of one length, every program
//   GET  /leaderboard?state=&school=&length=    the top careers for one starting program (games before 1.8)
// Each career carries a secret token from the device that started it; only its SHA-256 hash is stored, and
// an update must present the same token, so nobody can overwrite someone else's career. Every post is checked:
// the totals must be possible, a first contract starts at its program's prestige, a new career arrives at its first
// season or two, each season takes real time, and a player starts at most a few careers a day.
// The worker answers on its own address and on footballcoachgame.com/api/hof/* (where the sign-in cookie is sent).
// ---------------------------------------------------------------------------

// The parts of the Workers runtime types this file uses (no @cloudflare/workers-types dependency)
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

export interface Env {
  DB: D1Database;
  AUTH_DB?: D1Database; // the sign-in server's database (hsfhc-auth): who is signed in
  ALLOWED_ORIGINS: string; // comma-separated origins allowed to call the API (the game's site)
}

const TOP = 50;
const MAX_BODY_BYTES = 4096;
const SESSION_COOKIE = 'fc_session';
const MIN_SEASON_MS = 60 * 1000; // a season can't be played faster than this
const NEW_CAREER_MAX_SEASONS = 2; // a career first arrives after its first season (two if the first post failed)
const NEW_CAREERS_PER_DAY = 10; // per player
const DAY = 24 * 60 * 60 * 1000;

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

/** The signed-in player's id (from the sign-in server's sessions), or null. */
async function signedInUser(request: Request, env: Env): Promise<string | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !env.AUTH_DB) return null;
  const row = await env.AUTH_DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await sha256(token), Date.now())
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

interface Row {
  career_id: string;
  coach_name: string;
  scenario: string;
  state: string;
  starting_school: string;
  starting_program: string;
  length: number;
  seasons: number;
  wins: number;
  losses: number;
  playoff_wins: number;
  titles: number;
  national_titles: number;
  starting_prestige: number;
  college_signees: number;
  points: number;
  updated_at: number;
}

const toEntry = (r: Row) => ({
  careerId: r.career_id,
  coachName: r.coach_name,
  scenario: r.scenario,
  state: r.state,
  startingSchool: r.starting_school,
  startingProgram: r.starting_program,
  length: r.length,
  seasons: r.seasons,
  wins: r.wins,
  losses: r.losses,
  playoffWins: r.playoff_wins,
  titles: r.titles,
  nationalTitles: r.national_titles,
  startingPrestige: r.starting_prestige,
  collegeSignees: r.college_signees,
  points: r.points,
  updatedAt: r.updated_at
});

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  return {
    ...(allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function submit(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  // Only the game's own pages, and only a signed-in player
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  if (!allowed.includes(request.headers.get('Origin') ?? '')) return json({ error: 'Forbidden' }, 403, cors);
  const userId = await signedInUser(request, env);
  if (!userId) return json({ error: 'Sign in to post to the Hall of Fame' }, 401, cors);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413, cors);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }
  const result = validate(body);
  if (!result.ok) return json({ error: result.error }, 400, cors);
  const c = result.value;
  const tokenHash = await sha256(c.token);

  const existing = await env.DB.prepare(
    'SELECT token_hash, user_id, scenario, state, starting_school, length, seasons, starting_prestige, updated_at FROM careers WHERE career_id = ?'
  )
    .bind(c.careerId)
    .first<{ token_hash: string; user_id: string | null; scenario: string; state: string; starting_school: string; length: number; seasons: number; starting_prestige: number; updated_at: number }>();
  const now = Date.now();
  if (existing) {
    if (existing.token_hash !== tokenHash || (existing.user_id && existing.user_id !== userId)) return json({ error: 'Not your career' }, 403, cors);
    // Seasons take real time to play
    const added = c.seasons - existing.seasons;
    if (added > 0 && now - existing.updated_at < added * MIN_SEASON_MS) return json({ error: 'Too fast' }, 429, cors);
    // A career keeps its program and length, and only moves forward
    if (
      existing.scenario !== c.scenario ||
      existing.state !== c.state ||
      existing.starting_school !== c.startingSchool ||
      existing.length !== c.length ||
      (existing.starting_prestige ?? 99) !== c.startingPrestige
    )
      return json({ error: 'A career cannot change program, length or starting prestige' }, 409, cors);
    if (c.seasons < existing.seasons) return json({ error: 'Older than the stored career' }, 409, cors);
    // A career posted before sign-in was required joins the player who now posts it with its token
    await env.DB.prepare(
      `UPDATE careers SET coach_name = ?, seasons = ?, wins = ?, losses = ?, playoff_wins = ?, titles = ?, college_signees = ?, points = ?, updated_at = ?,
         national_titles = ?, user_id = ?
       WHERE career_id = ?`
    )
      .bind(c.coachName, c.seasons, c.wins, c.losses, c.playoffWins, c.titles, c.collegeSignees, c.points, now, c.nationalTitles, userId, c.careerId)
      .run();
  } else {
    // A new career arrives after its first season (or two), not finished
    if (c.seasons > NEW_CAREER_MAX_SEASONS) return json({ error: 'Careers are posted from their first season' }, 409, cors);
    // A first contract starts at its program's prestige; any other start needs a finished career behind it
    if (c.startingPrestige !== firstContractPrestige(c.scenario, c.state, c.startingSchool)) {
      const finished = await env.DB.prepare('SELECT 1 AS ok FROM careers WHERE user_id = ? AND seasons >= length LIMIT 1').bind(userId).first();
      if (!finished) return json({ error: 'Starting prestige does not match this program' }, 409, cors);
    }
    const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM careers WHERE user_id = ? AND created_at > ?').bind(userId, now - DAY).first<{ n: number }>();
    if ((today?.n ?? 0) >= NEW_CAREERS_PER_DAY) return json({ error: 'Too many new careers today' }, 429, cors);
    await env.DB.prepare(
      `INSERT INTO careers (career_id, token_hash, coach_name, scenario, state, starting_school, starting_program, length, seasons, wins, losses,
         playoff_wins, titles, college_signees, points, created_at, updated_at, national_titles, starting_prestige, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(c.careerId, tokenHash, c.coachName, c.scenario, c.state, c.startingSchool, c.startingProgram, c.length, c.seasons, c.wins, c.losses,
        c.playoffWins, c.titles, c.collegeSignees, c.points, now, now, c.nationalTitles, c.startingPrestige, userId)
      .run();
  }
  return json({ ok: true }, 200, cors);
}

async function leaderboard(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const state = url.searchParams.get('state');
  const school = url.searchParams.get('school');
  const length = Number(url.searchParams.get('length'));
  const where: string[] = [];
  const params: unknown[] = [];
  if (state && school) {
    where.push('state = ?', 'starting_school = ?');
    params.push(state, school);
  }
  if ([3, 5, 10].includes(length)) {
    where.push('length = ?');
    params.push(length);
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM careers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY points DESC, titles DESC, seasons ASC LIMIT ${TOP}`
  )
    .bind(...params)
    .all<Row>();
  return json(results.map(toEntry), 200, { ...cors, 'Cache-Control': 'public, max-age=30' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    // The same API on the worker's own address and on the game's domain under /api/hof
    const path = url.pathname.replace(/^\/api\/hof/, '') || '/';
    try {
      if (request.method === 'POST' && path === '/careers') return await submit(request, env, cors);
      if (request.method === 'GET' && path === '/leaderboard') return await leaderboard(url, env, cors);
      if (request.method === 'GET' && path === '/health') return json({ ok: true }, 200, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch {
      return json({ error: 'Server error' }, 500, cors);
    }
  }
};
