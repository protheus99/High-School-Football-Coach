// PLAYTEST ONLY: /?replayclip shows one hand-picked real play at a time on the replay field, for recording review videos.
// window.__setClip(i) picks a clip, window.__phase('pre' | 'post') shows the scoreboard and caption before or after the whistle,
// and ReplayField hands frame control to window.__clip.
import React, { useEffect, useMemo, useState } from 'react';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { GameSimulationState, PlayEvent, Team } from '../types/game';
import { ReplayField } from './ReplayField';
import { LibPlay, loadReplayLibrary, ReplayPlan } from './replayLibrary';
import { Tags, spot, tagPlay } from './clipTags';

interface ClipSpec {
  slug: string;
  title: string;
  id: string;
  down: string;
  q: string;
  score: [number, number]; // away, home before the snap
  offense: 'home' | 'away';
  los?: number; // when the play's own spot isn't known (kicks)
  points?: number; // scored by the offense (negative: by the defense)
  td?: boolean;
  after: (t: Tags, p: LibPlay) => string;
}

const CLIPS: ClipSpec[] = [
  { slug: 'goal-line-td-run', title: 'Goal-line touchdown run', id: 'p0291', down: '3rd & Goal', q: 'Q2 4:12', score: [7, 7], offense: 'home', points: 6, td: true,
    after: (t) => `${t.carrier} rushes for 1 yd. TOUCHDOWN!` },
  { slug: 'long-td-run', title: 'Long touchdown run', id: 'p0442', down: '1st & 10', q: 'Q3 8:40', score: [14, 10], offense: 'home', points: 6, td: true,
    after: (t) => `${t.carrier} rushes for 50 yds. TOUCHDOWN!` },
  { slug: 'big-outside-run', title: 'Big run to the outside', id: 'p0438', down: '2nd & 7', q: 'Q1 6:15', score: [0, 0], offense: 'away',
    after: (t) => `${t.carrier} rushes for 36 yds, pushed out of bounds by ${t.tackler}.` },
  { slug: 'tackle-for-loss', title: 'Tackle for loss', id: 'p0152', down: '1st & 10', q: 'Q2 9:02', score: [3, 0], offense: 'home',
    after: (t) => `TACKLED FOR LOSS! ${t.carrier} dropped 8 yds behind the line by ${t.tackler}.` },
  { slug: 'sack', title: 'Sack', id: 'p0964', down: '2nd & 8', q: 'Q3 3:43', score: [14, 10], offense: 'home',
    after: (t) => `SACKED! ${t.qb} brought down by ${t.sacker} for a loss of 9.` },
  { slug: 'qb-sneak', title: 'QB sneak', id: 'p0090', down: '4th & 1', q: 'Q4 1:21', score: [17, 14], offense: 'home',
    after: (t) => `${t.carrier} keeps it up the middle for 2 yds. First down!` },
  { slug: 'deep-bomb', title: 'Deep bomb', id: 'p0566', down: '1st & 10', q: 'Q3 2:39', score: [10, 13], offense: 'away',
    after: (t) => `${t.qb} complete to ${t.target} for 57 yds. Tackled by ${t.tackler}.` },
  { slug: 'mid-range-pass', title: 'Mid-range pass', id: 'p0641', down: '3rd & 6', q: 'Q2 6:38', score: [7, 3], offense: 'home',
    after: (t) => `${t.qb} complete to ${t.target} for 20 yds. Tackled by ${t.tackler}.` },
  { slug: 'deep-incomplete', title: 'Deep pass incomplete', id: 'p0609', down: '2nd & 10', q: 'Q4 7:10', score: [21, 17], offense: 'home',
    after: (t) => `${t.qb} pass incomplete, deep for ${t.target}. Broken up by ${t.tackler}.` },
  { slug: 'pick-six', title: 'Pick six', id: 'p0792', down: '3rd & 8', q: 'Q3 10:11', score: [10, 10], offense: 'away', points: -6, td: true,
    after: (t) => `INTERCEPTED! ${t.qb} picked off by ${t.intercepter}, returned 36 yds for a TOUCHDOWN!` },
  { slug: 'punt-long-return', title: 'Punt with a long return', id: 'p1013', down: '4th & 9', q: 'Q4 1:58', score: [13, 17], offense: 'away',
    after: (t) => `${t.qb} punts 43 yds. ${t.carrier} returns it 71 yds before ${t.tackler} drags him down.` },
  { slug: 'field-goal', title: 'Field goal', id: 'p0991', down: '4th & 5', q: 'Q4 0:12', score: [20, 17], offense: 'home', los: 85, points: 3,
    after: () => `The 32-yd field goal is GOOD!` }
];

