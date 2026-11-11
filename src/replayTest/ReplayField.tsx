// PLAYTEST ONLY: the live match field as a coach's diagram, each snap acted out by a matched real play.
import React, { useEffect, useRef, useState } from 'react';
import { GameSimulationState, PlayEvent, Team } from '../types/game';
import { markColors } from './markColors';
import { isBigPlay, LibPlay, loadReplayLibrary, planReplay, ReplayPlan } from './replayLibrary';
import { CueKind, findCues, findFlight, paceAt } from './replayCues';
import { FoulFx, pickPenaltyBase, stagePenalty } from './replayPenalty';
import { PenaltyId } from '../sim/penalties';
import { InjuryFx, stageInjury } from './replayInjury';
import { PenaltyFlagShape } from '../components/ui/PenaltyFlag';
import { renderToStaticMarkup } from 'react-dom/server';
import { addWalkBack, Pt } from './replayFlow';

// Action cues (add ?nocues to the address to compare without them)
const CUES = typeof window === 'undefined' || !window.location.search.includes('nocues');
const LOOK: Record<CueKind, { text: string; bg: string; fg: string; edge: string; shape: 'ring' | 'shock' | 'puff'; life: number }> = {
  snap: { text: '', bg: '#FFFFFF', fg: '', edge: '', shape: 'ring', life: 7 },
  handoff: { text: '', bg: '#FACC15', fg: '', edge: '', shape: 'ring', life: 8 },
  throw: { text: 'PASS', bg: '#2563EB', fg: '#FFFFFF', edge: '#FFFFFF', shape: 'ring', life: 10 },
  catch: { text: 'CAUGHT!', bg: '#FACC15', fg: '#0F172A', edge: '#0F172A', shape: 'ring', life: 14 },
  incomplete: { text: 'INCOMPLETE', bg: '#475569', fg: '#FFFFFF', edge: '#E2E8F0', shape: 'puff', life: 16 },
  pick: { text: 'PICKED OFF!', bg: '#DC2626', fg: '#FFFFFF', edge: '#FFFFFF', shape: 'ring', life: 16 },
  miss: { text: 'MISSED!', bg: '#7C3AED', fg: '#FFFFFF', edge: '#FFFFFF', shape: 'puff', life: 12 },
  hit: { text: 'Tackle', bg: '#0F172A', fg: '#FFFFFF', edge: '#F97316', shape: 'shock', life: 14 },
  sack: { text: 'Sack', bg: '#0F172A', fg: '#FFFFFF', edge: '#EF4444', shape: 'shock', life: 16 }
};

/** Test switches for the field's look and effects */
export interface FieldLook {
  /** 'now': the field as it was; 'new': real-field markings, team sidelines, goalposts, the chains */
  style: 'now' | 'new';
  /** Where the yard numbers sit (new field): just inside the sideline, or where a real field paints them (7 to 9 yd in) */
  numbers: 'near' | 'real';
  /** Players drawn 20% bigger */
  big: boolean;
  /** The ball grows as it goes up (kicks and passes) */
  height: boolean;
  /** On an interception the field turns around, so the defense now runs up the screen */
  flip: boolean;
  /** Officials spot the ball after the whistle: the wing officials square off at the spot, the nearer one runs in to
   * hold it, the umpire carries the ball to the next spot */
  spotting?: boolean;
  /** 'side': O's on offense, X's on defense (whoever has the ball); 'team': each school keeps its own mark all game */
  marks?: 'side' | 'team';
  /** 'plain': white marks with a colored edge; 'school': each school's main color with its second color as the edge */
  colors?: 'plain' | 'school';
}
const FIELD_NOW: FieldLook = { style: 'now', numbers: 'near', big: false, height: false, flip: false };

const W = 53.33, CX = W / 2, VH0 = 36, NS = 'http://www.w3.org/2000/svg';
const FLIP_MS = 1000; // the field turns around in one second, real time
const FLAG_CALL_MS = 3900; // a flag in the game: FLAG, then the call, then the next snap
const INJURY_OFF_MS = 1600; // an injury: he's off the field, a beat, then the next snap
/** A flag or an injury staged by the field itself (from the game's play), instead of passed in */
interface DrawExtra {
  foul?: FoulFx;
  walkOff?: { los: number; gain: number; down: number; at: number };
  injury?: InjuryFx;
}
const OL = new Set(['T', 'G', 'C', 'OT', 'OG']);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// Real positions up to the knee; past it, eased so nobody runs off the drawn grass (at most `room` yards further)
const onGrass = (v: number, lo: number, hi: number, room: number) =>
  v > hi ? hi + room * (1 - Math.exp(-(v - hi) / room)) : v < lo ? lo - room * (1 - Math.exp(-(lo - v) / room)) : v;
const el = (t: string, a: Record<string, string | number> = {}, p?: Element) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, String(a[k]));
  if (p) p.appendChild(e);
  return e;
};
// The sideline crowd's motion (CSS, so it keeps going between plays and while paused; px here are yards)
const SIDELINE_CSS = `
  .sl-idle { animation: sl-idle 3.6s ease-in-out infinite }
  @keyframes sl-idle { 0%, 100% { transform: translate(0, 0) } 30% { transform: translate(.12px, -.2px) } 65% { transform: translate(-.1px, .14px) } }
  .sl-walk { animation: sl-idle 1.6s ease-in-out infinite }
  .sl-hype .sl-idle, .sl-hype.sl-coach .sl-walk { animation: sl-hop .5s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
  .sl-hype.sl-coach .sl-walk { animation-duration: .6s }
  @keyframes sl-hop { 0%, 100% { transform: scale(1) translate(0, 0) } 40% { transform: scale(1.5) translate(0, -.15px) } }
  @media (prefers-reduced-motion: reduce) { .sl-idle, .sl-walk, .sl-hype .sl-idle { animation: none } }
`;
const LIMIT = 1.3; // the coaches' strip: from the sideline out to the limit line (yards)

// Cheerleaders: each one runs her own random moves (a jump, a spin, shaking the pom-poms, a high V, a kick, walking to
// a new spot), a new one every half second or so; every few seconds the squad does something together (a cheer in
// unison, a wave of jumps down the line, a lift with one of them held up high, or everyone moving to new spots).
// After a big play for their team they go wild: jumps and spins, nonstop.
type CheerMove = 'idle' | 'jump' | 'shake' | 'spin' | 'spread' | 'walk' | 'kick' | 'lift';
interface Cheer { g: Element; pa: Element; pb: Element; d: number; y: number; fd: number; fy: number; td: number; ty: number; move: CheerMove; t0: number; dur: number }
interface Squad { sgn: number; d0: number; d1: number; y0: number; y1: number; members: Cheer[]; nextRoutine: number }
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);
const MOVE_MS: Record<CheerMove, [number, number]> = {
  idle: [200, 600], jump: [420, 600], shake: [500, 900], spin: [480, 700], spread: [600, 900], walk: [700, 1300], kick: [500, 800], lift: [1700, 2100]
};
function startMove(sq: Squad, m: Cheer, move: CheerMove, now: number, delay = 0, fast = false) {
  const [a, b] = MOVE_MS[move];
  m.move = move;
  m.t0 = now + delay;
  m.dur = between(a, b) * (fast ? 0.7 : 1);
  m.fd = m.d;
  m.fy = m.y;
  if (move === 'walk') {
    m.td = between(sq.d0, sq.d1);
    m.ty = clamp(m.y + between(-3, 3), sq.y0 + 0.4, sq.y1 - 0.4);
  }
}
function cheerTick(sq: Squad, now: number, hype: boolean) {
  const M = sq.members;
  // Together now and then
  if (now >= sq.nextRoutine) {
    const r = hype ? pickOne(['wave', 'together', 'together']) : pickOne(['together', 'wave', 'lift', 'scatter', 'together']);
    if (r === 'together') {
      const mv = hype ? pickOne<CheerMove>(['jump', 'spin', 'jump']) : pickOne<CheerMove>(['jump', 'spin', 'shake', 'spread', 'kick']);
      for (const m of M) startMove(sq, m, mv, now, 0, hype);
      const dur = M[0].dur;
      for (const m of M) m.dur = dur; // in unison
    } else if (r === 'wave') for (const [i, m] of M.entries()) startMove(sq, m, 'jump', now, i * 110, hype);
    else if (r === 'scatter') for (const m of M) startMove(sq, m, 'walk', now, between(0, 250));
    else {
      // The lift: the others gather round one of them, who goes up high and comes down
      const c = Math.floor(Math.random() * M.length);
      M.forEach((m, i) => {
        if (i === c) return startMove(sq, m, 'lift', now, 350);
        startMove(sq, m, 'walk', now);
        const a = (i / M.length) * Math.PI * 2;
        m.td = clamp(M[c].d + Math.cos(a) * 0.65, sq.d0, sq.d1);
        m.ty = M[c].y + Math.sin(a) * 0.65;
        m.dur = 450;
      });
    }
    sq.nextRoutine = now + (hype ? between(700, 1200) : between(3500, 7000));
  }
  for (const m of M) {
    if (now >= m.t0 + m.dur) {
      if (m.move === 'walk') (m.d = m.td), (m.y = m.ty);
      // Her own next move (a short pause now and then)
      const mv = hype ? pickOne<CheerMove>(['jump', 'jump', 'spin', 'shake']) : Math.random() < 0.25 ? 'idle' : pickOne<CheerMove>(['jump', 'shake', 'spin', 'spread', 'walk', 'kick', 'walk']);
      startMove(sq, m, mv, now, 0, hype);
    }
    const t = clamp((now - m.t0) / m.dur, 0, 1), started = now >= m.t0;
    let sc = 1, rot = 0, spread = 0.5, pa = 0, pb = 0, side = 0, d = m.d, y = m.y;
    const bob = 0.12 * Math.sin(now / 160 + m.fy);
    switch (started ? m.move : 'idle') {
      case 'jump':
        sc = 1 + 0.45 * Math.sin(Math.PI * t);
        spread = 0.5 + 0.3 * Math.sin(Math.PI * t);
        break;
      case 'shake':
        pa = 0.4 * Math.sin((now - m.t0) / 35);
        pb = -pa;
        break;
      case 'spin':
        rot = 360 * ease(t);
        spread = 0.65;
        break;
      case 'spread':
        spread = 0.5 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.6));
        break;
      case 'kick':
        side = 0.3 * Math.sin(t * Math.PI * 4);
        pa = pb = bob;
        break;
      case 'walk':
        d = m.fd + (m.td - m.fd) * ease(t);
        y = m.fy + (m.ty - m.fy) * ease(t);
        pa = bob;
        pb = -bob;
        break;
      case 'lift': {
        const up = t < 0.25 ? ease(t / 0.25) : t > 0.75 ? ease((1 - t) / 0.25) : 1;
        sc = 1 + 0.8 * up;
        spread = 0.5 + 0.35 * up;
        break;
      }
      default:
        pa = bob;
        pb = -bob;
    }
    const x = sq.sgn < 0 ? -d : W + d;
    m.g.setAttribute('transform', `translate(${x.toFixed(2)} ${(-(y + side)).toFixed(2)}) rotate(${rot.toFixed(0)}) scale(${sc.toFixed(2)})`);
    m.pa.setAttribute('cx', (-spread).toFixed(2));
    m.pa.setAttribute('cy', pa.toFixed(2));
    m.pb.setAttribute('cx', spread.toFixed(2));
    m.pb.setAttribute('cy', pb.toFixed(2));
  }
}
const nice = (c?: string) => (c && c.toUpperCase() !== '#FFFFFF' ? c : '#334155');
// A team color darkened toward navy (the sideline bands)
const deepen = (hex: string, t: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#1E293B';
  const v = parseInt(m[1], 16), to = [15, 23, 42];
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x, i) => Math.round(x + (to[i] - x) * t));
  return `rgb(${c.join(',')})`;
};
/**
 * The home school's name in both end zones, kept inside the end zone: a long name gets a smaller size, then loses
 * words from the end ("CINCINNATI ARCHBISHOP…"). Measured as drawn (an estimate where the text can't be measured).
 */
