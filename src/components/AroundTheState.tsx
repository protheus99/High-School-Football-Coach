import React, { useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { PrecomputedGame, gameKey } from '../sim/runAhead';
import { TopGameTag, otherStateOf, topGameTagLabel, topGames } from '../sim/topGames';
import { userDivisionIndex } from '../sim/playoffEngine';

const TAG_STYLE: Record<TopGameTag, React.CSSProperties> = {
  LEAGUE: { color: '#14532D', background: '#DCFCE7' },
  DIVISION: { color: '#14532D', background: '#DCFCE7' },
  STATE_TOP_10: { color: '#1E40AF', background: '#DBEAFE' },
  NATIONAL_TOP_5: { color: '#1E40AF', background: '#DBEAFE' },
  UPSET: { color: '#fff', background: '#DC2626' }
};

/**
 * "Around the state", once the coach's game is over: the week's top games, all final (the run-ahead results that
 * Advance Week applies). A # before a name is only ever its national top-25 rank.
 */
export const AroundTheState: React.FC = () => {
  const { weekResults, currentWeek, runAhead, league, districtTeams, polls, playoffBracket, userTeamId } = useGameStore();
  // The run-ahead normally finished during the game; if not (a resumed final), simulate the week now
  useEffect(() => {
    if (weekResults?.week !== currentWeek) runAhead();
  }, [weekResults, currentWeek, runAhead]);

  const userState = league?.state ?? 'Texas';
  const rows = useMemo(() => {
    if (weekResults?.week !== currentWeek) return [];
    const division = playoffBracket?.isPlayoffsActive ? userDivisionIndex(playoffBracket, userTeamId) : undefined;
    return topGames({
      results: Object.values(weekResults.games),
      userState,
      districtIds: new Set(districtTeams.map((t) => t.id)),
      polls,
      divisionKey: division === undefined ? undefined : gameKey(userState, `po_${division}_`)
    });
  }, [weekResults, currentWeek, playoffBracket, userTeamId, userState, districtTeams, polls]);
  if (rows.length === 0) return null;

  const rank = new Map((polls?.nationalTop25 ?? []).map((e) => [e.teamId, e.rank]));
  const name = (g: PrecomputedGame, side: 'home' | 'away') => {
    const r = rank.get(side === 'home' ? g.homeId : g.awayId);
    const elsewhere = otherStateOf(g, side, userState);
    return `${r ? `#${r} ` : ''}${side === 'home' ? g.homeName : g.awayName}${elsewhere ? ` (${elsewhere})` : ''}`;
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px', boxShadow: '0 1px 2px rgba(15,23,42,.06)' }}>
      <div style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 900, letterSpacing: '0.06em', color: '#64748B', textTransform: 'uppercase', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        Around the state
      </div>
      {rows.map(({ game: g, tag }, i) => {
        const winner = g.homeScore === g.awayScore ? null : g.homeScore > g.awayScore ? 'home' : 'away';
        return (
          <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderTop: i > 0 ? '1px solid #F1F5F9' : undefined, fontSize: '13px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {(['away', 'home'] as const).map((side) => (
                <div key={side} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: winner === side ? 800 : 400 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(g, side)}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{side === 'home' ? g.homeScore : g.awayScore}</span>
                </div>
              ))}
            </div>
            {/* A fixed column, so the scores line up whatever the tag */}
            <span style={{ flex: '0 0 74px', textAlign: 'right' }}>
              <span style={{ display: 'inline-block', fontSize: '10.5px', fontWeight: 800, borderRadius: '999px', padding: '1px 6px', whiteSpace: 'nowrap', ...TAG_STYLE[tag] }}>
                {topGameTagLabel(tag, userState)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};
