// PLAYTEST ONLY: the replay test's options and its two overlays on the real live match screen: the down card over the
// lined-up players before the snap, and the result banner after the whistle (who did it, who stopped him, and the call:
// First Down!, Touchdown!, Turnover! ...), built from the game's own play-by-play line.
import React, { useEffect, useState } from 'react';
import { PenaltyFlag } from '../components/ui/PenaltyFlag';
import { flagResult } from '../sim/flagSequence';
import { PlayEvent, Team } from '../types/game';
import { ReplayPhase } from './matchOptions';



const ORD = ['', '1st', '2nd', '3rd', '4th'];
const NAME = "((?:QB|RB|FB|HB|WR|TE|K|P|DE|DT|NT|LB|OLB|ILB|MLB|CB|S|SS|FS|DB|OL|OT|OG|C) [A-Z][A-Za-z'\\-]+(?: (?:Jr\\.|II|III|IV))?)";
const grab = (text: string, ...pats: string[]) => {
  for (const p of pats) {
    const m = text.match(new RegExp(p.replace('NAME', NAME)));
    if (m) return m[1];
  }
  return '';
};

/** "on the Westlake 25", "on the Lake Travis 21", "at midfield" (the spot is from the offense's own goal line) */
const where = (los: number, offense: Team, defense: Team) =>
  Math.round(los) === 50 ? 'at midfield' : los < 50 ? `on the ${offense.name} ${Math.round(los)}` : `on the ${defense.name} ${Math.round(100 - los)}`;

function downCard(ev: PlayEvent, home: Team, away: Team) {
  const offense = ev.snapTeamId === away.id ? away : home, defense = offense === home ? away : home;
  const los = ev.snapYardLine ?? 25, dist = ev.snapDistance ?? 10;
  if (ev.isTry) return { big: ev.playConcept === 'TWO_POINT_TRY' ? 'Two-point try' : 'Extra point', small: `${offense.name}` };
  if ((ev.playConcept as string) === 'KICKOFF') return { big: 'Kickoff', small: `${offense.name} kicks off` };
  return { big: `${ORD[ev.snapDown ?? 1]} & ${los + dist >= 100 ? 'Goal' : dist}`, small: where(los, offense, defense) };
}

interface Banner {
  line: string;
  by: string;
  call: string;
  bg: string;
  fg: string;
  edge: string;
}
const GOLD = { bg: '#FACC15', fg: '#0F172A', edge: '#A16207' };
const RED = { bg: '#DC2626', fg: '#FFFFFF', edge: '#991B1B' };
const BLUE = { bg: '#2563EB', fg: '#FFFFFF', edge: '#1E3A8A' };
const GREEN = { bg: '#16A34A', fg: '#FFFFFF', edge: '#14532D' };
const GREY = { bg: '#475569', fg: '#FFFFFF', edge: '#1E293B' };
const INDIGO = { bg: '#4F46E5', fg: '#FFFFFF', edge: '#312E81' };

