import React, { useState } from 'react';
import { Career, CareerLength, careerPoints, invalidReckonings } from '../sim/careerScore';
import { toEntry } from '../services/leaderboard';
import { useHallOfFame } from '../utils/useHallOfFame';
import { ordinal, schoolWithState } from '../utils/format';
import { coachTitle } from '../store/gameStore';
import { HallOfFameArcade } from './HallOfFameBoard';
import { Sheet } from './ui/Sheet';

/**
 * Game over: the board fired the coach, for a second straight season without its confidence or at the 3rd strike
 * (sim/billyMartin.ts). An arcade game-over screen in the Hall of Fame board's look, with the career as it stands
 * (score, record, and its strikes or its rank) for a career game.
 */
export const FiredScreen: React.FC<{ school: string; misconduct: boolean; career: Career | null; onMainMenu: () => void }> = ({ school, misconduct, career, onMainMenu }) => {
  const [hallOfFame, setHallOfFame] = useState<CareerLength | null>(null);
  const scored = career && career.seasons.length > 0 ? career : null;
  return (
    <div style={screen}>
      <div style={{ ...column, maxWidth: '420px' }}>
        <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.3em', color: '#94A3B8' }}>GAME OVER</div>
        <h1 style={title}>
          YOU&apos;RE
          <br />
          FIRED
        </h1>
        <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.14em', color: '#FACC15', textShadow: '0 0 6px rgba(250,204,21,.5)' }}>{school.toUpperCase()} SCHOOL BOARD</div>
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#CBD5E1' }}>
          {misconduct
            ? 'A third scandal. Billy Martin was in the room when the board voted. Your contract is terminated, effective today.'
            : "After a second straight season without the board's confidence, the board has decided to make a change. Thank you for your service, Coach."}
        </p>
        {scored && <CareerLine career={scored} />}
        <button onClick={onMainMenu} style={{ ...arcadeBtn, borderColor: '#FACC15', color: '#FACC15', boxShadow: '0 0 10px rgba(250,204,21,.35) inset' }}>
          <span className="game-over-blink">▶ MAIN MENU</span>
        </button>
        {scored && (
          <button onClick={() => setHallOfFame(scored.length)} style={arcadeBtn}>
            🏆 HALL OF FAME
          </button>
        )}
      </div>
      {hallOfFame && scored && (
        <Sheet title="🏆 Hall of Fame" onClose={() => setHallOfFame(null)}>
          <HallOfFameArcade career={scored} length={hallOfFame} onLength={setHallOfFame} />
        </Sheet>
      )}
    </div>
  );
};

/** The career on the Hall of Fame: its score and record, then its strikes (an invalid playthrough) or its rank. */
const CareerLine: React.FC<{ career: Career }> = ({ career }) => {
  const board = useHallOfFame(career.length, career);
  const entry = toEntry(career);
  const invalid = invalidReckonings(career).length > 0;
  const rank = board.filter((e) => !(e.reckonings ?? 0)).findIndex((e) => e.careerId === career.id) + 1;
  const games = entry.wins + entry.losses;
  return (
    <div style={{ textAlign: 'left', border: '1px solid #7F1D1D', background: 'rgba(127,29,29,.18)', borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.16em', color: '#94A3B8' }}>YOUR CAREER</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: 900, fontSize: '13px' }}>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{coachTitle(career.coachName).toUpperCase()}</span>
        <span style={invalid ? { color: '#94A3B8', textDecoration: 'line-through', textDecorationColor: '#F87171' } : { color: '#FACC15' }}>{careerPoints(career)}</span>
      </div>
      <div style={sub}>
        {schoolWithState(career.startingProgram, career.state).toUpperCase()} · {career.seasons.length} OF {career.length} SEASONS
      </div>
      <div style={sub}>
        RECORD <b style={{ color: '#4ADE80' }}>{entry.wins}-{entry.losses}</b>
        {games > 0 ? ` · ${Math.round((entry.wins / games) * 100)}% WINS` : ''}
      </div>
      {invalid ? (
        <div style={{ ...tag, color: '#FCA5A5' }}>
          ☠️ {entry.reckonings} {entry.reckonings === 1 ? 'STRIKE' : 'STRIKES'} · INVALID PLAYTHROUGH
        </div>
      ) : (
        rank > 0 && (
          <div style={{ ...tag, color: '#22D3EE' }}>
            RANKED {ordinal(rank).toUpperCase()} · {career.length}-YEAR CAREERS
          </div>
        )
      )}
    </div>
  );
};

const screen: React.CSSProperties = {
  minHeight: '100%',
  background: '#05060F',
  color: '#E2E8F0',
  fontFamily: "ui-monospace, 'Courier New', monospace",
  display: 'flex',
  justifyContent: 'center',
  padding: '48px 16px 32px',
  boxSizing: 'border-box'
};
const column: React.CSSProperties = { width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' };
const title: React.CSSProperties = {
  margin: 0,
  fontSize: '46px',
  lineHeight: 1.02,
  fontWeight: 900,
  letterSpacing: '0.06em',
  color: '#F87171',
  textShadow: '0 0 8px rgba(248,113,113,.75), 0 0 22px rgba(220,38,38,.55)'
};
const sub: React.CSSProperties = { fontSize: '11px', color: '#94A3B8' };
const tag: React.CSSProperties = { fontSize: '10.5px', fontWeight: 900, letterSpacing: '0.04em', marginTop: '2px' };
const arcadeBtn: React.CSSProperties = {
  minHeight: '48px',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: 'transparent',
  color: '#E2E8F0',
  fontFamily: 'inherit',
  fontWeight: 900,
  fontSize: '14px',
  letterSpacing: '0.1em',
  cursor: 'pointer'
};
