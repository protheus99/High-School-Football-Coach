// @vitest-environment node
import { describe, it, expect } from 'vitest';
import worker, { Env, R2ObjectBody } from '../src/index';
import soundtrack from '../../public/music/soundtrack.json';

const GAME = 'https://high-school-football-coach.protheus99.workers.dev';
const SONG = (soundtrack as { songs: { file: string }[] }).songs[0]?.file ?? 'missing.mp3';
const BYTES = new Uint8Array(1000).map((_, i) => i % 256);

// An R2 stand-in: one stored song, byte ranges read from the Range header the way R2 does
function fakeBucket(): Env['MUSIC'] {
  return {
    async get(key, options) {
      if (key !== SONG) return null;
      const header = options?.range?.get('Range');
      const m = header?.match(/^bytes=(\d*)-(\d*)$/);
      let range: R2ObjectBody['range'];
      let slice = BYTES;
      if (m) {
        if (m[1] === '') {
          range = { suffix: Number(m[2]) };
          slice = BYTES.slice(BYTES.length - Number(m[2]));
        } else {
          const offset = Number(m[1]);
          const end = m[2] === '' ? BYTES.length - 1 : Number(m[2]);
          range = { offset, length: end - offset + 1 };
          slice = BYTES.slice(offset, end + 1);
        }
      }
      return { body: new Blob([slice]).stream(), size: BYTES.length, httpEtag: '"abc"', range };
    }
  };
}

const env: Env = { MUSIC: fakeBucket(), ALLOWED_ORIGINS: `${GAME},http://localhost:3000` };
const get = (path: string, headers: Record<string, string> = {}) => worker.fetch(new Request(`https://music.example${path}`, { headers }), env);
const songPath = `/music/${encodeURIComponent(SONG)}`;

describe('Music worker', () => {
  it('streams a soundtrack song to the game, to play in place', async () => {
    const res = await get(songPath, { Origin: GAME, 'Sec-Fetch-Dest': 'audio' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(GAME);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(res.headers.get('Content-Disposition')).toBe('inline');
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it('serves byte ranges for seeking and streaming', async () => {
    const res = await get(songPath, { Origin: GAME, Range: 'bytes=100-199' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(res.headers.get('Content-Length')).toBe('100');
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(100);
    const tail = await get(songPath, { Origin: GAME, Range: 'bytes=-50' });
    expect(tail.headers.get('Content-Range')).toBe('bytes 950-999/1000');
  });

  it('accepts the game page as the Referer when there is no Origin', async () => {
    expect((await get(songPath, { Referer: `${GAME}/` })).status).toBe(200);
  });

  it.each([
    ['a pasted link', { 'Sec-Fetch-Dest': 'document' }],
    ['another website', { Origin: 'https://evil.example' }],
    ['a download tool (no origin at all)', {}],
    ['the game page opening the file as a document', { Referer: `${GAME}/`, 'Sec-Fetch-Dest': 'document' }]
  ])('refuses %s', async (_, headers) => {
    const res = await get(songPath, headers as Record<string, string>);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('only serves songs on the soundtrack, and lists nothing', async () => {
    expect((await get('/music/not-a-song.mp3', { Origin: GAME })).status).toBe(404);
    expect((await get('/music/', { Origin: GAME })).status).toBe(404);
    expect((await get('/', { Origin: GAME })).status).toBe(404);
  });

  it('answers the CORS preflight for the game only', async () => {
    const pre = (origin: string) => worker.fetch(new Request(`https://music.example${songPath}`, { method: 'OPTIONS', headers: { Origin: origin } }), env);
    expect((await pre(GAME)).status).toBe(204);
    expect((await pre('https://evil.example')).status).toBe(403);
  });
});
