// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import worker, { Env } from '../src/index';
import { POINTS, prestigeMultiplier, validate } from '../src/validate';

// D1 over Node's built-in SQLite with the real migrations: the Hall of Fame database and the sign-in database
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
function d1(folder: string, files: string[]) {
  const sqlite = new DatabaseSync(':memory:');
  files.forEach((f) => sqlite.exec(readFileSync(new URL(`../../${folder}/migrations/${f}`, import.meta.url), 'utf8')));
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
  return { sqlite, db: { prepare } };
}
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** A Hall of Fame database, a sign-in database with two signed-in players, and the worker's settings. */
async function world() {
  const hof = d1('leaderboard-worker', ['0001_careers.sql', '0002_hall_of_fame.sql', '0003_owner.sql', '0004_reckonings.sql']);
  const auth = d1('auth-worker', ['0001_accounts.sql', '0002_saves.sql']);
  for (const [user, token] of [['u1', 'session-one'], ['u2', 'session-two']]) {
    auth.sqlite.prepare('INSERT INTO users (id, email, name, marketing_opt_in, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)').run(user, `${user}@example.com`, user);
    auth.sqlite.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, 0, ?)').run(await sha256(token), user, 9e15);
  }
  const env: Env = { DB: hof.db as Env['DB'], AUTH_DB: auth.db as Env['DB'], ALLOWED_ORIGINS: 'https://game.example' };
  return { hof, env };
}

/** Points by the formula, for a career's totals. */
const pointsFor = (c: { wins: number; playoffWins: number; losses: number; titles: number; nationalTitles?: number; collegeSignees: number; startingPrestige?: number }) =>
  Math.round(
    ((c.wins - c.playoffWins) * POINTS.win + c.losses * POINTS.loss + c.playoffWins * POINTS.playoffWin + c.titles * POINTS.stateTitle + (c.nationalTitles ?? 0) * POINTS.nationalTitle + c.collegeSignees * POINTS.collegeSignee) *
      prestigeMultiplier(c.startingPrestige ?? 99)
  );

const career = (overrides: Record<string, unknown> = {}) => ({
  careerId: 'career_1700000000000_abc123',
  token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  coachName: 'Coach Gaines',
  scenario: 'RECLAIM',
  state: 'Texas',
  startingSchool: 'Odessa Permian',
  startingProgram: 'Odessa Permian',
  length: 5,
  seasons: 2,
  wins: 19, // 15 regular season + 4 playoff
  losses: 3,
  playoffWins: 4,
  titles: 1,
  collegeSignees: 6,
  points: 15 * 5 + 3 + 4 * 8 + 10 + 6,
  ...overrides
});

describe('Leaderboard submissions', () => {
  it('accepts a possible career whose points match the formula', () => {
    expect(validate(career()).ok).toBe(true);
  });

  it.each([
    ['points that do not match', { points: 999 }],
    ['a school that is not in the state', { startingSchool: 'Springfield Atoms' }],
    ['an unknown scenario', { scenario: 'CHEAT' }],
    ['a starting prestige below 40', { startingPrestige: 12 }],
    ['more national titles than seasons', { nationalTitles: 3, points: 9999 }],
    ['points without the prestige bonus', { startingPrestige: 72 }],
    ['an unknown length', { length: 7 }],
    ['more seasons than the length', { seasons: 6 }],
    ['more games than the seasons allow', { wins: 40, playoffWins: 4, points: 36 * 5 + 3 + 32 + 10 + 6 }],
    ['a title without a playoff win', { titles: 1, playoffWins: 0, wins: 15, points: 75 + 3 + 10 + 6 }],
    ['more college signees than a senior class', { collegeSignees: 60, points: 15 * 5 + 3 + 4 * 8 + 10 + 60 }],
    ['an empty coach name', { coachName: '<<>>' }],
    ['a short token', { token: 'abc' }],
    ['a negative reckoning count', { reckonings: -1 }],
    ['more reckonings than the seasons allow', { reckonings: 999 }]
  ])('rejects %s', (_, overrides) => {
    expect(validate(career(overrides)).ok).toBe(false);
  });

  it('cleans the coach name and stores the program name the game uses', () => {
    const result = validate(career({ coachName: '  Coach <b>Gaines</b>  ', scenario: 'POWERHOUSE', startingSchool: 'Dr. Henry A. Wise', state: 'Maryland' }));
    expect(result.ok && result.value.coachName).toBe('Coach bGainesb');
    expect(result.ok && result.value.startingProgram).toBe('Wise');
  });

  it('takes any school in the state (Your Pick, or a new job) under its own name', () => {
    const result = validate(career({ scenario: 'OPEN', startingSchool: 'Austin Westlake', startingProgram: 'Whatever' }));
    expect(result.ok && result.value.startingProgram).toBe('Austin Westlake');
  });

  it('scores national titles and the starting-prestige bonus', () => {
    const base = 15 * 5 + 3 + 4 * 8 + 10 + 15 + 6; // a national title on top
    const result = validate(career({ startingPrestige: 72, nationalTitles: 1, points: Math.round(base * 1.27) }));
    expect(result.ok && result.value).toMatchObject({ startingPrestige: 72, nationalTitles: 1, points: Math.round(base * 1.27) });
  });

  it('games before 1.8 send neither field: no national titles, no bonus', () => {
    const result = validate(career());
    expect(result.ok && result.value).toMatchObject({ startingPrestige: 99, nationalTitles: 0 });
  });
});