const END_ZONE_TEXT = 47; // yards of the end zone's 53⅓ the name may use
function fitEndZoneName(top: SVGElement, bottom: SVGElement, name: string) {
  const width = (size: number, text: string) => {
    top.setAttribute('font-size', String(size));
    top.textContent = text;
    try {
      const w = (top as SVGTextElement).getComputedTextLength();
      if (w > 0) return w;
    } catch {
      // not drawn yet: estimate below
    }
    return text.length * size * 0.68;
  };
  let size = 3.6;
  let text = name;
  while (size > 2.8 && width(size, text) > END_ZONE_TEXT) size = Math.round((size - 0.2) * 10) / 10;
  const words = name.split(' ');
  while (words.length > 1 && width(size, text) > END_ZONE_TEXT) {
    words.pop();
    text = `${words.join(' ').replace(/[\s.,'-]+$/, '')}…`;
  }
  // (one long word: letters off the end)
  while (text.length > 4 && width(size, text) > END_ZONE_TEXT) text = `${text.replace(/…$/, '').slice(0, -1)}…`;
  // the shorter name may fit a bigger size again
  while (size < 3.6 && width(Math.round((size + 0.2) * 10) / 10, text) <= END_ZONE_TEXT) size = Math.round((size + 0.2) * 10) / 10;
  width(size, text);
  bottom.setAttribute('font-size', String(size));
  bottom.textContent = text;
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** The second half (and overtime): the head linesman, the line judge and the chain crew have switched sidelines */
const isSecondHalf = (q?: number | string) => q === 3 || q === 4 || q === 'OT';
const SPEED_KEY = 'replayTest.speed', SHOW_KEY = 'replayTest.show';
const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};

/** The grass, lines and everything around them (world y = yards from the offense's own goal; screen y = -world y) */
function drawField(g: Element, look: FieldLook, home: Team, away: Team, M: number) {
  const VW = W + 2 * M;
  const sides: Element[] = [], squads: Squad[] = [];
  if (look.style === 'now') {
    el('rect', { x: -M - 5, y: -140, width: VW + 10, height: 180, fill: '#256B2A' }, g);
  } else {
    el('rect', { x: -M - 5, y: -140, width: VW + 10, height: 180, fill: '#1D5523' }, g);
    el('rect', { x: 0, y: -114, width: W, height: 128, fill: '#2B7630' }, g); // the grass behind each end line
    // The running track behind each end zone
    for (const y0 of [-120, 14]) {
      el('rect', { x: -M - 5, y: y0, width: VW + 10, height: 6, fill: '#9A3E2B' }, g);
      for (let k = 1; k < 5; k++) el('line', { x1: -M - 5, x2: W + M + 5, y1: y0 + k * 1.2, y2: y0 + k * 1.2, stroke: '#fff', 'stroke-width': 0.07, 'stroke-opacity': 0.55 }, g);
    }
    // Each team's sideline in its color: the visitors on the left (where the chain crew works), the home team on the right
    el('rect', { x: -M, y: -114, width: M, height: 128, fill: deepen(away.primaryColor, 0.55) }, g);
    el('rect', { x: W, y: -114, width: M, height: 128, fill: deepen(home.primaryColor, 0.55) }, g);
    // The sidelines (the same seed every time, so the crowd stands where it stood)
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const delay = () => `animation-delay:-${(rnd() * 4).toFixed(2)}s`;
    for (const [t, sgn] of [[away, -1], [home, 1]] as const) {
      const xo = (d: number) => (sgn < 0 ? -d : W + d); // d yards out from the sideline
      const side = el('g', {}, g); // the team on its sideline (jumps up and down after a big play)
      sides.push(side);
      // The limit line: the strip inside it is where the coaches walk with the play (and the chain crew works)
      el('line', { x1: xo(LIMIT), x2: xo(LIMIT), y1: -110, y2: 10, stroke: '#fff', 'stroke-width': 0.1, 'stroke-dasharray': '0.5 0.35', 'stroke-opacity': 0.8 }, g);
      // The team area from the 12 to the 12, packed with the team
      el('rect', { x: Math.min(xo(LIMIT), xo(M)), y: -88, width: M - LIMIT, height: 76, fill: 'rgba(255,255,255,.22)', stroke: '#fff', 'stroke-width': 0.12 }, g);
      for (let row = 0; row < 3; row++)
        for (let y = 12.8 + row * 0.45; y < 87.4; y += 1.05 + rnd() * 0.7) {
          if (rnd() < 0.1) continue;
          const at = el('g', { transform: `translate(${xo(LIMIT + 0.5 + row * 0.72 + (rnd() - 0.5) * 0.2).toFixed(2)} ${(-y).toFixed(2)})` }, side);
          const b = el('g', { class: 'sl-idle', style: delay() }, at);
          // Home in team color, the visitors in road whites
          el('circle', sgn > 0 ? { r: 0.32, fill: t.primaryColor, stroke: '#fff', 'stroke-width': 0.11 } : { r: 0.32, fill: '#F8FAFC', stroke: nice(t.primaryColor), 'stroke-width': 0.13 }, b);
        }
      // Cheerleaders in the last 10 yards at each end (moved by cheerTick)
      for (const [y0, y1] of [[1, 9.5], [90.5, 99]]) {
        const sq: Squad = { sgn, d0: LIMIT + 0.45, d1: M - 0.35, y0, y1, members: [], nextRoutine: 0 };
        for (let k = 0; k < 5; k++) {
          const y = y0 + ((k + 0.5) * (y1 - y0)) / 5, d = sq.d0 + rnd() * (sq.d1 - sq.d0);
          const at = el('g', { transform: `translate(${xo(d).toFixed(2)} ${(-y).toFixed(2)})` }, side);
          const pom = { r: 0.27, fill: t.primaryColor, stroke: '#FDE047', 'stroke-width': 0.08 };
          const pa = el('circle', { cx: -0.5, ...pom }, at), pb = el('circle', { cx: 0.5, ...pom }, at);
          el('circle', { r: 0.34, fill: nice(t.secondaryColor) === '#334155' ? '#FFFFFF' : t.secondaryColor, stroke: t.primaryColor, 'stroke-width': 0.1 }, at);
          sq.members.push({ g: at, pa, pb, d, y, fd: d, fy: y, td: d, ty: y, move: 'idle', t0: 0, dur: rnd() * 600 });
        }
        squads.push(sq);
      }
    }
  }
  for (let y = 0; y < 100; y += 5) el('rect', { x: 0, y: -(y + 5), width: W, height: 5, fill: (y / 5) % 2 ? '#2E7D32' : '#2B7630' }, g);
  el('rect', { x: 0, y: -110, width: W, height: 10, fill: home.primaryColor }, g);
  el('rect', { x: 0, y: 0, width: W, height: 10, fill: home.primaryColor }, g);
  const ezTop = el('text', { x: CX, y: -103.6, 'text-anchor': 'middle', 'font-size': 3.6, 'font-weight': 800, fill: '#fff' }, g);
  const ezBottom = el('text', { x: CX, y: 6.4, 'text-anchor': 'middle', 'font-size': 3.6, 'font-weight': 800, fill: '#fff', transform: `rotate(180 ${CX} 5)` }, g);
  fitEndZoneName(ezTop, ezBottom, home.name.toUpperCase());
  for (let y = 0; y <= 100; y += 5) el('line', { x1: 0, x2: W, y1: -y, y2: -y, stroke: '#fff', 'stroke-width': y % 50 === 0 ? 0.42 : y % 10 === 0 ? 0.28 : 0.18, 'stroke-opacity': y % 10 === 0 ? 0.85 : 0.6 }, g);
  // Hash marks (high school: 53 ft 4 in in from each sideline) and the short marks along the sidelines
  const hashes = look.style === 'now' ? [0.3, 17.3, 35.5, 52.5] : [0.3, 17.45, W - 17.45 - 0.67, W - 0.3 - 0.67];
  for (let y = 1; y < 100; y++) {
    if (y % 5 === 0) continue;
    for (const x of hashes) el('line', { x1: x, x2: x + (look.style === 'now' ? 0.6 : 0.67), y1: -y, y2: -y, stroke: '#fff', 'stroke-width': 0.14, 'stroke-opacity': 0.7 }, g);
  }
  if (look.style === 'now') {
    for (let y = 10; y <= 90; y += 10)
      for (const x of [5, W - 5]) {
        const t = el('text', { x, y: -y + 1.1, 'text-anchor': 'middle', 'font-size': 3, 'font-weight': 700, fill: '#fff', opacity: 0.85 }, g);
        t.textContent = String(y <= 50 ? y : 100 - y);
      }
  } else {
    // Yard numbers as a real field paints them: turned to read from the sideline, the line running between the digits,
    // with the little arrow pointing to the nearer goal
    const bottom = look.numbers === 'near' ? 1.3 : 7.1;
    for (let y = 10; y <= 90; y += 10) {
      const label = String(y <= 50 ? y : 100 - y);
      const toBottom = y < 50; // the nearer goal is at the bottom of the screen
      for (const left of [true, false]) {
        const ng = el('g', { transform: `translate(${left ? bottom : W - bottom} ${-y}) rotate(${left ? 90 : -90})`, opacity: 0.9 }, g);
        const a = el('text', { x: -0.28, y: 0, 'text-anchor': 'end', 'font-size': 2.6, 'font-weight': 800, fill: '#fff' }, ng);
        const b = el('text', { x: 0.28, y: 0, 'text-anchor': 'start', 'font-size': 2.6, 'font-weight': 800, fill: '#fff' }, ng);
        a.textContent = label[0];
        b.textContent = label[1];
        if (y !== 50) {
          // In the number's own frame, +x runs down the screen on the left side and up it on the right
          const s = (toBottom ? 1 : -1) * (left ? 1 : -1);
          const x0 = s * 2.05;
          el('path', { d: `M${x0} -1.75 L${x0 + s * 0.75} -1.35 L${x0} -0.95 z`, fill: '#fff' }, ng);
        }
      }
    }
    // The midfield logo
    el('circle', { cx: CX, cy: -50, r: 3.4, fill: home.primaryColor, stroke: '#fff', 'stroke-width': 0.3 }, g);
    const lg = el('text', { x: CX, y: -50, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 2.8, 'font-weight': 900, fill: '#fff' }, g);
    lg.textContent = initials(home.name);
  }
  el('line', { x1: 0, x2: 0, y1: -110, y2: 10, stroke: '#fff', 'stroke-width': 0.35 }, g);
  el('line', { x1: W, x2: W, y1: -110, y2: 10, stroke: '#fff', 'stroke-width': 0.35 }, g);
  if (look.style === 'new') {
    for (const yEnd of [-110, 10]) {
      el('line', { x1: 0, x2: W, y1: yEnd, y2: yEnd, stroke: '#fff', 'stroke-width': 0.35 }, g);
      // The goalpost (high school: the uprights 23 ft 4 in apart), seen from above, on the end line
      const out = yEnd < 0 ? -1 : 1;
      el('line', { x1: CX, x2: CX, y1: yEnd, y2: yEnd + out * 1.8, stroke: '#EAB308', 'stroke-width': 0.4, 'stroke-linecap': 'round' }, g);
      el('line', { x1: CX - 3.89, x2: CX + 3.89, y1: yEnd, y2: yEnd, stroke: '#FACC15', 'stroke-width': 0.4, 'stroke-linecap': 'round' }, g);
      for (const x of [CX - 3.89, CX + 3.89]) el('circle', { cx: x, cy: yEnd, r: 0.32, fill: '#FDE047', stroke: '#A16207', 'stroke-width': 0.08 }, g);
    }
    // Pylons at the corners of each end zone
    for (const y of [-110, -100, 0, 10]) for (const x of [0, W]) el('rect', { x: x - 0.3, y: y - 0.3, width: 0.6, height: 0.6, fill: '#F97316', stroke: '#7C2D12', 'stroke-width': 0.06 }, g);
  }
  return { ezTop, ezBottom, sides, squads };
}

