import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameQuarter, PrecomputedGame, scoreAt } from '../sim/runAhead';

const OPEN_KEY = 'hsfhc.aroundTheLeagueOpen';
const MAX_ROWS = 10;

/**
 * Scores from around the league while the coach plays his game: his district's games (or, in the playoffs, the
 * rest of his bracket's round) and every game with a nationally ranked team in it. The results were simulated
 * ahead; each shows the score at the live game's clock and its final once the live game ends.
 */
export const AroundTheLeague: React.FC<{ quarter: GameQuarter; clock: number; isOver: boolean }> = ({ quarter, clock, isOver }) => {
  const { weekResults, currentWeek, runAhead, league, districtTeams, polls } = useGameStore();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  // The run-ahead normally finished in the background; if not, simulate the week now
  useEffect(() => {
    if (weekResults?.week !== currentWeek) runAhead();
  }, [weekResults, currentWeek, runAhead]);

  const results = weekResults?.week === currentWeek ? Object.values(weekResults.games) : [];
  const userState = league?.state ?? 'Texas';
  const districtIds = new Set(districtTeams.map((t) => t.id));
  const rank = new Map((polls?.nationalTop25 ?? []).map((e) => [e.teamId, e.rank]));
  const local = results.filter((g) => g.state === userState && (g.label || (districtIds.has(g.homeId) && districtIds.has(g.awayId))));
  const ranked = results
    .filter((g) => !local.includes(g) && (rank.has(g.homeId) || rank.has(g.awayId)))
    .sort((a, b) => Math.min(rank.get(a.homeId) ?? 99, rank.get(a.awayId) ?? 99) - Math.min(rank.get(b.homeId) ?? 99, rank.get(b.awayId) ?? 99));
  const rows = [...local, ...ranked].slice(0, MAX_ROWS);
  if (rows.length === 0) return null;

  const toggle = () =>
    setOpen((was) => {
      try {
        localStorage.setItem(OPEN_KEY, was ? '0' : '1');
      } catch {
        // storage unavailable: the toggle still works for this game
      }
      return !was;
    });
  const name = (g: PrecomputedGame, side: 'home' | 'away') => {
    const id = side === 'home' ? g.homeId : g.awayId;
    const r = rank.get(id);
    return `${r ? `#${r} ` : ''}${side === 'home' ? g.homeName : g.awayName}`;
  };

  return (
    <div style={{ marginBottom: '10px' }}>
      <button className="ui-btn ui-btn-block" onClick={toggle} aria-expanded={open} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🏟️ Around the league ({rows.length})</span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', marginTop: '6px' }}>
          {rows.map((g, i) => {
            const s = scoreAt(g, quarter, clock, isOver);
            const leader = s.home === s.away ? null : s.home > s.away ? 'home' : 'away';
            return (
              <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderTop: i > 0 ? '1px solid #F1F5F9' : undefined, fontSize: '13px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(['away', 'home'] as const).map((side) => (
                    <div key={side} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: leader === side ? 'bold' : 'normal' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(g, side)}</span>
                      <span>{side === 'home' ? s.home : s.away}</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex: '0 0 64px', textAlign: 'right', fontSize: '11px', color: '#64748B', lineHeight: 1.3 }}>
                  <strong style={{ color: s.status.startsWith('Final') ? '#0F172A' : '#B45309' }}>{s.status}</strong>
                  <br />
                  {g.label ?? (districtIds.has(g.homeId) && districtIds.has(g.awayId) ? 'District' : g.state)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