/** The result banner for a snap, from what the game says happened */
function resultBanner(ev: PlayEvent): Banner {
  const t = ev.textCommentary ?? '';
  const y = ev.yardsGained ?? 0;
  const td = ev.scoreType === 'TOUCHDOWN';
  const tackler = grab(t, 'Tackled by NAME', 'behind the line by NAME');
  const stopped = tackler ? `Tackled by ${tackler}` : '';
  // Tries
  if (ev.isTry) {
    const good = ev.scoreType === 'PAT' || ev.scoreType === 'TWO_POINT';
    if (ev.playConcept === 'PAT_KICK') return { line: `Extra point by ${grab(t, '(K [A-Z][A-Za-z\\-]+)') || 'the kicker'}`, by: '', call: good ? 'GOOD!' : 'NO GOOD', ...(good ? GOLD : RED) };
    return { line: 'Two-point try', by: '', call: good ? 'GOOD!' : 'NO GOOD', ...(good ? GOLD : RED) };
  }
  // Kicks
  if ((ev.playConcept as string) === 'KICKOFF') {
    const kicker = grab(t, '^NAME kicks off');
    const ret = t.match(/^.*? kicks off\. (.+?) returns it (?:(\d+) yds|to the (\d+))/);
    return ret
      ? { line: `Kickoff by ${kicker}`, by: ret[2] ? `Returned ${ret[2]} yards by ${ret[1]}` : `${ret[1]} brings it out to the ${ret[3]}`, call: '', ...INDIGO }
      : { line: `Kickoff by ${kicker}`, by: 'Into the end zone', call: 'TOUCHBACK', ...INDIGO };
  }
  if (ev.playConcept === 'FIELD_GOAL') {
    const yds = 100 - (ev.snapYardLine ?? 75) + 17;
    const good = ev.scoreType === 'FIELD_GOAL';
    return { line: `${yds}-yard field goal`, by: '', call: good ? "IT'S GOOD!" : 'NO GOOD', ...(good ? GOLD : RED) };
  }
  if (ev.playConcept === 'PUNT') {
    const gross = t.match(/punts (\d+) yds/)?.[1];
    const punter = grab(t, '(P [A-Z][A-Za-z\\-]+)');
    if (ev.turnoverType === 'MUFFED_PUNT') return { line: `${gross ? `${gross}-yard punt` : 'Punt'} by ${punter}`, by: 'Muffed! The kicking team recovers', call: 'TURNOVER!', ...RED };
    if (/touchback/.test(t)) return { line: `Punt by ${punter}`, by: 'Into the end zone for a touchback', call: '', ...INDIGO };
    return { line: `${gross ? `${gross}-yard punt` : 'Punt'} by ${punter}`, by: '', call: '', ...INDIGO };
  }
  // Turnovers
  if (ev.turnoverType === 'INTERCEPTION') {
    const who = grab(t, 'picked off by NAME');
    return { line: `Picked off by ${who}`, by: '', call: td ? 'PICK SIX!' : 'TURNOVER!', ...RED };
  }
  if (ev.turnoverType === 'FUMBLE') {
    const who = grab(t, 'Recovered by NAME');
    return { line: `Fumble! Recovered by ${who}`, by: '', call: td ? 'SCOOP AND SCORE!' : 'TURNOVER!', ...RED };
  }
  if (ev.sackerPlayerId || /^SACKED!/.test(t)) return { line: `${Math.abs(y)}-yard sack by ${grab(t, 'SACKED! NAME')}`, by: '', call: ev.turnoverType === 'DOWNS' ? 'TURNOVER ON DOWNS' : '', ...RED };
  if (/incomplete/i.test(t)) {
    const target = grab(t, 'intended for NAME', 'deep for NAME');
    return { line: target ? `Incomplete, intended for ${target}` : 'Incomplete', by: '', call: ev.turnoverType === 'DOWNS' ? 'TURNOVER ON DOWNS' : '', ...GREY };
  }
  // Runs and catches
  const who = grab(t, 'complete to NAME', 'NAME rushes', 'TACKLED FOR LOSS! NAME', '^NAME');
  const gain = `${Math.abs(y)}-yard ${y < 0 ? 'loss' : 'gain'} by ${who}`;
  if (td) return { line: `${y}-yard touchdown by ${who}`, by: '', call: 'TOUCHDOWN!', ...GOLD };
  if (ev.scoreType === 'SAFETY') return { line: gain, by: stopped, call: 'SAFETY!', ...RED };
  if (ev.turnoverType === 'DOWNS') return { line: y === 0 ? `No gain by ${who}` : gain, by: stopped, call: 'TURNOVER ON DOWNS', ...RED };
  if (y < 0) return { line: gain, by: stopped, call: '', ...RED };
  if (y >= (ev.snapDistance ?? 10)) return { line: gain, by: stopped, call: 'FIRST DOWN!', ...BLUE };
  return { line: y === 0 ? `No gain by ${who}` : gain, by: stopped, call: '', ...GREEN };
}

