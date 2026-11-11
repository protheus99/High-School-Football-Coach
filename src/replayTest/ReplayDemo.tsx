// PLAYTEST ONLY: real plays run back to back, to try the order: the down and distance over the lined-up players, the
// play, then a quick banner with the result. Three reels: a drive, kicks and long balls (the ball's height), and
// turnovers (the field turning around). Opened by the web-review build with VITE_REPLAYDEMO=1, or /?replaydemo.
import React, { useEffect, useMemo, useState } from 'react';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { GameSimulationState, PlayEvent, Team } from '../types/game';
import { FieldLook, ReplayField } from './ReplayField';
import { LibPlay, loadReplayLibrary, ReplayPlan } from './replayLibrary';
import { findCues, findFlight } from './replayCues';
import { spot, tagPlay, Tags } from './clipTags';

type Kind = 'run' | 'pass' | 'incomplete' | 'sack' | 'td' | 'punt' | 'fg' | 'pick' | 'picksix' | 'kickoff';
/** What the tracking says about a kick or a pick (yards, and who) */
interface Extra {
  kickYds: number; // a punt: from the line to where it came down
  ret: number; // return yards (punt or pick)
  fgYds: number;
}
interface Step {
  id: string;
  kind: Kind;
  after: (t: Tags, yards: number, x: Extra) => string;
  /** How the defender ended it, for the result banner ("Tackled by S Gray") */
  stop?: string;
  /** Reels that aren't one drive: where each snap is */
  los?: number;
  down?: number;
  dist?: number;
}
interface Reel {
  key: 'drive' | 'kicks' | 'turnovers' | 'kickoffs';
  label: string;
  chained: boolean;
  steps: Step[];
  blurb: string[];
}
const yd = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'yd' : 'yds'}`;
const REELS: Reel[] = [
  {
    key: 'drive', label: '🏈 Drive', chained: true,
    blurb: ['1. The down and distance over the lined-up players', '2. The play', '3. A quick banner with the result while the players walk back, then the next play'],
    steps: [
      { id: 'p0584', kind: 'pass', after: (t, y) => `${t.qb} complete to ${t.target} for ${yd(y)}. Tackled by ${t.tackler}.` },
      { id: 'p0058', kind: 'run', after: (t, y) => `${t.carrier} up the middle for ${yd(y)}. Tackled by ${t.tackler}.` },
      { id: 'p0375', kind: 'run', stop: 'Pushed out', after: (t, y) => `${t.carrier} keeps it around the left end for ${yd(y)}, pushed out by ${t.tackler}.` },
      { id: 'p0131', kind: 'run', stop: 'Stopped', after: (t, y) => `${t.carrier} stopped behind the line by ${t.tackler}, a loss of ${yd(y)}.` },
      { id: 'p0567', kind: 'pass', stop: 'Pushed out', after: (t, y) => `${t.qb} deep to ${t.target} for ${yd(y)}, pushed out by ${t.tackler}.` },
      { id: 'p0519', kind: 'incomplete', stop: 'Broken up', after: (t) => `${t.qb} pass incomplete, short for ${t.target}.` },
      { id: 'p0846', kind: 'td', after: (t, y) => `${t.qb} hits ${t.target} for ${yd(y)}. Touchdown!` }
    ]
  },
  {
    key: 'kicks', label: '🦵 Kicks & deep balls', chained: false,
    blurb: ['The ball grows as it goes up and shrinks as it comes down; its shadow stays on the grass under it', '1. A deep pass', '2. A punt: the field turns when the other team catches it, then the return', '3. A field goal into the net behind the end zone'],
    steps: [
      { id: 'p0566', kind: 'pass', los: 25, down: 1, dist: 10, after: (t, y) => `${t.qb} deep to ${t.target} for ${yd(y)}. Tackled by ${t.tackler}.` },
      { id: 'p0997', kind: 'punt', los: 30, down: 4, dist: 6, after: (t, _y, x) => `${t.qb} punts ${yd(x.kickYds)}. ${t.carrier} returns it ${yd(x.ret)}.` },
      { id: 'p0991', kind: 'fg', los: 80, down: 4, dist: 4, after: (t, _y, x) => `${t.qb}'s ${x.fgYds}-yd field goal is GOOD!` }
    ]
  },
  {
    key: 'turnovers', label: '🔄 Turnovers', chained: false,
    blurb: ['When the ball changes hands (a pick, or a punt caught by the other team) the field turns around, so the new offense runs up the screen', '1. A deep pass picked off and run back', '2. A short pass picked off and run back', '3. A pick six'],
    steps: [
      { id: 'p0776', kind: 'pick', los: 41, down: 2, dist: 7, after: (t, _y, x) => `INTERCEPTED! ${t.qb} picked off by ${t.intercepter}, returned ${yd(x.ret)}. Tackled by ${t.tackler}.` },
      { id: 'p0785', kind: 'pick', los: 37, down: 3, dist: 8, after: (t, _y, x) => `INTERCEPTED! ${t.qb} picked off by ${t.intercepter}, returned ${yd(x.ret)}. Tackled by ${t.tackler}.` },
      { id: 'p0792', kind: 'picksix', los: 22, down: 3, dist: 5, after: (t, _y, x) => `INTERCEPTED! ${t.qb} picked off by ${t.intercepter}, returned ${yd(x.ret)} for a TOUCHDOWN!` }
    ]
  }
];
REELS.push({
  key: 'kickoffs', label: '🚀 Kickoffs', chained: false,
  blurb: [
    'A high school kickoff from the 40: the ball climbs, the return team catches it and the field turns around, then the return',
    '1. A kick to the goal line, returned 26 yards',
    '2. A deep kick into the end zone, run out 29 yards',
    '3. A short kick that bounces, returned 10 yards',
    '4. A touchback'
  ],
  steps: [
    { id: 'p1001', kind: 'kickoff', los: 40, down: 1, dist: 10, after: (t, _y, x) => `${t.qb} kicks off ${yd(x.kickYds)}. ${t.carrier} returns it ${yd(x.ret)}.` },
    { id: 'p1004', kind: 'kickoff', los: 40, down: 1, dist: 10, after: (t, _y, x) => `${t.qb} kicks off ${yd(x.kickYds)}. ${t.carrier} runs it out ${yd(x.ret)}.` },
    { id: 'p1005', kind: 'kickoff', los: 40, down: 1, dist: 10, after: (t, _y, x) => `${t.qb}'s short kick bounces. ${t.carrier} returns it ${yd(x.ret)}.` },
    { id: 'p1002', kind: 'kickoff', los: 40, down: 1, dist: 10, after: (t) => `${t.qb} kicks off into the end zone. Touchback.` }
  ]
});
const ORD = ['', '1st', '2nd', '3rd', '4th'];
// How long the down card stays up over the lined-up players, and the result banner after the whistle (test sliders)
const SHOW_MIN = 0.5, SHOW_MAX = 2, CARD_DEFAULT = 1, BANNER_DEFAULT = 1.5;
const LOOK_DEFAULT: FieldLook = { style: 'new', numbers: 'near', big: false, height: true, flip: true, spotting: true, marks: 'team', colors: 'school' };