interface Props {
  /** The snap to act out (null: show the field as it stands) */
  event: PlayEvent | null;
  /** The game as the scoreboard shows it (before the snap while it plays) */
  board: GameSimulationState;
  caption: React.ReactNode;
  onDone: () => void;
  /** Act out this exact plan instead of matching one */
  clip?: ReplayPlan;
  /** Video recording: hand frame control to window.__clip instead of animating */
  manual?: boolean;
  /** Test: after the whistle the pile stays down a beat, then everyone walks back toward the next snap */
  walkBack?: boolean;
  /** Test: the players stand lined up this long (real time, any speed) before the play starts */
  holdMs?: number;
  /** Drawn over the field (the down and distance before the snap, the result after the whistle) */
  overlay?: React.ReactNode;
  /** Called once when the players start moving (after holdMs) */
  onStart?: () => void;
  /** Where the next snap is (yards from this offense's goal); defaults to this snap's spot plus the gain */
  next?: number | null;
  paused?: boolean;
  /** Called once when the play is whistled dead */
  onWhistle?: () => void;
  /** Test switches for the field's look (default: the field as it was) */
  look?: FieldLook;
  /** With each school keeping its own mark: the school that wears the O's (default: the visitors) */
  oTeamId?: string;
  /** Before the first snap: both teams lined up for the opening kickoff (the team with the ball receives) */
  kickoffPreview?: boolean;
  /** Test: just the field, bigger: edge to edge, taller, no caption or speed buttons (always 2x) */
  bare?: boolean;
  /** Call onDone this long (real time) after the whistle, while the players keep moving (default: when the replay ends) */
  afterWhistleMs?: number;
  /** Every snap acted out, or only the big ones (default: the viewer's own choice) */
  showMode?: 'every' | 'big';
  /** Test: a five-man high school crew of officials on the field */
  officials?: boolean;
  /** Test: a penalty acted out on this play: the flag thrown to the spot, the offender ringed, a hold or a hit shown */
  foul?: FoulFx;
  /** Test: after the call, the ball and the line walk off to the new spot (yards from the offense's goal) from frame `at` */
  walkOff?: { los: number; gain: number; down: number; at: number };
  /** Called once when the flag lands */
  onFlag?: () => void;
  /** Test: a player hurt on this play: a red X on him, trainers out from his sideline, players giving them room */
  injury?: InjuryFx;
  /** Called as the injury scene moves on: the trainers come on, they help him up, he's off the field */
  onInjury?: (stage: 'trainers' | 'up' | 'off') => void;
  /** With `bare`: fill the box it sits in, top to bottom (a taller box shows more of the field, never cropped sides) */
  fill?: boolean;
}

