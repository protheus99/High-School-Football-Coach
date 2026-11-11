// PLAYTEST ONLY: the match page's three scoreboards, now that the field shows the down and distance:
// 'stadium' (the default: a slate stadium board, each school's name plate in its colors, the score, the timeouts left,
// and DOWN / TO GO / BALL ON / QTR under the clock), 'simple' (a generic blue board like the Electro-Mech LX3630, with
// the school names) and 'score' (just the score and the clock). Long names drop a size, then end in "...".
import React from 'react';
import { GameSimulationState, Team } from '../types/game';
import { markColors } from './markColors';

// Seven-segment lamps: which segments light for each character (a top, b top right, c bottom right, d bottom,
// e bottom left, f top left, g middle)
const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  t: 'fged', ' ': '', '-': 'g'
};
const SEG_PATH: Record<string, string> = {
  a: 'M2.2 1 H7.8 L6.8 2.2 H3.2 Z',
  b: 'M8.2 1.4 V8.4 L7.1 7.6 V2.5 Z',
  c: 'M8.2 9.6 V16.6 L7.1 15.5 V10.4 Z',
  d: 'M2.2 17 H7.8 L6.8 15.8 H3.2 Z',
  e: 'M1.8 9.6 V16.6 L2.9 15.5 V10.4 Z',
  f: 'M1.8 1.4 V8.4 L2.9 7.6 V2.5 Z',
  g: 'M2.3 9 L3.2 8.3 H6.8 L7.7 9 L6.8 9.7 H3.2 Z'
};
const LIT = '#FFD54A', DARK = 'rgba(255,255,255,.07)';