export const ReplayClips: React.FC = () => {
  const teams = useMemo(() => generateDistrictTeams(), []);
  const [away, home] = teams;
  const [lib, setLib] = useState<LibPlay[] | null>(null);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    Promise.all([loadReplayLibrary(), fetch(`${import.meta.env.BASE_URL}replay-data/clips.json`).then((r) => (r.ok ? r.json() : []))]).then(([a, b]) => setLib([...a, ...b]));
    const w = window as unknown as Record<string, unknown>;
    w.__setClip = (n: number) => {
      w.__clip = null;
      setPhase('pre');
      setI(n);
      setNonce((x) => x + 1);
    };
    w.__phase = setPhase;
    w.__clips = CLIPS.map((c) => c.slug);
  }, []);

  const spec = CLIPS[i];
  const play = lib?.find((p) => p.id === spec.id);
  const built = useMemo(() => {
    if (!play) return null;
    const offense: Team = spec.offense === 'home' ? home : away;
    const defense: Team = offense === home ? away : home;
    const { names, tags } = tagPlay(play, offense, defense);
    const los = spec.los ?? 100 - play.goal;
    const dist = /Goal/.test(spec.down) ? 100 - los : Number(spec.down.split('& ')[1]);
    const event = {
      playId: i + 1, snapTeamId: offense.id, snapYardLine: los, snapDistance: dist, yardsGained: play.yards, textCommentary: '', isTry: false,
      scoreType: spec.td ? 'TOUCHDOWN' : undefined
    } as unknown as PlayEvent;
    const plan: ReplayPlan = { play, los, delta: 0, stretchFrom: play.start, mirror: false, names, offense, defense };
    const board = {
      gameId: 'clips', homeTeam: home, awayTeam: away, homeScore: spec.score[1], awayScore: spec.score[0], yardLine: los, distance: dist, down: 1,
      possessionTeamId: offense.id, currentQuarter: 1, clockSecondsRemaining: 0, eventLog: []
    } as unknown as GameSimulationState;
    return { plan, event, board, tags, offense, los };
  }, [play, spec, home, away, i]);

  if (!built) return <div style={{ padding: 16 }}>Loading the clips…</div>;
  const { tags, offense } = built;
  let [as, hs] = spec.score;
  if (phase === 'post' && spec.points) {
    const scorer = spec.points > 0 ? offense : offense === home ? away : home;
    if (scorer === home) hs += Math.abs(spec.points);
    else as += Math.abs(spec.points);
  }
  const card: React.CSSProperties = { background: '#fff', borderRadius: 12, boxShadow: '0 2px 10px rgba(15,23,42,.12)', border: '1px solid #E2E8F0' };
  const side = (t: Team, score: number, align: 'left' | 'right') => (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {t === offense && align === 'left' ? '🏈 ' : ''}{t.name}{t === offense && align === 'right' ? ' 🏈' : ''}
      </div>
      <div style={{ fontSize: 34, fontWeight: 900, color: t.primaryColor, lineHeight: 1.1 }}>{score}</div>
    </div>
  );
  return (
    <div id="clip" style={{ width: 375, boxSizing: 'border-box', padding: 12, background: '#F1F5F9', font: '14px system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ background: '#0F172A', color: '#FACC15', fontWeight: 900, fontSize: 12, letterSpacing: '.06em', padding: '5px 9px', borderRadius: 7 }}>REPLAY</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>{spec.title}</span>
      </div>
      <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', padding: '10px 14px', marginBottom: 10 }}>
        {side(away, as, 'left')}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, color: '#B45309' }}>{spec.q}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{spec.down}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{spot(built.los)}</div>
        </div>
        {side(home, hs, 'right')}
      </div>
      <ReplayField
        key={`${spec.slug}-${nonce}`}
        event={built.event}
        board={built.board}
        clip={built.plan}
        manual
        onDone={() => undefined}
        caption={
          <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', minHeight: 44, color: '#0F172A', fontSize: 15, lineHeight: 1.35, fontWeight: phase === 'post' ? 600 : 500 }}>
            {phase === 'post' ? spec.after(tags, built.plan.play) : `${offense.name} ball, ${spec.down} at ${spot(built.los)}.`}
          </div>
        }
      />
    </div>
  );
};
