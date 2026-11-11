// PLAYTEST ONLY: each of the game's penalties acted out on a real play (library coordinates: tenths of a yard, x from
// the offense's left sideline, y past the line of scrimmage, 10 frames a second).
// Before the snap there is no play: the lineup stays set while one player commits the foul (a lineman flinches, an end
// jumps across, the play clock runs out, a receiver lines up off the line). During the play the real tracking runs and
// the foul is laid on top of it: two players tied together (holding), a push or a hit that knocks someone off his path
// (pass interference, a block in the back, roughing, a late hit), a carrier yanked by the face mask.
import { LibPlay } from './replayLibrary';
import { PenaltyId } from '../sim/penalties';

type Pt = [number, number];

/** What the field draws for the foul */
export interface FoulFx {
  /** The flag leaves the official's hand on this frame */
  frame: number;
  /** Where it lands (library coordinates of this play) */
  spot: Pt;
  offender: number;
  victim?: number;
  /** Frames the two are tied together (a hold) */
  tether?: [number, number];
  /** The frame a push or a hit lands (a jolt on the victim) */
  contact?: number;
  /** Delay of game: the play clock runs out on this frame */
  clockOut?: number;
}
export interface Staged {
  play: LibPlay;
  foul: FoulFx;
}

const clone = (p: LibPlay): LibPlay => ({ ...p, p: p.p.map((r) => [...r]), ball: p.ball.map((b) => [...b]), key: { ...p.key } });
const at = (pl: LibPlay, f: number, k: number): Pt => [pl.p[f][k * 2], pl.p[f][k * 2 + 1]];
const put = (pl: LibPlay, f: number, k: number, [x, y]: Pt) => {
  pl.p[f][k * 2] = Math.round(x);
  pl.p[f][k * 2 + 1] = Math.round(y);
};
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: Pt, b: Pt): Pt => {
  const d = dist(a, b) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const pos = (pl: LibPlay, k: number) => pl.roles[k].slice(2);
const OL = ['T', 'G', 'C', 'OT', 'OG'];
const DL = ['DE', 'DT', 'NT'];
const FRONT = ['DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'LB'];
const COVER = ['CB', 'SS', 'FS', 'S', 'DB'];

/** The player on `side` (with a position in `list`, if given) nearest `pt` on frame f */
function nearest(pl: LibPlay, f: number, pt: Pt, side: 'O' | 'D', list?: string[], not: number[] = []) {
  let best = -1, bd = 1e9;
  pl.roles.forEach((r, k) => {
    if (r[0] !== side || not.includes(k) || (list && !list.includes(pos(pl, k)))) return;
    const d = dist(at(pl, f, k), pt);
    if (d < bd) (bd = d), (best = k);
  });
  return best;
}

/** The lineup set before the snap, held still for `frames` frames: the snap never comes */
function setLineup(play: LibPlay, frames: number, whistle: number): LibPlay {
  const set = play.p[play.snap], ball = play.ball[play.snap];
  return {
    ...play, p: Array.from({ length: frames }, () => [...set]), ball: Array.from({ length: frames }, () => [...ball]),
    snap: 9999, start: -1, throw: -1, arrive: -1000, end: whistle, res: 'RUN', key: {}
  };
}

/** Tie `k` to `to` (k held at `gap` tenths from him) from a to b, then let him go back to his own path over 8 frames */
function tie(pl: LibPlay, k: number, to: number, a: number, b: number, gap = 9) {
  const orig = pl.p.map((_, f) => at(pl, f, k));
  const side = unit(at(pl, a, to), at(pl, a, k));
  for (let f = a; f < pl.p.length; f++) {
    const held: Pt = [at(pl, Math.min(f, b), to)[0] + side[0] * gap, at(pl, Math.min(f, b), to)[1] + side[1] * gap];
    if (f <= b) put(pl, f, k, lerp(orig[f], held, ease((f - a) / 3)));
    else if (f <= b + 8) put(pl, f, k, lerp(held, orig[f], ease((f - b) / 8)));
  }
}

/** Knock `k` along `dir` by `by` tenths from frame c (over 3 frames), and keep him off his path from there on */
function knock(pl: LibPlay, k: number, c: number, dir: Pt, by: number) {
  for (let f = c; f < pl.p.length; f++) {
    const [x, y] = at(pl, f, k), t = ease((f - c) / 3);
    put(pl, f, k, [x + dir[0] * by * t, y + dir[1] * by * t]);
  }
}

/** Run `k` from where he is at a to `target(f)` by frame c, staying on it until c + stay, then back to his own path */
function chase(pl: LibPlay, k: number, a: number, c: number, target: (f: number) => Pt, stay = 6) {
  const orig = pl.p.map((_, f) => at(pl, f, k));
  for (let f = a; f < pl.p.length; f++) {
    if (f <= c) put(pl, f, k, lerp(orig[f], target(f), ease((f - a) / Math.max(1, c - a))));
    else if (f <= c + stay) put(pl, f, k, target(f));
    else if (f <= c + stay + 8) put(pl, f, k, lerp(target(c + stay), orig[f], ease((f - c - stay) / 8)));
  }
}

/** Frames past the whistle (players slowing to a stop), for a hit that comes after it */
function extend(pl: LibPlay, frames: number) {
  const n = pl.p.length, last = pl.p[n - 1], prev = pl.p[n - 2];
  for (let i = 1; i <= frames; i++) {
    const k = Math.pow(0.8, i);
    pl.p.push(last.map((v, j) => Math.round(v + (v - prev[j]) * k * i * 0.5)));
    pl.ball.push([...pl.ball[n - 1]]);
  }
}

export function stagePenalty(id: PenaltyId, base: LibPlay): Staged {
  const pl = clone(base);
  switch (id) {
    case 'FALSE_START': {
      // A lineman flinches forward before the snap; the end across from him twitches
      const p = setLineup(pl, 26, 18);
      const ol = p.roles.map((_, k) => k).filter((k) => p.roles[k][0] === 'O' && OL.includes(pos(p, k)));
      const k = ol.sort((a, b) => at(p, 0, b)[0] - at(p, 0, a)[0])[1] ?? ol[0]; // the right guard or tackle
      const across = nearest(p, 0, at(p, 0, k), 'D', DL);
      for (let f = 12; f < p.p.length; f++) {
        const [x, y] = at(p, 0, k);
        put(p, f, k, [x, y + 8 * ease((f - 12) / 3)]);
        if (across >= 0) put(p, f, across, [at(p, 0, across)[0], at(p, 0, across)[1] - 3 * ease((f - 14) / 2)]);
      }
      return { play: p, foul: { frame: 14, spot: at(p, 15, k), offender: k } };
    }
    case 'OFFSIDE': {
      // A defensive lineman jumps across the line before the snap
      const p = setLineup(pl, 26, 18);
      const ball = p.ball[0] as unknown as Pt;
      const k = nearest(p, 0, [ball[0] + 25, ball[1]], 'D', DL);
      for (let f = 11; f < p.p.length; f++) {
        const [x, y] = at(p, 0, k);
        put(p, f, k, [x, y - (y + 12) * ease((f - 11) / 4)]);
      }
      return { play: p, foul: { frame: 14, spot: at(p, 16, k), offender: k } };
    }
    case 'DELAY_OF_GAME': {
      // Everyone set, the snap never comes: the play clock runs out
      const p = setLineup(pl, 46, 42);
      const qb = p.roles.findIndex((r) => r === 'O:QB');
      return { play: p, foul: { frame: 40, spot: p.ball[0] as unknown as Pt, offender: qb, clockOut: 40 } };
    }
    case 'ILLEGAL_FORMATION': {
      // A receiver who should be on the line stands a step and a half off it: only six on the line
      const p = setLineup(pl, 28, 22);
      const wr = p.roles.map((_, k) => k).filter((k) => p.roles[k] === 'O:WR');
      const k = wr.sort((a, b) => Math.abs(at(p, 0, a)[1]) - Math.abs(at(p, 0, b)[1]))[0];
      for (let f = 0; f < p.p.length; f++) put(p, f, k, [at(p, 0, k)[0], -18]);
      return { play: p, foul: { frame: 18, spot: at(p, 0, k), offender: k } };
    }
    case 'HOLDING': {
      // A lineman grabs the man he's blocking and won't let go
      const s = pl.snap;
      let k = -1, v = -1, bd = 1e9;
      pl.roles.forEach((r, i) => {
        if (r[0] !== 'O' || !OL.includes(pos(pl, i))) return;
        const d = nearest(pl, s + 6, at(pl, s + 6, i), 'D', FRONT);
        const dd = dist(at(pl, s + 6, i), at(pl, s + 6, d));
        if (dd < bd) (bd = dd), (k = i), (v = d);
      });
      tie(pl, v, k, s + 4, s + 20);
      return { play: pl, foul: { frame: s + 12, spot: at(pl, s + 12, k), offender: k, victim: v, tether: [s + 5, s + 20] } };
    }
    case 'OFFENSIVE_PASS_INTERFERENCE': {
      // The receiver pushes off the defender to get open before the ball comes
      const k = pl.key.target!, c = pl.arrive - 6;
      const v = nearest(pl, c, at(pl, c, k), 'D');
      knock(pl, v, c, unit(at(pl, c, k), at(pl, c, v)), 20);
      return { play: pl, foul: { frame: c + 1, spot: at(pl, c, k), offender: k, victim: v, contact: c } };
    }
    case 'ILLEGAL_BLOCK': {
      // A blocker comes from behind a defender chasing the runner and shoves him in the back
      const car = pl.key.carrier!, c = Math.min(pl.start + 12, pl.end - 10);
      const v = nearest(pl, c, at(pl, c, car), 'D', undefined);
      const vdir = unit(at(pl, c - 3, v), at(pl, c, v));
      const k = nearest(pl, c - 8, at(pl, c - 8, v), 'O', ['WR', 'TE', 'RB', 'FB', 'HB'], [car]);
      chase(pl, k, c - 8, c, (f) => {
        const [x, y] = at(pl, f, v);
        return [x - vdir[0] * 8, y - vdir[1] * 8];
      }, 3);
      knock(pl, v, c, vdir, 16);
      return { play: pl, foul: { frame: c + 1, spot: at(pl, c, v), offender: k, victim: v, contact: c } };
    }
    case 'PASS_INTERFERENCE': {
      // The defender runs through the receiver before the ball gets there
      const t = pl.key.target!, c = pl.arrive - 3;
      const k = nearest(pl, c, at(pl, c, t), 'D', COVER.concat(['OLB', 'ILB', 'MLB', 'LB']));
      chase(pl, k, pl.arrive - 9, c, (f) => {
        const [x, y] = at(pl, f, t);
        return [x + 4, y + 3];
      }, 4);
      const toward = unit(at(pl, c - 2, t), at(pl, c, t));
      knock(pl, t, c, [-toward[1], toward[0]], 9); // knocked off his route
      return { play: pl, foul: { frame: c + 1, spot: at(pl, c, t), offender: k, victim: t, contact: c } };
    }
    case 'DEFENSIVE_HOLDING': {
      // A defender grabs a receiver in his route and holds him back
      const s = pl.snap;
      const wr = pl.roles.map((_, i) => i).filter((i) => pl.roles[i] === 'O:WR' && i !== pl.key.target);
      const v = wr[0] ?? pl.key.target!;
      const k = nearest(pl, s + 8, at(pl, s + 8, v), 'D', COVER);
      tie(pl, v, k, s + 6, s + 20, 8);
      return { play: pl, foul: { frame: s + 13, spot: at(pl, s + 13, v), offender: k, victim: v, tether: [s + 7, s + 20] } };
    }
    case 'FACE_MASK': {
      // The tackler grabs the runner's face mask and twists him down
      const car = pl.key.carrier!, c = pl.end - 4;
      const k = pl.key.tackler ?? nearest(pl, pl.end, at(pl, pl.end, car), 'D');
      chase(pl, k, c - 5, c, (f) => {
        const [x, y] = at(pl, f, car);
        return [x + 5, y + 4];
      }, 20);
      for (let f = c; f < pl.p.length; f++) {
        const [x, y] = at(pl, f, car), u = f - c;
        put(pl, f, car, [x + 8 * Math.sin(u * 1.1) * Math.exp(-u / 6), y]);
      }
      return { play: pl, foul: { frame: c + 1, spot: at(pl, c, car), offender: k, victim: car, contact: c } };
    }
    case 'ROUGHING_THE_PASSER': {
      // The ball is long gone when a lineman drives the quarterback into the ground
      const qb = pl.key.qb!, c = pl.throw + 9;
      const k = nearest(pl, pl.throw + 2, at(pl, pl.throw + 2, qb), 'D', FRONT);
      chase(pl, k, pl.throw + 2, c, (f) => {
        const [x, y] = at(pl, f, qb);
        return [x + 3, y + 6];
      }, 30);
      knock(pl, qb, c, [0, -1], 12);
      return { play: pl, foul: { frame: c + 1, spot: at(pl, c, qb), offender: k, victim: qb, contact: c } };
    }
    case 'PERSONAL_FOUL': {
      // The runner is already down (or out) when a defender comes in late and hits him
      const car = pl.key.carrier!, e = pl.end;
      extend(pl, 18);
      const k = nearest(pl, e, at(pl, e, car), 'D', undefined, pl.key.tackler !== undefined ? [pl.key.tackler] : []);
      const c = e + 8;
      chase(pl, k, e, c, (f) => {
        const [x, y] = at(pl, f, car);
        return [x - 4, y + 3];
      }, 12);
      knock(pl, car, c, unit(at(pl, e, k), at(pl, c, car)), 12);
      return { play: pl, foul: { frame: c + 1, spot: at(pl, c, car), offender: k, victim: car, contact: c } };
    }
  }
}

/**
 * A real play this penalty can be laid on (the game's own flags): any lineup for a foul before the snap; a pass with a
 * target for the pass fouls; a pass with time after the throw for roughing; a run for the run fouls. `seed` picks among
 * them, so the same flag looks different from one game to the next.
 */
export function pickPenaltyBase(lib: LibPlay[], id: PenaltyId, seed: string): LibPlay | null {
  const pass = (p: LibPlay) => (p.res === 'C' || p.res === 'I') && p.key.target !== undefined && p.throw >= 0 && p.arrive > p.throw + 6;
  const run = (p: LibPlay) => p.res === 'RUN' && p.key.carrier !== undefined && p.start > 0;
  const fits: Record<PenaltyId, (p: LibPlay) => boolean> = {
    FALSE_START: (p) => p.snap > 0 && (run(p) || pass(p)),
    DELAY_OF_GAME: (p) => p.snap > 0 && (run(p) || pass(p)),
    ILLEGAL_FORMATION: (p) => p.snap > 0 && p.roles.includes('O:WR'),
    OFFSIDE: (p) => p.snap > 0 && (run(p) || pass(p)),
    HOLDING: (p) => p.snap >= 0 && p.end > p.snap + 26 && (run(p) || pass(p)),
    OFFENSIVE_PASS_INTERFERENCE: pass,
    PASS_INTERFERENCE: pass,
    DEFENSIVE_HOLDING: (p) => pass(p) && p.roles.filter((r) => r === 'O:WR').length >= 2 && p.end > p.snap + 26,
    ILLEGAL_BLOCK: (p) => run(p) && p.end - p.start > 24,
    FACE_MASK: (p) => run(p) && p.key.tackler !== undefined && p.end - p.start > 8,
    ROUGHING_THE_PASSER: (p) => pass(p) && p.key.qb !== undefined && p.p.length > p.throw + 20,
    PERSONAL_FOUL: (p) => run(p) && p.end - p.start > 8
  };
  const pool = lib.filter(fits[id]);
  if (!pool.length) return null;
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return pool[h % pool.length];
}
