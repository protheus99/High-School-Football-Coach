// PLAYTEST ONLY: the pieces of the match page (Game Screen Replay), the approved no-scroll layout: the four plan boxes
// under the field, the choice cards that open over the field (a plan pick, a timeout, a decision that's due), the
// timeout banner in the calling school's colors, the sheets that slide up (Stats, Other scores, Options, Play-by-play),
// and the halftime panel that takes the field's place.
import React, { useState } from 'react';
import { GameSimulationState, PlayEvent, PlayerStats, Team } from '../types/game';
import { addPlayerStats, createEmptyPlayerStats } from '../sim/playerStats';
import { readableOnWhite } from '../utils/color';
import { shortName } from '../utils/playerFormat';
import { PenaltyFlag } from '../components/ui/PenaltyFlag';
import { TalkOption } from '../sim/talkPicker';
import { FAMILY_COLORS } from '../sim/talks';
import { FieldLook } from './ReplayField';
import { markColors } from './markColors';
import { DEFAULT_REPLAY_OPTIONS, ReplayOptions } from './matchOptions';

export const MP_CSS = `
.mp-page { position: relative; height: 100dvh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 8px 8px 0; overflow: hidden; background: #F1F5F9; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box }
.mp-page *, .mp-page *::before, .mp-page *::after { box-sizing: border-box }
.mp-page button { font-family: inherit; cursor: pointer }
.mp-field { position: relative; flex: 1 1 auto; min-height: 190px; border-radius: 10px; overflow: hidden; background: #2B7630; box-shadow: 0 4px 14px rgba(15,23,42,.25) }
.mp-plan { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; flex: none }
.mp-pb { background: #fff; border: 1px solid #E2E8F0; border-radius: 10px; padding: 6px 3px 7px; text-align: center; box-shadow: 0 1px 3px rgba(15,23,42,.08); min-width: 0; display: flex; flex-direction: column; justify-content: center }
.mp-pb small { display: block; font: 700 10.5px system-ui, sans-serif; letter-spacing: .05em; text-transform: uppercase; color: #64748B }
.mp-pb b { display: block; font: 800 12px/1.15 system-ui, sans-serif; letter-spacing: -.01em; color: #1D4ED8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.mp-pb[aria-expanded="true"] { border: 2px solid #1D4ED8; padding: 5px 2px 6px }
.mp-pb:disabled { opacity: .55; cursor: default }
.mp-ctl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; flex: none }
.mp-ctl > div { display: contents }
.mp-ret { grid-column: 1 / -1; font: 900 15px system-ui, sans-serif; border: none; border-radius: 9px; padding: 12px; min-height: 48px; color: #fff; background: #047857; box-shadow: 0 3px 0 rgba(0,0,0,.18) }
.mp-ret:disabled { background: #E2E8F0; color: #94A3B8; box-shadow: none; cursor: default }
.mp-pbp { flex: none; background: #fff; border: 1px solid #E2E8F0; border-radius: 10px; padding: 6px 10px; font-size: 12.5px; line-height: 1.35; color: #334155; text-align: left; box-shadow: 0 1px 3px rgba(15,23,42,.06); min-width: 0 }
.mp-pbp span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.mp-bottom { margin-top: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 0 0 calc(10px + env(safe-area-inset-bottom, 0px)); flex: none }
.mp-qb { display: flex; align-items: center; justify-content: center; gap: 5px; font: 800 12.5px system-ui, sans-serif; color: #0F172A; background: #fff; border: 1px solid #CBD5E1; border-left: 4px solid #2563EB; border-radius: 9px; padding: 10px 2px; white-space: nowrap; min-width: 0; box-shadow: 0 2px 0 rgba(15,23,42,.08) }
.mp-qb.mp-opts { border-left-color: #16A34A }
.mp-chooser { position: absolute; left: 6px; right: 6px; bottom: 6px; z-index: 6; background: #fff; border-radius: 12px; box-shadow: 0 10px 28px rgba(0,0,0,.4); padding: 10px; border: 2px solid #1D4ED8 }
.mp-chooser h3 { margin: 0 0 8px; font: 900 13px system-ui, sans-serif; letter-spacing: .05em; color: #1E3A8A; display: flex; justify-content: space-between; align-items: center; gap: 8px; text-transform: uppercase }
.mp-chooser .mp-sub { font: 600 13px system-ui, sans-serif; color: #334155; margin: -2px 0 8px }
.mp-x { flex: none; border: none; background: #E2E8F0; border-radius: 99px; width: 28px; height: 28px; font: 900 13px system-ui, sans-serif; color: #334155 }
.mp-opts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px }
.mp-opt { text-align: left; border: 1.5px solid #CBD5E1; background: #F8FAFC; border-radius: 9px; padding: 7px 9px; font: 800 13px system-ui, sans-serif; color: #0F172A; min-height: 44px; min-width: 0 }
.mp-opt span { display: block; font: 600 11.5px system-ui, sans-serif; color: #64748B }
.mp-opt[aria-pressed="true"] { background: #1D4ED8; border-color: #1E3A8A; color: #fff }
.mp-opt[aria-pressed="true"] span { color: #DBEAFE }
.mp-opt:disabled { opacity: .45; cursor: default }
.mp-chooser.mp-due { border-color: #F59E0B; background: #FFFBEB }
.mp-chooser.mp-due h3 { color: #92400E }
.mp-chooser.mp-due .mp-opt { background: #1F2937; border-color: #1F2937; color: #fff; text-align: center }
.mp-chooser.mp-due .mp-opt span { color: #CBD5E1 }
.mp-tob { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 7; color: #fff; border: 3px solid; border-radius: 12px; text-align: center; padding: 7px 8px 8px; font: 900 22px system-ui, sans-serif; letter-spacing: .04em; box-shadow: 0 6px 18px rgba(0,0,0,.35); animation: mp-drop .25s ease-out }
.mp-tob .mp-tm { display: inline-flex; align-items: center; gap: 7px }
.mp-tob small { display: block; color: #E2E8F0; font: 700 13px system-ui, sans-serif; letter-spacing: 0; margin-top: 2px }
@keyframes mp-drop { from { transform: translateY(-14px); opacity: 0 } to { transform: none; opacity: 1 } }
.mp-dim { position: absolute; inset: 0; background: rgba(15,23,42,.35); z-index: 20; opacity: 0; pointer-events: none; transition: opacity .2s }
.mp-dim.mp-on { opacity: 1; pointer-events: auto }
.mp-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: 86%; z-index: 21; background: #fff; border-radius: 20px 20px 0 0; box-shadow: 0 -12px 30px rgba(0,0,0,.35); display: flex; flex-direction: column; transform: translateY(105%); transition: transform .28s ease; visibility: hidden }
.mp-sheet.mp-on { transform: none; visibility: visible }
.mp-sheet header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px 8px; border-bottom: 1px solid #E2E8F0 }
.mp-sheet header b { font: 900 16px system-ui, sans-serif; color: #0F172A }
.mp-sheet .mp-body { overflow-y: auto; padding: 4px 14px calc(16px + env(safe-area-inset-bottom, 0px)) }
.mp-grab { width: 40px; height: 4px; border-radius: 9px; background: #CBD5E1; margin: 8px auto 0 }
.mp-mo { margin-top: 10px }
.mp-mo .mp-t { font: 700 13px system-ui, sans-serif; color: #0F172A; margin-bottom: 4px }
.mp-mo .mp-s { display: flex; gap: 5px }
.mp-mo .mp-s button { flex: 1; font: 800 12px system-ui, sans-serif; padding: 7px 4px; border-radius: 8px; border: 2px solid #CBD5E1; background: #F8FAFC; color: #334155; min-width: 0 }
.mp-mo .mp-s button[aria-pressed="true"] { background: #16A34A; border-color: #15803D; color: #fff }
.mp-mo .mp-s button:disabled { opacity: .45; cursor: default }
.mp-half { position: absolute; inset: 0; z-index: 5; background: #fff; padding: 9px 10px 8px; display: flex; flex-direction: column; gap: 7px; overflow: hidden }
.mp-half .mp-hd { display: flex; justify-content: space-between; align-items: baseline; gap: 8px }
.mp-half .mp-hd b { font: 900 15.5px system-ui, sans-serif; white-space: nowrap; color: #0F172A }
.mp-half .mp-hd span { font: 700 12px system-ui, sans-serif; white-space: nowrap }
.mp-half .mp-fh { display: grid; grid-template-columns: 1fr 1fr; gap: 4px }
.mp-half .mp-fh span { background: #F1F5F9; border-radius: 7px; padding: 4px 7px; font: 600 12px system-ui, sans-serif; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.mp-half .mp-tt { display: flex; justify-content: space-between; align-items: baseline; font: 900 13px system-ui, sans-serif; color: #0F172A }
.mp-half .mp-tt small { font: 700 11px system-ui, sans-serif; color: #475569 }
.mp-sp { text-align: left; background: #fff; border: 1px solid #CBD5E1; border-left-width: 5px; border-radius: 9px; padding: 5px 9px 6px; display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: none }
.mp-sp q { font: italic 800 13px system-ui, sans-serif; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block }
.mp-sp .mp-tg { display: flex; gap: 4px; flex-wrap: nowrap; overflow: hidden }
.mp-sp .mp-tg i { font: 800 10.5px system-ui, sans-serif; font-style: normal; padding: 1px 7px; border-radius: 99px; white-space: nowrap }
.mp-sp[aria-pressed="true"] { background: var(--tint); border-color: var(--edge); box-shadow: 0 0 0 1px var(--edge) }
.mp-row { display: grid; grid-template-columns: 3.6em 1fr 3.6em; align-items: baseline; font-variant-numeric: tabular-nums }
.mp-row b { font-size: 15px; color: #0F172A }
.mp-row b:last-child { text-align: right }
.mp-row span { text-align: center; font: 600 13.5px system-ui, sans-serif; color: #334155 }
`;

