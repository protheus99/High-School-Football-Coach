// PLAYTEST ONLY: a player hurt on a play, acted out: he stays down with a red X, trainers come out from his team's
// sideline, the players back off and clear their path, the trainers work on him, then help him off slowly.
// Opened by the web-review build with VITE_REPLAYINJURY=1, or /?replayinjury.
import React, { useEffect, useMemo, useState } from 'react';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { GameSimulationState, PlayEvent, Team } from '../types/game';
import { ReplayField } from './ReplayField';
import { LibPlay, loadReplayLibrary, ReplayPlan } from './replayLibrary';
import { stageInjury } from './replayInjury';
import { tagPlay } from './clipTags';
import { DEFAULT_REPLAY_OPTIONS } from './matchOptions';
import { ReplayScoreboard } from './ReplayScoreboard';

interface Test {
  title: string;
  play: string;
  who: 'carrier' | 'target' | 'tackler';
  los: number;
  down: number;
  dist: number;
  mirror: boolean; // the play flipped left to right
  watch: string;
}
const TESTS: Test[] = [
  { title: 'Ball carrier hurt on the tackle', play: 'p0131', who: 'carrier', los: 40, down: 2, dist: 7, mirror: false, watch: 'The runner is stopped behind the line and stays down near his own sideline.' },
  { title: 'Receiver hurt on a hard hit', play: 'p0584', who: 'target', los: 35, down: 1, dist: 10, mirror: false, watch: 'The receiver makes the catch, takes the hit and stays down.' },
  { title: 'Defender hurt making the tackle', play: 'p0641', who: 'tackler', los: 30, down: 3, dist: 6, mirror: false, watch: 'The tackler stays down: his trainers come from the other sideline.' },
  { title: 'Hurt in the middle of the field', play: 'p0058', who: 'carrier', los: 45, down: 1, dist: 10, mirror: true, watch: 'A long way to the sideline: watch the players step out of the trainers’ path.' }
];
const ORD = ['', '1st', '2nd', '3rd', '4th'];
type Phase = 'pre' | 'live' | 'trainers' | 'up' | 'off' | 'done';