export const ReplayField: React.FC<Props> = ({ event, board, caption, onDone, clip, manual, walkBack, holdMs = 0, overlay, next, paused, onWhistle, onStart, look = FIELD_NOW, oTeamId, kickoffPreview, bare, afterWhistleMs, showMode, officials, foul: foulProp, walkOff: walkOffProp, onFlag, injury: injuryProp, onInjury, fill }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const layers = useRef<Record<string, SVGElement>>({});
  const libRef = useRef<LibPlay[] | null>(null);
  const usedRef = useRef(new Set<string>());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const flagRef = useRef(onFlag);
  flagRef.current = onFlag;
  const injuryRef = useRef(onInjury);
  injuryRef.current = onInjury;
  const whistleRef = useRef(onWhistle);
  whistleRef.current = onWhistle;
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const holdRef = useRef(holdMs); // read live, so a change applies to the card already up
  holdRef.current = holdMs;
  const [speed0, setSpeed] = useState(() => Number(read(SPEED_KEY, '2')));
  const speed = bare ? 2 : speed0;
  const VH = bare ? 50 : VH0; // yards of field shown top to bottom
  // Filling a box: as many yards top to bottom as the box's shape needs (read live by the camera)
  const vhRef = useRef(VH);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [show0, setShow] = useState(() => read(SHOW_KEY, 'every'));
  const show = showMode ?? show0;
  const [ready, setReady] = useState(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const pausedRef = useRef(!!paused);
  pausedRef.current = !!paused;
  // The grass beside each sideline: 3 yd on the old field; on the new one, 3.6 yd for the coaches' strip and the team box
  const M = look.style === 'new' ? 3.6 : 3, VW = W + 2 * M;
  useEffect(() => {
    if (!fill || !wrapRef.current) return;
    const box = wrapRef.current;
    const fit = () => {
      const { width, height } = box.getBoundingClientRect();
      if (width < 10 || height < 10) return;
      vhRef.current = Math.max(24, Math.min(120, (VW * height) / width));
      // Between plays the camera rests: reframe it now, around the same spot
      const svg = svgRef.current, vb = svg?.getAttribute('viewBox')?.split(' ').map(Number);
      if (svg && vb && vb.length === 4) svg.setAttribute('viewBox', `${vb[0]} ${(vb[1] + vb[3] / 2 - vhRef.current / 2).toFixed(2)} ${vb[2]} ${vhRef.current.toFixed(2)}`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [fill, VW]);
  const lookKey = `${look.style}-${look.numbers}`;
  const coachesRef = useRef<{ g: Element; x: number; off: number; side: number }[]>([]);
  const sidesRef = useRef<Element[]>([]);
  const hypeRef = useRef<boolean[]>([false, false]); // [visitors, home]: their sideline goes wild
  const setHype = (side: number, on: boolean) => {
    if (hypeRef.current[side] === on) return;
    hypeRef.current[side] = on;
    sidesRef.current[side]?.setAttribute('class', on ? 'sl-hype' : '');
    for (const c of coachesRef.current) if (c.side === side) c.g.setAttribute('class', on ? 'sl-coach sl-hype' : 'sl-coach');
  };
  // The coaches stand level with `y` (world yards), each a few yards off it, never past their team area
  const setCoaches = (y: number) => {
    for (const c of coachesRef.current) c.g.setAttribute('transform', `translate(${c.x.toFixed(2)} ${(-clamp(y + c.off, 12.5, 87.5)).toFixed(2)})`);
  };

  // The field, drawn once
  useEffect(() => {
    const svg = svgRef.current!;
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    const marker = (id: string, d: string, attrs: Record<string, string | number>, refX: number) => {
      const m = el('marker', { id, viewBox: '0 0 10 10', refX, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto', markerUnits: 'strokeWidth' }, defs);
      el('path', { d, ...attrs }, m);
    };
    marker('rt-arr', 'M1 1 L9 5 L1 9 z', { fill: '#fff' }, 8);
    marker('rt-tee', 'M5 0 L5 10', { stroke: '#fff', 'stroke-width': 2.6, fill: 'none' }, 5);
    const stripes = el('pattern', { id: 'rt-ref', patternUnits: 'userSpaceOnUse', width: 0.42, height: 1 }, defs);
    el('rect', { width: 0.42, height: 1, fill: '#FFFFFF' }, stripes);
    el('rect', { width: 0.2, height: 1, fill: '#0F172A' }, stripes);
    const L = layers.current;
    // Everything on the ground turns together when the field flips; names, cue tags and TOUCHDOWN! stay upright on top
    L.world = el('g', {}, svg) as SVGElement;
    const { ezTop, ezBottom, sides, squads } = drawField(el('g', {}, L.world), look, board.homeTeam, board.awayTeam, M);
    sidesRef.current = sides;
    hypeRef.current = [false, false];
    // The cheerleaders never stop (between plays and while paused too)
    let cheerRaf = 0;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cheer = (now: number) => {
      for (const sq of squads) cheerTick(sq, now, hypeRef.current[sq.sgn < 0 ? 0 : 1]);
      if (!still) cheerRaf = requestAnimationFrame(cheer);
    };
    if (squads.length) cheerRaf = requestAnimationFrame(cheer);
    L.chain = el('g', {}, L.world) as SVGElement;
    el('style', {}, svg).textContent = SIDELINE_CSS;
    // The coaches, three a side, walking their strip of the sideline with the play
    coachesRef.current = [];
    if (look.style === 'new')
      for (const [t, sgn] of [[board.awayTeam, -1], [board.homeTeam, 1]] as const)
        [-6, -3, 2.6].forEach((off, k) => {
          // Seen from above: a white polo, the team cap with its bill toward the field, the head coach with his play sheet
          const at = el('g', { class: 'sl-coach' }, L.world);
          const b = el('g', { class: 'sl-walk', style: `animation-delay:-${k * 0.5}s` }, at);
          el('circle', { r: 0.62, fill: '#F8FAFC', stroke: '#0F172A', 'stroke-width': 0.12 }, b);
          el('ellipse', { cx: -sgn * 0.3, rx: 0.2, ry: 0.27, fill: t.primaryColor, stroke: '#0F172A', 'stroke-width': 0.05 }, b);
          el('circle', { r: 0.3, fill: t.primaryColor, stroke: '#fff', 'stroke-width': 0.06 }, b);
          if (k === 1) el('rect', { x: sgn * 0.42 - 0.24, y: -0.36, width: 0.48, height: 0.66, rx: 0.06, fill: '#FDE047', stroke: '#0F172A', 'stroke-width': 0.06 }, b);
          coachesRef.current.push({ g: at, x: sgn < 0 ? -LIMIT / 2 : W + LIMIT / 2, off, side: sgn < 0 ? 0 : 1 });
        });
    L.los = el('line', { x1: 0, x2: W, stroke: '#60A5FA', 'stroke-width': 0.4 }, L.world) as SVGElement;
    L.gain = el('line', { x1: 0, x2: W, stroke: '#FACC15', 'stroke-width': 0.4 }, L.world) as SVGElement;
    L.trails = el('g', { fill: 'none' }, L.world) as SVGElement;
    L.reticle = el('g', { visibility: 'hidden' }, L.world) as SVGElement;
    el('circle', { r: 1.5, fill: 'rgba(250,204,21,.18)', stroke: '#FACC15', 'stroke-width': 0.25, 'stroke-dasharray': '0.6 0.4' }, L.reticle);
    el('path', { d: 'M-2.1 0 H-1 M1 0 H2.1 M0 -2.1 V-1 M0 1 V2.1', stroke: '#FACC15', 'stroke-width': 0.25, 'stroke-linecap': 'round' }, L.reticle);
    L.halo = el('circle', { r: 1.55, fill: 'rgba(250,204,21,.25)', stroke: '#FACC15', 'stroke-width': 0.3, visibility: 'hidden' }, L.world) as SVGElement;
    L.foulG = el('g', {}, L.world) as SVGElement;
    L.refs = el('g', {}, L.world) as SVGElement;
    L.players = el('g', {}, L.world) as SVGElement;
    L.ballG = el('g', {}, L.world) as SVGElement;
    L.shadow = el('ellipse', { rx: 0.5, ry: 0.3, fill: 'rgba(0,0,0,.35)' }, L.ballG) as SVGElement;
    L.ball = el('g', {}, L.ballG) as SVGElement;
    el('ellipse', { rx: 0.55, ry: 0.34, fill: '#7C2D12', stroke: '#fff', 'stroke-width': 0.08 }, L.ball);
    el('line', { x1: -0.22, x2: 0.22, y1: 0, y2: 0, stroke: '#fff', 'stroke-width': 0.07 }, L.ball);
    L.fx = el('g', {}, L.world) as SVGElement;
    L.injG = el('g', {}, L.world) as SVGElement; // an injury: the red X and the trainers, above everyone
    L.flagG = el('g', { visibility: 'hidden' }, L.world) as SVGElement;
    L.flagG.innerHTML = `<g transform="scale(0.034) translate(-32 -40)">${renderToStaticMarkup(<PenaltyFlagShape />)}</g>`;
    L.labels = el('g', {}, svg) as SVGElement;
    L.chips = el('g', {}, svg) as SVGElement;
    L.td = el('text', { x: CX, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 900, fill: '#FACC15', stroke: '#0F172A', 'stroke-width': 0.5, 'paint-order': 'stroke', visibility: 'hidden' }, svg) as SVGElement;
    L.td.textContent = 'TOUCHDOWN!';
    L.ezTop = ezTop as SVGElement;
    L.ezBottom = ezBottom as SVGElement;
    loadReplayLibrary().then((lib) => {
      libRef.current = lib;
      setReady(true);
    });
    return () => cancelAnimationFrame(cheerRaf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.homeTeam.id, lookKey]);

  // The chain crew on the head linesman's sideline (new field): a stake where the series started, one at the line to
  // gain, the chain between them, and the down box on the line of scrimmage. Like him they switch sides at halftime:
  // the visitors' side (left) in the first half, the home side (right) in the second half and overtime
  const chainRightRef = useRef(false);
  const setChain = (los: number, gain: number, down: number | undefined, on: boolean) => {
    const C = layers.current.chain;
    if (!C) return;
    C.innerHTML = '';
    if (look.style !== 'new' || !on) return;
    const x = chainRightRef.current ? W + LIMIT / 2 : -LIMIT / 2;
    if (gain < 100) {
      el('line', { x1: x, x2: x, y1: -(gain - 10), y2: -gain, stroke: '#E2E8F0', 'stroke-width': 0.14, 'stroke-dasharray': '0.3 0.18' }, C);
      for (const y of [gain - 10, gain]) el('rect', { x: x - 0.28, y: -y - 0.28, width: 0.56, height: 0.56, rx: 0.12, fill: '#F97316', stroke: '#0F172A', 'stroke-width': 0.1 }, C);
    }
    el('rect', { x: x - 0.55, y: -los - 0.55, width: 1.1, height: 1.1, rx: 0.22, fill: '#F97316', stroke: '#0F172A', 'stroke-width': 0.1 }, C);
    const t = el('text', { x, y: -los, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.9, 'font-weight': 900, fill: '#0F172A' }, C);
    t.textContent = String(down ?? 1);
  };

  // The field as it stands between snaps: the ball on the spot, the offense driving up
  const showSpot = (state: GameSimulationState) => {
    const L = layers.current;
    if (!L.los) return;
    L.world.removeAttribute('transform');
    L.trails.innerHTML = '';
    L.players.innerHTML = '';
    L.labels.innerHTML = '';
    L.chips.innerHTML = '';
    L.fx.innerHTML = '';
    L.halo.setAttribute('visibility', 'hidden');
    L.reticle.setAttribute('visibility', 'hidden');
    L.td.setAttribute('visibility', 'hidden');
    const los = state.yardLine;
    L.los.setAttribute('y1', String(-los));
    L.los.setAttribute('y2', String(-los));
    const g = los + state.distance;
    L.gain.setAttribute('visibility', g < 100 ? 'visible' : 'hidden');
    L.gain.setAttribute('y1', String(-g));
    L.gain.setAttribute('y2', String(-g));
    chainRightRef.current = isSecondHalf(state.currentQuarter);
    setChain(los, g, state.down, true);
    L.ball.setAttribute('transform', `translate(${CX} ${-los}) rotate(-90)`);
    setCoaches(los);
    L.shadow.setAttribute('visibility', 'hidden');
    svgRef.current!.setAttribute('viewBox', `${-M} ${-(clamp(los + 8, 8, 92) + vhRef.current / 2)} ${VW} ${vhRef.current}`);
  };

  // Each new snap: match a real play and act it out
  useEffect(() => {
    if (!ready) return;
    if (!event) {
      // Before the game: the opening kickoff lined up, still (a real kickoff's first frame)
      const lib0 = libRef.current ?? [];
      if (kickoffPreview && lib0.length) {
        const receiving = board.possessionTeamId === board.awayTeam.id ? board.awayTeam : board.homeTeam;
        const kicking = receiving === board.homeTeam ? board.awayTeam : board.homeTeam;
        const ev = {
          playId: 'kickoff-preview', snapTeamId: kicking.id, snapYardLine: 40, snapDown: 1, snapDistance: 10, down: 1, distance: 10, yardLine: board.yardLine,
          possessionTeamId: receiving.id, playConcept: 'KICKOFF', yardsGained: 100 - board.yardLine - 40, textCommentary: '', isScore: false, isTurnover: false, isTry: false
        } as unknown as PlayEvent;
        const plan = planReplay(lib0, ev, board.homeTeam, board.awayTeam, new Set());
        if (plan) {
          draw(plan, ev).render(0);
          return;
        }
      }
      showSpot(board);
      return;
    }
    const lib = libRef.current ?? [];
    let plan = clip ?? planReplay(lib, event, board.homeTeam, board.awayTeam, usedRef.current);
    let extra: DrawExtra = {};
    const offenseOf = (id?: string) => (id === board.awayTeam.id ? board.awayTeam : board.homeTeam);
    // A flag in the game: the foul acted out on a real play that fits it, the ball walked off to where the game put it
    if (!clip && event.penalty && lib.length) {
      const base = pickPenaltyBase(lib, event.penalty.id as PenaltyId, String(event.playId));
      if (base) {
        const st = stagePenalty(event.penalty.id as PenaltyId, base);
        const offense = offenseOf(event.snapTeamId), defense = offense === board.homeTeam ? board.awayTeam : board.homeTeam;
        plan = { play: st.play, los: event.snapYardLine ?? 25, delta: 0, stretchFrom: st.play.start, mirror: false, names: { [st.foul.offender]: event.penalty.player }, offense, defense };
        extra = { foul: st.foul, walkOff: { los: event.yardLine, gain: event.yardLine + event.distance, down: event.down, at: Math.max(st.play.end, st.foul.frame + 9) + 30 } };
      }
    }
    // A player hurt on the play: he stays down, the trainers come out from his sideline and help him off
    if (!clip && plan && event.injury && !event.penalty) {
      const k = plan.play.key, role = event.injury.role;
      const who =
        role === 'carrier' ? k.carrier ?? k.target : role === 'receiver' ? k.target ?? k.carrier : role === 'tackler' ? k.tackler
          : role === 'sacker' ? k.sacker ?? k.tackler : role === 'intercepter' ? k.intercepter : k.qb;
      if (who !== undefined && who >= 0) {
        const right = event.injury.teamId === board.homeTeam.id; // the home sideline is on the right
        const st = stageInjury(plan.play, who, right !== plan.mirror ? 533 + 25 : -25);
        plan = { ...plan, play: st.play, names: { ...plan.names, [who]: event.injury.name } };
        extra = { injury: st.fx };
      }
    }
    if (!plan) {
      doneRef.current();
      return;
    }
    const big = isBigPlay(event) || !!event.penalty || !!event.injury; // a flag or an injury always plays out
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const parts = draw(plan, event, extra);
    const n = parts.frames;
    if (manual) {
      (window as unknown as { __clip: unknown }).__clip = { frames: n, end: parts.end, render: parts.render, rate: parts.rate };
      return;
    }
    if (reduce || (show === 'big' && !big)) {
      parts.render(parts.end);
      startRef.current?.();
      whistleRef.current?.();
      if (parts.flagAt >= 0) flagRef.current?.();
      const t = setTimeout(() => doneRef.current(), afterWhistleMs ?? 700);
      return () => clearTimeout(t);
    }
    let raf = 0, hold: ReturnType<typeof setTimeout> | undefined, doneT: ReturnType<typeof setTimeout> | undefined;
    const t0 = performance.now();
    let last = t0, fi = 0, blown = false, waited = 0, started = false, flipT = 0, flagged = false;
    let lastStage: string | null = null;
    const tick = (now: number) => {
      if (!svgRef.current) return; // this field is gone (the next play replaced it): stop
      if (pausedRef.current) {
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      // Lined up, waiting for the play
      if (!started) {
        waited += now - last;
        last = now;
        if (waited < holdRef.current) {
          raf = requestAnimationFrame(tick);
          return;
        }
        started = true;
        startRef.current?.();
      }
      const dt = now - last;
      let rate = parts.rate(fi);
      // The turnover: the play slows almost to a stop while the field turns around (real time, any speed)
      if (parts.flipAt >= 0 && fi >= parts.flipAt && flipT < 1) {
        flipT = Math.min(1, flipT + dt / FLIP_MS);
        rate = 0.12 / speedRef.current;
      }
      fi = Math.min(n - 1, fi + (dt / 100) * speedRef.current * rate); // the data is 10 frames a second
      last = now;
      parts.render(fi, parts.flipAt >= 0 && fi >= parts.flipAt ? flipT : 0);
      if (parts.flagAt >= 0 && fi >= parts.flagAt && !flagged) {
        flagged = true;
        flagRef.current?.();
      }
      const inj = parts.injury;
      if (inj) {
        const stage = fi >= inj.gone ? 'off' : fi >= inj.up ? 'up' : fi >= inj.out ? 'trainers' : null;
        if (stage && stage !== lastStage) {
          lastStage = stage;
          injuryRef.current?.(stage);
          if (stage === 'off' && afterWhistleMs !== undefined) doneT = setTimeout(() => doneRef.current(), INJURY_OFF_MS);
        }
      }
      if (fi >= parts.end && !blown) {
        blown = true;
        whistleRef.current?.();
        // The result shows for a set time while the players walk back (or celebrate); then the game moves on
        if (afterWhistleMs !== undefined && !parts.foul && !inj) doneT = setTimeout(() => doneRef.current(), afterWhistleMs);
      }
      // A flag: the FLAG banner and the call once the play is dead and the flag is down
      if (parts.foul && blown && flagged && !doneT && afterWhistleMs !== undefined) doneT = setTimeout(() => doneRef.current(), FLAG_CALL_MS);
      if (fi < n - 1) raf = requestAnimationFrame(tick);
      else if (afterWhistleMs === undefined) hold = setTimeout(() => doneRef.current(), 500 / speedRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (hold) clearTimeout(hold);
      if (doneT) clearTimeout(doneT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ready]);

  // Builds the players and paths for one plan; returns a renderer for any frame
  const draw = (plan0: ReplayPlan, ev: PlayEvent, extra: DrawExtra = {}) => {
    const L = layers.current;
    const foul = extra.foul ?? foulProp, walkOff = extra.walkOff ?? walkOffProp, injury = extra.injury ?? injuryProp;
    const { los, mirror, names, offense, defense } = plan0;
    // The test: after the whistle the pile stays down a beat, then everyone walks back toward the next snap
    const done = ev.isScore || ev.isTurnover || ev.isTry || ['PUNT', 'FIELD_GOAL', 'PAT_KICK', 'KICKOFF'].includes(ev.playConcept ?? '');
    const nextSpot = next !== undefined ? next : ev.penalty ? ev.yardLine : done ? null : clamp(los + (ev.yardsGained ?? 0), 1, 99);
    // (an injury scene's frames after the whistle leave no trails)
    let realEnd = injury ? Math.min(plan0.play.p.length - 1, plan0.play.end + 2) : plan0.play.p.length - 1, scorer = -1;
    let plan = plan0;
    if (walkBack && !injury) {
      const endB = plan0.play.ball[Math.min(plan0.play.end, plan0.play.ball.length - 1)];
      const nextLib: Pt | undefined = nextSpot === null ? undefined : [clamp(endB[0], 178, 355), (nextSpot - los - plan0.delta) * 10];
      const fl = addWalkBack(plan0.play, nextLib, ev.scoreType === 'TOUCHDOWN');
      realEnd = fl.realEnd;
      scorer = fl.scorer ?? -1;
      plan = { ...plan0, play: fl.play };
    }
    const { play } = plan;
    L.world.removeAttribute('transform');
    L.foulG.innerHTML = '';
    L.refs.innerHTML = '';
    L.injG.innerHTML = '';
    L.flagG.setAttribute('visibility', 'hidden');
    L.trails.innerHTML = '';
    L.players.innerHTML = '';
    L.labels.innerHTML = '';
    L.chips.innerHTML = '';
    L.td.setAttribute('visibility', 'hidden');
    L.los.setAttribute('y1', String(-los));
    L.los.setAttribute('y2', String(-los));
    const g = los + (ev.snapDistance ?? 10);
    const kickoff = (ev.playConcept as string) === 'KICKOFF'; // no line to gain, no chains
    L.gain.setAttribute('visibility', !ev.isTry && !kickoff && g < 100 ? 'visible' : 'hidden');
    L.gain.setAttribute('y1', String(-g));
    L.gain.setAttribute('y2', String(-g));
    chainRightRef.current = isSecondHalf(ev.snapQuarter ?? ev.quarter);
    setChain(los, g, ev.snapDown ?? board.down, !ev.isTry && !kickoff);
    setHype(0, false);
    setHype(1, false);
    const nw = look.style === 'new';
    const X = (x10: number) => onGrass(mirror ? W - x10 / 10 : x10 / 10, nw ? -0.5 : -1, nw ? W + 0.5 : W + 1, nw ? 1.1 : 1.6);
    const stretch = (f: number) => (plan.delta && f > plan.stretchFrom ? plan.delta * Math.min(1, (f - plan.stretchFrom) / Math.max(1, play.end - plan.stretchFrom)) : 0);
    const Y = (y10: number, f: number) => onGrass(los + y10 / 10 + stretch(f), -9, 109, 2.5);
    // The ball may fly past the end line (a kick into the net behind the goalpost)
    const YB = (y10: number, f: number) => onGrass(los + y10 / 10 + stretch(f), -16, 116, 3);
    const size = look.big ? 1.2 : 1;
    const items = play.roles.map((r, k) => {
      const isOff = r[0] === 'O', pos = r.slice(2), name = names[k];
      const gp = el('g', {}, L.players);
      const body = el('g', { transform: `scale(${size})` }, gp);
      // His mark: O or X by side of the ball, or his school's own; white, or his school's colors
      const team = isOff ? offense : defense;
      const isO = look.marks === 'team' ? team.id === (oTeamId ?? board.awayTeam.id) : isOff;
      const c = look.colors === 'school' ? markColors(team) : null;
      if (isO) el('circle', { r: 0.95, fill: c ? c.main : '#fff', stroke: c ? c.edge : nice(team.primaryColor), 'stroke-width': c ? 0.36 : 0.45 }, body);
      else {
        el('path', { d: 'M-.8 -.8 L.8 .8 M.8 -.8 L-.8 .8', stroke: c ? c.edge : '#fff', 'stroke-width': c ? 0.95 : 0.85, 'stroke-linecap': 'round' }, body);
        el('path', { d: 'M-.8 -.8 L.8 .8 M.8 -.8 L-.8 .8', stroke: c ? c.main : nice(team.primaryColor), 'stroke-width': c ? 0.5 : 0.45, 'stroke-linecap': 'round' }, body);
      }
      const end: Record<string, string> = !isOff ? {} : OL.has(pos) ? { 'marker-end': 'url(#rt-tee)' } : { 'marker-end': 'url(#rt-arr)' };
      const tr = el('polyline', { stroke: '#fff', 'stroke-width': name ? 0.3 : 0.18, opacity: name ? 1 : isOff ? 0.55 : 0.45, 'stroke-dasharray': isOff ? 'none' : name ? '0.35 0.5' : '0.3 0.45', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...end }, L.trails);
      let lab: Element | null = null;
      if (name) {
        lab = el('g', { style: 'opacity:0;transition:opacity .2s' }, L.labels);
        const w = name.length * 0.74 + 1.4;
        el('rect', { x: -w / 2, y: -1.05, width: w, height: 2.1, rx: 0.6, fill: 'rgba(15,23,42,.85)', stroke: isOff ? nice(offense.primaryColor) : '#E2E8F0', 'stroke-width': 0.18 }, lab);
        const t = el('text', { y: 0.5, 'text-anchor': 'middle', 'font-size': 1.35, 'font-weight': 700, fill: '#fff' }, lab);
        t.textContent = name;
      }
      return { gp, tr, lab, k };
    });

    // The action cues: what just happened, drawn where it happened
    const cues = CUES ? findCues(play) : { list: [], holder: [] as number[], target: undefined };
    // The ball in the air, for its height
    const flight = findFlight(play);
    // The ball changes hands and the field turns around: the moment a pass is picked off, or a punt is caught by
    // the return team
    const pick = cues.list.find((c) => c.kind === 'pick');
    let caught = -1;
    if (flight?.kind === 'punt') for (let f = flight.to; f < Math.min(play.p.length, flight.to + 8) && caught < 0; f++) caught = cues.holder[f] ?? -1;
    const flipAt = !look.flip ? -1 : pick ? pick.f + 1 : caught >= 0 && play.roles[caught][0] === 'D' ? flight!.to + 1 : -1;
    // A field goal is whistled once it has come down in the net, so the result doesn't hide the kick
    const whistle = flight?.kind === 'fg' ? Math.min(play.p.length - 1, Math.max(play.end, flight.to + 6)) : play.end;

    // The camera follows the ball, smoothed, looking a few yards ahead of whoever has it (the other way after a pick)
    const cam: number[] = [];
    let c = clamp(los + 8, 8, 92);
    for (let f = 0; f < play.p.length; f++) {
      const ahead = flipAt >= 0 && f >= flipAt ? -4 : 4;
      const inAir = !!flight && flight.kind !== 'pass' && f >= flight.from && f <= flight.to + 4; // a kick: keep up with it
      // A penalty: the camera goes to the foul as it happens and stays until the flag is down (a hit on the passer
      // comes long after the ball has gone downfield)
      const atFoul = !!foul && f >= foul.frame - 8 && f <= foul.frame + 30;
      const aim = atFoul ? Y(foul!.spot[1], foul!.frame) + 4 : YB(play.ball[f][1], f) + ahead;
      c += (clamp(aim, 2, 98) - c) * (inAir && !atFoul ? 0.32 : atFoul ? 0.22 : 0.18);
      cam.push(c);
    }
    const trail = play.p.length > 130 ? 50 : 1e9; // long plays (punt returns) keep only the last 5 seconds of trail
    // The coaches walk after the ball, a beat behind
    // The coaches stay near the line of scrimmage, giving a couple of yards with the play, slowly; after the whistle
    // they drift to the next line
    const coachY: number[] = [];
    let cy0 = los;
    for (let f = 0; f < play.p.length; f++) {
      const aim = f <= play.end ? los + clamp((YB(play.ball[f][1], f) - los) * 0.12, -2, 3) : nextSpot ?? los;
      cy0 += (aim - cy0) * 0.015;
      coachY.push(cy0);
    }
    // Which way the ball points: along the way it's moving (thrown, kicked or carried), held when it's still;
    // straight downfield at the snap. A football looks the same end for end, so it only ever turns the short way.
    const ballFrame0 = (f: number) => (flight?.kind === 'fg' && f > flight.to ? flight.to : f);
    const bxy = (f: number): [number, number] => {
      const b = ballFrame0(clamp(f, 0, play.p.length - 1));
      return [X(play.ball[b][0]), -YB(play.ball[b][1], b)];
    };
    const ballAng: number[] = [];
    let ba = -90;
    for (let f = 0; f < play.p.length; f++) {
      const [x0, y0] = bxy(f - 1), [x1, y1] = bxy(f + 1);
      if (f > play.snap && Math.hypot(x1 - x0, y1 - y0) > 0.5) {
        let d = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI - ba;
        d = ((((d + 90) % 180) + 180) % 180) - 90; // the nearest way round, end for end
        ba += d * 0.5;
      }
      ballAng.push(ba);
    }
    // The officials: a high school crew of five, placed and moved by the 2025 TASO crew-of-five mechanics. Each keeps to
    // his own area: nobody chases the ball and nobody sprints (a jog is about 3.5 yd a second, a walk 1.5).
    //   R, the referee (white cap): 10-12 yd behind the line on the passer's arm side; backs out at 45° with a passer,
    //     trails a runner
    //   U, the umpire: 3-8 yd off the ball on the defense's side; opens to the point of attack, comes up toward the line
    //     on a pass, turns and trails once the runner is past him
    //   H, the head linesman and L, the line judge: straddling the line on their sidelines; they hold it, drift with
    //     their side's routes on a pass and follow the ball's progress. They switch sidelines at halftime: in the first
    //     half H is on the visitors' side (the left, away from the press box, which is on the home side), in the second
    //     half on the home side
    //   B, the back judge: 20-25 yd deep, favoring the strong side; keeps the play in front of him
    // The goal line, a team backed up, punts, field goals and tries, kickoffs and a change of possession each have their own.
    const ballW = (f: number): Pt => [X(play.ball[f][0]), YB(play.ball[f][1], f)];
    const kickUp = flight?.kind === 'fg' || ev.playConcept === 'FIELD_GOAL' || ev.playConcept === 'PAT_KICK';
    const punt = !kickoff && ev.playConcept === 'PUNT';
    const HASH = 17.78;
    // (yards a frame: a jog is about 3.5 yd/s, a walk 1.5; on a long play a wing official runs, up to 5 yd/s)
    const JOG = 0.35, WALK = 0.15, RUN = 0.5;
    // The two sidelines, just off the field: the visitors' (left) and the home team's (right, the press-box side)
    const SL = -0.9, SR = W + 0.9;
    // The head linesman's sideline and the line judge's: they switch at halftime (overtime keeps the second half's)
    const secondHalf = isSecondHalf(ev.snapQuarter ?? ev.quarter);
    const HX = secondHalf ? SR : SL, LX = secondHalf ? SL : SR;
    const lSide = Math.sign(LX - CX); // the line judge's side of the field (-1 left, +1 right)
    const outward = (x: number, w: number) => (x < CX ? x - w : x + w); // w yards wider, off the field
    const snapF = clamp(play.snap, 0, play.p.length - 1);
    const e0 = Math.min(play.end, play.p.length - 1);
    const ball0 = ballW(snapF);
    const posAt = (k: number, f: number): Pt => [X(play.p[f][k * 2]), Y(play.p[f][k * 2 + 1], f)];
    // The strong side: where more receivers line up (+1 is the offense's right, the right of the screen)
    const elig = play.roles.map((r, k) => (r[0] === 'O' && /^(WR|TE|RB|FB|HB)$/.test(r.slice(2)) ? k : -1)).filter((k) => k >= 0);
    const strong = Math.sign(play.roles.reduce((s, r, k) => s + (r === 'O:WR' || r === 'O:TE' ? Math.sign(posAt(k, snapF)[0] - ball0[0]) : 0), 0));
    // How far downfield the deepest receiver is (on one half of the field, or anywhere)
    const deepest = (f: number, side = 0) => {
      let d = -Infinity;
      for (const k of elig) {
        const p = posAt(k, f);
        if (!side || Math.sign(p[0] - CX) === side) d = Math.max(d, p[1]);
      }
      return d;
    };
    // The crew set for a snap from the line `ly` with the ball at `bx` (also where they walk to for the next snap)
    const setFor = (ly: number, bx: number): Pt[] => {
      const toGo = 100 - ly;
      // Near the goal line the umpire is shallower; the back judge is on the goal line from the B-20 to the B-10 and
      // on the end line inside the B-10; the wings start wide, off the field
      const uDeep = toGo <= 10 ? clamp(toGo * 0.5, 2.5, 5) : 6;
      const bY = toGo <= 10 ? 110 : toGo <= 20 ? 100 : toGo <= 25 ? Math.min(ly + 18, 100) : ly + 22;
      const wide = toGo <= 10 ? 0.7 : 0;
      return [
        [clamp(bx + 5, 3, W - 2), Math.max(ly - 11, -9)],
        [clamp(bx - 1, HASH - 2, W - HASH + 2), ly + uDeep],
        [outward(HX, wide), ly],
        [outward(LX, wide), ly],
        [clamp((bx + CX) / 2 + strong * 4, 10, W - 10), bY]
      ];
    };
    const kicker = play.roles.indexOf('O:K'), punter = play.roles.indexOf('O:P');
    // The punt's deepest receiver, and the side of him the back judge takes (outside him, never between two receivers)
    let rk = -1;
    if (punt) play.roles.forEach((r, k) => { if (r[0] === 'D' && (rk < 0 || posAt(k, snapF)[1] > posAt(rk, snapF)[1])) rk = k; });
    const rSide = rk >= 0 && posAt(rk, snapF)[0] > CX ? 1 : -1;
    const besideReturner = (f: number): Pt => {
      const r = posAt(rk, f);
      return [clamp(r[0] + rSide * 5, 2, W - 2), Math.min(r[1] + 3, 109.5)];
    };
    const start: Pt[] = setFor(los, ball0[0]);
    // A short kickoff (an onside kick or a squib that comes down within 30 yd of the kick) doesn't use the deep-kick set
    const shortKick = kickoff && !!flight && ballW(flight.to)[1] - los < 30;
    if (shortKick) {
      // A short kick: H and L on the receiving team's restraining line, each on his own sideline; U and B on the kicking
      // team's, U away from the press box (the home side, on the right) and B on the press-box side; R deep in the
      // middle, 20 yd past the receiving team's line, behind the play
      start.splice(0, 5, [CX, Math.min(los + 30, 100)], [SL, los], [HX, los + 10], [LX, los + 10], [SR, los]);
    } else if (kickoff) {
      // A deep kickoff: R and L at the receiving end's pylons (L at the one on his sideline); U on the kicking team's
      // restraining line, away from the press box; H on the receiving team's, on his sideline (away from the press box
      // in the first half); B on the kicking team's restraining line on the press-box side
      start.splice(0, 5, [outward(HX, -0.3), 100], [SL, los], [HX, los + 10], [outward(LX, -0.3), 100], [SR, los]);
    } else if (kickUp) {
      // A field goal or a try: R even with the kicker and 10 yd wide of him on the L side, facing the holder; U about
      // 5 yd deep, wide on the L side; H on the line; L and B under the uprights, L at the post on his side
      if (kicker >= 0) {
        const kp = posAt(kicker, snapF);
        start[0] = [clamp(kp[0] + 10 * lSide, 1.5, W - 1.5), kp[1]];
      }
      start[1] = [clamp(ball0[0] + 6 * lSide, 3, W - 3), los - 4.5];
      start[3] = [CX + 4.6 * lSide, 110.6];
      start[4] = [CX - 4.6 * lSide, 110.6];
    } else if (punt) {
      // A punt: R just behind the punter on his kicking-foot side; U 8-10 yd behind the line, favoring the L side; the
      // wings on the line; B behind the deepest receiver and to one side
      if (punter >= 0) {
        const pp = posAt(punter, snapF);
        start[0] = [clamp(pp[0] + 3.5, 2, W - 2), pp[1] - 1.5];
      }
      start[1] = [clamp(ball0[0] + 6 * lSide, 3, W - 3), los - 9];
      if (rk >= 0) start[4] = besideReturner(snapF);
    }
    // When the ball changes hands (a pick, a fumble the defense picks up, a punt or a kickoff caught): from then on the
    // play heads down the screen and the crew turns with it
    const holder = CUES ? cues.holder : findCues(play).holder;
    const kickF = flight && flight.kind !== 'pass' ? flight.from : snapF;
    const dHolds = (f: number) => (holder[f] ?? -1) >= 0 && play.roles[holder[f]][0] === 'D';
    let turnF = Infinity;
    if (!kickUp && (!!pick || punt || kickoff || ev.turnoverType === 'FUMBLE' || ev.turnoverType === 'INTERCEPTION'))
      for (let f = Math.max(snapF + 1, flight && flight.kind !== 'pass' ? flight.to : 0); f + 2 <= e0; f++)
        if (dHolds(f) && dHolds(f + 1) && dHolds(f + 2)) {
          turnF = f;
          break;
        }
    const isPass = play.throw >= 0 && play.arrive > play.throw;
    const arriveF = Math.min(play.arrive, play.p.length - 1);
    const land: Pt = isPass ? ballW(arriveF) : [CX, los];
    const qb = play.key.qb;
    const qbY0 = qb !== undefined ? posAt(qb, snapF)[1] : los;
    const toGo = 100 - los;
    type Move = { aim: Pt; v: number };
    const stay = (p: Pt): Move => ({ aim: p, v: WALK });
    // Where each official is headed on frame f of the play (b: the ball)
    const playMove = (k: number, f: number, cur: Pt, b: Pt): Move => {
      const s = start[k];
      const wing = k === 2 || k === 3, side = Math.sign(s[0] - CX);
      // A field goal or a try: everyone holds his spot and watches the kick
      if (kickUp) return stay(s);
      if (kickoff) {
        if (f < turnF) return stay(s); // the kick in the air, or a touchback
        if (shortKick) {
          // A short kick: the wings follow the ball's progress along their sidelines; R, deep, trails it; U and B, on
          // the kicking team's line, give ground ahead of it, keeping 10 yd in front
          if (wing) return { aim: [s[0], clamp(b[1], 0, 100)], v: JOG };
          if (k === 0) return { aim: [s[0], Math.min(s[1], b[1] + 8)], v: JOG };
          return { aim: [s[0], Math.min(s[1], cur[1], b[1] - 10)], v: JOG };
        }
        // The return: the two at the pylons trail it along their sidelines; the three on the restraining lines give
        // ground ahead of it, keeping 10 yd in front
        if (k === 0 || k === 3) return { aim: [s[0], Math.min(s[1], b[1] + 6)], v: JOG };
        return { aim: [s[0], Math.min(s[1], cur[1], b[1] - 10)], v: JOG };
      }
      if (f >= turnF) {
        // The ball has changed hands: the wings follow the new runner's progress; the referee or the umpire, ahead of
        // him, gives ground (10 yd in front); the back judge, behind him, trails him (as does anyone he has passed)
        if (wing) return { aim: [s[0], clamp(b[1], 0, 100)], v: JOG };
        if (k !== 4 && cur[1] < b[1]) return { aim: [cur[0], Math.min(cur[1], b[1] - 10)], v: JOG };
        return { aim: [clamp(b[0] + (cur[0] < b[0] ? -4 : 4), 3, W - 3), Math.min(b[1] + 10, 110)], v: JOG };
      }
      if (punt) {
        // The wings hold the line until the kick, then go downfield with it; B stays beside the deepest receiver
        if (wing) return f < kickF ? stay(s) : { aim: [s[0], Math.max(los, b[1])], v: JOG };
        if (k === 4 && rk >= 0) return { aim: besideReturner(f), v: JOG };
        return stay(s);
      }
      // An incomplete pass: the play is over where it is
      if (isPass && play.res === 'I' && f >= play.arrive) return { aim: cur, v: 0 };
      const inAir = isPass && f >= play.throw && f < play.arrive;
      const thrown = isPass && f >= play.throw;
      const past = !inAir && b[1] > los + 1.5; // the ball is past the line: a runner, or a receiver after the catch
      if (wing) {
        let y = los, v = JOG;
        if (los <= 3 && !past) y = 0; // backed up on or inside the A-3: straight to the goal line
        else if (toGo <= 5) y = 100; // inside the B-5: to the goal line at the snap
        else if (toGo <= 10) (y = 100), (v = past || inAir ? JOG : WALK); // B-10 to B-5: release slowly toward it
        else if (past) y = b[1]; // his progress along the sideline
        else if (inAir) (y = land[1]), (v = Math.sign(land[0] - CX) === side ? JOG : WALK); // a pass to his side, or not
        else if (isPass && !thrown) y = los + clamp((deepest(f, side) - los) * 0.3, 0, 6); // drifts with his side's routes
        return { aim: [s[0], y], v };
      }
      if (k === 0) {
        // The referee trails a runner from behind; on a pass he backs out at 45° as the passer drops, then holds
        if (past) return { aim: [clamp(s[0] + (b[0] - s[0]) * 0.4, 2, W - 2), Math.max(s[1], b[1] - 15)], v: JOG };
        if (isPass && qb !== undefined) {
          const drop = clamp(qbY0 - posAt(qb, Math.min(f, play.throw))[1], 0, 5) * 0.7;
          return { aim: [clamp(s[0] + drop, 2, W - 1), s[1] - drop], v: JOG };
        }
        return { aim: [s[0] + clamp((b[0] - ball0[0]) * 0.3, -3, 3), s[1]], v: WALK };
      }
      if (k === 1) {
        // The umpire: once the runner reaches him he steps out of the lane and trails; on a pass he comes up toward the
        // line; on a run he opens toward the point of attack
        if (past && b[1] > cur[1] - 2) return { aim: [clamp(b[0] + (cur[0] < b[0] ? -3 : 3), 3, W - 3), Math.max(cur[1], b[1] - 7)], v: JOG };
        if (isPass) return { aim: [s[0], los + Math.min(2.5, s[1] - los)], v: WALK };
        return { aim: [clamp(b[0], s[0] - 5, s[0] + 5), s[1]], v: JOG };
      }
      // The back judge keeps everything in front of him: 10 yd beyond the ball, deeper than the deepest receiver; he
      // drops back at a jog but comes up only a few yards, slowly; near the goal line he keeps to his line
      let y = Math.max(b[1] + 10, isPass && !thrown ? deepest(f) + 5 : -Infinity, inAir ? land[1] + 5 : -Infinity, s[1] - 5);
      if (s[1] >= 100) y = Math.max(y, s[1]);
      y = Math.min(y, 110);
      return { aim: [clamp(s[0] + (b[0] - s[0]) * 0.5, 4, W - 4), y], v: y < cur[1] ? WALK : JOG };
    };
    // Spotting the ball (a test): where the play ended, where the ball goes next (the nearer hash, or where it is if
    // it ended between them), who runs in
    const spotOn = !!officials && !!look.spotting && !foul && !kickUp && nextSpot !== null && e0 > play.snap;
    const deadAt: Pt = ballW(e0);
    const placeAt: Pt = [clamp(deadAt[0], HASH, W - HASH), nextSpot ?? los];
    const nextSet = setFor(placeAt[1], placeAt[0]); // the crew's spots for the next snap
    const nearWing = (deadAt[0] < CX) === (HX < CX) ? 2 : 3; // the official on the sideline nearer the ball
    const spotAim = (k: number, r: number): Move | null => {
      if (!spotOn) return null;
      const side = k === 2 ? HX : LX;
      if (k === 2 || k === 3) {
        // Already level with the ball: the nearer one jogs a few yards in toward the spot and holds it; the other stays
        // square on his sideline; then both walk back to the sideline at the next line
        const inward = side < CX ? 1 : -1;
        if (k === nearWing && r <= 22) return { aim: [side + inward * Math.max(0, Math.min(6, Math.abs(deadAt[0] - side) - 1.2)), deadAt[1]], v: JOG };
        if (r <= 22) return { aim: [side, deadAt[1]], v: JOG };
        return { aim: nextSet[k], v: WALK };
      }
      if (k === 1) {
        // the umpire jogs in for the ball, carries it to the next spot, then walks back to his place off the ball
        if (r <= 4) return { aim: [0, 0], v: 0 };
        if (!umpHas) return { aim: deadAt, v: JOG };
        if (!umpSet) return { aim: placeAt, v: JOG };
        return { aim: nextSet[1], v: WALK };
      }
      return { aim: nextSet[k], v: WALK };
    };
    // After the whistle with no spotting: the wings mark where the ball died (on a kickoff, the official on each
    // sideline nearest it); the others finish their move at a walk
    let markL = -1, markR = -1;
    const afterMove = (k: number, cur: Pt): Move => {
      if (kickUp) return { aim: cur, v: 0 };
      const mark: Pt = [start[k][0], clamp(deadAt[1], 0, 100)];
      if (kickoff) return k === markL || k === markR || (shortKick && (k === 2 || k === 3)) ? { aim: mark, v: JOG } : { aim: cur, v: 0 };
      if (k === 2 || k === 3) return { aim: mark, v: JOG };
      return { ...playMove(k, e0, cur, deadAt), v: WALK };
    };
    // When the umpire has the ball, and when he has set it down (frames after the whistle)
    let umpHas = false, umpSet = false;
    let umpGot = Infinity, umpDown = Infinity;
    const paths: Pt[][] = start.map(() => []);
    if (officials) {
      const cur = start.map((p) => [...p] as Pt);
      for (let f = 0; f < play.p.length; f++) {
        if (kickoff && !shortKick && f === e0 + 1) {
          const near = (ks: number[]) => ks.reduce((a, k) => (Math.abs(cur[k][1] - deadAt[1]) < Math.abs(cur[a][1] - deadAt[1]) ? k : a), ks[0]);
          const left = [0, 1, 2, 3, 4].filter((k) => cur[k][0] < CX);
          markL = near(left);
          markR = near([0, 1, 2, 3, 4].filter((k) => !left.includes(k)));
        }
        for (let k = 0; k < 5; k++) {
          let c = cur[k];
          if (k === 1 && f > e0) {
            umpHas = f - e0 > 4 && (umpHas || Math.hypot(c[0] - deadAt[0], c[1] - deadAt[1]) < 0.6);
            if (umpHas && umpGot === Infinity) umpGot = f;
            umpSet = umpHas && (umpSet || Math.hypot(c[0] - placeAt[0], c[1] - placeAt[1]) < 0.6);
            if (umpSet && umpDown === Infinity) umpDown = f;
          }
          const sp = f > e0 ? spotAim(k, f - e0) : null;
          let m = sp ?? (f <= snapF ? null : f > e0 ? afterMove(k, c) : playMove(k, f, c, ballW(f)));
          // A long play: a wing official whose jog leaves him more than 10 yd behind the ball's progress picks up to a
          // run, a full 5 yd/s once 20 yd behind (during the play only)
          if (m && !sp && f <= e0 && (k === 2 || k === 3) && m.v === JOG) {
            const gap = Math.abs(m.aim[1] - c[1]);
            m = { ...m, v: JOG + (RUN - JOG) * clamp((gap - 10) / 10, 0, 1) };
          }
          if (m && m.v > 0) {
            // a steady jog (or walk) toward where he's going, easing in as he gets there
            const dx = m.aim[0] - c[0], dy = m.aim[1] - c[1], d = Math.hypot(dx, dy);
            const step = sp ? Math.min(d, m.v) : Math.min(m.v, d * 0.25);
            if (d > 0.01) c = [c[0] + (dx / d) * step, c[1] + (dy / d) * step];
          }
          cur[k] = c;
          paths[k].push(c);
        }
      }
    }
    // (the three on the field drawn as big as a player; the two on the sidelines smaller, out of the way; under the
    // uprights the line judge is on the field too)
    const crew = officials
      ? paths.map((path, k) => {
          const size = k === 2 || (k === 3 && !kickUp) ? 1 : 1.35, cap = k === 0 ? '#FFFFFF' : '#0F172A';
          const g = el('g', {}, L.refs);
          const body = el('g', { transform: `scale(${size})` }, g);
          el('circle', { r: 0.72, fill: 'url(#rt-ref)', stroke: '#0F172A', 'stroke-width': 0.1 }, body);
          el('circle', { r: 0.28, fill: cap, stroke: cap === '#FFFFFF' ? '#0F172A' : '#FFFFFF', 'stroke-width': 0.07 }, body);
          return { g, path };
        })
      : [];
    // The foul: the offender ringed, a hold drawn as a tie between the two, a hit as a jolt, the flag thrown by the
    // nearest official (or from the sideline) to the spot of the foul
    const FLAG_AIR = 9;
    const fz = foul
      ? (() => {
          const spot: Pt = [X(foul.spot[0]), Y(foul.spot[1], foul.frame)];
          let from: Pt = [spot[0] < CX ? -0.9 : W + 0.9, los];
          let bd = 1e9;
          for (const c of crew) {
            const p = c.path[Math.min(foul.frame, c.path.length - 1)];
            const d = Math.hypot(p[0] - spot[0], p[1] - spot[1]);
            if (d < bd) (bd = d), (from = p);
          }
          const ring = el('circle', { r: 1.75, fill: 'none', stroke: '#FACC15', 'stroke-width': 0.32, 'stroke-dasharray': '0.55 0.35', visibility: 'hidden' }, L.foulG);
          const tether = el('line', { stroke: '#FACC15', 'stroke-width': 0.34, 'stroke-linecap': 'round', 'stroke-dasharray': '0.3 0.22', visibility: 'hidden' }, L.foulG);
          const jolt = el('g', { visibility: 'hidden' }, L.foulG);
          el('circle', { r: 1, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 0.22 }, jolt);
          el('circle', { r: 0.6, fill: 'none', stroke: '#FACC15', 'stroke-width': 0.3 }, jolt);
          return { spot, from, ring, tether, jolt };
        })()
      : null;
    const flagAt = foul ? foul.frame + FLAG_AIR : -1;
    const wpos = (k: number, f0: number, f1: number, a: number): Pt => [
      X(play.p[f0][k * 2]) + (X(play.p[f1][k * 2]) - X(play.p[f0][k * 2])) * a,
      Y(play.p[f0][k * 2 + 1], f0) + (Y(play.p[f1][k * 2 + 1], f1) - Y(play.p[f0][k * 2 + 1], f0)) * a
    ];
    let chainMoved = false;
    // The injury: a red X on him, the trainers (white, with a red cross)
    const hurtX = injury
      ? (() => {
          const g = el('g', { visibility: 'hidden' }, L.injG);
          for (const [stroke, w] of [['#FFFFFF', 0.8], ['#DC2626', 0.45]] as const)
            el('path', { d: 'M-1.1 -1.1 L1.1 1.1 M1.1 -1.1 L-1.1 1.1', stroke, 'stroke-width': w, 'stroke-linecap': 'round' }, g);
          return g;
        })()
      : null;
    const medics = injury
      ? injury.trainers.map(() => {
          const g = el('g', { visibility: 'hidden' }, L.injG);
          const b = el('g', { transform: `scale(${size * 1.1})` }, g);
          el('circle', { r: 0.85, fill: '#FFFFFF', stroke: '#DC2626', 'stroke-width': 0.18 }, b);
          el('rect', { x: -0.16, y: -0.5, width: 0.32, height: 1, fill: '#DC2626' }, b);
          el('rect', { x: -0.5, y: -0.16, width: 1, height: 0.32, fill: '#DC2626' }, b);
          return g;
        })
      : [];

    // Name tags: nobody's before the snap. A player's name shows while he has the ball, and from the moment he
    // makes the play: the tackle or sack, the pick, the pass he was the target of falling incomplete. Whoever had it
    // at the whistle and whoever stopped him keep theirs through the result.
    const endF = Math.min(play.end, cues.holder.length - 1);
    const lastHolder = cues.holder[endF] >= 0 ? cues.holder[endF] : cues.holder[Math.max(0, endF - 1)] ?? -1;
    const stopper = play.key.tackler ?? play.key.sacker;
    const stopAt = cues.list.find((c) => c.kind === 'hit' || c.kind === 'sack')?.f ?? play.end;
    // A big play sets off the sideline of the team that made it: a touchdown, a pick, a sack, a field goal, a gain of 15+
    const homeOff = offense.id === board.homeTeam.id;
    const offSide = homeOff ? 1 : 0, defSide = homeOff ? 0 : 1;
    const hype: [number, number][] = []; // [side, from frame]
    if (pick) hype.push([defSide, pick.f]);
    else if (ev.scoreType === 'TOUCHDOWN') hype.push([offSide, play.end]);
    else if (flight?.kind === 'fg' && ev.isScore) hype.push([offSide, flight.to]);
    else if (cues.list.some((c) => c.kind === 'sack')) hype.push([defSide, play.end]);
    else if ((ev.yardsGained ?? 0) >= 15) hype.push([offSide, play.end]);
    const tagOn = (k: number, f: number) => {
      if (foul && k === foul.offender && f >= foul.frame) return true;
      if (injury && k === injury.who && f >= injury.down) return true;
      if (f <= play.snap) return false;
      if (cues.holder[f] === k) return true;
      if (f >= play.end && k === lastHolder) return true;
      if (k === stopper && f >= stopAt - 1) return true;
      if (k === play.key.intercepter && pick && f >= pick.f) return true;
      if (k === play.key.target && play.res === 'I' && f >= play.arrive) return true;
      return false;
    };

    L.fx.innerHTML = '';
    const fx = cues.list.map((c) => {
      const look = LOOK[c.kind];
      const burst = el('g', { visibility: 'hidden' }, L.fx);
      if (look.shape === 'shock') {
        // Contact: two thin rings snap outward from where the hit lands
        el('circle', { r: 1, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 0.22 }, burst);
        el('circle', { r: 0.6, fill: 'none', stroke: look.edge, 'stroke-width': 0.3 }, burst);
      }
      else if (look.shape === 'puff') for (const [dx, dy] of [[-0.9, 0.2], [0.8, -0.3], [0.1, 0.8], [0, -0.8]]) el('circle', { cx: dx, cy: dy, r: 0.75, fill: 'rgba(226,232,240,.75)' }, burst);
      else el('circle', { r: 1.4, fill: 'none', stroke: look.bg, 'stroke-width': 0.45 }, burst);
      let chip: Element | null = null;
      if (look.text) {
        chip = el('g', { visibility: 'hidden' }, L.chips);
        const rect = el('rect', { y: -1.4, height: 2.8, rx: 1.4, fill: look.bg, stroke: look.edge, 'stroke-width': look.shape === 'shock' ? 0.3 : 0.22 }, chip);
        const t = el('text', { y: 0.62, 'text-anchor': 'middle', 'font-size': 1.75, 'font-weight': 800, fill: look.fg }, chip);
        t.textContent = look.text;
        // Sized to the text it holds
        let tw = 0;
        try {
          tw = (t as SVGTextElement).getComputedTextLength();
        } catch {
          tw = 0;
        }
        const w = (tw > 0 ? tw : look.text.length * 1.1) + 2.2;
        rect.setAttribute('x', String(-w / 2));
        rect.setAttribute('width', String(w));
      }
      return { c, burst, chip, look, x: X(c.x), y: -Y(c.y, c.f) };
    });
    const tgt = cues.target ? { x: X(cues.target.x), y: -Y(cues.target.y, play.arrive) } : null;
    const hit = cues.list.find((c) => c.kind === 'hit' || c.kind === 'sack');
    const loose = cues.list.find((c) => c.kind === 'incomplete');

    // How high the ball is (yards) on a frame
    const heightAt = (fi: number) => {
      if (!look.height) {
        const air = play.throw >= 0 && fi >= play.throw && fi < play.arrive;
        const w = air ? (fi - play.throw) / (play.arrive - play.throw) : 0;
        return air ? 12 * w * (1 - w) * 0.25 : 0; // the old gentle lift (in yards, about 0.75 at most)
      }
      if (!flight || fi < flight.from) return 0;
      const arc = (u: number) => {
        const w = flight.kind === 'fg' ? u * 0.75 : u;
        return 4 * flight.peak * w * (1 - w);
      };
      if (fi <= flight.to) return arc((fi - flight.from) / Math.max(1, flight.to - flight.from));
      // A field goal drops into the net behind the goalpost
      if (flight.kind === 'fg') return arc(1) * Math.max(0, 1 - (fi - flight.to) / 6);
      return 0;
    };
    // A kick that reached the net stays there (the real ball was tossed back, which looked like a bounce)
    const ballFrame = (f: number) => (flight?.kind === 'fg' && f > flight.to ? flight.to : f);

    const render = (fi: number, flipT?: number) => {
      const n = play.p.length, f0 = clamp(Math.floor(fi), 0, n - 1), f1 = Math.min(n - 1, f0 + 1), a = fi - f0;
      const lerp = (u: number, v: number) => u + (v - u) * a;
      // The field turning around: half a turn around the middle of the view, easing in and out, with a slight pull back
      const ft = flipAt < 0 ? 0 : flipT ?? (fi >= flipAt ? Math.min(1, (fi - flipAt) / 4) : 0);
      const e = ease(ft);
      const ang = Math.PI * e, zoom = 1 - 0.12 * Math.sin(Math.PI * e);
      const camY = -lerp(cam[f0], cam[f1]);
      const cos = Math.cos(ang) * zoom, sin = Math.sin(ang) * zoom;
      const scr = (x: number, y: number): [number, number] => [CX + (x - CX) * cos - (y - camY) * sin, camY + (x - CX) * sin + (y - camY) * cos];
      if (ft > 0) L.world.setAttribute('transform', `translate(${CX} ${camY.toFixed(2)}) rotate(${(180 * e).toFixed(2)}) scale(${zoom.toFixed(3)}) translate(${-CX} ${(-camY).toFixed(2)})`);
      else L.world.removeAttribute('transform');
      L.chain.setAttribute('visibility', ft > 0 ? 'hidden' : 'visible'); // the series is over

      for (const it of fx) {
        const age = fi - it.c.f, life = it.look.life;
        const on = age >= 0 && age < life;
        it.burst.setAttribute('visibility', on ? 'visible' : 'hidden');
        it.chip?.setAttribute('visibility', on ? 'visible' : 'hidden');
        if (!on) continue;
        const pop = Math.min(1, age / 2.5); // grows in over a quarter second
        const fade = age > life - 5 ? (life - age) / 5 : 1;
        const sc = it.look.shape === 'ring' ? 0.6 + age * 0.22 : it.look.shape === 'puff' ? 0.8 + age * 0.08 : 0.8 + age * 0.45;
        it.burst.setAttribute('transform', `translate(${it.x.toFixed(2)} ${it.y.toFixed(2)}) scale(${sc.toFixed(2)})`);
        it.burst.setAttribute('opacity', (it.look.shape === 'ring' ? Math.max(0, 1 - age / life) : it.look.shape === 'shock' ? Math.max(0, 1 - age / 6) : fade).toFixed(2));
        if (it.chip) {
          // Above the name tag of the player it happened to, following him (on screen, whichever way the field faces)
          const w = it.c.who;
          const wx = w === undefined ? it.x : lerp(X(play.p[f0][w * 2]), X(play.p[f1][w * 2]));
          const wy = w === undefined ? it.y : -lerp(Y(play.p[f0][w * 2 + 1], f0), Y(play.p[f1][w * 2 + 1], f1));
          const [px, py] = scr(wx, wy);
          const cx = clamp(px, 8, W - 8), cy = py - 5.3 - pop * 0.6;
          it.chip.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${(0.6 + pop * 0.4).toFixed(2)})`);
          it.chip.setAttribute('opacity', fade.toFixed(2));
        }
      }
      const spots: { lab: Element; x: number; y: number }[] = [];
      for (const it of items) {
        const x = lerp(X(play.p[f0][it.k * 2]), X(play.p[f1][it.k * 2]));
        const y = -lerp(Y(play.p[f0][it.k * 2 + 1], f0), Y(play.p[f1][it.k * 2 + 1], f1));
        // The mob round the scorer bounces up and down
        let hop = 1;
        if (scorer >= 0 && fi > play.end && play.roles[it.k][0] === play.roles[scorer][0]) {
          const sx = X(play.p[f0][scorer * 2]), sy = -Y(play.p[f0][scorer * 2 + 1], f0);
          if (Math.hypot(x - sx, y - sy) < 3.2) hop = 1 + 0.22 * Math.abs(Math.sin(fi * 0.55 + it.k * 1.7));
        }
        it.gp.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})${hop > 1 ? ` scale(${hop.toFixed(2)})` : ''}`);
        const pts: string[] = [];
        for (let f = Math.max(0, play.snap, f0 - trail); f <= Math.min(f0, realEnd); f++) pts.push(`${X(play.p[f][it.k * 2]).toFixed(2)},${(-Y(play.p[f][it.k * 2 + 1], f)).toFixed(2)}`);
        it.tr.setAttribute('points', pts.join(' '));
        if (it.lab) {
          const on = tagOn(it.k, f0);
          (it.lab as SVGElement).style.opacity = on ? '1' : '0';
          if (on) {
            const [sx, sy] = scr(x, y);
            spots.push({ lab: it.lab, x: sx, y: sy });
          }
        }
      }
      for (const s of spots) {
        const lower = spots.some((o) => o !== s && Math.abs(o.x - s.x) < 7 && Math.abs(o.y - s.y) < 4 && o.y < s.y);
        s.lab.setAttribute('transform', `translate(${clamp(s.x, 4, W - 4).toFixed(2)} ${(s.y + (lower ? 2.1 : -2) * size).toFixed(2)})`);
      }
      const b0 = ballFrame(f0), b1 = ballFrame(f1);
      const bx = lerp(X(play.ball[b0][0]), X(play.ball[b1][0])), by = lerp(YB(play.ball[b0][1], b0), YB(play.ball[b1][1], b1));
      const lag = loose ? fi - loose.f : -1; // an incompletion hits the turf and bounces
      const hop = lag >= 0 && lag < 12 ? (look.height ? 2.5 : 0.4) * Math.abs(Math.sin(lag * 0.9)) * Math.exp(-lag / 3) : 0;
      const h = heightAt(fi) + hop;
      const spin = lerp(ballAng[f0], ballAng[f1]) + (lag >= 0 ? Math.min(lag, 12) * 40 : 0); // an incompletion tumbles
      // The higher it goes, the bigger the ball and the smaller and fainter its shadow on the grass under it
      // (a punt's 18 yd peak: about 4 times bigger; a deep pass: 3 times; a short pass: barely)
      const grow = look.height ? 1 + Math.min(3.2, h * 0.17) : 1 + h * 0.28;
      const lift = look.height ? Math.min(3, h * 0.15) : h * 1.4;
      const up = Math.cos(ang) >= 0 ? 1 : -1; // "up the screen" in world terms, once the field has turned
      L.shadow.setAttribute('visibility', h > 0.05 ? 'visible' : 'hidden');
      if (look.height) {
        const fade = 1 - Math.min(0.65, h / 30);
        L.shadow.setAttribute('cx', bx.toFixed(2));
        L.shadow.setAttribute('cy', (-by).toFixed(2));
        L.shadow.setAttribute('rx', (0.5 * fade).toFixed(2));
        L.shadow.setAttribute('ry', (0.3 * fade).toFixed(2));
        L.shadow.setAttribute('opacity', fade.toFixed(2));
      } else {
        L.shadow.setAttribute('cx', (bx + h * 1.0).toFixed(2));
        L.shadow.setAttribute('cy', (-by + h * 0.8).toFixed(2));
        L.shadow.setAttribute('rx', '0.5');
        L.shadow.setAttribute('ry', '0.3');
        L.shadow.setAttribute('opacity', '1');
      }
      L.ball.setAttribute('transform', `translate(${bx.toFixed(2)} ${(-by - lift * up).toFixed(2)}) scale(${grow.toFixed(2)}) rotate(${spin.toFixed(0)})`);
      if (spotOn && crew[1] && fi >= umpGot) {
        const u = crew[1].path;
        const at: Pt = fi < umpDown ? [lerp(u[f0][0], u[f1][0]), lerp(u[f0][1], u[f1][1])] : placeAt;
        L.ball.setAttribute('transform', `translate(${at[0].toFixed(2)} ${(-at[1]).toFixed(2)}) rotate(-90)`);
        L.shadow.setAttribute('visibility', 'hidden');
      }
      // Who has the ball: a gold ring under him
      const hk = cues.holder[f0] ?? -1;
      L.halo.setAttribute('visibility', CUES && hk >= 0 && fi >= play.snap + 3 ? 'visible' : 'hidden');
      if (hk >= 0) {
        const hx = lerp(X(play.p[f0][hk * 2]), X(play.p[f1][hk * 2])), hy = -lerp(Y(play.p[f0][hk * 2 + 1], f0), Y(play.p[f1][hk * 2 + 1], f1));
        L.halo.setAttribute('transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) scale(${((1 + 0.08 * Math.sin(fi * 1.3)) * size).toFixed(3)})`);
      }
      const struck = hit && fi >= hit.f && fi < hit.f + 6; // the ring flashes the hit's color as it lands
      L.halo.setAttribute('stroke', struck ? LOOK[hit!.kind].edge : '#FACC15');
      // Where the pass will come down, from the throw until just after it gets there
      const showT = !!tgt && fi >= play.throw && fi < play.arrive + 4;
      L.reticle.setAttribute('visibility', showT ? 'visible' : 'hidden');
      if (tgt && showT) L.reticle.setAttribute('transform', `translate(${tgt.x.toFixed(2)} ${tgt.y.toFixed(2)}) scale(${(1 + 0.12 * Math.sin(fi * 1.1)).toFixed(3)})`);
      // The hit lands: a short jolt of the camera
      const ha = hit ? fi - hit.f : -1;
      const jolt = ha >= 0 && ha < 5 ? (hit!.kind === 'sack' ? 0.35 : 0.22) * Math.sin(ha * 3.1) * Math.exp(-ha / 2) : 0;
      setCoaches(lerp(coachY[f0], coachY[f1]));
      if (injury && hurtX) {
        const on = fi >= injury.down + 2;
        hurtX.setAttribute('visibility', on ? 'visible' : 'hidden');
        if (on) {
          const h = wpos(injury.who, f0, f1, a);
          hurtX.setAttribute('transform', `translate(${h[0].toFixed(2)} ${(-h[1]).toFixed(2)}) scale(${size})`);
        }
        injury.trainers.forEach((path, j) => {
          const p0 = path[f0], p1 = path[f1] ?? p0;
          medics[j].setAttribute('visibility', p0 ? 'visible' : 'hidden');
          if (p0 && p1) medics[j].setAttribute('transform', `translate(${lerp(X(p0[0]), X(p1[0])).toFixed(2)} ${(-lerp(Y(p0[1], f0), Y(p1[1], f1))).toFixed(2)})`);
        });
      }
      for (const c of crew) {
        const p0 = c.path[f0], p1 = c.path[f1];
        c.g.setAttribute('transform', `translate(${lerp(p0[0], p1[0]).toFixed(2)} ${(-lerp(p0[1], p1[1])).toFixed(2)})`);
      }
      if (foul && fz) {
        const off = wpos(foul.offender, f0, f1, a);
        const ringOn = fi >= foul.frame - 2;
        fz.ring.setAttribute('visibility', ringOn ? 'visible' : 'hidden');
        if (ringOn) fz.ring.setAttribute('transform', `translate(${off[0].toFixed(2)} ${(-off[1]).toFixed(2)}) scale(${(1 + 0.1 * Math.sin(fi * 1.4)).toFixed(3)})`);
        const tied = !!foul.tether && foul.victim !== undefined && fi >= foul.tether[0] && fi <= foul.tether[1];
        fz.tether.setAttribute('visibility', tied ? 'visible' : 'hidden');
        if (tied) {
          const v = wpos(foul.victim!, f0, f1, a);
          fz.tether.setAttribute('x1', off[0].toFixed(2));
          fz.tether.setAttribute('y1', (-off[1]).toFixed(2));
          fz.tether.setAttribute('x2', v[0].toFixed(2));
          fz.tether.setAttribute('y2', (-v[1]).toFixed(2));
        }
        const ja = foul.contact !== undefined ? fi - foul.contact : -1;
        fz.jolt.setAttribute('visibility', ja >= 0 && ja < 7 ? 'visible' : 'hidden');
        if (ja >= 0 && ja < 7 && foul.victim !== undefined) {
          const v = wpos(foul.victim, f0, f1, a);
          fz.jolt.setAttribute('transform', `translate(${v[0].toFixed(2)} ${(-v[1]).toFixed(2)}) scale(${(0.8 + ja * 0.45).toFixed(2)})`);
          fz.jolt.setAttribute('opacity', Math.max(0, 1 - ja / 6).toFixed(2));
        }
        // The flag: thrown high, spinning, then lying on the grass at the spot
        const ft2 = (fi - foul.frame) / FLAG_AIR;
        L.flagG.setAttribute('visibility', ft2 >= 0 ? 'visible' : 'hidden');
        if (ft2 >= 0) {
          const u = Math.min(1, ft2), hgt = 4 * 2.6 * u * (1 - u);
          const fx2 = fz.from[0] + (fz.spot[0] - fz.from[0]) * u, fy2 = fz.from[1] + (fz.spot[1] - fz.from[1]) * u;
          const flutter = u >= 1 ? 6 * Math.sin(fi * 0.5) : 0;
          L.flagG.setAttribute('transform', `translate(${fx2.toFixed(2)} ${(-fy2 - hgt * 0.35).toFixed(2)}) rotate(${(u < 1 ? 900 * u : 25 + flutter).toFixed(0)}) scale(${(1 + hgt * 0.18).toFixed(2)})`);
        }
      }
      if (walkOff && fi >= walkOff.at) {
        // The ball and the line of scrimmage walked off to the new spot
        const t = ease(Math.min(1, (fi - walkOff.at) / 16));
        const ly = los + (walkOff.los - los) * t, gy = (ev.snapDistance ?? 10) + los + (walkOff.gain - los - (ev.snapDistance ?? 10)) * t;
        L.los.setAttribute('y1', String(-ly));
        L.los.setAttribute('y2', String(-ly));
        L.gain.setAttribute('y1', String(-gy));
        L.gain.setAttribute('y2', String(-gy));
        L.gain.setAttribute('visibility', walkOff.gain < 100 ? 'visible' : 'hidden');
        L.ball.setAttribute('transform', `translate(${(bx + (CX - bx) * t).toFixed(2)} ${(-(by + (walkOff.los - by) * t)).toFixed(2)}) rotate(-90)`);
        L.shadow.setAttribute('visibility', 'hidden');
        if (t >= 1 && !chainMoved) {
          chainMoved = true;
          setChain(walkOff.los, walkOff.gain, walkOff.down, true);
        }
      }
      for (const [sd, from] of hype) setHype(sd, fi >= from && fi < from + 90);
      svgRef.current?.setAttribute('viewBox', `${(-M + jolt).toFixed(2)} ${(camY - vhRef.current / 2 + jolt * 0.6).toFixed(2)} ${VW} ${vhRef.current.toFixed(2)}`);
      const scored = ev.scoreType === 'TOUCHDOWN' && fi >= play.end;
      const top = by > 50;
      L.td.setAttribute('visibility', scored && !bare ? 'visible' : 'hidden'); // the test page's banner already says it
      L.labels.setAttribute('visibility', scored ? 'hidden' : 'visible');
      const [, tdY] = scr(CX, top ? -105 : 5);
      L.td.setAttribute('y', (tdY + 1.8).toFixed(2));
      L.ezTop.setAttribute('visibility', scored && top ? 'hidden' : 'visible');
      L.ezBottom.setAttribute('visibility', scored && !top ? 'hidden' : 'visible');
    };
    render(0);
    return { render, rate: (fi: number) => (CUES ? paceAt(cues, fi) : 1), frames: play.p.length, end: whistle, flipAt, flagAt, foul, injury };
  };

  const pick = (k: string, v: string, set: (v: string) => void) => {
    set(v);
    try {
      localStorage.setItem(k, v);
    } catch {
      // storage unavailable: the choice holds for this session
    }
  };
  const segBtn = (on: boolean): React.CSSProperties => ({
    font: '700 12px system-ui, sans-serif', padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
    border: `1.5px solid ${on ? '#15803D' : '#CBD5E1'}`, background: on ? '#16A34A' : '#F8FAFC', color: on ? '#fff' : '#334155'
  });

  return (
    <div style={fill ? { height: '100%' } : bare ? { marginBottom: 12, boxShadow: '0 4px 14px rgba(15,23,42,.25)' } : { background: '#1B4D3E', borderRadius: '8px', padding: '8px', marginBottom: '12px', border: '2px solid #2E7D32' }}>
      <div ref={wrapRef} style={fill ? { position: 'relative', height: '100%', background: '#2B7630' } : { position: 'relative' }}>
        <svg ref={svgRef} viewBox={`${-M} -60 ${VW} ${VH}`} style={{ width: '100%', height: fill ? '100%' : 'auto', display: 'block', borderRadius: bare ? 0 : 4 }} role="img" aria-label="The play on the field" />
        {overlay}
      </div>
      {(!bare || caption) && <div style={{ marginTop: '8px', padding: bare ? '0 8px' : 0 }}>{caption}</div>}
      <div style={{ marginTop: 8, display: manual || bare ? 'none' : 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#BBF7D0', letterSpacing: '.05em' }}>SPEED</span>
        {['1', '2', '4'].map((v) => (
          <button key={v} type="button" style={segBtn(String(speed) === v)} onClick={() => pick(SPEED_KEY, v, (x) => setSpeed(Number(x)))}>{v}x</button>
        ))}
        {!clip && (
          <>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#BBF7D0', letterSpacing: '.05em', marginLeft: 6 }}>SHOW</span>
            {[['every', 'Every play'], ['big', 'Big plays']].map(([v, l]) => (
              <button key={v} type="button" style={segBtn(show === v)} onClick={() => pick(SHOW_KEY, v, setShow)}>{l}</button>
            ))}
          </>
        )}
      </div>
      {!ready && <div style={{ color: '#BBF7D0', fontSize: 12, marginTop: 6 }}>Loading the play library…</div>}
    </div>
  );
};
