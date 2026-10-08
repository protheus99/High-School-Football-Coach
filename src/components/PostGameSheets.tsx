import React, { useState } from 'react';
import { DilemmaChoice, Player, Team } from '../types/game';
import { Sheet } from './ui/Sheet';
import { ChoiceEffects } from './ui/ChoiceEffects';
import { dilemmaChoiceEffects } from '../sim/dilemmaEngine';
import { GAME_BALL_EXPOSURE_CAP, GameBallCandidate, attributeLabel, gameBallSkill } from '../sim/postGame';
import { NO_COMMENT, OUTLET_NAMES, PressQuestion } from '../sim/pressConference';

/**
 * Post-game step 1: the Player of the Game, win or lose. The three best performances are offered first; anyone else who
 * played is a tap away. The card shows what the game ball gives: +1 to a key skill and college exposure.
 */
export const GameBallSheet: React.FC<{
  candidates: GameBallCandidate[];
  headline: string; // "FINAL · DeMatha 35, Hoke County 34 (OT)"
  year: number;
  onAward: (candidate: GameBallCandidate) => void;
}> = ({ candidates, headline, year, onAward }) => {
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState<GameBallCandidate | undefined>(candidates[0]);
  const shown = showAll ? candidates : candidates.slice(0, 3);
  const exposureLeft = (p: Player) => (p.gameBallYear === year ? p.gameBallsThisSeason ?? 0 : 0) < GAME_BALL_EXPOSURE_CAP;
  return (
    <Sheet
      title="Player of the Game"
      subtitle={`${headline} · step 1 of 2`}
      dismissible={false}
      footer={
        <button className="ui-btn ui-btn-primary ui-btn-block" style={{ minHeight: '50px' }} disabled={!picked} onClick={() => picked && onAward(picked)}>
          Award the game ball
        </button>
      }
    >
      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>Who earned the game ball?</div>
      {shown.map((c) => (
        <button key={c.player.id} onClick={() => setPicked(c)} aria-pressed={picked?.player.id === c.player.id} style={candidateBtn(picked?.player.id === c.player.id)}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>
            {c.player.position} {c.player.firstName[0]}. {c.player.lastName}{' '}
            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
              · {c.player.classYear}
              {c.player.recruiting.starRating > 0 ? ` · ${c.player.recruiting.starRating}★` : ''}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#334155' }}>{c.line}</div>
        </button>
      ))}
      {!showAll && candidates.length > 3 && (
        <button onClick={() => setShowAll(true)} style={{ minHeight: '40px', background: 'none', border: 'none', color: '#1D4ED8', fontWeight: 700, fontSize: '14px', cursor: 'pointer', padding: '0 2px' }}>
          Pick another player ›
        </button>
      )}
      {picked && (
        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '8px 10px', marginTop: '8px', fontSize: '13px' }}>
          Game ball for <b>{picked.player.lastName}</b>:
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
            <span style={gain}>{attributeLabel(gameBallSkill(picked.player))} +1</span>
            {exposureLeft(picked.player) && <span style={gain}>College exposure +1</span>}
            <span style={gain}>In the news</span>
          </div>
        </div>
      )}
    </Sheet>
  );
};

/**
 * Post-game step 2: the press conference. One question that fits the game, three answers that show what they do (like
 * dilemma choices), and Skip, which counts as "No comment" and carries only its penalty.
 */
export const PressConferenceSheet: React.FC<{ question: PressQuestion; team: Team; onAnswer: (choice: DilemmaChoice) => void }> = ({ question, team, onAnswer }) => {
  const skip = dilemmaChoiceEffects(NO_COMMENT, team);
  return (
    <Sheet title="Press Conference" subtitle={`${OUTLET_NAMES[question.outlet]} · step 2 of 2`} dismissible={false}>
      <div style={{ fontSize: '16px', fontWeight: 800, lineHeight: 1.35 }}>"{question.question}"</div>
      <div style={{ fontSize: '12px', color: '#475569', margin: '2px 0 8px' }}>Asked because: {question.reason.replace(/\.$/, '').toLowerCase()}.</div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {question.answers.map((a) => (
          <button key={a.id} onClick={() => onAnswer(a)} style={answerBtn}>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{a.label}</div>
            <ChoiceEffects fx={dilemmaChoiceEffects(a, team)} />
          </button>
        ))}
      </div>
      <button onClick={() => onAnswer(NO_COMMENT)} style={{ ...answerBtn, marginTop: '12px', background: '#F8FAFC', borderStyle: 'dashed' }}>
        <div style={{ fontWeight: 700, fontSize: '14px' }}>Skip the press conference</div>
        <div style={{ fontSize: '12px', color: '#475569' }}>Counts as "No comment."</div>
        <ChoiceEffects fx={skip} />
      </button>
    </Sheet>
  );
};

const candidateBtn = (selected: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  marginTop: '6px',
  minHeight: '52px',
  padding: selected ? '8px 9px' : '9px 10px',
  borderRadius: '10px',
  border: selected ? '2px solid #2563EB' : '1px solid #CBD5E1',
  background: selected ? '#EFF6FF' : '#fff',
  color: '#0F172A',
  font: 'inherit',
  cursor: 'pointer'
});
const answerBtn: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  minHeight: '52px',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid #CBD5E1',
  background: '#fff',
  color: '#0F172A',
  font: 'inherit',
  cursor: 'pointer'
};
const gain: React.CSSProperties = { fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '2px 8px', background: '#DCFCE7', color: '#166534' };
