// The match field's plays: real tracking plays matched to each simulated snap.
// The library is kept out of the public repo. The live game loads it from the music Worker (R2, see music-worker/);
// the dev server and local builds read replay-data/library.json (git-ignored). Without it the field still works:
// each snap shows where it ended.
import { PlayEvent, Team } from '../types/game';

export interface LibPlay {
  id: string;
  kind: string; // INSIDE_RUN, OUTSIDE_RUN, SHORT_PASS, DEEP_PASS, PUNT, PAT_KICK, FIELD_GOAL, KICKOFF
  res: string; // RUN, C, I, IN, S, PUNT, PAT_KICK, FIELD_GOAL
  yards: number;
  goal: number; // yards to the goal line at the snap
  td: boolean;
  fumble: boolean;
  qb: boolean;
  roles: string[]; // 'O:WR', 'D:CB' ... one per player
  key: { qb?: number; carrier?: number; target?: number; tackler?: number; intercepter?: number; sacker?: number };
  snap: number;
  start: number; // the hand-off or catch (-1 if none)
  end: number; // the whistle
  throw: number;
  arrive: number;
  p: number[][]; // per frame: x0,y0,x1,y1... in tenths of a yard (x from the offense's left sideline, y past the line)
  ball: number[][];
}

// (an empty VITE_PLAYS_URL, as the local playtest builds set, reads the local copy)
const PLAYS_HOST: string = import.meta.env.VITE_PLAYS_URL ?? (import.meta.env.PROD ? 'https://hsfhc-music.protheus99.workers.dev' : '');
const PLAYS_URL = PLAYS_HOST ? `${PLAYS_HOST}/plays/library.json` : `${import.meta.env.BASE_URL}replay-data/library.json`;

let cache: Promise<LibPlay[]> | null = null;
export const loadReplayLibrary = () =>
  (cache ??= fetch(PLAYS_URL)
    .then((r) => (r.ok ? r.json() : { plays: [] }))
    .then((d) => (Array.isArray(d?.plays) ? (d.plays as LibPlay[]) : []))
    // (no library in this build: the site answers with its own page, which isn't JSON)
    .catch(() => [] as LibPlay[])
    .catch(() => []));