interface Snap {
  play: LibPlay;
  los: number;
  down: number;
  dist: number;
  yards: number;
  next: number | null;
  extra: Extra;
  /** Points before the snap */
  home: number;
  away: number;
}

const dist2 = (f: number[], a: number, b: number) => Math.hypot(f[a * 2] - f[b * 2], f[a * 2 + 1] - f[b * 2 + 1]);
/** The player on `side` nearest to player `k` on frame `f` */
const nearest = (play: LibPlay, k: number, f: number, side: 'O' | 'D') => {
  let best = -1, bd = 1e9;
  play.roles.forEach((r, j) => {
    if (r[0] !== side || j === k) return;
    const d = dist2(play.p[f], j, k);
    if (d < bd) (bd = d), (best = j);
  });
  return best;
};

/** The real play with the people the banner needs filled in (kicks and picks don't name them all) */
function keyed(play: LibPlay, kind: Kind): { play: LibPlay; extra: Extra } {
  const end = Math.min(play.end, play.ball.length - 1);
  const extra: Extra = { kickYds: 0, ret: 0, fgYds: 0 };
  const key = { ...play.key };
  if (kind === 'punt' || kind === 'kickoff') {
    const fl = findFlight(play), cues = findCues(play);
    const land = fl ? fl.to : end;
    if (kind === 'punt') key.qb = play.roles.indexOf('O:P');
    let ret = key.carrier ?? cues.holder[Math.min(end, land + 3)];
    if (ret === undefined || ret < 0 || play.roles[ret][0] !== 'D') {
      // whoever on the return team is nearest the ball where it came down
      let bd = 1e9;
      play.roles.forEach((r, j) => {
        const d = Math.hypot(play.p[land][j * 2] - play.ball[land][0], play.p[land][j * 2 + 1] - play.ball[land][1]);
        if (r[0] === 'D' && d < bd) (bd = d), (ret = j);
      });
    }
    key.carrier = ret;
    key.tackler = key.tackler ?? nearest(play, ret, end, 'O');
    extra.kickYds = Math.round(play.ball[land][1] / 10);
    extra.ret = Math.round((play.ball[land][1] - play.ball[end][1]) / 10);
    if (kind === 'kickoff' && play.start < 0) extra.ret = 0; // nobody caught it: a touchback
  } else if (kind === 'fg') {
    key.qb = play.roles.indexOf('O:K');
  } else if (kind === 'pick' || kind === 'picksix') {
    const k = key.intercepter ?? -1;
    if (k >= 0 && kind === 'pick') key.tackler = nearest(play, k, end, 'O');
    extra.ret = Math.round((play.ball[play.arrive][1] - play.ball[end][1]) / 10);
  }
  return { play: { ...play, key }, extra };
}

