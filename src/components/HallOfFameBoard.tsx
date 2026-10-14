import React, { useState } from 'react';
import { coachTitle, useGameStore } from '../store/gameStore';
import { CAREER_LENGTHS, CAREER_POINTS, Career, CareerLength, careerBasePoints, careerPoints, prestigeMultiplier } from '../sim/careerScore';
import { hasRemoteLeaderboard, LeaderboardEntry } from '../services/leaderboard';
import { ordinal, schoolWithState } from '../utils/format';
import { useHallOfFame } from '../utils/useHallOfFame';
import { StatePennant, UsFlag } from './ui/TitleMarks';
import { signInAvailable, useAccount } from '../services/account';
import { SignInSheet } from './AccountPanels';

const SCORING: [string, string][] = [
  ['Win', `${CAREER_POINTS.win}`],
  ['Loss', `${CAREER_POINTS.loss}`],
  ['Playoff win', `${CAREER_POINTS.playoffWin}`],
  ['State title', `${CAREER_POINTS.stateTitle}`],
  ['National title', `${CAREER_POINTS.nationalTitle}`],
  ['College signee', `${CAREER_POINTS.collegeSignee}`]
];

/** A career's titles: the state pennant and the US flag, each with its count. */
export const TitleCounts: React.FC<{ state: string; titles: number; nationalTitles?: number }> = ({ state, titles, nationalTitles = 0 }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
    {titles > 0 && (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <StatePennant state={state} />({titles})
      </span>
    )}
    {nationalTitles > 0 && (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        <UsFlag width={17} />({nationalTitles})
      </span>
    )}
  </span>
);

/**
 * The Hall of Fame: every career of the same length on one arcade board (3, 5 and 10 years), ranked by score.
 * Above it, the coach's current contract season by season.
 */
