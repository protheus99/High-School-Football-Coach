// PLAYTEST ONLY: an injury after the whistle, acted out (library coordinates: tenths of a yard, 10 frames a second).
// The hurt player stays down where the play ended. Two trainers jog out from his team's sideline; everyone near him
// backs away to give them room, and anyone in their path steps aside. The trainers kneel and work on him, help him up,
// and the three walk slowly back to the sideline together.
import { LibPlay } from './replayLibrary';

type Pt = [number, number];
export interface InjuryFx {
  who: number;
  /** The frame he goes down (the whistle) */
  down: number;
  /** The trainers' paths, one point a frame (null before they come on) */
  trainers: (Pt | null)[][];
  out: number; // they leave the sideline
  arrive: number; // they reach him
  up: number; // they help him up
  gone: number; // the three reach the sideline
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** The nearest point to p on the segment a-b */
const onSegment = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return [a[0] + dx * t, a[1] + dy * t];
};

const JOG = 4.5; // trainers run out at 4.5 yd/s
const WALK = 1.8; // and walk him off at 1.8 yd/s
const WORK = 45; // 4.5 s working on him
const ROOM = 80; // players keep 8 yd away
const LANE = 35; // and 3.5 yd off the trainers' path

/**
 * `sideX`: his team's sideline (library x: below 0 is left of the field, above 533 right of it).
 * Returns the play with the scene added after the whistle, and what the field draws for it.
 */
export function stageInjury(base: LibPlay, who: number, sideX: number): { play: LibPlay; fx: InjuryFx } {
  const e = Math.min(base.end, base.p.length - 1);
  const p = base.p.slice(0, e + 1).map((r) => [...r]);
  const ball = base.ball.slice(0, e + 1).map((b) => [...b]);
  const P = base.roles.length;
  const I: Pt = [p[e][who * 2], p[e][who * 2 + 1]];
  const sgn = sideX > I[0] ? 1 : -1;
  const E: Pt = [sideX, I[1]]; // where they come on
  const home: Pt = [sideX + sgn * 15, I[1]]; // back in the team area
  const out = e + 8;
  const arrive = out + Math.ceil(dist(E, I) / JOG);
  const up = arrive + WORK;
  const gone = up + Math.ceil(dist(I, home) / WALK);
  const N = gone + 14;

  // Everyone else: momentum fades, then they back off from him and out of the trainers' path, and stand milling about
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pos: Pt[] = base.roles.map((_, k) => [p[e][k * 2], p[e][k * 2 + 1]]);
  const vel: Pt[] = base.roles.map((_, k) => (e > 0 ? [p[e][k * 2] - p[e - 1][k * 2], p[e][k * 2 + 1] - p[e - 1][k * 2 + 1]] : [0, 0]));
  const hurt = (f: number): Pt => (f <= up ? I : lerp(I, home, Math.min(1, (f - up) / Math.max(1, gone - up))));
  for (let f = e + 1; f < N; f++) {
    const lane: [Pt, Pt] | null = f >= out - 4 && f < arrive + 4 ? [E, I] : f >= up - 4 && f <= gone ? [hurt(f), home] : null;
    for (let k = 0; k < P; k++) {
      if (k === who) continue;
      let want: Pt = [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4]; // shifting their weight
      const d = dist(pos[k], hurt(f));
      if (d < ROOM && f > e + 4) {
        const u: Pt = d > 1 ? [(pos[k][0] - hurt(f)[0]) / d, (pos[k][1] - hurt(f)[1]) / d] : [rnd() - 0.5, 1];
        want = [u[0] * 1.3, u[1] * 1.3];
      }
      if (lane) {
        const q = onSegment(pos[k], lane[0], lane[1]), dl = dist(pos[k], q);
        if (dl < LANE) {
          // Step out of the lane, to whichever side he's already on (along the field, never toward the trainers)
          const side = pos[k][1] >= q[1] ? 1 : -1;
          want = [want[0] * 0.3, side * 1.6];
        }
      }
      const keep = f < e + 6 ? 0.85 : 0.75;
      vel[k] = [vel[k][0] * keep + want[0] * (1 - keep), vel[k][1] * keep + want[1] * (1 - keep)];
      pos[k] = [pos[k][0] + vel[k][0], pos[k][1] + vel[k][1]];
    }
    pos[who] = hurt(f);
    p.push(pos.flatMap((q) => [Math.round(q[0]), Math.round(q[1])]));
    ball.push([...ball[e]]);
  }
  // He stays down from the whistle (the frames already in the play too)
  for (let f = e; f < N; f++) if (f <= up) (p[f][who * 2] = I[0]), (p[f][who * 2 + 1] = I[1]);

  // The trainers: out from the sideline a yard apart, kneeling either side of him, then each with an arm round him
  const trainers = [-1, 1].map((s) => {
    const kneel: Pt = [I[0] + sgn * 9, I[1] + s * 13];
    const path: (Pt | null)[] = [];
    for (let f = 0; f < N; f++) {
      if (f < out) path.push(null);
      else if (f < arrive) path.push(lerp([E[0], E[1] + s * 10], kneel, (f - out) / Math.max(1, arrive - out)));
      else if (f < up) path.push([kneel[0], kneel[1] + Math.sin(f * 0.5 + s) * 1.2]);
      else {
        const h = hurt(f);
        const t = Math.min(1, (f - up) / 6);
        path.push(lerp(kneel, [h[0], h[1] + s * 12], t));
      }
    }
    return path;
  });
  return { play: { ...base, p, ball, end: e }, fx: { who, down: e, trainers, out, arrive, up, gone } };
}
