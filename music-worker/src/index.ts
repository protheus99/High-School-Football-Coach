import soundtrack from '../../public/music/soundtrack.json';

// ---------------------------------------------------------------------------
// The game's music (Cloudflare Worker + R2).
//   GET /music/<file>   one song from soundtrack.json, streamed (with byte ranges) to the game's own pages
// The licensed MP3s sit in a private R2 bucket, never in the public repo or the site's files. Only songs in the
// soundtrack can be fetched (nothing can be listed), only requests from the game's pages are answered (a pasted
// link, another website or a download tool gets 403), and every song is sent to play, never as a download. A
// browser still has to receive a song to play it, so this keeps the files from being offered as downloads; it
// can't stop someone recording what they hear.
// ---------------------------------------------------------------------------

// The parts of the Workers runtime types this file uses (no @cloudflare/workers-types dependency)
interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}
export interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  range?: R2Range;
}
interface R2Bucket {
  get(key: string, options?: { range?: Headers }): Promise<R2ObjectBody | null>;
}

export interface Env {
  MUSIC: R2Bucket;
  ALLOWED_ORIGINS: string; // comma-separated origins of the game's pages
}

/** The songs that can be played: the soundtrack's list (adding a song means redeploying this Worker). */
const SONGS = new Set((soundtrack as { songs: { file: string }[] }).songs.map((s) => s.file));

const allowedOrigins = (env: Env) =>
  env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

/** The game page asking: the CORS Origin header (the player asks with CORS), or the Referer's origin. */
function callerOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (origin) return origin;
  const referer = request.headers.get('Referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

const deny = (status: number, message: string) => new Response(message, { status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = callerOrigin(request);
    const allowed = origin !== null && allowedOrigins(env).includes(origin);
    const cors: Record<string, string> = allowed ? { 'Access-Control-Allow-Origin': origin!, Vary: 'Origin' } : { Vary: 'Origin' };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '86400' }
      });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405, 'Method not allowed');
    if (url.pathname === '/health') return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
    if (!url.pathname.startsWith('/music/')) return deny(404, 'Not found');

    let file: string;
    try {
      file = decodeURIComponent(url.pathname.slice('/music/'.length));
    } catch {
      return deny(404, 'Not found');
    }
    if (!SONGS.has(file)) return deny(404, 'Not found');
    // Only the game's pages: opening the link directly (a document request with no origin) or from another site is refused
    if (!allowed || request.headers.get('Sec-Fetch-Dest') === 'document') return deny(403, 'This music plays in the game only');

    const object = await env.MUSIC.get(file, { range: request.headers });
    if (!object) return deny(404, 'Not found');

    const headers = new Headers({
      ...cors,
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline',
      'Accept-Ranges': 'bytes',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      ETag: object.httpEtag
    });
    // A byte range (the browser seeking or streaming in pieces): 206 with the slice it asked for
    let status = 200;
    let length = object.size;
    if (request.headers.has('Range') && object.range) {
      const r = object.range;
      const offset = r.suffix !== undefined ? Math.max(0, object.size - r.suffix) : r.offset ?? 0;
      length = r.suffix !== undefined ? object.size - offset : r.length ?? object.size - offset;
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      status = 206;
    }
    headers.set('Content-Length', String(length));
    return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
  }
};
