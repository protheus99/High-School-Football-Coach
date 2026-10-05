// @vitest-environment node
import { describe, it, expect } from 'vitest';
import worker, { Env } from '../src/index';
import { validate } from '../src/validate';

// A D1 stand-in: just the statements the worker runs, over an in-memory table
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const cols = ['career_id', 'token_hash', 'coach_name', 'scenario', 'state', 'starting_school', 'starting_program', 'length', 'seasons', 'wins', 'losses', 'playoff_wins', 'titles', 'college_signees', 'points', 'created_at', 'updated_at'];
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...values: unknown[]) => ((args = values), stmt),
      first: async () => (sql.startsWith('SELECT token_hash') ? rows.get(args[0] as string) ?? null : null),
      run: async () => {
        if (sql.startsWith('INSERT')) rows.set(args[0] as string, Object.fromEntries(cols.map((c, i) => [c, args[i]])));
        if (sql.startsWith('UPDATE')) {
          const row = rows.get(args[9] as string)!;
          ['coach_name', 'seasons', 'wins', 'losses', 'playoff_wins', 'titles', 'college_signees', 'points', 'updated_at'].forEach((c, i) => (row[c] = args[i]));
        }
        return {};
      },
      all: async () => {
        let list = [...rows.values()];
        const filters = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
        filters.forEach((col, i) => (list = list.filter((r) => r[col] === args[i])));
        list.sort((a, b) => (b.points as number) - (a.points as number));
        return { results: list };
      }
    };
    return stmt;
  };
  return { rows, db: { prepare } };
}

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
    ['a program outside the scenarios', { startingSchool: 'Austin Westlake' }],
    ['a program from the other scenario', { scenario: 'POWERHOUSE' }],
    ['an unknown length', { length: 7 }],
    ['more seasons than the length', { seasons: 6 }],
    ['more games than the seasons allow', { wins: 40, playoffWins: 4, points: 36 * 5 + 3 + 32 + 10 + 6 }],
    ['a title without a playoff win', { titles: 1, playoffWins: 0, wins: 15, points: 75 + 3 + 10 + 6 }],
    ['an empty coach name', { coachName: '<<>>' }],
    ['a short token', { token: 'abc' }]
  ])('rejects %s', (_, overrides) => {
    expect(validate(career(overrides)).ok).toBe(false);
  });

  it('cleans the coach name and stores the program name the game uses', () => {
    const result = validate(career({ coachName: '  Coach <b>Gaines</b>  ', scenario: 'POWERHOUSE', startingSchool: 'Dr. Henry A. Wise', state: 'Maryland' }));
    expect(result.ok && result.value.coachName).toBe('Coach bGainesb');
    expect(result.ok && result.value.startingProgram).toBe('Wise');
  });
});

describe('Leaderboard worker', () => {
  const env = (db: unknown): Env => ({ DB: db as Env['DB'], ALLOWED_ORIGINS: 'https://game.example' });
  const post = (body: unknown) => new Request('https://api.example/careers', { method: 'POST', body: JSON.stringify(body), headers: { Origin: 'https://game.example' } });

  it('stores a career, lets its owner update it, and refuses anyone else', async () => {
    const { rows, db } = fakeDb();
    expect((await worker.fetch(post(career()), env(db))).status).toBe(200);
    expect(rows.get('career_1700000000000_abc123')!.token_hash).not.toBe(career().token); // only the hash is kept

    const later = career({ seasons: 3, wins: 28, losses: 4, points: 24 * 5 + 4 + 32 + 10 + 6 });
    expect((await worker.fetch(post(later), env(db))).status).toBe(200);
    expect(rows.get('career_1700000000000_abc123')!.seasons).toBe(3);

    expect((await worker.fetch(post({ ...later, token: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }), env(db))).status).toBe(403);
    expect((await worker.fetch(post(career()), env(db))).status).toBe(409); // can't roll back to two seasons
  });

  it('serves a program board at one length, best first, with CORS for the game only', async () => {
    const { db } = fakeDb();
    await worker.fetch(post(career()), env(db));
    await worker.fetch(post(career({ careerId: 'career_2_xyz789', token: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', coachName: 'Rival', titles: 0, points: 75 + 3 + 32 + 6 })), env(db));
    await worker.fetch(post(career({ careerId: 'career_3_xyz789', token: 'cccccccc-cccc-cccc-cccc-cccccccccccc', length: 3 })), env(db));
    const res = await worker.fetch(new Request('https://api.example/leaderboard?state=Texas&school=Odessa%20Permian&length=5', { headers: { Origin: 'https://game.example' } }), env(db));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://game.example');
    const board = (await res.json()) as { coachName: string; length: number }[];
    expect(board.map((e) => e.coachName)).toEqual(['Coach Gaines', 'Rival']);
    expect(board.every((e) => e.length === 5)).toBe(true);
    expect(board[0]).not.toHaveProperty('token');

    const other = await worker.fetch(new Request('https://api.example/leaderboard', { headers: { Origin: 'https://evil.example' } }), env(db));
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