describe('Leaderboard worker', () => {
  let now = 1_800_000_000_000;
  afterEach(() => vi.restoreAllMocks());
  const tick = (ms: number) => (now += ms);
  const MINUTE = 60 * 1000;
  // Reclaim starts Odessa Permian at 72: a first contract there must say so
  const first = (overrides: Record<string, unknown> = {}) => {
    const c = career({ startingPrestige: 72, ...overrides });
    return { ...c, points: pointsFor(c as Parameters<typeof pointsFor>[0]) };
  };
  const post = (env: Env, body: unknown, session: string | null = 'session-one', origin = 'https://game.example', path = '/api/hof/careers') => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const headers: Record<string, string> = { Origin: origin };
    if (session) headers.Cookie = `fc_session=${session}`;
    return worker.fetch(new Request(`https://footballcoachgame.com${path}`, { method: 'POST', body: JSON.stringify(body), headers }), env);
  };

  it('posts only from the game, for a signed-in player', async () => {
    const { env } = await world();
    expect((await post(env, first(), null)).status).toBe(401);
    expect((await post(env, first(), 'not-a-session')).status).toBe(401);
    expect((await post(env, first(), 'session-one', 'https://evil.example')).status).toBe(403);
    expect((await post({ ...env, AUTH_DB: undefined }, first())).status).toBe(401);
    expect((await post(env, first())).status).toBe(200);
    // The worker's own address works too
    expect((await post(env, first({ careerId: 'career_2_own', token: 'b'.repeat(32) }), 'session-one', 'https://game.example', '/careers')).status).toBe(200);
  });

  it('stores a career for its player, who updates it a season at a time, and nobody else can', async () => {
    const { hof, env } = await world();
    expect((await post(env, first())).status).toBe(200);
    const row = hof.sqlite.prepare('SELECT token_hash, user_id FROM careers').get() as { token_hash: string; user_id: string };
    expect(row).toMatchObject({ user_id: 'u1' });
    expect(row.token_hash).not.toBe(first().token); // only the hash is kept

    const later = first({ seasons: 3, wins: 28, losses: 4 });
    tick(20 * 1000);
    expect((await post(env, later)).status).toBe(429); // a season takes real time
    tick(MINUTE);
    expect((await post(env, later)).status).toBe(200);
    tick(MINUTE);
    expect((await post(env, { ...later, token: 'f'.repeat(32) })).status).toBe(403); // wrong token
    expect((await post(env, later, 'session-two')).status).toBe(403); // another player
    expect((await post(env, first())).status).toBe(409); // can't roll back
    expect((await post(env, { ...later, seasons: 4, startingPrestige: 60, points: pointsFor({ ...later, startingPrestige: 60 }) })).status).toBe(409); // nor change its bonus
  });

  it("refuses a made-up career: a first contract must start at its program's prestige, and arrive at its first seasons", async () => {
    const { env } = await world();
    // A Powerhouse school claiming the lowest prestige for the biggest bonus
    const forged = { ...first({ scenario: 'POWERHOUSE', startingSchool: 'Duncanville', startingPrestige: 40 }) };
    expect((await post(env, { ...forged, points: pointsFor(forged) })).status).toBe(409);
    // A whole career at once
    const whole = first({ careerId: 'career_whole_1', token: 'w'.repeat(32), seasons: 5, wins: 50, losses: 5, playoffWins: 4 });
    expect((await post(env, whole)).status).toBe(409);
    // Your Pick starts at the school's own prestige
    expect((await post(env, first({ careerId: 'career_open_1', token: 'o'.repeat(32), scenario: 'OPEN', startingSchool: 'Austin Westlake', startingPrestige: 98 }))).status).toBe(200);
  });

  it('lets a coach with a finished career start a new contract at any prestige (an extension or a new job)', async () => {
    const { env } = await world();
    const newJob = first({ careerId: 'career_job_1', token: 'j'.repeat(32), scenario: 'OPEN', startingSchool: 'Austin Westlake', startingPrestige: 63 });
    expect((await post(env, newJob)).status).toBe(409); // no finished career yet
    // Finish a 3-year career, a season at a time
    for (let seasons = 1; seasons <= 3; seasons++) {
      tick(2 * MINUTE);
      expect((await post(env, first({ length: 3, seasons, wins: 9 * seasons, losses: seasons, playoffWins: 0, titles: 0 }))).status).toBe(200);
    }
    tick(MINUTE);
    expect((await post(env, newJob)).status).toBe(200);
  });

  it('a player starts at most ten careers a day', async () => {
    const { env } = await world();
    for (let i = 0; i < 10; i++) expect((await post(env, first({ careerId: `career_day_${i}`, token: `${i}`.repeat(32) }))).status).toBe(200);
    expect((await post(env, first({ careerId: 'career_day_x', token: 'x'.repeat(32) }))).status).toBe(429);
    tick(24 * 60 * MINUTE + 1);
    expect((await post(env, first({ careerId: 'career_day_y', token: 'y'.repeat(32) }))).status).toBe(200);
  });

  it('a career posted before sign-in was required joins the player who posts it with its token', async () => {
    const { hof, env } = await world();
    const legacy = first();
    hof.sqlite
      .prepare(
        `INSERT INTO careers (career_id, token_hash, coach_name, scenario, state, starting_school, starting_program, length, seasons, wins, losses, playoff_wins, titles, college_signees, points, created_at, updated_at, national_titles, starting_prestige)
         VALUES (?, ?, 'Coach Gaines', 'RECLAIM', 'Texas', 'Odessa Permian', 'Odessa Permian', 5, 2, 19, 3, 4, 1, 6, ?, 0, 0, 0, 72)`
      )
      .run(legacy.careerId, await sha256(legacy.token), legacy.points);
    expect((await post(env, first({ seasons: 3, wins: 28, losses: 4 }))).status).toBe(200);
    expect((hof.sqlite.prepare('SELECT user_id FROM careers').get() as { user_id: string }).user_id).toBe('u1');
  });

  it('serves a Hall of Fame board: one length, every program', async () => {
    const { env } = await world();
    await post(env, first());
    await post(env, first({ careerId: 'career_2_xyz789', token: 'b'.repeat(32), coachName: 'Pick', scenario: 'OPEN', startingSchool: 'Austin Westlake', startingPrestige: 98, wins: 24, losses: 1, playoffWins: 6, titles: 2 }));
    await post(env, first({ careerId: 'career_3_xyz789', token: 'c'.repeat(32), length: 3 }));
    const res = await worker.fetch(new Request('https://footballcoachgame.com/api/hof/leaderboard?length=5', { headers: { Origin: 'https://game.example' } }), env);
    const board = (await res.json()) as { coachName: string; startingPrestige: number }[];
    expect(board.map((e) => [e.coachName, e.startingPrestige])).toEqual([
      ['Pick', 98],
      ['Coach Gaines', 72]
    ]);
  });

  it('serves a program board at one length, best first, with CORS for the game only', async () => {
    const { env } = await world();
    await post(env, first());
    await post(env, first({ careerId: 'career_2_xyz789', token: 'b'.repeat(32), coachName: 'Rival', titles: 0 }));
    await post(env, first({ careerId: 'career_3_xyz789', token: 'c'.repeat(32), length: 3 }));
    const res = await worker.fetch(new Request('https://api.example/leaderboard?state=Texas&school=Odessa%20Permian&length=5', { headers: { Origin: 'https://game.example' } }), env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://game.example');
    const board = (await res.json()) as { coachName: string; length: number }[];
    expect(board.map((e) => e.coachName)).toEqual(['Coach Gaines', 'Rival']);
    expect(board.every((e) => e.length === 5)).toBe(true);
    expect(board[0]).not.toHaveProperty('token');

    const other = await worker.fetch(new Request('https://api.example/leaderboard', { headers: { Origin: 'https://evil.example' } }), env);
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('lists invalid playthroughs (a reckoning) after the ranked board, and a reckoning never goes away', async () => {
    const { hof, env } = await world();
    // The best career had a shady call come to light; the other two are clean
    await post(env, first({ coachName: 'Shady', wins: 24, losses: 1, playoffWins: 6, titles: 2, reckonings: 1 }));
    await post(env, first({ careerId: 'career_2_clean1', token: 'b'.repeat(32), coachName: 'Clean One' }));
    await post(env, first({ careerId: 'career_3_clean2', token: 'c'.repeat(32), coachName: 'Clean Two', titles: 0 }));
    const res = await worker.fetch(new Request('https://footballcoachgame.com/api/hof/leaderboard?length=5', { headers: { Origin: 'https://game.example' } }), env);
    const board = (await res.json()) as { coachName: string; reckonings: number }[];
    expect(board.map((e) => [e.coachName, e.reckonings])).toEqual([
      ['Clean One', 0],
      ['Clean Two', 0],
      ['Shady', 1]
    ]);
    // Sending the career again without its reckoning doesn't clear it
    tick(2 * MINUTE);
    expect((await post(env, first({ coachName: 'Shady', seasons: 3, wins: 33, losses: 2, playoffWins: 6, titles: 2, reckonings: 0 }))).status).toBe(200);
    expect((hof.sqlite.prepare("SELECT reckonings FROM careers WHERE coach_name = 'Shady'").get() as { reckonings: number }).reckonings).toBe(1);
  });
});