export const ReplayDemo: React.FC = () => {
  const [away, home] = useMemo(() => generateDistrictTeams(), []);
  const offense: Team = home, defense: Team = away;
  const [lib, setLib] = useState<LibPlay[] | null>(null);
  const [reelKey, setReelKey] = useState<Reel['key']>('drive');
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'pre' | 'live' | 'post'>('pre');
  const [finished, setFinished] = useState(false); // the field is done with this play
  const [paused, setPaused] = useState(true);
  const [run, setRun] = useState(0); // remounts the field to start over
  const [over, setOver] = useState(false);
  const [cardSec, setCardSec] = useState(CARD_DEFAULT);
  const [bannerSec, setBannerSec] = useState(BANNER_DEFAULT);
  const [look, setLook] = useState<FieldLook>(LOOK_DEFAULT);
  const reel = REELS.find((r) => r.key === reelKey)!;

  useEffect(() => {
    loadReplayLibrary().then(setLib);
  }, []);

  // The reel's snaps: a drive chained (each snap where the last one ended), the others each from its own spot
  const snaps = useMemo<Snap[] | null>(() => {
    if (!lib) return null;
    const out: Snap[] = [];
    let los = 30, down = 1, dist = 10, hs = 0, as = 0;
    for (const s of reel.steps) {
      const raw = lib.find((p) => p.id === s.id);
      if (!raw) return null;
      const { play, extra } = keyed(raw, s.kind);
      if (!reel.chained) (los = s.los ?? 30), (down = s.down ?? 1), (dist = s.dist ?? 10);
      extra.fgYds = 100 - los + 17;
      if (s.kind === 'picksix') extra.ret = Math.round(los + play.ball[play.arrive][1] / 10);
      const td = s.kind === 'td';
      const yards = td ? 100 - los : play.yards;
      const ends = td || !reel.chained;
      out.push({ play, los, down, dist, yards, next: ends ? null : los + yards, extra, home: hs, away: as });
      if (td) hs += 6;
      if (s.kind === 'fg') hs += 3;
      if (s.kind === 'picksix') as += 6;
      if (td) break;
      if (yards >= dist) (down = 1), (dist = Math.min(10, 100 - (los + yards)));
      else (down += 1), (dist -= yards);
      los += yards;
    }
    return out;
  }, [lib, reel]);

  // The next play once the result has been read (and not while paused)
  useEffect(() => {
    if (!finished || paused || !snaps) return;
    const t = setTimeout(() => {
      if (i + 1 < snaps.length) {
        setI(i + 1);
        setPhase('pre');
        setFinished(false);
      } else setOver(true);
    }, bannerSec * 1000);
    return () => clearTimeout(t);
  }, [finished, paused, i, snaps, bannerSec]);

  const cur = snaps?.[i];
  const step = reel.steps[i];
  const built = useMemo(() => {
    if (!cur || !step) return null;
    const { play, los } = cur;
    const { names, tags } = tagPlay(play, offense, defense);
    // A touchdown is stretched a little so it crosses our goal line, not the real one
    const delta = step.kind === 'td' ? 100 - los - play.goal : 0;
    const plan: ReplayPlan = { play, los, delta, stretchFrom: play.start, mirror: false, names, offense, defense };
    const concept = step.kind === 'punt' ? 'PUNT' : step.kind === 'fg' ? 'FIELD_GOAL' : step.kind === 'kickoff' ? 'KICKOFF' : undefined;
    const turnover = step.kind === 'pick' || step.kind === 'picksix';
    const event = {
      playId: i + 1, snapTeamId: offense.id, snapYardLine: los, snapDistance: cur.dist, snapDown: cur.down, yardsGained: cur.yards, textCommentary: '', isTry: false,
      playConcept: concept, isTurnover: turnover, turnoverType: turnover ? 'INTERCEPTION' : undefined,
      scoreType: step.kind === 'td' || step.kind === 'picksix' ? 'TOUCHDOWN' : step.kind === 'fg' ? 'FIELD_GOAL' : undefined,
      isScore: step.kind === 'td' || step.kind === 'picksix' || step.kind === 'fg'
    } as unknown as PlayEvent;
    const board = {
      gameId: 'demo', homeTeam: home, awayTeam: away, homeScore: cur.home, awayScore: cur.away, yardLine: los, distance: cur.dist, down: cur.down,
      possessionTeamId: offense.id, currentQuarter: 2, clockSecondsRemaining: 0, eventLog: []
    } as unknown as GameSimulationState;
    return { plan, event, board, tags };
  }, [cur, step, i, offense, defense, home, away]);

  const restart = (play = true) => {
    setI(0);
    setPhase('pre');
    setFinished(false);
    setOver(false);
    setPaused(!play);
    setRun((r) => r + 1);
  };
  const chooseReel = (k: Reel['key']) => {
    setReelKey(k);
    restart(false);
  };
  // A new look starts the current play over (from its down card)
  const setLookPart = (part: Partial<FieldLook>) => {
    setLook((l) => ({ ...l, ...part }));
    setPhase('pre');
    setFinished(false);
  };

  if (!built || !cur || !snaps || !step) return <div style={{ padding: 16, font: '600 14px system-ui, sans-serif', color: '#64748B' }}>Loading the plays…</div>;
  const scoredNow = phase === 'post';
  const homeScore = cur.home + (scoredNow ? (step.kind === 'td' ? 6 : step.kind === 'fg' ? 3 : 0) : 0);
  const awayScore = cur.away + (scoredNow && step.kind === 'picksix' ? 6 : 0);

  // "on the Westlake 25", "on the Lake Travis 21", "at midfield"
  const where = (los: number) =>
    Math.round(los) === 50 ? 'at midfield' : los < 50 ? `on the ${offense.name} ${Math.round(los)}` : `on the ${defense.name} ${Math.round(100 - los)}`;
  const situation = (down: number, dist: number, los: number) => `${ORD[down]} & ${los + dist >= 100 ? 'Goal' : dist}`;

  // The result banner: what happened and who did it ("3-yard gain by RB Castillo"), the defender who ended it, then
  // "First Down!", "Touchdown!", "It's good!" or "Turnover!"
  const result = (() => {
    const y = cur.yards, t = built.tags, x = cur.extra;
    const who = step.kind === 'run' ? t.carrier : t.target || t.carrier;
    const gain = `${Math.abs(y)}-yard gain by ${who}`;
    const by = t.tackler ? `${step.stop ?? 'Tackled'} by ${t.tackler}` : ''; // the defender who made the play
    const gold = { bg: '#FACC15', fg: '#0F172A', edge: '#A16207' }, red = { bg: '#DC2626', fg: '#FFFFFF', edge: '#991B1B' };
    if (step.kind === 'td') return { line: gain, by: '', call: 'TOUCHDOWN!', ...gold };
    if (step.kind === 'fg') return { line: `${x.fgYds}-yard field goal by ${t.qb}`, by: '', call: "IT'S GOOD!", ...gold };
    if (step.kind === 'kickoff')
      return x.ret > 0
        ? { line: `${x.kickYds}-yard kickoff by ${t.qb}`, by: `Returned ${x.ret} yards by ${t.carrier}`, call: '', bg: '#4F46E5', fg: '#FFFFFF', edge: '#312E81' }
        : { line: `Kickoff by ${t.qb}`, by: 'Into the end zone', call: 'TOUCHBACK', bg: '#4F46E5', fg: '#FFFFFF', edge: '#312E81' };
    if (step.kind === 'punt')
      return { line: `${x.kickYds}-yard punt by ${t.qb}`, by: x.ret > 0 ? `Returned ${x.ret} yards by ${t.carrier}` : `Fair catch by ${t.carrier}`, call: '', bg: '#4F46E5', fg: '#FFFFFF', edge: '#312E81' };
    if (step.kind === 'pick') return { line: `Picked off by ${t.intercepter}`, by: `${x.ret}-yard return, tackled by ${t.tackler}`, call: 'TURNOVER!', ...red };
    if (step.kind === 'picksix') return { line: `Picked off by ${t.intercepter}`, by: `${x.ret}-yard return`, call: 'PICK SIX!', ...red };
    if (step.kind === 'incomplete') return { line: `Incomplete, intended for ${t.target}`, by, call: '', bg: '#475569', fg: '#FFFFFF', edge: '#1E293B' };
    if (step.kind === 'sack') return { line: `${Math.abs(y)}-yard sack by ${t.sacker}`, by: '', call: '', ...red };
    if (y < 0) return { line: `${Math.abs(y)}-yard loss by ${who}`, by, call: '', ...red };
    if (y >= cur.dist) return { line: gain, by, call: 'FIRST DOWN!', bg: '#2563EB', fg: '#FFFFFF', edge: '#1E3A8A' };
    return { line: y === 0 ? `No gain by ${who}` : gain, by, call: '', bg: '#16A34A', fg: '#FFFFFF', edge: '#14532D' };
  })();

  const overlay = (
    <>
      {/* Before the snap: the down and distance, above the lined-up players (deep grass is nearly always empty) */}
      <div className={`rd-layer ${phase === 'pre' ? 'rd-on' : ''}`} style={{ alignItems: 'flex-start', justifyContent: 'center', padding: 10 }}>
        <div key={`pre-${run}-${i}`} className="rd-pop" style={{ background: 'rgba(15,23,42,.9)', border: '2px solid #FACC15', borderRadius: 14, padding: '10px 22px 12px', textAlign: 'center', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
          <div style={{ color: '#FACC15', font: '900 30px system-ui, sans-serif', letterSpacing: '.01em', lineHeight: 1.1 }}>{step.kind === 'kickoff' ? 'Kickoff' : situation(cur.down, cur.dist, cur.los)}</div>
          <div style={{ color: '#FFFFFF', font: '700 15px system-ui, sans-serif', marginTop: 4 }}>{step.kind === 'kickoff' ? `${offense.name} kicks from the 40` : where(cur.los)}</div>
        </div>
      </div>
      {/* After the whistle: the result */}
      <div className={`rd-layer ${phase === 'post' ? 'rd-on' : ''}`} style={{ alignItems: 'flex-start', justifyContent: 'center', padding: 10 }}>
        {phase === 'post' && (
          <div key={`post-${run}-${i}`} className="rd-drop" style={{ width: '100%', background: result.bg, borderRadius: 12, border: `2px solid ${result.edge}`, boxShadow: `0 4px 0 ${result.edge}, 0 10px 22px rgba(0,0,0,.3)`, padding: '9px 14px 10px', textAlign: 'center' }}>
            <div style={{ color: result.fg, font: `800 ${result.call ? 16 : 19}px system-ui, sans-serif`, lineHeight: 1.2 }}>{result.line}</div>
            {result.by && <div style={{ color: result.fg, opacity: 0.9, font: '700 13.5px system-ui, sans-serif', marginTop: 2 }}>{result.by}</div>}
            {result.call && <div style={{ color: result.fg, font: '900 25px system-ui, sans-serif', letterSpacing: '.02em', lineHeight: 1.1, marginTop: 2 }}>{result.call}</div>}
          </div>
        )}
      </div>
    </>
  );

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, boxShadow: '0 2px 10px rgba(15,23,42,.12)', border: '1px solid #E2E8F0' };
  const btn = (bg: string, edge: string): React.CSSProperties => ({
    font: '800 15px system-ui, sans-serif', color: '#fff', background: bg, border: `2px solid ${edge}`, borderRadius: 10, padding: '11px 14px',
    boxShadow: `0 3px 0 ${edge}`, cursor: 'pointer', flex: 1
  });
  const seg = (on: boolean, off?: boolean): React.CSSProperties => ({
    font: '800 12.5px system-ui, sans-serif', padding: '7px 8px', borderRadius: 8, cursor: off ? 'default' : 'pointer', flex: 1, opacity: off ? 0.45 : 1,
    border: `2px solid ${on ? '#15803D' : '#CBD5E1'}`, background: on ? '#16A34A' : '#F8FAFC', color: on ? '#fff' : '#334155', boxShadow: on ? '0 2px 0 #15803D' : 'none'
  });
  const side = (t: Team, score: number, align: 'left' | 'right') => (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {t.name}{t === offense ? ' 🏈' : ''}
      </div>
      <div style={{ fontSize: 34, fontWeight: 900, color: t.primaryColor, lineHeight: 1.1 }}>{score}</div>
    </div>
  );
  const toggles: [string, keyof FieldLook, [string, string | boolean][], boolean?][] = [
    ['Field', 'style', [['Before', 'now'], ['New', 'new']]],
    ['Yard numbers', 'numbers', [['Near the sideline', 'near'], ['Real spot', 'real']], look.style === 'now'],
    ['Players', 'big', [['As now', false], ['20% bigger', true]]],
    ['Ball height', 'height', [['Off', false], ['On', true]]],
    ['Field turns when the ball changes hands', 'flip', [['Off', false], ['On', true]]],
    ['Officials spot the ball', 'spotting', [['Off', false], ['On', true]]],
    ['Player marks', 'marks', [['O offense, X defense', 'side'], ['Each school keeps its own', 'team']]],
    ['Mark colors', 'colors', [['White', 'plain'], ['School colors', 'school']]]
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', display: 'flex', justifyContent: 'center' }}>
      <style>{`
        .rd-layer { position: absolute; inset: 0; display: flex; pointer-events: none; opacity: 0; transition: opacity .25s ease; box-sizing: border-box }
        .rd-layer.rd-on { opacity: 1 }
        .rd-pop { animation: rd-pop .35s cubic-bezier(.2,1.4,.4,1) both }
        .rd-drop { animation: rd-drop .4s cubic-bezier(.2,1.3,.4,1) both }
        @keyframes rd-pop { from { transform: scale(.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes rd-drop { from { transform: translateY(-24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .rd-pop, .rd-drop { animation: none } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '12px 16px 24px', font: '14px system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ background: '#0F172A', color: '#FACC15', fontWeight: 900, fontSize: 12, letterSpacing: '.06em', padding: '5px 9px', borderRadius: 7 }}>REPLAY TEST</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>Snap to result</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {REELS.map((r) => (
            <button key={r.key} type="button" onClick={() => chooseReel(r.key)}
              style={{ ...seg(r.key === reelKey), font: '800 12.5px system-ui, sans-serif', padding: '9px 6px', background: r.key === reelKey ? '#0F172A' : '#FFFFFF', color: r.key === reelKey ? '#FACC15' : '#0F172A', border: `2px solid ${r.key === reelKey ? '#0F172A' : '#CBD5E1'}`, boxShadow: r.key === reelKey ? '0 3px 0 #FACC15' : '0 2px 6px rgba(15,23,42,.08)' }}>
              {r.label}
            </button>
          ))}
        </div>
        <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', padding: '10px 14px', marginBottom: 10 }}>
          {side(away, awayScore, 'left')}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, color: '#B45309' }}>Play {i + 1} of {snaps.length}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{situation(cur.down, cur.dist, cur.los)}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{spot(cur.los)}</div>
          </div>
          {side(home, homeScore, 'right')}
        </div>
        {/* The field, edge to edge on a phone */}
        <div style={{ margin: '0 -16px' }}>
        <ReplayField
          bare
          key={`${reelKey}-${run}-${JSON.stringify(look)}`}
          event={built.event}
          board={built.board}
          clip={built.plan}
          walkBack
          officials
          oTeamId={home.id}
          holdMs={cardSec * 1000}
          overlay={overlay}
          next={cur.next}
          paused={paused}
          look={look}
          onStart={() => setPhase('live')}
          onWhistle={() => {
            setPhase('post');
            setFinished(true);
          }}
          onDone={() => undefined}
          caption={null}
        />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {over ? (
            <button type="button" style={btn('#16A34A', '#15803D')} onClick={() => restart()}>↺ Run it again</button>
          ) : (
            <>
              <button type="button" style={paused ? btn('#16A34A', '#15803D') : btn('#F59E0B', '#B45309')} onClick={() => setPaused(!paused)}>
                {paused ? (i === 0 && phase === 'pre' ? '▶ Play' : '▶ Resume') : '⏸ Pause'}
              </button>
              <button type="button" style={btn('#2563EB', '#1D4ED8')} onClick={() => restart()}>↺ Restart</button>
            </>
          )}
        </div>
        <div style={{ ...card, padding: 12, marginBottom: 10, borderLeft: '4px solid #16A34A' }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#475569', marginBottom: 2 }}>THE FIELD</div>
          {toggles.map(([label, k, opts, off]) => (
            <div key={k} style={{ marginTop: 9 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: off ? '#94A3B8' : '#0F172A', marginBottom: 4 }}>{label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {opts.map(([l, v]) => (
                  <button key={l} type="button" disabled={off} style={seg(look[k] === v, off)} onClick={() => setLookPart({ [k]: v } as Partial<FieldLook>)}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: 12, marginBottom: 10, borderLeft: '4px solid #FACC15' }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#475569', marginBottom: 4 }}>HOW LONG EACH ONE SHOWS</div>
          {([['🟨 Down card', cardSec, setCardSec], ['🟩 Result banner', bannerSec, setBannerSec]] as const).map(([label, v, set]) => (
            <label key={label} style={{ display: 'block', marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
                <span>{label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#15803D' }}>{v.toFixed(1)} s</span>
              </div>
              <input
                type="range" min={SHOW_MIN} max={SHOW_MAX} step={0.1} value={v} aria-label={`${label} time in seconds`}
                onChange={(e) => set(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#16A34A', marginTop: 4 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8' }}>
                <span>Faster · {SHOW_MIN} s</span>
                <span>{SHOW_MAX} s · Slower</span>
              </div>
            </label>
          ))}
        </div>
        <div style={{ ...card, padding: 12, fontSize: 13, color: '#475569', lineHeight: 1.45 }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#475569', marginBottom: 6 }}>THIS TEST</div>
          {reel.blurb.map((b) => <div key={b}>{b}</div>)}
        </div>
      </div>
    </div>
  );
};
