import { validate } from './validate';

// ---------------------------------------------------------------------------
// The global leaderboard API (Cloudflare Worker + D1).
//   POST /careers                               a career's latest totals (created, or updated by its owner)
//   GET  /leaderboard?state=&school=&length=    the top careers for a starting program and length
//   GET  /leaderboard?length=                   the top careers across every program (length optional)
// Each career carries a secret token from the device that started it; only its SHA-256 hash is stored, and
// an update must present the same token, so nobody can overwrite someone else's career.
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
  ALLOWED_ORIGINS: string; // comma-separated origins allowed to call the API (the game's site)
}

const TOP = 50;
const MAX_BODY_BYTES = 4096;

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
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function submit(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
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

  const existing = await env.DB.prepare('SELECT token_hash, scenario, state, starting_school, length, seasons FROM careers WHERE career_id = ?')
    .bind(c.careerId)
    .first<{ token_hash: string; scenario: string; state: string; starting_school: string; length: number; seasons: number }>();
  const now = Date.now();
  if (existing) {
    if (existing.token_hash !== tokenHash) return json({ error: 'Not your career' }, 403, cors);
    // A career keeps its program and length, and only moves forward
    if (existing.scenario !== c.scenario || existing.state !== c.state || existing.starting_school !== c.startingSchool || existing.length !== c.length)
      return json({ error: 'A career cannot change program or length' }, 409, cors);
    if (c.seasons < existing.seasons) return json({ error: 'Older than the stored career' }, 409, cors);
    await env.DB.prepare(
      `UPDATE careers SET coach_name = ?, seasons = ?, wins = ?, losses = ?, playoff_wins = ?, titles = ?, college_signees = ?, points = ?, updated_at = ?
       WHERE career_id = ?`
    )
      .bind(c.coachName, c.seasons, c.wins, c.losses, c.playoffWins, c.titles, c.collegeSignees, c.points, now, c.careerId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO careers (career_id, token_hash, coach_name, scenario, state, starting_school, starting_program, length, seasons, wins, losses,
         playoff_wins, titles, college_signees, points, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(c.careerId, tokenHash, c.coachName, c.scenario, c.state, c.startingSchool, c.startingProgram, c.length, c.seasons, c.wins, c.losses,
        c.playoffWins, c.titles, c.collegeSignees, c.points, now, now)
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
    try {
      if (request.method === 'POST' && url.pathname === '/careers') return await submit(request, env, cors);
      if (request.method === 'GET' && url.pathname === '/leaderboard') return await leaderboard(url, env, cors);
      if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true }, 200, cors);
      return json({ error: 'Not found' }, 404, cors);
    } catch {
      return json({ error: 'Server error' }, 500, cors);
    }
  }
};
