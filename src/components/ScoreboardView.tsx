import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { findDistrict, findRegion, playoffRoundCount } from '../sim/league';
import { FIRST_NON_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK } from '../sim/scheduleEngine';
import { ROUND_LABELS } from '../sim/playoffEngine';

type Scope = 'DISTRICT' | 'REGION' | 'ALL';

interface ScoreRow {
  id: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeScore?: number;
  awayScore?: number;
  tag?: string;
}

/** Scores and results from every game in the league, week by week (regular season and playoffs). */
export const ScoreboardView: React.FC = () => {
  const { league, leagueTeams, seasonSchedule, playoffBracket, currentWeek, userTeamId } = useGameStore();
  const rounds = league ? playoffRoundCount(league) : 0;
  const lastWeek = LAST_REGULAR_SEASON_WEEK + rounds;
  const weeks = Array.from({ length: lastWeek - FIRST_NON_DISTRICT_WEEK + 1 }, (_, i) => FIRST_NON_DISTRICT_WEEK + i);
  // Default: the most recent week with results
  const defaultWeek = Math.min(lastWeek, Math.max(FIRST_NON_DISTRICT_WEEK, currentWeek - 1));
  const [week, setWeek] = useState(defaultWeek);
  const [scope, setScope] = useState<Scope>('DISTRICT');
  const [search, setSearch] = useState('');
  // Keep the chosen week's chip visible in the scrolling week row
  const weekRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    weekRow.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [week]);

  const names = useMemo(() => new Map(leagueTeams.map((t) => [t.id, t.name])), [leagueTeams]);
  // Current overall record (regular season), shown next to every team
  const records = useMemo(() => new Map(leagueTeams.map((t) => [t.id, `${t.record.wins}-${t.record.losses}`])), [leagueTeams]);
  const district = league ? findDistrict(league, userTeamId) : undefined;
  const region = league ? findRegion(league, userTeamId) : undefined;
  const isPlayoffWeek = week > LAST_REGULAR_SEASON_WEEK;
  const roundIndex = week - LAST_REGULAR_SEASON_WEEK - 1;

  const rows: ScoreRow[] = useMemo(() => {
    if (isPlayoffWeek) {
      if (!playoffBracket) return [];
      return playoffBracket.divisions.flatMap((d) =>
        (d.rounds[roundIndex] ?? []).map((n) => ({
          id: n.matchupId,
          homeId: n.team1.id,
          awayId: n.team2.id,
          homeName: n.team1.name,
          awayName: n.team2.name,
          homeScore: n.team1Score,
          awayScore: n.team2Score,
          tag: playoffBracket.divisions.length > 1 ? d.name : n.region
        }))
      );
    }
    return seasonSchedule
      .filter((g) => g.week === week)
      .map((g) => ({
        id: g.gameId,
        homeId: g.homeTeamId,
        awayId: g.awayTeamId,
        homeName: names.get(g.homeTeamId) ?? 'Unknown',
        awayName: names.get(g.awayTeamId) ?? 'Unknown',
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        tag: g.forfeitedByTeamId ? 'Forfeit' : g.isDistrictGame ? 'District' : undefined
      }));
  }, [isPlayoffWeek, playoffBracket, roundIndex, seasonSchedule, week, names]);

  const inScope = (id: string) =>
    scope === 'ALL' ||
    (scope === 'DISTRICT' && !!district?.teamIds.includes(id)) ||
    (scope === 'REGION' && !!region?.districts.some((d) => d.teamIds.includes(id)));
  const query = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => inScope(r.homeId) || inScope(r.awayId))
    .filter((r) => !query || r.homeName.toLowerCase().includes(query) || r.awayName.toLowerCase().includes(query))
    // The user's game first, then finals before upcoming games
    .sort((a, b) => Number(b.homeId === userTeamId || b.awayId === userTeamId) - Number(a.homeId === userTeamId || a.awayId === userTeamId) || Number(b.homeScore !== undefined) - Number(a.homeScore !== undefined));

  if (!league) return null;
  const weekLabel = (w: number) => (w > LAST_REGULAR_SEASON_WEEK ? (playoffBracket?.roundNames[w - LAST_REGULAR_SEASON_WEEK - 1] ? ROUND_LABELS[playoffBracket.roundNames[w - LAST_REGULAR_SEASON_WEEK - 1]] : `Playoffs ${w - LAST_REGULAR_SEASON_WEEK}`) : `Wk ${w}`);

  return (
    <div className="ui-screen" style={{ maxWidth: '800px' }}>
      <h2 style={{ margin: '0 0 8px 0' }}>Scoreboard</h2>

      <div ref={weekRow} className="ui-chips" aria-label="Week" style={{ marginBottom: '8px' }}>
        {weeks.map((w) => (
          <button key={w} className="ui-chip" aria-pressed={week === w} onClick={() => setWeek(w)}>
            {weekLabel(w)}
          </button>
        ))}
      </div>

      <div className="ui-chips" aria-label="Which games" style={{ marginBottom: '8px' }}>
        {(
          [
            ['DISTRICT', district?.name ?? 'My district'],
            ['REGION', region?.name ?? 'My region'],
            ['ALL', 'All games']
          ] as [Scope, string][]
        ).map(([id, label]) => (
          <button key={id} className="ui-chip" aria-pressed={scope === id} onClick={() => setScope(id)}>
            {label}
          </button>
        ))}
      </div>
      <input className="ui-input" type="search" placeholder="Find a team" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: '12px' }} />

      {shown.length === 0 ? (
        <div className="ui-muted">{isPlayoffWeek && !playoffBracket ? 'The playoff bracket is set after the regular season.' : 'No games to show.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shown.map((r) => {
            const final = r.homeScore !== undefined && r.awayScore !== undefined;
            const isUser = r.homeId === userTeamId || r.awayId === userTeamId;
            const line = (name: string, teamId: string, score: number | undefined, won: boolean, home: boolean) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: won ? 'bold' : 'normal', color: final && !won ? '#64748B' : '#0F172A' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {home && <span style={{ color: '#94A3B8', fontWeight: 'normal' }}>@ </span>}
                  {name} <span style={{ color: '#94A3B8', fontWeight: 'normal', fontSize: '12px' }}>({records.get(teamId)})</span>
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{final ? score : ''}</span>
              </div>
            );
            return (
              <div
                key={r.id}
                style={{ background: isUser ? '#EFF6FF' : '#fff', border: `1px solid ${isUser ? '#93C5FD' : '#E2E8F0'}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px' }}
              >
                {line(r.awayName, r.awayId, r.awayScore, final && r.awayScore! > r.homeScore!, false)}
                {line(r.homeName, r.homeId, r.homeScore, final && r.homeScore! > r.awayScore!, true)}
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                  {final ? 'Final' : 'Upcoming'}
                  {r.tag ? ` · ${r.tag}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
