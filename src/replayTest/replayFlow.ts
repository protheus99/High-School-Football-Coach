// PLAYTEST ONLY: what happens after the whistle, so the field never freezes: whoever is on the ball stays down a beat,
// momentum fades, then everyone walks back toward the next snap, and once there keeps milling about (never standing
// dead still). After a touchdown the scorer's teammates run to him and mob him instead. In the library's coordinates
// (tenths of a yard).
import { LibPlay } from './replayLibrary';

export type Pt = [number, number];
export interface Flow {
  play: LibPlay; // the play with the walk-back added after the real data
  realEnd: number; // the last frame of real data
  /** After a touchdown: who scored (his teammates mob him) */
  scorer?: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const AFTER = 120; // 12 s of after-play at real speed: enough for a 2 s banner even at 4x

/**
 * `next`: the next snap's spot in tenths past this line (none: no walk back, e.g. after a score: everyone mills about).
 * `celebrate`: a touchdown: the scorer's teammates sprint to him and crowd round.
 */
export function addWalkBack(play: LibPlay, next?: Pt, celebrate = false): Flow {
  const n = play.p.length, roles = play.roles, P = roles.length;
  const last = play.p[n - 1], prev = play.p[Math.max(0, n - 2)];
  const endF = Math.min(play.end, n - 1);
  const ballEnd: Pt = [play.ball[endF][0], play.ball[endF][1]];
  let seed = [...play.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // The pile: whoever is on the ball at the whistle stays down a moment before getting up (not after a score)
  const pile = roles.map((_, k) => !celebrate && dist([play.p[endF][k * 2], play.p[endF][k * 2 + 1]], ballEnd) < 22);
  const pos: Pt[] = roles.map((_, k) => [last[k * 2], last[k * 2 + 1]]);
  const vel: Pt[] = roles.map((_, k) => (pile[k] ? [0, 0] : [last[k * 2] - prev[k * 2], last[k * 2 + 1] - prev[k * 2 + 1]]));
  // Where each one heads: a loose group behind the new spot (offense) or just past it (defense), each his own place
  const home: Pt[] = roles.map((r, k) => {
    if (!next) return [pos[k][0], pos[k][1]];
    const a = rnd() * Math.PI * 2, rr = 15 + rnd() * 30;
    return r[0] === 'O' ? [next[0] + Math.cos(a) * rr * 1.4, next[1] - 70 + Math.sin(a) * rr * 0.6] : [next[0] + Math.cos(a) * rr * 1.5, next[1] + 50 + Math.sin(a) * rr * 0.6];
  });
  const aim: Pt[] = home.map((h) => [h[0], h[1]]);
  const pace = roles.map(() => 1.1 + rnd() * 0.5); // 1.1 to 1.6 yd/s: some stroll, some hurry

  // The touchdown: the scorer (nearest the ball at the whistle) slows to a stop; his teammates take places in rings
  // round him, the nearest first, sprinting (5 to 7 yd/s); the other team drifts away
  let scorer = -1;
  const ring = new Map<number, Pt>();
  const sprint = roles.map(() => 5 + rnd() * 2);
  if (celebrate) {
    let bd = 1e9;
    roles.forEach((_, k) => {
      const d = dist([play.p[endF][k * 2], play.p[endF][k * 2 + 1]], ballEnd);
      if (d < bd) (bd = d), (scorer = k);
    });
    const side = roles[scorer][0];
    const mates = roles.map((_, k) => k).filter((k) => k !== scorer && roles[k][0] === side).sort((a, b) => dist(pos[a], pos[scorer]) - dist(pos[b], pos[scorer]));
    mates.forEach((k, i) => {
      const inner = i < 6, slot = inner ? i : i - 6, count = inner ? 6 : mates.length - 6;
      const a = (slot / Math.max(1, count)) * Math.PI * 2 + (inner ? 0 : 0.5) + (rnd() - 0.5) * 0.4;
      const r = inner ? 12 + rnd() * 3 : 22 + rnd() * 4;
      ring.set(k, [Math.cos(a) * r, Math.sin(a) * r]);
    });
  }

  const frames: number[][] = [];
  const balls: number[][] = [];
  for (let f = 1; f <= AFTER; f++) {
    for (let k = 0; k < P; k++) {
      const down = pile[k] && f < 10;
      let want: Pt = [0, 0];
      let keep = down ? 0 : 0.86; // momentum fades, the walk takes over
      if (celebrate && k === scorer) {
        keep = 0.8; // he pulls up and waits for them
      } else if (celebrate && ring.has(k)) {
        const o = ring.get(k)!;
        const t: Pt = [pos[scorer][0] + o[0], pos[scorer][1] + o[1]];
        const d = dist(pos[k], t);
        const sp = d > 30 ? sprint[k] : Math.max(0.4, (sprint[k] * d) / 30); // ease in as he gets there
        if (d > 1) want = [((t[0] - pos[k][0]) / d) * sp, ((t[1] - pos[k][1]) / d) * sp];
        keep = 0.7;
      } else if (!down) {
        // Arrived: wander a little around his place, slowly, then pick another spot nearby
        if (dist(pos[k], aim[k]) < 6) aim[k] = [home[k][0] + (rnd() - 0.5) * 30, home[k][1] + (rnd() - 0.5) * 20];
        const d = dist(pos[k], aim[k]);
        const near = dist(pos[k], home[k]) < 40;
        const sp = near ? 0.8 : pace[k]; // milling about: 0.8 yd/s
        if (d > 0.5) want = [((aim[k][0] - pos[k][0]) / d) * sp, ((aim[k][1] - pos[k][1]) / d) * sp];
      }
      vel[k] = [vel[k][0] * keep + want[0] * (1 - keep), vel[k][1] * keep + want[1] * (1 - keep)];
      pos[k] = [pos[k][0] + vel[k][0], pos[k][1] + vel[k][1]];
    }
    frames.push(pos.flatMap((p) => [Math.round(p[0]), Math.round(p[1])]));
    // After a score the ball stays with the scorer
    balls.push(celebrate && scorer >= 0 ? [Math.round(pos[scorer][0]), Math.round(pos[scorer][1])] : [...play.ball[n - 1]]);
  }
  return { play: { ...play, p: [...play.p, ...frames], ball: [...play.ball, ...balls] }, realEnd: n - 1, scorer: scorer >= 0 ? scorer : undefined };
}
