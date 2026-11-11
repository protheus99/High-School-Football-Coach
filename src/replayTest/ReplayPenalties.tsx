// PLAYTEST ONLY: every penalty the game calls, acted out on the field one at a time: the down card, the foul (before
// the snap, or laid on a real play), the official's flag flying to the spot, a FLAG banner, the call, then the ball
// walked off to the new spot. Opened by the web-review build with VITE_REPLAYPENALTY=1, or /?replaypenalty.
import React, { useEffect, useMemo, useState } from 'react';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { GameSimulationState, PlayEvent, Team } from '../types/game';
import { enforcedYards, PENALTIES, PenaltyId } from '../sim/penalties';
import { PenaltyFlag } from '../components/ui/PenaltyFlag';
import { ReplayField } from './ReplayField';
import { LibPlay, loadReplayLibrary, ReplayPlan } from './replayLibrary';
import { stagePenalty } from './replayPenalty';
import { tagPlay } from './clipTags';
import { DEFAULT_REPLAY_OPTIONS } from './matchOptions';
import { ReplayScoreboard } from './ReplayScoreboard';

interface Test {
  id: PenaltyId;
  play: string; // the real play it's laid on
  los: number;
  down: number;
  dist: number;
  watch: string; // what to look for
  /** The chip's name when two tests share a penalty */
  label?: string;
}
const TESTS: Test[] = [
  { id: 'FALSE_START', play: 'p0058', los: 35, down: 2, dist: 6, watch: 'A lineman on the right side flinches forward before the snap.' },
  { id: 'OFFSIDE', play: 'p0058', los: 40, down: 3, dist: 4, watch: 'A defensive lineman jumps across the line before the snap.' },
  { id: 'DELAY_OF_GAME', play: 'p0584', los: 30, down: 1, dist: 10, watch: 'Everyone is set, the snap never comes, the play clock hits zero.' },
  { id: 'ILLEGAL_FORMATION', play: 'p0584', los: 45, down: 2, dist: 8, watch: 'A receiver lines up a step and a half off the line: only six on it.' },
  { id: 'HOLDING', play: 'p0058', los: 30, down: 1, dist: 10, watch: 'A lineman grabs the man he blocks and drags him along (the yellow tie). The run only gains 3: the defense takes the 10 yards.' },
  { id: 'HOLDING', play: 'p0785', los: 37, down: 3, dist: 8, label: 'Holding, then a pick', watch: 'Holding on the line, then the pass is picked off: the defense declines the penalty and keeps the ball.' },
  { id: 'OFFENSIVE_PASS_INTERFERENCE', play: 'p0584', los: 40, down: 2, dist: 7, watch: 'The receiver shoves the defender away just before the ball arrives.' },
  { id: 'ILLEGAL_BLOCK', play: 'p0438', los: 25, down: 1, dist: 10, watch: 'A blocker hits a defender chasing the runner from behind.' },
  { id: 'PASS_INTERFERENCE', play: 'p0519', los: 35, down: 3, dist: 6, watch: 'The defender runs through the receiver before the ball gets there. The pass falls incomplete: the offense takes the 15 yards.' },
  { id: 'PASS_INTERFERENCE', play: 'p0566', los: 25, down: 1, dist: 10, label: 'Interference, caught anyway', watch: 'The defender hits the receiver early, but he makes the catch for 58 yards: the offense declines the 15.' },
  { id: 'DEFENSIVE_HOLDING', play: 'p0567', los: 30, down: 2, dist: 9, watch: 'A defender grabs a receiver in his route and holds him back. The pass still goes for 31 yards elsewhere: the offense declines the 10.' },
  { id: 'FACE_MASK', play: 'p0058', los: 45, down: 1, dist: 10, watch: 'The tackler grabs the face mask and twists the runner down.' },
  { id: 'ROUGHING_THE_PASSER', play: 'p0566', los: 25, down: 3, dist: 8, watch: 'The pass is long gone when a lineman drives the quarterback into the ground. The 58-yard catch stands and the 15 yards are added to the end of it.' },
  { id: 'PERSONAL_FOUL', play: 'p0375', los: 35, down: 2, dist: 5, watch: 'The runner is already out of bounds when a defender comes in late and hits him. The run stands and 15 yards are added to it.' }
];
const ORD = ['', '1st', '2nd', '3rd', '4th'];
type Phase = 'pre' | 'live' | 'flag' | 'call' | 'done';
const FLAG_MS = 1100, CALL_MS = 2800;