const CSS = `
  .rd-layer { position: absolute; inset: 0; display: flex; pointer-events: none; opacity: 0; transition: opacity .25s ease; box-sizing: border-box; align-items: flex-start; justify-content: center; padding: 10px }
  .rd-layer.rd-on { opacity: 1 }
  .rd-pop { animation: rd-pop .35s cubic-bezier(.2,1.4,.4,1) both }
  .rd-drop { animation: rd-drop .4s cubic-bezier(.2,1.3,.4,1) both }
  @keyframes rd-pop { from { transform: scale(.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  @keyframes rd-drop { from { transform: translateY(-24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .rd-pop, .rd-drop { animation: none } }
`;

/** A flag in the game: FLAG first, then the call (what, on whom, what it means) */
const FlagBanners: React.FC<{ event: PlayEvent; home: Team; away: Team }> = ({ event, home, away }) => {
  const [call, setCall] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCall(true), 1100);
    return () => clearTimeout(t);
  }, []);
  const p = event.penalty!;
  const team = p.teamId === home.id ? home : away;
  const gain = p.side === 'DEFENSE';
  if (!call)
    return (
      <div className="rd-drop" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FACC15', border: '2px solid #A16207', borderRadius: 12, boxShadow: '0 4px 0 #A16207, 0 10px 22px rgba(0,0,0,.3)', padding: '8px 22px' }}>
        <PenaltyFlag size={40} />
        <span style={{ font: '900 32px system-ui, sans-serif', color: '#0F172A', letterSpacing: '.06em' }}>FLAG</span>
      </div>
    );
  return (
    <div className="rd-drop" style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FEF9C3', border: '2px solid #A16207', borderLeft: `6px solid ${team.primaryColor}`, borderRadius: 12, boxShadow: '0 4px 0 #A16207, 0 10px 22px rgba(0,0,0,.3)', padding: '8px 12px' }}>
      <PenaltyFlag size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
          <span style={{ font: '900 10.5px system-ui', letterSpacing: '.06em', color: '#854D0E' }}>{p.side}{p.timing === 'PRE_SNAP' ? ' · BEFORE THE SNAP' : ''}</span>
          <span style={{ font: '900 13px system-ui', color: gain ? '#15803D' : '#B91C1C', whiteSpace: 'nowrap' }}>{gain ? '+' : '−'}{p.yards} yds</span>
        </div>
        <div style={{ font: '900 19px system-ui, sans-serif', color: '#0F172A', lineHeight: 1.15 }}>{p.name}</div>
        <div style={{ font: '600 13px system-ui', color: '#422006' }}>on <b>{p.player}</b>, <span style={{ color: team.primaryColor, fontWeight: 800 }}>{team.name}</span></div>
        <div style={{ font: '700 13px system-ui', color: '#422006', marginTop: 1 }}>{flagResult(event)}</div>
      </div>
    </div>
  );
};

/** A player hurt on the play: down, up, off the field. It never says how long he'll be out: only that he's being
 * evaluated. */
const InjuryBanner: React.FC<{ event: PlayEvent; stage: string; home: Team; away: Team }> = ({ event, stage, home, away }) => {
  const i = event.injury!;
  const team = i.teamId === home.id ? home : away;
  const [big, sub] =
    stage === 'trainers' ? [`${i.name} is down`, `The ${team.name} trainers are on the field.`]
      : stage === 'up' ? [`${i.name} is up`, 'Helped off slowly by the trainers.']
        : [`${i.name} is off the field`, 'He is injured and being evaluated.'];
  return (
    <div key={stage} className="rd-drop" style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '2px solid #DC2626', borderLeft: `6px solid ${team.primaryColor}`, borderRadius: 12, boxShadow: '0 4px 0 #991B1B, 0 10px 22px rgba(0,0,0,.3)', padding: '8px 12px' }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, background: '#DC2626', display: 'grid', placeItems: 'center', flex: 'none', boxShadow: 'inset 0 0 0 2px #fff', color: '#fff', font: '900 26px system-ui', lineHeight: 1 }}>+</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '900 10.5px system-ui', letterSpacing: '.07em', color: '#B91C1C' }}>{stage === 'off' ? 'INJURY' : 'INJURY TIMEOUT'}</div>
        <div style={{ font: '900 18px system-ui, sans-serif', color: '#0F172A', lineHeight: 1.15 }}>{big}</div>
        <div style={{ font: '600 13px system-ui', color: '#334155' }}>{sub}</div>
      </div>
    </div>
  );
};

