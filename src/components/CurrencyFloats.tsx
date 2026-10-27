import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCP } from '../sim/coachPoints';
import { formatDucats } from '../data/ducats';
import { useDucats } from '../services/ducats';

/*
 * Spending, made visible. When Coach Points or ducats go down, a red "−₡20" floats up from the button the coach
 * tapped (or from the balance, when nothing was tapped) and the balance squeezes, counts down and springs back to its
 * size. Gains float up green from the balance. Ducats have no badge of their own, so one slides into the top bar over
 * Prestige and Rating while they change. The balances are watched, so every spend on every screen shows.
 */

// Where the coach last tapped: the number floats up from the top of that button
let lastTap: { x: number; y: number; at: number } | null = null;
let listening = false;
function listenForTaps() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target instanceof Element ? e.target.closest('button, a, [role="button"]') : null;
      const r = target?.getBoundingClientRect();
      lastTap = r ? { x: r.left + r.width / 2, y: r.top, at: Date.now() } : { x: e.clientX, y: e.clientY - 12, at: Date.now() };
    },
    true
  );
}
const tapWithin = (ms: number) => (lastTap && Date.now() - lastTap.at <= ms ? lastTap : null);

const BIG_SPEND = 500; // talents and the like: a bigger number
const COUNT_MS = 450;
const DUCAT_CHIP_MS = 2750; // the ducat badge stays this long after the last change

interface Float {
  id: number;
  text: string;
  kind: 'spend' | 'gain';
  x: number;
  y: number;
  big: boolean;
  fromBadge: boolean; // drops out of the balance and rises back (no tap to start from)
}

let nextFloatId = 1;
function useFloats() {
  const [floats, setFloats] = useState<Float[]>([]);
  const add = (f: Omit<Float, 'id'>) => setFloats((list) => [...list, { ...f, id: nextFloatId++ }]);
  const remove = (id: number) => setFloats((list) => list.filter((f) => f.id !== id));
  const layer = createPortal(
    floats.map((f) => (
      <div
        key={f.id}
        aria-hidden="true"
        className={`currency-float currency-float-${f.kind}${f.big ? ' currency-float-big' : ''}${f.fromBadge ? ' currency-float-badge' : ''}`}
        style={{ left: f.x, top: f.fromBadge ? f.y : f.y - 18 }}
        onAnimationEnd={() => remove(f.id)}
      >
        {f.text}
      </div>
    )),
    document.body
  );
  return { add, layer };
}

/** Restarts a one-shot animation class (a second spend mid-squeeze starts again from full size). */
function pulse(el: HTMLElement | null, cls: string) {
  if (!el) return;
  el.classList.remove('currency-hit', 'currency-got');
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Counts the shown number from where it is to the new balance; null when it shows the balance itself. */
function useCount() {
  const [shown, setShown] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const run = (from: number, to: number) => {
    cancelAnimationFrame(raf.current);
    const start = shownRef.current ?? from;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_MS);
      const v = k < 1 ? Math.round(start + (to - start) * (1 - (1 - k) ** 3)) : null;
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  const stop = () => {
    cancelAnimationFrame(raf.current);
    shownRef.current = null;
    setShown(null);
  };
  return { shown, run, stop };
}

/** The Coach PTS badge in the top bar. resetKey changes with a new or loaded career: that jump isn't a spend. */
export const CoachPointsBadge: React.FC<{ coachPoints: number; resetKey: string; style: React.CSSProperties; labelStyle: React.CSSProperties }> = ({
  coachPoints,
  resetKey,
  style,
  labelStyle
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef({ cp: coachPoints, key: resetKey });
  const { add, layer } = useFloats();
  const count = useCount();
  useEffect(listenForTaps, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = { cp: coachPoints, key: resetKey };
    const delta = coachPoints - before.cp;
    if (before.key !== resetKey) return count.stop();
    if (delta === 0 || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const atBadge = { x: r.left + r.width / 2, y: r.bottom - 4, fromBadge: true };
    if (delta < 0) {
      const tap = tapWithin(1000);
      add({ text: `−${formatCP(-delta)}`, kind: 'spend', big: -delta >= BIG_SPEND, ...(tap ? { x: tap.x, y: tap.y, fromBadge: false } : atBadge) });
      pulse(ref.current, 'currency-hit');
    } else {
      add({ text: `+${formatCP(delta)}`, kind: 'gain', big: false, ...atBadge });
      pulse(ref.current, 'currency-got');
    }
    count.run(before.cp, coachPoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachPoints, resetKey]);

  const value = count.shown ?? coachPoints;
  return (
    <span ref={ref} aria-label={`Coach Points: ${coachPoints}`} title={`Coach Points: ${formatCP(coachPoints)}`} style={style}>
      {/* Five figures shorten (₡12.3k) so the bar stays one line on the narrowest phones */}
      {value >= 10000 ? `₡${(value / 1000).toFixed(1)}k` : formatCP(value)}
      <span style={labelStyle}>Coach PTS</span>
      {layer}
    </span>
  );
};

/** Ducats have no badge: this one slides in over Prestige and Rating (its slot) while the balance changes. */
export const DucatChip: React.FC = () => {
  const { balance } = useDucats();
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(balance);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const [shown, setShown] = useState(false);
  const { add, layer } = useFloats();
  const count = useCount();
  useEffect(listenForTaps, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const before = prev.current;
    prev.current = balance;
    // Only a known balance that changes (not signing in or out, or the first look)
    if (before === null || balance === null || before === balance || !ref.current) return;
    const delta = balance - before;
    setShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), DUCAT_CHIP_MS);
    const r = ref.current.getBoundingClientRect();
    const atChip = { x: r.left + r.width / 2, y: r.bottom - 4, fromBadge: true };
    // Paying for a coach waits on the server first: the tap can be a few seconds back
    const tap = delta < 0 ? tapWithin(10000) : null;
    add({
      text: `${delta < 0 ? '−' : '+'}${formatDucats(Math.abs(delta))}`,
      kind: delta < 0 ? 'spend' : 'gain',
      big: false,
      ...(tap ? { x: tap.x, y: tap.y, fromBadge: false } : atChip)
    });
    const face = ref.current.firstElementChild as HTMLElement | null;
    count.run(before, balance);
    // The squeeze once the badge has slid in
    setTimeout(() => pulse(face, delta < 0 ? 'currency-hit' : 'currency-got'), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);

  const value = count.shown ?? balance ?? 0;
  return (
    <span ref={ref} className={`ducat-chip${shown ? ' is-shown' : ''}`} aria-hidden={!shown} role="status">
      <span className="ducat-chip-face">
        <span className="ducat-chip-coin">₾</span>
        <span>
          {formatDucats(value)}
          <span className="ducat-chip-label">Ducats</span>
        </span>
      </span>
      {layer}
    </span>
  );
};