/** What the call means: the new spot and down, and the referee's words */
function enforce(t: Test) {
  const rule = PENALTIES.find((r) => r.id === t.id)!;
  if (rule.side === 'OFFENSE') {
    const y = enforcedYards(rule.yards, t.los);
    const los = t.los - y;
    return { rule, y, los, down: t.down, dist: t.dist + y, text: `${rule.timing === 'LIVE' ? 'The play comes back.' : 'Dead ball.'} ${y} yards, replay ${ORD[t.down]} down.` };
  }
  const y = enforcedYards(rule.yards, 100 - t.los);
  const los = t.los + y;
  const first = y >= t.dist || !!rule.autoFirstDown;
  return first
    ? { rule, y, los, down: 1, dist: Math.min(10, 100 - los), text: `${y} yards. FIRST DOWN.` }
    : { rule, y, los, down: t.down, dist: t.dist - y, text: `${y} yards, replay ${ORD[t.down]} down.` };
}

/** What the play itself did, if the flag is declined */
interface Result {
  kind: 'gain' | 'incomplete' | 'pick' | 'td';
  los: number; // from the offense's goal line (from the new offense's after a pick)
  down: number;
  dist: number;
  poss: 'offense' | 'defense';
  yards: number;
}
function playResult(t: Test, play: LibPlay): Result {
  if (play.res === 'IN') {
    const endY = t.los + play.ball[Math.min(play.end, play.ball.length - 1)][1] / 10;
    const los = Math.round(100 - endY);
    return { kind: 'pick', los, down: 1, dist: Math.min(10, 100 - los), poss: 'defense', yards: 0 };
  }
  if (play.res === 'I') return { kind: 'incomplete', los: t.los, down: t.down + 1, dist: t.dist, poss: 'offense', yards: 0 };
  const y = play.yards, los = t.los + y;
  if (los >= 100) return { kind: 'td', los: 100, down: 1, dist: 0, poss: 'offense', yards: y };
  const first = y >= t.dist;
  return { kind: 'gain', los, down: first ? 1 : t.down + 1, dist: first ? Math.min(10, 100 - los) : t.dist - y, poss: 'offense', yards: y };
}
/** How good a result is for the offense (a rough coach's eye: field position, a fresh set of downs, the down) */
const worth = (r: { los: number; down: number; dist: number; poss: string; kind?: string }) =>
  r.poss === 'defense' ? -1000 : r.kind === 'td' ? 1000 : r.los + (r.down === 1 ? 12 : 0) - (r.down - 1) * 4 - r.dist * 0.5;

type Verdict = 'accepted' | 'declined' | 'added';
/**
 * The fouled team's choice. Before the snap there's no play: always enforced. During the play the fouled team takes
 * whichever is better for it, the play or the penalty. A late hit comes after the play, and roughing the passer on a
 * completed pass is walked off from the end of the catch: the play stands and the yards are added to it.
 */