/** Both overlays, drawn over the field; `phase` says which one shows (a flag's banners wait for the flag on the grass,
 * an injury's follow the trainers) */
export const ReplayOverlay: React.FC<{ event: PlayEvent | null; phase: ReplayPhase; home: Team; away: Team; flagDown?: boolean; injuryStage?: string | null }> = ({
  event, phase, home, away, flagDown, injuryStage
}) => {
  if (!event) return null;
  const card = downCard(event, home, away);
  const r = resultBanner(event);
  const after = phase === 'post' || phase === 'done';
  if (event.penalty || (event.injury && injuryStage))
    return (
      <>
        <style>{CSS}</style>
        <div className={`rd-layer ${phase === 'pre' ? 'rd-on' : ''}`}>
          <div key={`pre-${event.playId}`} className="rd-pop" style={{ background: 'rgba(15,23,42,.9)', border: '2px solid #FACC15', borderRadius: 14, padding: '10px 22px 12px', textAlign: 'center', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
            <div style={{ color: '#FACC15', font: '900 30px system-ui, sans-serif', lineHeight: 1.1 }}>{card.big}</div>
            <div style={{ color: '#FFFFFF', font: '700 15px system-ui, sans-serif', marginTop: 4 }}>{card.small}</div>
          </div>
        </div>
        <div className={`rd-layer ${after && (event.penalty ? flagDown : true) ? 'rd-on' : ''}`}>
          {event.penalty
            ? after && flagDown && <FlagBanners key={`flag-${event.playId}`} event={event} home={home} away={away} />
            : <InjuryBanner event={event} stage={injuryStage!} home={home} away={away} />}
        </div>
      </>
    );
  return (
    <>
      <style>{CSS}</style>
      <div className={`rd-layer ${phase === 'pre' ? 'rd-on' : ''}`}>
        <div key={`pre-${event.playId}`} className="rd-pop" style={{ background: 'rgba(15,23,42,.9)', border: '2px solid #FACC15', borderRadius: 14, padding: '10px 22px 12px', textAlign: 'center', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
          <div style={{ color: '#FACC15', font: '900 30px system-ui, sans-serif', lineHeight: 1.1 }}>{card.big}</div>
          <div style={{ color: '#FFFFFF', font: '700 15px system-ui, sans-serif', marginTop: 4 }}>{card.small}</div>
        </div>
      </div>
      <div className={`rd-layer ${phase === 'post' ? 'rd-on' : ''}`}>
        {phase === 'post' && (
          <div key={`post-${event.playId}`} className="rd-drop" style={{ width: '100%', background: r.bg, borderRadius: 12, border: `2px solid ${r.edge}`, boxShadow: `0 4px 0 ${r.edge}, 0 10px 22px rgba(0,0,0,.3)`, padding: '9px 14px 10px', textAlign: 'center' }}>
            <div style={{ color: r.fg, font: `800 ${r.call ? 16 : 19}px system-ui, sans-serif`, lineHeight: 1.2 }}>{r.line}</div>
            {r.by && <div style={{ color: r.fg, opacity: 0.9, font: '700 13.5px system-ui, sans-serif', marginTop: 2 }}>{r.by}</div>}
            {r.call && <div style={{ color: r.fg, font: '900 25px system-ui, sans-serif', letterSpacing: '.02em', lineHeight: 1.1, marginTop: 2 }}>{r.call}</div>}
          </div>
        )}
      </div>
    </>
  );
};