/** One lamp cell: black, a lit digit (or blank), the unlit segments faintly visible */
const Digit: React.FC<{ ch: string; h: number }> = ({ ch, h }) => {
  const on = SEGS[ch] ?? '';
  return (
    <svg viewBox="0 0 10 18" style={{ height: h, width: (h * 10) / 18, display: 'block', overflow: 'visible' }} aria-hidden="true">
      {Object.entries(SEG_PATH).map(([k, d]) => (
        <path key={k} d={d} fill={on.includes(k) ? LIT : DARK} style={on.includes(k) ? { filter: 'drop-shadow(0 0 .6px #FFB300)' } : undefined} />
      ))}
    </svg>
  );
};
/** A row of lamp cells in a black box (text is right-aligned into `cells` cells, like a real board) */
const Lamps: React.FC<{ text: string; cells: number; h: number; label: string; colonAfter?: number }> = ({ text, cells, h, label, colonAfter }) => {
  const chars = text.padStart(cells, ' ').slice(-cells).split('');
  return (
    <div role="img" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: h * 0.12, background: '#050608', borderRadius: 4, padding: `${h * 0.14}px ${h * 0.16}px`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06), inset 0 2px 6px rgba(0,0,0,.8)' }}>
      {chars.map((c, i) => (
        <React.Fragment key={i}>
          <Digit ch={c} h={h} />
          {colonAfter === i + 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: h * 0.28, padding: `0 ${h * 0.04}px` }}>
              <span style={{ width: h * 0.11, height: h * 0.11, borderRadius: 9, background: LIT, boxShadow: '0 0 3px #FFB300' }} />
              <span style={{ width: h * 0.11, height: h * 0.11, borderRadius: 9, background: LIT, boxShadow: '0 0 3px #FFB300' }} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

const label: React.CSSProperties = { color: '#FFFFFF', font: '900 9.5px system-ui, sans-serif', letterSpacing: '.06em', textAlign: 'center', lineHeight: 1 };
const clockText = (s: GameSimulationState) =>
  `${Math.floor(s.clockSecondsRemaining / 60)}`.padStart(2, ' ') + `${s.clockSecondsRemaining % 60}`.padStart(2, '0');

// The stadium board's neutral slate: the schools' colors stay on their name plates
const SLATE = { bg: '#4A5361', edge: '#2F3641', frame: '#E5C33A', inset: '#2F3641' };

export type ScoreboardVariant = 'score' | 'stadium' | 'simple';

interface Props {
  variant: ScoreboardVariant;
  board: GameSimulationState;
  down: number;
  distance: number;
  /** The ball's spot from the offense's own goal line */
  yardLine: number;
  /** Each school's mark on the field, shown with its name (none: O's and X's go by side of the ball) */
  markOf?: (t: Team) => 'O' | 'X';
  /** Halftime: no down, distance or spot on the board */
  blankDown?: boolean;
}

export const ReplayScoreboard: React.FC<Props> = ({ variant, board, down, distance, yardLine, markOf, blankDown }) => {
  const { homeTeam: home, awayTeam: away } = board;
  const homeBall = board.possessionTeamId === home.id;
  const q = board.currentQuarter === 'OT' ? 'OT' : `Q${board.currentQuarter}`;
  const clock = `${Math.floor(board.clockSecondsRemaining / 60)}:${(board.clockSecondsRemaining % 60).toString().padStart(2, '0')}`;
  const tol = (t: Team) => board.timeoutsLeft?.[t.id] ?? 3;
  const ballOn = yardLine > 50 ? 100 - yardLine : yardLine;
  const qtr = board.currentQuarter === 'OT' ? 't' : String(board.currentQuarter);
  const info: [string, string, number][] = [
    ['DOWN', blankDown ? '' : String(down), 1],
    ['TO GO', blankDown ? '' : String(Math.min(99, distance)), 2],
    ['BALL ON', blankDown ? '' : String(ballOn), 2],
    ['QTR', qtr, 1]
  ];

  if (variant === 'score') {
    // Just the score: the names, the points and the clock (the field shows the rest)
    const side = (t: Team, pts: number, right: boolean) => (
      <div style={{ minWidth: 0, textAlign: right ? 'right' : 'left' }}>
        <div style={{ display: 'flex', gap: 4, justifyContent: right ? 'flex-end' : 'flex-start', alignItems: 'center', minWidth: 0 }}>
          {right && board.possessionTeamId === t.id && <span aria-label="has the ball">🏈</span>}
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
          {!right && board.possessionTeamId === t.id && <span aria-label="has the ball">🏈</span>}
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{pts}</div>
      </div>
    );
    return (
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', boxShadow: '0 1px 3px rgba(15,23,42,.08)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8, flex: 'none' }}>
        {side(away, board.awayScore, false)}
        <div style={{ textAlign: 'center', fontWeight: 900, color: '#B45309', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
          {q}
          <div style={{ fontSize: 19, color: '#0F172A' }}>{clock}</div>
        </div>
        {side(home, board.homeScore, true)}
      </div>
    );
  }

  if (variant === 'simple') {
    // The generic board: the school names over the score, the timeouts left (TOL), a football lit for possession
    const big = (t: Team) => (
      <span style={{ display: 'block', maxWidth: '100%', textAlign: 'center', color: '#fff', font: `italic 900 ${t.name.length > 10 ? 15 : 18}px system-ui, sans-serif`, letterSpacing: '.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {t.name.toUpperCase()}
      </span>
    );
    const tolBox = (t: Team) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Lamps text={String(tol(t))} cells={1} h={15} label={`${t.name}: ${tol(t)} timeouts left`} />
        <div style={label}>TOL</div>
      </div>
    );
    const ball = (on: boolean, t: Team) => (
      <span aria-label={on ? `${t.name} has the ball` : undefined} style={{ width: 26, height: 14, background: '#050608', borderRadius: 3, display: 'grid', placeItems: 'center', color: on ? LIT : 'transparent', font: '900 12px system-ui' }}>⬭</span>
    );
    const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 };
    return (
      <div style={{ background: '#2F62B3', border: '3px solid #1E3A6E', borderRadius: 8, padding: '6px 8px 7px', boxShadow: '0 3px 10px rgba(15,23,42,.25)', flex: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 6, alignItems: 'start' }}>
          <div style={col}>
            {big(away)}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
              {tolBox(away)}
              <Lamps text={String(board.awayScore)} cells={board.awayScore > 99 ? 3 : 2} h={24} label={`${away.name} ${board.awayScore}`} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <span style={{ border: '2px solid #E5C33A', borderRadius: 4, padding: 2 }}>
              <Lamps text={clockText(board)} cells={4} h={22} colonAfter={2} label={`${q} ${clock}`} />
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {ball(!homeBall, away)}
              {ball(homeBall, home)}
            </div>
          </div>
          <div style={col}>
            {big(home)}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
              <Lamps text={String(board.homeScore)} cells={board.homeScore > 99 ? 3 : 2} h={24} label={`${home.name} ${board.homeScore}`} />
              {tolBox(home)}
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.25)', marginTop: 6, paddingTop: 5, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {info.map(([l, v, n]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ color: '#fff', font: 'italic 900 11px system-ui, sans-serif' }}>{l === 'QTR' ? 'QTR.' : l}</span>
              <Lamps text={v} cells={n} h={16} label={`${l} ${v === 't' ? 'OT' : v || 'blank'}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // The stadium board (the default), in a neutral slate. Each school's name plate is in its own colors, with its mark
  // on the field when it keeps one; a long name drops a size, then is cut with "..."
  const plate = (t: Team) => {
    const c = markColors(t), m = markOf?.(t);
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: c.main, border: `2px solid ${c.edge}`, borderRadius: 5, padding: '2px 4px', color: '#fff', font: `900 ${t.name.length > 9 ? 10 : 11}px system-ui, sans-serif`, whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
        {m && (
          <span aria-hidden="true" style={{ flex: 'none', width: 12, height: 12, display: 'grid', placeItems: 'center', borderRadius: m === 'O' ? 99 : 2, boxShadow: m === 'O' ? `inset 0 0 0 2.5px ${c.edge}` : 'none', color: c.edge, font: '900 12px system-ui', lineHeight: 1 }}>
            {m === 'X' ? '✕' : ''}
          </span>
        )}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name.toUpperCase()}</span>
      </div>
    );
  };
  const arrow = (show: boolean, dir: '<' | '>') => (
    <div
      aria-label={show ? `${dir === '<' ? away.name : home.name} has the ball` : undefined}
      style={{ width: 15, height: 15, display: 'grid', placeItems: 'center', background: '#050608', borderRadius: 3, color: show ? LIT : 'rgba(255,255,255,.07)', font: '900 10px system-ui', textShadow: show ? '0 0 5px #FFB300' : 'none' }}
    >
      {dir === '<' ? '◀' : '▶'}
    </div>
  );
  const side = (t: Team, pts: number, left: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {plate(t)}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        {!left && arrow(homeBall, '>')}
        <Lamps text={String(pts)} cells={pts > 99 ? 3 : 2} h={24} label={`${t.name} ${pts}`} />
        {left && arrow(!homeBall, '<')}
      </div>
      <div style={{ textAlign: 'center', font: '800 9px system-ui, sans-serif', color: '#CBD5E1', letterSpacing: '.06em' }}>{tol(t)} TIMEOUTS</div>
    </div>
  );
  return (
    <div style={{ background: SLATE.bg, border: `2px solid ${SLATE.edge}`, borderRadius: 10, padding: '6px 8px 7px', boxShadow: '0 3px 10px rgba(15,23,42,.25)', flex: 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 7, alignItems: 'start' }}>
        {side(away, board.awayScore, true)}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ border: `2px solid ${SLATE.frame}`, borderRadius: 5, padding: 2, background: SLATE.inset }}>
            <Lamps text={clockText(board)} cells={4} h={20} colonAfter={2} label={`${q} ${clock}`} />
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 6px', alignItems: 'center' }}>
            {info.map(([l, v, n]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                <span style={label}>{l}</span>
                <Lamps text={v} cells={n} h={12} label={`${l} ${v === 't' ? 'OT' : v || 'blank'}`} />
              </div>
            ))}
          </div>
        </div>
        {side(home, board.homeScore, false)}
      </div>
    </div>
  );
};