export const ReplayInjuries: React.FC = () => {
  const [away, home] = useMemo(() => generateDistrictTeams(), []);
  const offense: Team = home, defense: Team = away;
  const [lib, setLib] = useState<LibPlay[] | null>(null);
  const [i, setI] = useState(0);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>('pre');
  const [paused, setPaused] = useState(true);
  const [playAll, setPlayAll] = useState(false);

  useEffect(() => {
    loadReplayLibrary().then(setLib);
  }, []);

  const test = TESTS[i];
  const built = useMemo(() => {
    const base = lib?.find((p) => p.id === test.play);
    if (!base) return null;
    const who = base.key[test.who]!;
    const isOff = base.roles[who][0] === 'O';
    // His team's sideline: home (the offense here) on the right of the screen, the visitors on the left
    const right = isOff;
    const sideX = right !== test.mirror ? 533 + 25 : -25;
    const { play, fx } = stageInjury(base, who, sideX);
    const { names } = tagPlay(play, offense, defense, [who]);
    const plan: ReplayPlan = { play, los: test.los, delta: 0, stretchFrom: play.start, mirror: test.mirror, names, offense, defense };
    const event = {
      playId: `inj-${i}-${run}`, snapTeamId: offense.id, snapYardLine: test.los, snapDistance: test.dist, snapDown: test.down, yardsGained: play.yards,
      textCommentary: '', isTry: false, isScore: false, isTurnover: false
    } as unknown as PlayEvent;
    return { plan, event, fx, name: names[who] ?? 'A player', team: isOff ? offense : defense };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, i, run]);

  useEffect(() => {
    if (phase !== 'off' || paused) return;
    const t = setTimeout(() => setPhase('done'), 2200);
    return () => clearTimeout(t);
  }, [phase, paused]);
  useEffect(() => {
    if (phase !== 'done' || !playAll) return;
    if (i + 1 >= TESTS.length) return setPlayAll(false);
    const t = setTimeout(() => go(i + 1, true), 700);
    return () => clearTimeout(t);
  }, [phase, playAll, i]);

  const go = (n: number, play: boolean) => {
    setI(n);
    setRun((r) => r + 1);
    setPhase('pre');
    setPaused(!play);
  };

  if (!built) return <div style={{ padding: 16, font: '600 14px system-ui, sans-serif', color: '#64748B' }}>Loading the plays…</div>;

  const board = {
    gameId: 'inj', homeTeam: home, awayTeam: away, homeScore: 7, awayScore: 3, currentQuarter: 3, clockSecondsRemaining: 412,
    possessionTeamId: offense.id, down: test.down, distance: test.dist, yardLine: test.los, eventLog: []
  } as unknown as GameSimulationState;
  const where = (los: number) => (los === 50 ? 'at midfield' : los < 50 ? `on the ${offense.name} ${los}` : `on the ${defense.name} ${100 - los}`);
  const cross = (
    <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 8, background: '#DC2626', display: 'grid', placeItems: 'center', flex: 'none', boxShadow: 'inset 0 0 0 2px #fff' }}>
      <span style={{ position: 'relative', width: 18, height: 18 }}>
        <span style={{ position: 'absolute', left: 6, top: 0, width: 6, height: 18, background: '#fff', borderRadius: 1 }} />
        <span style={{ position: 'absolute', left: 0, top: 6, width: 18, height: 6, background: '#fff', borderRadius: 1 }} />
      </span>
    </span>
  );
  const banner = (small: string, big: string, sub: string) => (
    <div key={`${phase}-${run}`} className="rd-drop" style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '2px solid #DC2626', borderLeft: `6px solid ${built.team.primaryColor}`, borderRadius: 12, boxShadow: '0 4px 0 #991B1B, 0 10px 22px rgba(0,0,0,.3)', padding: '8px 12px' }}>
      {cross}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: '900 10.5px system-ui', letterSpacing: '.07em', color: '#B91C1C' }}>{small}</div>
        <div style={{ font: '900 18px system-ui, sans-serif', color: '#0F172A', lineHeight: 1.15 }}>{big}</div>
        <div style={{ font: '600 13px system-ui', color: '#334155' }}>{sub}</div>
      </div>
    </div>
  );
  const overlay = (
    <>
      <div className={`rd-layer ${phase === 'pre' ? 'rd-on' : ''}`}>
        <div key={`pre-${run}`} className="rd-pop" style={{ background: 'rgba(15,23,42,.9)', border: '2px solid #FACC15', borderRadius: 14, padding: '10px 22px 12px', textAlign: 'center', boxShadow: '0 8px 22px rgba(0,0,0,.35)' }}>
          <div style={{ color: '#FACC15', font: '900 30px system-ui, sans-serif', lineHeight: 1.1 }}>{ORD[test.down]} &amp; {test.dist}</div>
          <div style={{ color: '#FFFFFF', font: '700 15px system-ui, sans-serif', marginTop: 4 }}>{where(test.los)}</div>
        </div>
      </div>
      <div className={`rd-layer ${phase === 'trainers' || phase === 'up' || phase === 'off' ? 'rd-on' : ''}`}>
        {phase === 'trainers' && banner('INJURY TIMEOUT', `${built.name} is down`, `The ${built.team.name} trainers are on the field.`)}
        {phase === 'up' && banner('INJURY TIMEOUT', `${built.name} is up`, 'Helped off slowly by the trainers.')}
        {phase === 'off' && banner('INJURY', `${built.name} is off the field`, 'He is injured and being evaluated.')}
      </div>
    </>
  );

  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, boxShadow: '0 2px 10px rgba(15,23,42,.10)', border: '1px solid #E2E8F0' };
  const btn = (bg: string, edge: string): React.CSSProperties => ({
    font: '800 14.5px system-ui, sans-serif', color: '#fff', background: bg, border: `2px solid ${edge}`, borderRadius: 10, padding: '10px 8px',
    boxShadow: `0 3px 0 ${edge}`, cursor: 'pointer', flex: 1
  });

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
          <span style={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>Injuries</span>
          <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 13, color: '#B45309' }}>{i + 1} of {TESTS.length}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <ReplayScoreboard variant="stadium" markOf={(t) => (t.id === home.id ? 'O' : 'X')} board={board} down={test.down} distance={test.dist} yardLine={test.los} />
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
            holdMs={1000}
            officials
            injury={built.fx}
            paused={paused}
            overlay={overlay}
            onStart={() => setPhase('live')}
            onInjury={(stage) => setPhase(stage)}
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
        <div style={{ ...card, padding: 12, marginBottom: 10, borderLeft: '4px solid #DC2626' }}>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.05em', color: '#475569', marginBottom: 4 }}>WATCH FOR</div>
          <div style={{ fontSize: 14.5, color: '#0F172A', lineHeight: 1.4 }}>{test.watch}</div>
        </div>
        <div style={{ ...card, padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {TESTS.map((t, k) => (
              <button key={k} type="button" onClick={() => go(k, true)} aria-pressed={k === i}
                style={{ textAlign: 'left', padding: '8px 9px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${k === i ? '#0F172A' : '#E2E8F0'}`, background: k === i ? '#0F172A' : '#fff', boxShadow: k === i ? '0 3px 0 #DC2626' : '0 1px 3px rgba(15,23,42,.08)', font: '800 13px system-ui', color: k === i ? '#fff' : '#0F172A', lineHeight: 1.25 }}>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