function decide(t: Test, play: LibPlay, offense: Team, defense: Team) {
  const pen = enforce(t);
  const { rule } = pen;
  const fouled = rule.side === 'DEFENSE' ? offense : defense;
  if (rule.timing === 'PRE_SNAP')
    return { verdict: 'accepted' as Verdict, fouled, los: pen.los, down: pen.down, dist: pen.dist, poss: 'offense' as const, yards: pen.y, text: pen.text };
  const r = playResult(t, play);
  if (t.id === 'PERSONAL_FOUL' || (t.id === 'ROUGHING_THE_PASSER' && r.kind === 'gain' && r.yards > 0)) {
    const y = enforcedYards(rule.yards, 100 - r.los), los = r.los + y;
    const first = r.down === 1 || !!rule.autoFirstDown || los >= t.los + t.dist;
    return {
      verdict: 'added' as Verdict, fouled, los, poss: 'offense' as const, yards: y,
      down: first ? 1 : r.down, dist: first ? Math.min(10, 100 - los) : t.los + t.dist - los,
      text: `The ${r.yards}-yard ${play.res === 'RUN' ? 'run' : 'catch'} stands, and ${y} yards are added to the end of it.${first ? ' FIRST DOWN.' : ''}`
    };
  }
  const penOut = { los: pen.los, down: pen.down, dist: pen.dist, poss: 'offense' };
  const take = fouled === offense ? worth(penOut) >= worth(r) : worth(penOut) <= worth(r);
  if (take) return { verdict: 'accepted' as Verdict, fouled, los: pen.los, down: pen.down, dist: pen.dist, poss: 'offense' as const, yards: pen.y, text: pen.text };
  const after = r.down === 1 ? 'FIRST DOWN' : `${ORD[r.down]} & ${r.dist}`;
  const text =
    r.kind === 'pick'
      ? `${defense.name} keeps the interception.`
      : r.kind === 'incomplete'
        ? `The incomplete pass stands: ${after}.`
        : `${fouled === offense ? `${offense.name} keeps` : 'The play stands:'} the ${r.yards}-yard ${play.res === 'RUN' ? 'run' : 'catch'}. ${after}.`;
  return { verdict: 'declined' as Verdict, fouled, los: r.los, down: r.down, dist: r.dist, poss: r.poss, yards: 0, text };
}