export const HallOfFameBoard: React.FC = () => {
  const career = useGameStore((s) => s.career);
  const [length, setLength] = useState<CareerLength>(career?.length ?? 3);
  const account = useAccount();
  const [signingIn, setSigningIn] = useState(false);
  // Signed out, careers stay on this device: they post to the Hall of Fame only for a signed-in player
  const deviceOnly = hasRemoteLeaderboard() && !account.user;

  return (
    <div className="ui-screen" style={{ paddingTop: 0 }}>
      {career ? (
        <section aria-label="Your career" className="ui-card" style={{ marginBottom: '12px' }}>
          <div className="ui-card-head">
            <span className="ui-card-title">
              {coachTitle(career.coachName)} · {career.startingProgram}
            </span>
            <span className="ui-card-badge">{careerPoints(career)}</span>
          </div>
          <div className="ui-muted">
            {career.length}-year contract · season {Math.min(career.seasons.length + 1, career.length)} of {career.length}
          </div>
          {career.seasons.length === 0 ? (
            <p className="ui-muted" style={{ margin: '8px 0 0' }}>
              Your first season is scored once the state championship games are played.
            </p>
          ) : (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[...career.seasons].reverse().map((s) => (
                <div key={s.year} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                  <span style={{ minWidth: 0, display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
                    <strong>{s.year}</strong> {s.wins + s.playoffWins}-{s.losses}
                    {s.playoffWins > 0 && ` · ${s.playoffWins} playoff ${s.playoffWins === 1 ? 'win' : 'wins'}`}
                    {s.stateTitle && <StatePennant state={career.state} />}
                    {s.nationalTitle && <UsFlag width={17} />}
                    {s.collegeSignees > 0 && ` · ${s.collegeSignees} signed`}
                  </span>
                  <strong style={{ flex: '0 0 auto' }}>+{s.points}</strong>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', borderTop: '2px solid #0f172a', paddingTop: '6px', marginTop: '2px' }}>
                <span>
                  {careerBasePoints(career)} × {prestigeMultiplier(career.startingPrestige).toFixed(2)}{' '}
                  <span className="ui-muted">(started at {career.startingPrestige ?? 99} prestige)</span>
                </span>
                <strong>{careerPoints(career)}</strong>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="ui-muted" style={{ margin: '0 0 12px' }}>
          Classic games aren&apos;t ranked. Start a career from New Game to get into the Hall of Fame.
        </p>
      )}

      <HallOfFameArcade career={career} length={length} onLength={setLength} deviceOnly={deviceOnly} />
      {!hasRemoteLeaderboard() && (
        <p className="ui-muted" style={{ marginTop: '10px' }}>
          Showing careers played on this device.
        </p>
      )}
      {signingIn && <SignInSheet onClose={() => setSigningIn(false)} />}
      {deviceOnly && signInAvailable(account.options) && (
        <div style={{ marginTop: '10px', background: '#EFF6FF', border: '1px solid #93C5FD', borderLeft: '5px solid #2563EB', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: '#1E3A8A', lineHeight: 1.45 }}>
          Your careers count only on this device. Sign in to put them on the Hall of Fame for everyone. Careers count from their first season, so sign in before you start one.
          <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', background: '#2563EB', borderColor: '#2563EB', color: '#fff' }} onClick={() => setSigningIn(true)}>
            Sign in
          </button>
        </div>
      )}
      {hasRemoteLeaderboard() && account.user && (
        <div style={{ marginTop: '10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderLeft: '5px solid #16A34A', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', color: '#166534' }}>
          Your careers post to the Hall of Fame under your account.
        </div>
      )}
    </div>
  );
};

/**
 * The arcade board itself: every career of one length (3, 5 or 10 years), ranked. The coach's own career is
 * highlighted when there is one; the title screen shows it with no game loaded.
 */
export const HallOfFameArcade: React.FC<{ career: Career | null; length: CareerLength; onLength: (length: CareerLength) => void; deviceOnly?: boolean }> = ({
  career,
  length,
  onLength,
  deviceOnly = false
}) => {
  const board = useHallOfFame(length, career);
  return (
    <section aria-label="Hall of Fame" style={arcade}>
      <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 900, letterSpacing: '0.16em', color: '#FACC15', textShadow: '0 0 6px rgba(250,204,21,.6)' }}>HALL OF FAME</div>
      <div role="group" aria-label="Career length" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', margin: '10px 0' }}>
        {CAREER_LENGTHS.map((n) => (
          <button
            key={n}
            aria-pressed={length === n}
            onClick={() => onLength(n)}
            style={{
              minHeight: '40px',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontWeight: 900,
              fontSize: '13px',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              border: `2px solid ${length === n ? '#22D3EE' : '#334155'}`,
              background: length === n ? 'rgba(34,211,238,.15)' : 'transparent',
              color: length === n ? '#22D3EE' : '#94A3B8'
            }}
          >
            {n} YEARS
          </button>
        ))}
      </div>
      {board.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '13px', margin: '14px 0' }}>NO {length}-YEAR CAREERS YET</p>
      ) : (
        <div>
          {board.map((e, i) => (
            <BoardRow key={e.careerId} entry={e} rank={i + 1} mine={e.careerId === career?.id} deviceOnly={deviceOnly && e.careerId === career?.id} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: '12px', fontSize: '11px', color: '#94A3B8' }} aria-label="Scoring">
        {SCORING.map(([label, pts]) => (
          <span key={label}>
            {label.toUpperCase()} <strong style={{ color: '#E2E8F0' }}>{pts}</strong>
          </span>
        ))}
        <span>× START BONUS: LOWER PRESTIGE SCORES MORE</span>
      </div>
    </section>
  );
};

const BoardRow: React.FC<{ entry: LeaderboardEntry; rank: number; mine: boolean; deviceOnly?: boolean }> = ({ entry: e, rank, mine, deviceOnly }) => {
  const games = e.wins + e.losses;
  const sub: React.CSSProperties = { display: 'block', color: '#94A3B8', fontSize: '11px' };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '42px minmax(0, 1fr) 46px',
        gap: '6px',
        alignItems: 'start',
        fontSize: '12.5px',
        padding: '6px',
        borderRadius: '6px',
        ...(mine ? { background: 'rgba(250,204,21,.18)', outline: '1px solid #FACC15' } : {})
      }}
    >
      <span style={{ color: rank === 1 ? '#FACC15' : '#22D3EE', fontWeight: 900 }}>{ordinal(rank).toUpperCase()}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <span style={{ display: 'block', fontWeight: 700 }}>{coachTitle(e.coachName)}</span>
        <span style={sub}>
          {schoolWithState(e.startingProgram, e.state)}
          {e.seasons < e.length ? ` · ${e.seasons} of ${e.length}` : ''}
          {deviceOnly ? ' · this device only' : ''}
        </span>
        <span style={sub}>
          RECORD <strong style={{ color: '#4ADE80' }}>{e.wins}-{e.losses}</strong>
          {games > 0 ? ` · ${Math.round((e.wins / games) * 100)}% WINS` : ''}
        </span>
        {(e.titles > 0 || (e.nationalTitles ?? 0) > 0) && (
          <span style={{ display: 'block', marginTop: '3px' }}>
            <TitleCounts state={e.state} titles={e.titles} nationalTitles={e.nationalTitles} />
          </span>
        )}
      </span>
      <span style={{ textAlign: 'right', color: '#FACC15', fontWeight: 900, fontSize: '14px' }}>{e.points}</span>
    </div>
  );
};

const arcade: React.CSSProperties = {
  background: '#05060F',
  color: '#E2E8F0',
  borderRadius: '12px',
  padding: '14px 10px',
  fontFamily: "ui-monospace, 'Courier New', monospace",
  boxShadow: '0 2px 10px rgba(15,23,42,.25)'
};
