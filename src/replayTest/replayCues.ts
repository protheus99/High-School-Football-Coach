// PLAYTEST ONLY: the moments that give a real play its feel (snap, hand-off, throw, catch, incompletion, pick, a hit
// that lands or one that misses), found in the play's own tracking. Positions are the library's (tenths of a yard).
import { LibPlay } from './replayLibrary';

export type CueKind = 'snap' | 'handoff' | 'throw' | 'catch' | 'incomplete' | 'pick' | 'hit' | 'sack' | 'miss';
export interface Cue {
  f: number; // the frame it happens on
  kind: CueKind;
  x: number;
  y: number;
  /** The player it happened to: its label follows him */
  who?: number;
}
export interface PlayCues {
  list: Cue[];
  /** Who carries the ball on each frame (-1: nobody, it's in the air or loose) */
  holder: number[];
  /** Where a pass comes down, shown from the throw */
  target?: { x: number; y: number };
}

const HOLD = 13; // within 1.3 yards of the ball: he has it
const near = (a: number[], i: number, b: number[], j: number) => Math.hypot(a[i * 2] - b[j * 2], a[i * 2 + 1] - b[j * 2 + 1]);

export function findCues(play: LibPlay): PlayCues {
  const n = play.p.length, end = Math.min(play.end, n - 1);
  const off = play.roles.map((r) => r[0] === 'O');
  const isPass = play.throw >= 0 && play.arrive > play.throw;
  const list: Cue[] = [];
  const at = (f: number, kind: CueKind, k?: number, who = k) => {
    const g = Math.max(0, Math.min(n - 1, f));
    const x = k === undefined ? play.ball[g][0] : play.p[g][k * 2], y = k === undefined ? play.ball[g][1] : play.p[g][k * 2 + 1];
    list.push({ f, kind, x, y, who: who !== undefined && who >= 0 ? who : undefined });
  };

  // The ball carrier, frame by frame: the player nearest the ball when it isn't in the air
  const holder: number[] = new Array(n).fill(-1);
  for (let f = Math.max(0, play.snap); f <= end; f++) {
    if (isPass && f >= play.throw && f < play.arrive) continue;
    if (isPass && play.res === 'I' && f >= play.arrive) continue;
    let best = -1, bd = HOLD;
    for (let k = 0; k < off.length; k++) {
      const d = Math.hypot(play.p[f][k * 2] - play.ball[f][0], play.p[f][k * 2 + 1] - play.ball[f][1]);
      if (d < bd) (bd = d), (best = k);
    }
    holder[f] = best;
  }
  // Smooth out one-frame flickers
  for (let f = 1; f < n - 1; f++) if (holder[f] === -1 && holder[f - 1] >= 0 && holder[f - 1] === holder[f + 1]) holder[f] = holder[f - 1];

  if (play.snap >= 0) at(play.snap, 'snap');
  let target: PlayCues['target'];
  if (isPass) {
    at(play.throw, 'throw', undefined, holder[Math.max(0, play.throw - 1)]);
    const a = Math.min(play.arrive, n - 1);
    target = { x: play.ball[a][0], y: play.ball[a][1] };
    const caught = holder[Math.min(end, play.arrive + 2)];
    at(play.arrive, play.res === 'C' ? 'catch' : play.res === 'IN' ? 'pick' : 'incomplete', undefined, play.res === 'I' ? undefined : caught);
  } else if (play.res === 'RUN' && play.start > play.snap) {
    const qb = play.key.qb, car = play.key.carrier;
    if (qb !== undefined && car !== undefined && qb !== car) at(play.start, 'handoff', car);
  }

  // Hits that miss: a defender gets to the carrier, then the carrier is clear of him and still going
  const run0 = isPass ? play.arrive : play.start > 0 ? play.start : play.snap + 5;
  const tried = new Set<number>();
  let misses = 0;
  for (let f = Math.max(run0 + 2, play.snap + 5); f <= end - 8 && misses < 2; f++) {
    const h = holder[f];
    if (h < 0) continue;
    for (let d = 0; d < off.length; d++) {
      if (off[d] === off[h] || tried.has(d) || near(play.p[f], d, play.p[f], h) > 10) continue;
      tried.add(d);
      const g = f + 8;
      const h2 = holder[g] >= 0 ? holder[g] : h;
      const gone = near(play.p[g], d, play.p[g], h2) > 25;
      const onward = Math.abs(play.p[g][h2 * 2 + 1] - play.p[f][h * 2 + 1]) + Math.abs(play.p[g][h2 * 2] - play.p[f][h * 2]) > 25;
      if (gone && onward) {
        at(f, 'miss', d);
        misses++;
        break;
      }
    }
  }

  // The hit that ends it: a defender on the carrier at the whistle (none when he runs out untouched or scores)
  const hEnd = holder[end] >= 0 ? holder[end] : holder[Math.max(0, end - 1)];
  if (hEnd >= 0 && !play.td) {
    let dmin = 1e9;
    for (let d = 0; d < off.length; d++) if (off[d] !== off[hEnd]) dmin = Math.min(dmin, near(play.p[end], d, play.p[end], hEnd));
    if (dmin < 18) at(end, play.res === 'S' ? 'sack' : 'hit', hEnd);
  }
  list.sort((a, b) => a.f - b.f);
  return { list, holder, target };
}