export const ReplayPenalties: React.FC = () => {
  const [away, home] = useMemo(() => generateDistrictTeams(), []);
  const offense: Team = home, defense: Team = away;
  const [lib, setLib] = useState<LibPlay[] | null>(null);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>('pre');
  const [whistled, setWhistled] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [paused, setPaused] = useState(true);
  const [playAll, setPlayAll] = useState(false);
  const [clockLeft, setClockLeft] = useState(3);

  useEffect(() => {
    loadReplayLibrary().then(setLib);
  }, []);

  const test = TESTS[i];
  const call = enforce(test);
  const built = useMemo(() => {
    const base = lib?.find((p) => p.id === test.play);
    if (!base) return null;
    const { play, foul } = stagePenalty(test.id, base);
    const { names } = tagPlay(play, offense, defense, [foul.offender]);
    const plan: ReplayPlan = { play, los: test.los, delta: 0, stretchFrom: play.start, mirror: false, names, offense, defense };
    const event = {
      playId: `pen-${i}-${run}`, snapTeamId: offense.id, snapYardLine: test.los, snapDistance: test.dist, snapDown: test.down, yardsGained: 0,
      textCommentary: '', isTry: false, isScore: false, isTurnover: false
    } as unknown as PlayEvent;
    const at = Math.max(play.end, foul.frame + 9) + 30;
    const choice = decide(test, play, offense, defense);
    const walkOff = choice.poss === 'offense' ? { los: choice.los, gain: choice.los + choice.dist, down: choice.down, at } : undefined;
    return { plan, event, foul, choice, offender: names[foul.offender] ?? 'the offender', walkOff };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, i, run]);

  // The whistle and the flag on the ground: FLAG, then the call, then done (and on to the next one in Play all)
  useEffect(() => {
    if (whistled && flagged && phase === 'live') setPhase('flag');
  }, [whistled, flagged, phase]);
  useEffect(() => {
    if (paused) return;
    if (phase === 'flag') {
      const t = setTimeout(() => setPhase('call'), FLAG_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'call') {
      const t = setTimeout(() => setPhase('done'), CALL_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'done' && playAll && i + 1 < TESTS.length) {
      const t = setTimeout(() => go(i + 1, true), 700);
      return () => clearTimeout(t);
    }
    if (phase === 'done' && playAll) setPlayAll(false);
  }, [phase, paused, playAll, i]);
  // Delay of game: the play clock counts down while everyone waits
  useEffect(() => {
    if (test.id !== 'DELAY_OF_GAME' || phase !== 'live' || paused) return;
    setClockLeft(3);
    const t = setInterval(() => setClockLeft((c) => Math.max(0, c - 1)), 500);
    return () => clearInterval(t);
  }, [test.id, phase, paused]);

  const go = (n: number, play: boolean) => {
    setI(n);
    setRun((r) => r + 1);
    setPhase('pre');
    setWhistled(false);
    setFlagged(false);
    setPaused(!play);
  };

  if (!built) return <div style={{ padding: 16, font: '600 14px system-ui, sans-serif', color: '#64748B' }}>Loading the plays…</div>;

  const after = phase === 'call' || phase === 'done';
  const board = {
    gameId: 'pen', homeTeam: home, awayTeam: away, homeScore: 0, awayScore: 0, currentQuarter: 2, clockSecondsRemaining: 488,
    possessionTeamId: after && built.choice.poss === 'defense' ? defense.id : offense.id,
    down: after ? built.choice.down : test.down, distance: after ? built.choice.dist : test.dist, yardLine: after ? built.choice.los : test.los, eventLog: []
  } as unknown as GameSimulationState;
  const where = (los: number) => (los === 50 ? 'at midfield' : los < 50 ? `on the ${offense.name} ${los}` : `on the ${defense.name} ${100 - los}`);
  const situation = `${ORD[test.down]} & ${test.los + test.dist >= 100 ? 'Goal' : test.dist}`;
  const offTeam = call.rule.side === 'OFFENSE' ? offense : defense;
  const gain = call.rule.side === 'DEFENSE';

  const overlay = (
    <>
      <div className={`rd-layer ${phase === 'pre' ? 'rd-on' : ''}`}>
        <div key={`pre-${run}`} className="rd-pop" style={{ background: 'rgba(15,23,42,.9)', border: '2px solid #FACC15', borderRadius: 14, padding: '10px 22px 12px', textAlign: 'center', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
          <div style={{ color: '#FACC15', font: '900 30px system-ui, sans-serif', lineHeight: 1.1 }}>{situation}</div>
          <div style={{ color: '#FFFFFF', font: '700 15px system-ui, sans-serif', marginTop: 4 }}>{where(test.los)}</div>
        </div>
      </div>
      {test.id === 'DELAY_OF_GAME' && phase === 'live' && (
        <div style={{ position: 'absolute', top: 8, right: 8, background: '#050608', border: '2px solid #FACC15', borderRadius: 8, padding: '4px 10px', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ color: '#fff', font: '900 10px system-ui', letterSpacing: '.08em' }}>PLAY CLOCK</div>
          <div style={{ color: clockLeft === 0 ? '#F87171' : '#FFD54A', font: '900 26px ui-monospace, Consolas, monospace', lineHeight: 1.05, textShadow: '0 0 6px #FFB300' }}>{clockLeft}</div>
        </div>
      )}
      <div className={`rd-layer ${phase === 'flag' ? 'rd-on' : ''}`}>
        {phase === 'flag' && (
          <div key={`flag-${run}`} className="rd-drop" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FACC15', border: '2px solid #A16207', borderRadius: 12, boxShadow: '0 4px 0 #A16207, 0 10px 22px rgba(0,0,0,.3)', padding: '8px 22px' }}>
            <PenaltyFlag size={40} />
            <span style={{ font: '900 32px system-ui, sans-serif', color: '#0F172A', letterSpacing: '.06em' }}>FLAG</span>
          </div>
        )}
      </div>
      <div className={`rd-layer ${phase === 'call' ? 'rd-on' : ''}`}>
        {phase === 'call' && (
          <div key={`call-${run}`} className="rd-drop" style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FEF9C3', border: '2px solid #A16207', borderLeft: `6px solid ${offTeam.primaryColor}`, borderRadius: 12, boxShadow: '0 4px 0 #A16207, 0 10px 22px rgba(0,0,0,.3)', padding: '8px 12px' }}>
            <PenaltyFlag size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                <span style={{ font: '900 10.5px system-ui', letterSpacing: '.06em', color: '#854D0E' }}>
                  {call.rule.side}{call.rule.timing === 'PRE_SNAP' ? ' · BEFORE THE SNAP' : ''}
                </span>
                {built.choice.verdict === 'declined' ? (
                  <span style={{ font: '900 11px system-ui', color: '#fff', background: '#475569', borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap' }}>DECLINED</span>
                ) : (
                  <span style={{ font: '900 13px system-ui', color: gain ? '#15803D' : '#B91C1C', whiteSpace: 'nowrap' }}>{gain ? '+' : '−'}{built.choice.yards} yds</span>
                )}
              </div>
              <div style={{ font: '900 19px system-ui, sans-serif', color: '#0F172A', lineHeight: 1.15 }}>{call.rule.name}</div>
              <div style={{ font: '600 13px system-ui', color: '#422006' }}>on <b>{built.offender}</b>, <span style={{ color: offTeam.primaryColor, fontWeight: 800 }}>{offTeam.name}</span></div>
              {call.rule.timing === 'LIVE' && (
                <div style={{ font: '800 12px system-ui', color: built.choice.verdict === 'declined' ? '#334155' : '#15803D', marginTop: 2 }}>
                  {built.choice.verdict === 'declined'
                    ? `${built.choice.fouled.name} declines the penalty`
                    : built.choice.verdict === 'added'
                      ? `Added to the play for ${built.choice.fouled.name}`
                      : `${built.choice.fouled.name} accepts the penalty`}
                </div>
              )}
              <div style={{ font: '700 13px system-ui', color: '#422006', marginTop: 1 }}>{built.choice.text}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, boxShadow: '0 2px 10px rgba(15,23,42,.10)', border: '1px solid #E2E8F0' };
  const btn = (bg: string, edge: string): React.CSSProperties => ({
    font: '800 14.5px system-ui, sans-serif', color: '#fff', background: bg, border: `2px solid ${edge}`, borderRadius: 10, padding: '10px 8px',
    boxShadow: `0 3px 0 ${edge}`, cursor: 'pointer', flex: 1
  });
  const chip = (k: number) => {
    const t = TESTS[k], r = PENALTIES.find((p) => p.id === t.id)!, on = k === i;
    return (
      <button key={k} type="button" onClick={() => go(k, true)} aria-pressed={on}
        style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${on ? '#0F172A' : '#E2E8F0'}`, background: on ? '#0F172A' : '#fff', boxShadow: on ? '0 3px 0 #FACC15' : '0 1px 3px rgba(15,23,42,.08)', minWidth: 0 }}>
        <div style={{ font: '800 13px system-ui', color: on ? '#FACC15' : '#0F172A', lineHeight: 1.2 }}>{t.label ?? (r.name === 'Holding' ? (r.side === 'OFFENSE' ? 'Holding (offense)' : 'Holding (defense)') : r.name)}</div>
        <div style={{ font: '800 10.5px system-ui', letterSpacing: '.05em', color: r.side === 'OFFENSE' ? (on ? '#93C5FD' : '#2563EB') : on ? '#FCA5A5' : '#DC2626', marginTop: 2 }}>
          {r.side} · {r.side === 'OFFENSE' ? '−' : '+'}{r.yards}
        </div>
      </button>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F1F5F9', display: 'flex', justifyContent: 'center' }}>
      <style>{`
        .rd-layer { position: absolute; inset: 0; display: flex; pointer-events: none; opacity: 0; transition: opacity .25s ease; box-sizing: border-box; align-items: flex-start; justify-content: center; padding: 10px }
        .rd-layer.rd-on { opacity: 1 }
        .rd-pop { animation: rd-pop .35s cubic-bezier(.2,1.4,.4,1) both }
        .rd-drop { animation: rd-drop .4s cubic-bezier(.2,1.3,.4,1) both }
        @keyframes rd-pop { from { transform: scale(.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes rd-drop { from { transform: translateY(-24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .rd-pop, .rd-drop { animation: none } }
      `}</style>
      <div style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '12px 8px 24px', font: '14px system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ background: '#0F172A', color: '#FACC15', fontWeight: 900, fontSize: 12, letterSpacing: '.06em', padding: '5px 9px', borderRadius: 7 }}>REPLAY TEST</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>Penalties</span>
          <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 13, color: '#B45309' }}>{i + 1} of {TESTS.length}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <ReplayScoreboard variant="stadium" markOf={(t) => (t.id === home.id ? 'O' : 'X')} board={board} down={board.down} distance={board.distance} yardLine={board.yardLine} />
        </div>
        <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <ReplayField
            key={run}
            bare
            event={built.event}
            board={board}
            clip={built.plan}
            look={DEFAULT_REPLAY_OPTIONS.look}
            oTeamId={home.id}
            walkBack
            next={built.choice.poss === 'offense' ? built.choice.los : null}
            holdMs={1000}
            officials
            foul={built.foul}
            walkOff={built.walkOff}
            paused={paused}
            overlay={overlay}
            onStart={() => setPhase('live')}
            onWhistle={() => setWhistled(true)}
            onFlag={() => setFlagged(true)}
            onDone={() => undefined}
            caption={null}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" style={paused ? btn('#16A34A', '#15803D') : btn('#F59E0B', '#B45309')} onClick={() => setPaused(!paused)}>
            {paused ? (phase === 'pre' ? '▶ Play' : '▶ Resume') : '⏸ Pause'}
          </button>
          <button type="button" style={btn('#2563EB', '#1D4ED8')} onClick={() => go(i, true)}>↺ Again</button>
          <button type="button" style={btn('#7C3AED', '#5B21B6')} onClick={() => go((i + 1) % TESTS.length, true)}>Next ▶</button>
        </div>
        <button type="button" onClick={() => { setPlayAll(true); go(0, true); }}
          style={{ ...btn('#0F172A', '#FACC15'), width: '100%', marginBottom: 12, color: '#FACC15' }}>
          {playAll ? `▶ Playing all ${TESTS.length}…` : `▶ Play all ${TESTS.length} tests`}
        </button>
        <div style={{ ...card, padding: 12, marginBottom: 10, borderLeft: '4px solid #FACC15' }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#475569', marginBottom: 4 }}>WATCH FOR</div>
          <div style={{ fontSize: 14.5, color: '#0F172A', lineHeight: 1.4 }}>{test.watch}</div>
        </div>
        <div style={{ ...card, padding: 12, marginBottom: 10, borderLeft: '4px solid #DC2626', background: '#FEF2F2' }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#991B1B', marginBottom: 4 }}>TO REVIEW: THE GAME TODAY</div>
          <div style={{ fontSize: 13.5, color: '#450A0A', lineHeight: 1.45 }}>
            The game always takes the penalty. On a flag during a play it makes up a play the penalty beats (a short gain or an incompletion), so a decline never comes up, and a late hit or roughing never adds to a gain. This page shows how it could work: the play happens, then the fouled team picks the better of the play or the penalty.
          </div>
        </div>
        {(['PRE_SNAP', 'LIVE'] as const).map((timing) => (
          <div key={timing} style={{ ...card, padding: 10, marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#475569', marginBottom: 8 }}>{timing === 'PRE_SNAP' ? 'BEFORE THE SNAP' : 'DURING THE PLAY'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {TESTS.map((t, k) => (PENALTIES.find((r) => r.id === t.id)!.timing === timing ? chip(k) : null))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
