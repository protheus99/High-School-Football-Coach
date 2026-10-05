import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CAREER_POINTS, careerPoints } from '../sim/careerScore';
import { scenarioById } from '../data/scenarios';
import { fetchRemoteLeaderboard, hasRemoteLeaderboard, LeaderboardEntry, localLeaderboard, rankEntries, toEntry } from '../services/leaderboard';

const SCORING: [string, number][] = [
  ['Win', CAREER_POINTS.win],
  ['Loss', CAREER_POINTS.loss],
  ['Playoff win', CAREER_POINTS.playoffWin],
  ['State title', CAREER_POINTS.stateTitle],
  ['College signee', CAREER_POINTS.collegeSignee]
];

/**
 * Career leaderboards: coaches are ranked by points earned each full season, against everyone who started at
 * the same program. Shows the coach's own career season by season, then the board.
 */
export const LeaderboardView: React.FC = () => {
  const career = useGameStore((s) => s.career);
  const [scope, setScope] = useState<'PROGRAM' | 'ALL'>(career ? 'PROGRAM' : 'ALL');
  const [remote, setRemote] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (!career || scope !== 'PROGRAM' || !hasRemoteLeaderboard()) return;
    let live = true;
    fetchRemoteLeaderboard(career.startingSchool, career.state).then((entries) => live && setRemote(entries));
    return () => {
      live = false;
    };
  }, [career, scope]);

  // This device's careers (the current one as it stands now), plus the server's for the program
  const local = scope === 'PROGRAM' && career ? localLeaderboard(career.startingSchool, career.state) : localLeaderboard();
  const merged = new Map<string, LeaderboardEntry>();
  [...(scope === 'PROGRAM' ? remote ?? [] : []), ...local].forEach((e) => merged.set(e.careerId, { ...merged.get(e.careerId), ...e }));
  if (career && career.seasons.length) merged.set(career.id, toEntry(career));
  const board = rankEntries([...merged.values()]);

  return (
    <div className="ui-screen" style={{ paddingTop: 0 }}>
      {career ? (
        <section aria-label="Your career" className="ui-card" style={{ marginBottom: '12px' }}>
          <div className="ui-card-head">
            <span className="ui-card-title">
              {career.coachName} · {career.startingProgram}
            </span>
            <span className="ui-card-badge">{careerPoints(career)} pts</span>
          </div>
          <div className="ui-muted">
            {scenarioById(career.scenario).title} · {career.state} · since {career.startedYear}
          </div>
          {career.seasons.length === 0 ? (
            <p className="ui-muted" style={{ margin: '8px 0 0' }}>
              Your first season is scored once the state championship games are played.
            </p>
          ) : (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[...career.seasons].reverse().map((s) => (
                <div key={s.year} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{s.year}</strong> {s.wins + s.playoffWins}-{s.losses}
                    {s.playoffWins > 0 && ` · ${s.playoffWins} playoff ${s.playoffWins === 1 ? 'win' : 'wins'}`}
                    {s.stateTitle && ' · 🏆 State champions'}
                    {s.collegeSignees > 0 && ` · ${s.collegeSignees} signed`}
                  </span>
                  <strong style={{ flex: '0 0 auto' }}>+{s.points}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="ui-muted" style={{ margin: '0 0 12px' }}>
          Classic games aren&apos;t ranked. Start a career at one of the scenario programs (New Game) to compete on its leaderboard.
        </p>
      )}

      <div className="ui-muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: '12px' }} aria-label="Scoring">
        {SCORING.map(([label, pts]) => (
          <span key={label}>
            {label} <strong style={{ color: '#0f172a' }}>{pts}</strong>
          </span>
        ))}
      </div>

      <div className="ui-chips" role="group" aria-label="Leaderboard" style={{ marginBottom: '12px' }}>
        {career && (
          <button className="ui-chip" aria-pressed={scope === 'PROGRAM'} onClick={() => setScope('PROGRAM')}>
            {career.startingProgram}
          </button>
        )}
        <button className="ui-chip" aria-pressed={scope === 'ALL'} onClick={() => setScope('ALL')}>
          All programs
        </button>
      </div>

      {board.length === 0 ? (
        <p className="ui-muted">No completed seasons yet.</p>
      ) : (
        <div className="ui-standings" aria-label="Rankings">
          {board.map((e, i) => {
            const mine = e.careerId === career?.id;
            return (
              <div key={e.careerId} className="ui-standings-row" style={mine ? { background: '#fef9c3' } : undefined}>
                <span className="ui-standings-seed" style={{ background: i === 0 ? '#ca8a04' : i < 3 ? '#64748b' : '#94a3b8' }}>
                  {i + 1}
                </span>
                <span className="ui-standings-name">
                  <strong>{e.coachName}</strong>
                  {mine && ' (you)'}
                  <br />
                  <small className="ui-muted" style={{ fontSize: '12px' }}>
                    {scope === 'ALL' && `${e.startingProgram} · `}
                    {e.seasons} {e.seasons === 1 ? 'season' : 'seasons'} · {e.wins}-{e.losses}
                    {e.titles > 0 && ` · ${e.titles} ${e.titles === 1 ? 'title' : 'titles'}`}
                  </small>
                </span>
                <span className="ui-standings-record">
                  <strong>{e.points}</strong>
                  <small>pts</small>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {!hasRemoteLeaderboard() && (
        <p className="ui-muted" style={{ marginTop: '10px' }}>
          Showing careers played on this device.
        </p>
      )}
    </div>
  );
};