export interface ReplayPlan {
  play: LibPlay;
  los: number; // the simulator's line of scrimmage (yards from the offense's goal)
  delta: number; // yards the play is stretched by after the hand-off or catch, so it ends on the simulator's spot
  stretchFrom: number;
  mirror: boolean;
  names: Record<number, string>; // player index -> "QB Rogers"
  offense: Team;
  defense: Team;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

// How deep and how far back each real play's players go between the snap and the whistle (yards past the line)
const reach = new WeakMap<LibPlay, [number, number]>();
const reachOf = (p: LibPlay) => {
  let r = reach.get(p);
  if (!r) {
    let lo = 0, hi = 0;
    for (let f = Math.max(0, p.snap); f <= Math.min(p.end, p.p.length - 1); f++)
      for (let k = 1; k < p.p[f].length; k += 2) {
        lo = Math.min(lo, p.p[f][k] / 10);
        hi = Math.max(hi, p.p[f][k] / 10);
      }
    reach.set(p, (r = [lo, hi]));
  }
  return r;
};
/** Yards some player would run past an end line if this real play were snapped at `los` (0: it fits the field). */
export const outOfField = (p: LibPlay, los: number, delta: number) => {
  const [lo, hi] = reachOf(p);
  return Math.max(0, los + hi + Math.max(0, delta) - 110) + Math.max(0, -10 - (los + lo + Math.min(0, delta)));
};

/** The snap was a sack (the quarterback brought down behind the line while passing) */
export const isSack = (e: PlayEvent) => !!e.sackerPlayerId || /^SACKED!/.test(e.textCommentary ?? '');

/** The closest real play to a simulated snap: same kind of play and result, closest yards and room to the goal line. */
export function planReplay(lib: LibPlay[], event: PlayEvent, home: Team, away: Team, used: Set<string>): ReplayPlan | null {
  if (!lib.length || event.penalty) return null;
  const offense = event.snapTeamId === home.id ? home : away;
  const defense = offense === home ? away : home;
  const los = event.snapYardLine ?? 25;
  const goal = 100 - los;
  const text = event.textCommentary.toLowerCase();
  const c = event.playConcept;
  const td = event.scoreType === 'TOUCHDOWN' || event.scoreType === 'TWO_POINT';
  const yards = event.yardsGained ?? 0;
  const carrierIsQb = /^(?:TACKLED FOR LOSS! )?QB /.test(event.textCommentary);

  let pool: LibPlay[];
  if (c === 'PUNT' || c === 'PAT_KICK' || c === 'FIELD_GOAL') pool = lib.filter((p) => p.kind === c);
  // A kickoff: a touchback (nobody catches it) or a return, ending where the game spotted the ball
  else if ((c as string) === 'KICKOFF') {
    const tb = /touchback/i.test(text);
    pool = lib.filter((p) => p.kind === 'KICKOFF' && (tb ? p.start < 0 : p.start >= 0));
    if (!pool.length) pool = lib.filter((p) => p.kind === 'KICKOFF');
  }
  // A sack: the quarterback dropped while passing (the game says so in its line; it doesn't fill in the sacker's id).
  // A run stopped behind the line is a run (a tackle for loss), never a sack
  else if (isSack(event)) pool = lib.filter((p) => p.res === 'S');
  else if (c === 'INSIDE_RUN' || c === 'OUTSIDE_RUN') {
    const qb = carrierIsQb;
    pool = lib.filter((p) => p.res === 'RUN' && p.td === td && p.fumble === (event.turnoverType === 'FUMBLE'));
    const sameKind = pool.filter((p) => p.kind === c);
    if (sameKind.length) pool = sameKind;
    if (qb && pool.some((p) => p.qb)) pool = pool.filter((p) => p.qb);
  } else {
    const res = event.turnoverType === 'INTERCEPTION' ? 'IN' : text.includes('incomplete') || (c === 'TWO_POINT_TRY' && !td) ? 'I' : 'C';
    pool = lib.filter((p) => (p.res === res || (c === 'TWO_POINT_TRY' && td && p.res === 'RUN')) && p.td === (res === 'C' || p.res === 'RUN' ? td : false));
    // Same pass type (short or deep) when one comes close; otherwise any pass with the right yards
    const sameKind = pool.filter((p) => p.kind === c);
    const close = sameKind.some((p) => (p.td ? Math.abs(p.goal - goal) <= 8 : Math.abs(p.yards - yards) <= 7));
    if (sameKind.length && res !== 'IN' && close) pool = sameKind;
  }
  if (!pool.length) pool = lib.filter((p) => p.res === 'RUN');
  // Stretch after the hand-off or catch so the ball ends on the simulator's spot (never an incompletion or a pick)
  const stretchOf = (p: LibPlay) => {
    const endBall = p.ball[Math.min(p.end, p.ball.length - 1)][1] / 10;
    const from = p.res === 'S' ? p.snap : p.start;
    if (from < 0 || !(p.res === 'RUN' || p.res === 'C' || p.res === 'S' || p.res === 'KICKOFF')) return { from, delta: 0 };
    const target = td ? goal + Math.max(1, endBall - p.goal) : yards;
    const cap = td ? 12 : p.res === 'KICKOFF' ? 15 : 6; // a touchdown always ends in the end zone
    return { from, delta: Math.max(-cap, Math.min(cap, target - endBall)) };
  };
  const cost = (p: LibPlay) => {
    const out = outOfField(p, los, stretchOf(p).delta) * 25; // every player stays between the end lines
    if ((c as string) === 'KICKOFF') return Math.abs(p.ball[Math.min(p.end, p.ball.length - 1)][1] / 10 - yards) * 2 + out;
    if (c === 'PUNT' || c === 'PAT_KICK' || c === 'FIELD_GOAL') return out;
    if (p.td) return Math.abs(p.goal - goal) * 2 + out;
    const crosses = p.yards >= goal ? 50 : 0; // a real gain that would cross our goal line can't be used
    return Math.abs(p.yards - yards) * 3 + crosses + Math.abs(p.goal - goal) * 0.05 + out;
  };
  const fresh = pool.filter((p) => !used.has(p.id));
  const ranked = (fresh.length ? fresh : pool).map((p) => ({ p, c: cost(p) })).sort((a, b) => a.c - b.c);
  const best = ranked.filter((r) => r.c <= ranked[0].c + 1.5).slice(0, 6); // a little variety among near-equal matches
  const play = best[hash(`${event.playId}`) % best.length].p;
  used.add(play.id);
  const { from: stretchFrom, delta } = stretchOf(play);
  // The simulator's named players come from its play-by-play line ("QB Rogers complete to WR Hill ... Tackled by CB Reed")
  const NAME = "((?:QB|RB|FB|WR|TE|K|P|DE|DT|NT|LB|OLB|ILB|MLB|CB|S|SS|FS|DB) [A-Z][A-Za-z'\\-]+(?: (?:Jr\\.|II|III|IV))?)";
  const grab = (...pats: string[]) => {
    for (const pat of pats) {
      const m = event.textCommentary.match(new RegExp(pat.replace('NAME', NAME)));
      if (m) return m[1];
    }
    return undefined;
  };
  const names: Record<number, string> = {};
  const put = (idx: number | undefined, name?: string) => {
    if (idx !== undefined && name) names[idx] = name;
  };
  put(play.key.qb, grab('^NAME kicks off', '^NAME (?:pass|complete)', 'INTERCEPTED! NAME', '(?:drags down|sacks) NAME', 'down NAME'));
  put(play.key.carrier, grab('NAME returns it', 'NAME rushes', 'TACKLED FOR LOSS! NAME', 'FUMBLE! NAME'));
  put(play.key.target, grab('(?:complete to|intended for) NAME'));
  put(play.key.tackler, grab('Tackled by NAME', 'behind the line by NAME'));
  put(play.key.intercepter, grab('picked off by NAME'));
  put(play.key.sacker, grab('SACKED! NAME'));
  return { play, los, delta, stretchFrom, mirror: hash(`${event.playId}m`) % 2 === 1, names, offense, defense };
}

/**
 * A snap worth the full animation when the coach only wants the big moments: a touchdown or a safety, a pick, a fumble
 * or any other turnover (a muffed punt, a stop on 4th down), a sack, a run or catch of 15+ yards, and a 4th down the
 * offense goes for. Routine kicks are not: punts, field goals and extra points just show where they ended.
 */
export const isBigPlay = (e: PlayEvent) => {
  const kick = e.isTry || ['PUNT', 'FIELD_GOAL', 'PAT_KICK', 'KICKOFF'].includes(e.playConcept ?? '');
  if (kick) return e.isTurnover; // a muffed punt
  return !!(e.scoreType === 'TOUCHDOWN' || e.scoreType === 'SAFETY' || e.isTurnover || Math.abs(e.yardsGained ?? 0) >= 15 || isSack(e) || e.snapDown === 4);
};