// ---------- the plan bar and the cards that open over the field ----------

export interface PlanItem {
  key: string;
  label: string;
  value: string;
  disabled?: boolean;
}

/** Offense | Defense | 2nd String | Timeout: two lines each at most (the choice is cut with "..." before it wraps) */
export const PlanBar: React.FC<{ items: PlanItem[]; open: string | null; onToggle: (key: string) => void }> = ({ items, open, onToggle }) => (
  <div className="mp-plan">
    {items.map((it) => (
      <button key={it.key} type="button" className="mp-pb" aria-expanded={open === it.key} disabled={it.disabled} onClick={() => onToggle(it.key)}>
        <small>{it.label}</small>
        <b>{it.value}</b>
      </button>
    ))}
  </div>
);

/** A card over the bottom of the field: a plan choice, a timeout, or a decision that's due (`due`) */
export const Chooser: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; due?: boolean; onClose?: () => void; children: React.ReactNode }> = ({ title, sub, due, onClose, children }) => (
  <div className={`mp-chooser${due ? ' mp-due' : ''}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
    <h3>
      <span>{title}</span>
      {onClose && (
        <button type="button" className="mp-x" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      )}
    </h3>
    {sub && <div className="mp-sub">{sub}</div>}
    <div className="mp-opts-grid">{children}</div>
  </div>
);

export const Opt: React.FC<{ name: React.ReactNode; note?: React.ReactNode; picked?: boolean; disabled?: boolean; onClick: () => void }> = ({ name, note, picked, disabled, onClick }) => (
  <button type="button" className="mp-opt" aria-pressed={picked ?? undefined} disabled={disabled} onClick={onClick}>
    {name}
    {note && <span>{note}</span>}
  </button>
);

// ---------- the timeout banner ----------

/** TIMEOUT in the calling school's colors: its main color, its second color around the banner and on its O or X */
export const TimeoutBanner: React.FC<{ team: Team; mark?: 'O' | 'X'; line: string }> = ({ team, mark, line }) => {
  const c = markColors(team);
  return (
    <div className="mp-tob" role="status" style={{ background: c.main, borderColor: c.edge }}>
      <span className="mp-tm">
        {mark === 'O' ? (
          <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 99, boxShadow: `inset 0 0 0 3.5px ${c.edge}` }} />
        ) : mark === 'X' ? (
          <span aria-hidden="true" style={{ color: c.edge, font: '900 20px/18px system-ui' }}>
            ✕
          </span>
        ) : null}
        TIMEOUT
      </span>
      <small>{line}</small>
    </div>
  );
};

// ---------- the sheets that slide up ----------

export const Sheet: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => (
  <>
    <div className={`mp-dim${open ? ' mp-on' : ''}`} onClick={onClose} aria-hidden="true" />
    <div className={`mp-sheet${open ? ' mp-on' : ''}`} role="dialog" aria-label={title} aria-hidden={!open}>
      <div className="mp-grab" />
      <header>
        <b>{title}</b>
        <button type="button" className="mp-x" style={{ width: 30, height: 30, fontSize: 14 }} aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="mp-body">{open && children}</div>
    </div>
  </>
);

// ---------- game stats: Team stats and Player stats ----------

const teamTotals = (state: GameSimulationState, team: Team): PlayerStats => {
  const total = createEmptyPlayerStats();
  const stats = state.playerGameStats ?? {};
  team.roster.forEach((p) => stats[p.id] && addPlayerStats(total, stats[p.id]));
  return total;
};

/** Seconds each team had the ball: each snap's clock goes to the team that snapped it (timeouts already given back) */
const possessionSeconds = (state: GameSimulationState): Record<string, number> => {
  const top: Record<string, number> = {};
  let q: PlayEvent['quarter'] = 1;
  let clock = 720;
  for (const e of state.eventLog) {
    if (e.quarter === 'OT' || e.snapQuarter === 'OT') continue;
    const used = e.quarter === q ? clock - e.clockTimeRemainingSeconds : clock + (720 - e.clockTimeRemainingSeconds);
    const id = e.snapTeamId;
    if (id) top[id] = (top[id] ?? 0) + Math.max(0, used);
    q = e.quarter;
    clock = e.clockTimeRemainingSeconds;
  }
  return top;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const MarkIcon: React.FC<{ mark?: 'O' | 'X'; color: string }> = ({ mark, color }) =>
  mark === 'O' ? (
    <span aria-hidden="true" style={{ display: 'inline-block', width: 13, height: 13, verticalAlign: -2, borderRadius: 99, boxShadow: `inset 0 0 0 2.5px ${color}` }} />
  ) : mark === 'X' ? (
    <span aria-hidden="true" style={{ color, font: '900 13px/13px system-ui' }}>
      ✕
    </span>
  ) : null;

/** The stats sheet: Team stats (yards with bars in the school colors, first downs, time of possession) and Player
 * stats (each side's leader in passing, rushing and receiving yards, sacks and tackles) */
export const StatsBody: React.FC<{ state: GameSimulationState; markOf?: (t: Team) => 'O' | 'X'; when: string }> = ({ state, markOf, when }) => {
  const [tab, setTab] = useState<'team' | 'player'>('team');
  const { awayTeam: away, homeTeam: home } = state;
  const color = (t: Team) => readableOnWhite(t.primaryColor, t.secondaryColor);
  const [ac, hc] = [color(away), color(home)];
  const a = teamTotals(state, away), h = teamTotals(state, home);
  const top = possessionSeconds(state);
  const firstDowns = (t: Team) => state.eventLog.filter((e) => e.snapTeamId === t.id && !e.penalty && /FIRST DOWN/.test(e.textCommentary)).length;
  const tabBtn = (k: 'team' | 'player', l: string) => (
    <button type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
      style={{ flex: 1, font: '800 13px system-ui, sans-serif', padding: '8px 4px', borderRadius: 8, border: `2px solid ${tab === k ? '#0F172A' : '#CBD5E1'}`, background: tab === k ? '#0F172A' : '#F8FAFC', color: tab === k ? '#fff' : '#334155' }}>
      {l}
    </button>
  );
  const heads = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '12px 0 4px', font: '900 12px system-ui, sans-serif', letterSpacing: '.04em' }}>
      <span style={{ color: ac, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <MarkIcon mark={markOf?.(away)} color={ac} /> {away.name.toUpperCase()}
      </span>
      <span style={{ color: '#64748B', fontWeight: 700, fontSize: 11, flex: 'none' }}>{when}</span>
      <span style={{ color: hc, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
        {home.name.toUpperCase()} <MarkIcon mark={markOf?.(home)} color={hc} />
      </span>
    </div>
  );
  const tabs = <div style={{ display: 'flex', gap: 6, paddingTop: 8 }}>{tabBtn('team', 'Team stats')}{tabBtn('player', 'Player stats')}</div>;

  if (tab === 'team') {
    const bars: [string, number, number][] = [
      ['Total yards', a.passYards + a.rushYards, h.passYards + h.rushYards],
      ['Passing yards', a.passYards, h.passYards],
      ['Rushing yards', a.rushYards, h.rushYards]
    ];
    const rows: [string, string, string][] = [
      ['First downs', String(firstDowns(away)), String(firstDowns(home))],
      ['Time of possession', mmss(top[away.id] ?? 0), mmss(top[home.id] ?? 0)]
    ];
    return (
      <>
        {tabs}
        {heads}
        {bars.map(([l, x, y]) => {
          // (negative rushing can happen: the bar splits on what each side gained)
          const px = Math.max(0, x), py = Math.max(0, y), share = px + py > 0 ? (px / (px + py)) * 100 : 50;
          return (
            <div key={l} style={{ padding: '9px 0 7px' }}>
              <div className="mp-row"><b>{x}</b><span>{l}</span><b>{y}</b></div>
              <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                <span style={{ height: 6, borderRadius: 9, background: ac, width: `${share}%` }} />
                <span style={{ height: 6, borderRadius: 9, background: hc, flex: 1 }} />
              </div>
            </div>
          );
        })}
        <div style={{ height: 6 }} />
        {rows.map(([l, x, y]) => (
          <div key={l} style={{ padding: '10px 0', borderTop: '1px solid #EEF2F6' }}>
            <div className="mp-row"><b>{x}</b><span>{l}</span><b>{y}</b></div>
          </div>
        ))}
      </>
    );
  }

  // Player stats: the leader on each side (no pictures)
  const stats = state.playerGameStats ?? {};
  const leader = (t: Team, score: (s: PlayerStats) => number) => {
    let best: { p: Team['roster'][number]; s: PlayerStats } | null = null;
    for (const p of t.roster) {
      const s = stats[p.id];
      if (s && score(s) > 0 && (!best || score(s) > score(best.s))) best = { p, s };
    }
    return best;
  };
  const cats: [string, (s: PlayerStats) => number, (s: PlayerStats) => string, (s: PlayerStats) => string][] = [
    ['Passing yards', (s) => s.passYards, (s) => String(s.passYards), (s) => `${s.passCompletions}/${s.passAttempts}, ${s.passTDs} TD, ${s.interceptionsThrown} INT`],
    ['Rushing yards', (s) => s.rushYards, (s) => String(s.rushYards), (s) => `${s.rushAttempts} CAR`],
    ['Receiving yards', (s) => s.receivingYards, (s) => String(s.receivingYards), (s) => `${s.receptions} REC`],
    ['Sacks', (s) => s.sacks, (s) => String(s.sacks), () => ''],
    ['Tackles', (s) => s.tackles, (s) => String(s.tackles), (s) => (s.tacklesForLoss ? `${s.tacklesForLoss} TFL` : '')]
  ];
  const who = (l: ReturnType<typeof leader>, right: boolean, value: (s: PlayerStats) => string, sub: (s: PlayerStats) => string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start', minWidth: 0, textAlign: right ? 'right' : 'left' }}>
      {l ? (
        <>
          <b style={{ font: '900 22px system-ui, sans-serif', fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>{value(l.s)}</b>
          <span style={{ font: '800 13px system-ui, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', color: '#0F172A' }}>
            {shortName(l.p)} <span style={{ color: '#64748B', fontWeight: 700 }}>{l.p.position}</span>
          </span>
          {sub(l.s) && <span style={{ font: '600 11.5px system-ui, sans-serif', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{sub(l.s)}</span>}
        </>
      ) : (
        <b style={{ font: '900 22px system-ui, sans-serif', color: '#CBD5E1' }}>-</b>
      )}
    </div>
  );
  return (
    <>
      {tabs}
      {heads}
      {cats.map(([l, score, value, sub]) => (
        <div key={l} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 5.6em minmax(0,1fr)', alignItems: 'center', gap: 6, padding: '10px 0', borderTop: '1px solid #EEF2F6' }}>
          {who(leader(away, score), false, value, sub)}
          <span style={{ textAlign: 'center', font: '800 11.5px/1.2 system-ui, sans-serif', color: '#475569', textTransform: 'uppercase', letterSpacing: '.04em' }}>{l}</span>
          {who(leader(home, score), true, value, sub)}
        </div>
      ))}
    </>
  );
};

// ---------- halftime: the panel that takes the field's place ----------

/** A first-half line, with the referee's flag (not the 🚩 pennant) for the flags line */
const halfLine = (line: string) =>
  line.startsWith('🚩') ? (
    <>
      <PenaltyFlag size={14} /> {line.replace(/^🚩\s*/, '')}
    </>
  ) : (
    line
  );

export const HalftimePanel: React.FC<{ score: string; lines: string[]; options: TalkOption[]; picked: string | null; onPick: (id: string) => void }> = ({ score, lines, options, picked, onPick }) => (
  <div className="mp-half" role="region" aria-label="Halftime">
    <div className="mp-hd">
      <b>⏱️ Halftime</b>
      <span style={{ color: score.includes('Trailing') ? '#B91C1C' : score.includes('Leading') ? '#15803D' : '#475569' }}>{score}</span>
    </div>
    {lines.length > 0 && (
      <div className="mp-fh">
        {lines.slice(0, 4).map((l) => (
          <span key={l}>{halfLine(l)}</span>
        ))}
      </div>
    )}
    <div className="mp-tt">
      Halftime speech <small>★ Assistant recommends</small>
    </div>
    {options.map(({ talk, line }, i) => {
      const { edge, tint } = FAMILY_COLORS[talk.family];
      return (
        <button key={talk.id} type="button" className="mp-sp" aria-pressed={picked === talk.id} onClick={() => onPick(talk.id)}
          style={{ borderLeftColor: edge, ['--edge' as string]: edge, ['--tint' as string]: tint } as React.CSSProperties}>
          <q>{talk.lines[line]}</q>
          <span className="mp-tg">
            {talk.gains.map((g) => <i key={g} style={{ background: '#DCFCE7', color: '#166534' }}>{g}</i>)}
            {talk.costs.map((c) => <i key={c} style={{ background: '#FEE2E2', color: '#991B1B' }}>{c}</i>)}
            {talk.risky && <i style={{ background: '#FEF3C7', color: '#92400E' }}>⚡ High risk</i>}
            {i === 0 && <i style={{ color: '#1D4ED8', marginLeft: 'auto' }}>★</i>}
          </span>
        </button>
      );
    })}
    <div style={{ font: '600 11.5px system-ui, sans-serif', color: '#64748B' }}>{picked ? 'The plan below is for the second half.' : 'Select one to continue'}</div>
  </div>
);

// ---------- the Options sheet ----------

export const OptionsBody: React.FC<{ opts: ReplayOptions; set: (o: ReplayOptions) => void }> = ({ opts, set }) => {
  const look = opts.look;
  const setLook = (part: Partial<FieldLook>) => set({ ...opts, look: { ...look, ...part } });
  const seg = <T,>(label: string, value: T, choices: [string, T][], pick: (v: T) => void, off?: boolean) => (
    <div className="mp-mo" key={label}>
      <div className="mp-t" style={off ? { color: '#94A3B8' } : undefined}>{label}</div>
      <div className="mp-s">
        {choices.map(([l, v]) => (
          <button key={l} type="button" aria-pressed={value === v} disabled={off} onClick={() => pick(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const slider = (label: string, v: number, pick: (n: number) => void) => (
    <label className="mp-mo" style={{ display: 'block' }}>
      <div className="mp-t" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>{(v / 1000).toFixed(1)} s</span>
      </div>
      <input type="range" min={500} max={2000} step={100} value={v} aria-label={`${label} in seconds`} onChange={(e) => pick(Number(e.target.value))} style={{ width: '100%', accentColor: '#16A34A' }} />
    </label>
  );
  return (
    <>
      <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 8 }}>Changes apply from the next snap.</div>
      {seg<ReplayOptions['show']>('Plays shown', opts.show, [['Every play', 'every'], ['Big plays only', 'big']], (show) => set({ ...opts, show }))}
      {seg('Play-by-play', opts.pbp, [['Off', false], ['On', true]], (pbp) => set({ ...opts, pbp }))}
      {seg<ReplayOptions['scoreboard']>('Scoreboard', opts.scoreboard, [['Stadium', 'stadium'], ['Stadium simple', 'simple'], ['Score only', 'score']], (scoreboard) => set({ ...opts, scoreboard }))}
      {seg<FieldLook['style']>('Field', look.style, [['Before', 'now'], ['New', 'new']], (style) => setLook({ style }))}
      {seg<FieldLook['numbers']>('Yard numbers', look.numbers, [['Near the sideline', 'near'], ['Real position', 'real']], (numbers) => setLook({ numbers }), look.style === 'now')}
      {seg('Players size', look.big, [['As now', false], ['20% bigger', true]], (big) => setLook({ big }))}
      {seg('Ball height', look.height, [['Off', false], ['On', true]], (height) => setLook({ height }))}
      {seg('Field turns when the ball changes hands', look.flip, [['Off', false], ['On', true]], (flip) => setLook({ flip }))}
      {seg('Officials spot the ball', !!look.spotting, [['Off', false], ['On', true]], (spotting) => setLook({ spotting }))}
      {seg<NonNullable<FieldLook['marks']>>('Player marks', look.marks ?? 'side', [['O offense, X defense', 'side'], ['Each school keeps its own', 'team']], (marks) => setLook({ marks }))}
      {seg<NonNullable<FieldLook['colors']>>('Mark colors', look.colors ?? 'plain', [['White', 'plain'], ['School colors', 'school']], (colors) => setLook({ colors }))}
      {slider('🟨 Down card delay', opts.cardMs, (cardMs) => set({ ...opts, cardMs }))}
      {slider('🟩 Result banner delay', opts.bannerMs, (bannerMs) => set({ ...opts, bannerMs }))}
      {opts.playtest && (
        <>
          <div style={{ marginTop: 14, paddingTop: 8, borderTop: '1px solid #E2E8F0', font: '800 11.5px system-ui, sans-serif', letterSpacing: '.06em', color: '#64748B' }}>PLAYTEST</div>
          {seg<ReplayOptions['injuries']>('Injuries during the game', opts.injuries, [['Off', 'off'], ['Normal', 'normal'], ['Often', 'often']], (injuries) => set({ ...opts, injuries }))}
          {seg<ReplayOptions['penalties']>('Penalties', opts.penalties, [['As called', 'normal'], ['Twice as often', 'often']], (penalties) => set({ ...opts, penalties }))}
        </>
      )}
      <button type="button" onClick={() => set({ ...DEFAULT_REPLAY_OPTIONS, playtest: opts.playtest })}
        style={{ marginTop: 14, width: '100%', font: '700 13px system-ui, sans-serif', padding: 8, borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#F8FAFC', color: '#334155' }}>
        ↺ Back to the defaults
      </button>
    </>
  );
};