/** A ball in the air: a pass from throw to arrival, or a kick from the boot to where it comes down */
export interface Flight {
  from: number;
  to: number;
  /** How high it gets, in yards (from the hang time: a ball in the air T seconds peaks at g·T²/8) */
  peak: number;
  kind: 'pass' | 'punt' | 'fg';
}
const G = 10.7; // gravity in yards per second²

export function findFlight(play: LibPlay): Flight | null {
  const b = play.ball, n = b.length;
  if (play.throw >= 0 && play.arrive > play.throw) {
    const T = (play.arrive - play.throw) / 10;
    return { from: play.throw, to: Math.min(play.arrive, n - 1), peak: (G * T * T) / 8, kind: 'pass' };
  }
  // A kickoff flies and comes down like a punt (off a tee: the ball is kicked right at the start)
  const kind = play.kind === 'PUNT' || play.kind === 'KICKOFF' ? 'punt' : play.kind === 'FIELD_GOAL' || play.kind === 'PAT_KICK' ? 'fg' : null;
  if (!kind) return null;
  // The kick: the ball suddenly heads downfield fast (more than 0.9 yd a frame, three frames running)
  const dy = (f: number) => b[f + 1][1] - b[f][1];
  const sp = (f: number) => Math.hypot(b[f + 1][0] - b[f][0], b[f + 1][1] - b[f][1]);
  let from = -1;
  for (let f = Math.max(0, play.snap + (play.kind === 'KICKOFF' ? -1 : 3)); f < n - 4; f++)
    if (dy(f) > 9 && dy(f + 1) > 9 && dy(f + 2) > 9) {
      from = f;
      break;
    }
  if (from < 0) return null;
  // It comes down (caught, bounces, or hits the net) when its speed drops below half
  const v0 = (sp(from + 1) + sp(from + 2) + sp(from + 3)) / 3;
  // A punt comes down when someone catches it (a player within 1.3 yd of it)
  const caughtAt = (f: number) => play.p[f].some((_, i) => i % 2 === 0 && Math.hypot(play.p[f][i] - b[f][0], play.p[f][i + 1] - b[f][1]) < HOLD);
  let to = n - 1;
  for (let f = from + 5; f < n - 2; f++)
    if ((kind === 'punt' && f > from + 10 && caughtAt(f)) || (sp(f) + sp(f + 1)) / 2 < v0 * 0.45) {
      to = f;
      break;
    }
  // A kickoff slows a lot in the air (it's kicked far harder than a punt): it comes down where the return man catches it
  // (the data's catch), or where it stops going forward (a touchback)
  if (play.kind === 'KICKOFF') {
    if (play.start > from) to = play.start;
    else {
      to = from;
      for (let f = from; f < n; f++) if (b[f][1] > b[to][1]) to = f;
    }
  }
  const T = (to - from) / 10;
  // A field goal is still climbing down when it reaches the net: only about 3/4 of its arc happens on camera
  const full = kind === 'fg' ? T / 0.75 : T;
  return { from, to, peak: (G * full * full) / 8, kind };
}

/** Slow-motion around the moments that matter: the catch or pick, and the final hit */
export function paceAt(cues: PlayCues, fi: number) {
  for (const c of cues.list) {
    if ((c.kind === 'catch' || c.kind === 'pick') && fi >= c.f - 3 && fi < c.f + 3) return 0.45;
    if ((c.kind === 'hit' || c.kind === 'sack') && fi >= c.f - 3 && fi < c.f + 1) return 0.45;
  }
  return 1;
}
