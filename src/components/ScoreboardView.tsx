import React, { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { findDistrict, findRegion } from '../sim/league';
import { FIRST_NON_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK, STATE_FINAL_WEEK } from '../sim/scheduleEngine';
import { bracketRoundForWeek } from '../sim/playoffEngine';
import { rulesForState } from '../sim/stateRules';
import { nationalTeams } from '../sim/nationalWorld';

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

/** Last week's results and this week's games around the league (regular season and playoffs). */
export const ScoreboardView: React.FC = () => {
  const { league, leagueTeams, seasonSchedule, playoffBracket, currentWeek, userTeamId, openTeamProfile, nationalLeagues } = useGameStore();
  const [scope, setScope] = useState<Scope>('DISTRICT');
  const [search, setSearch] = useState('');

  // Out-of-state opponents play in other states' leagues
  const allTeams = useMemo(() => nationalTeams(leagueTeams, nationalLeagues), [leagueTeams, nationalLeagues]);
  const names = useMemo(() => new Map(allTeams.map((t) => [t.id, t.name])), [allTeams]);
  // Current overall record (regular season), shown next to every team
  const records = useMemo(() => new Map(allTeams.map((t) => [t.id, `${t.record.wins}-${t.record.losses}`])), [allTeams]);
  const district = league ? findDistrict(league, userTeamId) : undefined;
  const region = league ? findRegion(league, userTeamId) : undefined;
  const lastGameWeek = STATE_FINAL_WEEK;
  const ROUND_LABELS = rulesForState(league?.state).playoffs.roundLabels;

  const rowsForWeek = (week: number): ScoreRow[] => {
    if (week > LAST_REGULAR_SEASON_WEEK) {
      if (!playoffBracket) return [];
      const roundIndex = bracketRoundForWeek(playoffBracket, week);
      if (roundIndex < 0) return []; // open week
      return playoffBracket.divisions.flatMap((d) =>
        (d.rounds[roundIndex] ?? []).filter((n) => !n.isBye).map((n) => ({
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
        tag: g.forfeitedByTeamId ? 'Forfeit' : g.isDistrictGame ? rulesForState(league?.state).districtLabel : undefined
      }));
  };

  const inScope = (id: string) =>
    scope === 'ALL' ||
    (scope === 'DISTRICT' && !!district?.teamIds.includes(id)) ||
    (scope === 'REGION' && !!region?.districts.some((d) => d.teamIds.includes(id)));
  const query = search.trim().toLowerCase();
  const filterRows = (rows: ScoreRow[]) =>
    rows
      .filter((r) => inScope(r.homeId) || inScope(r.awayId))
      .filter((r) => !query || r.homeName.toLowerCase().includes(query) || r.awayName.toLowerCase().includes(query))
      // The user's game first
      .sort((a, b) => Number(b.homeId === userTeamId || b.awayId === userTeamId) - Number(a.homeId === userTeamId || a.awayId === userTeamId));

  if (!league) return null;
  const isGameWeek = (w: number) => w >= FIRST_NON_DISTRICT_WEEK && w <= lastGameWeek;
  const weekLabel = (w: number) => {
    const round = w > LAST_REGULAR_SEASON_WEEK && playoffBracket ? bracketRoundForWeek(playoffBracket, w) : -1;
    if (w > LAST_REGULAR_SEASON_WEEK && playoffBracket && round < 0) return `Open week (week ${w})`;
    return round >= 0 && playoffBracket?.roundNames[round] ? `${ROUND_LABELS[playoffBracket.roundNames[round]]} (week ${w})` : `Week ${w}`;
  };
  const sections = [
    { key: 'last', title: 'Last week', week: currentWeek - 1 },
    { key: 'this', title: 'This week', week: currentWeek }
  ].filter((s) => isGameWeek(s.week));

  // Team names open the team's page
  const teamBtn = (id: string, name: string, home: boolean) => (
    <button onClick={() => openTeamProfile(id)} style={teamLink}>
      {home && <span style={{ color: '#94A3B8', fontWeight: 'normal' }}>@ </span>}
      {name} <span style={{ color: '#94A3B8', fontWeight: 'normal', fontSize: '12px' }}>({records.get(id)})</span>
    </button>
  );

  return (
    <div className="ui-screen" style={{ maxWidth: '800px' }}>
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

      {sections.length === 0 && (
        <div className="ui-muted">{currentWeek < FIRST_NON_DISTRICT_WEEK ? `No games yet: the season opens in week ${FIRST_NON_DISTRICT_WEEK}.` : 'The season is over.'}</div>
      )}
      {sections.map((section) => {
        const rows = filterRows(rowsForWeek(section.week));
        return (
          <section key={section.key} style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>
              {section.title} <span style={{ color: '#64748B', fontWeight: 'normal' }}>· {weekLabel(section.week)}</span>
            </h3>
            {rows.length === 0 ? (
              <div className="ui-muted">
                {section.week > LAST_REGULAR_SEASON_WEEK && !playoffBracket ? 'The playoff bracket is set after the regular season.' : 'No games to show.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.map((r) => {
                  const final = r.homeScore !== undefined && r.awayScore !== undefined;
                  const isUser = r.homeId === userTeamId || r.awayId === userTeamId;
                  const line = (id: string, name: string, score: number | undefined, won: boolean, home: boolean) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontWeight: won ? 'bold' : 'normal', color: final && !won ? '#64748B' : '#0F172A' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamBtn(id, name, home)}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{final ? score : ''}</span>
                    </div>
                  );
                  return (
                    <div
                      key={r.id}
                      style={{ background: isUser ? '#EFF6FF' : '#fff', border: `1px solid ${isUser ? '#93C5FD' : '#E2E8F0'}`, borderRadius: '8px', padding: '10px 12px', fontSize: '14px' }}
                    >
                      {line(r.awayId, r.awayName, r.awayScore, final && r.awayScore! > r.homeScore!, false)}
                      {line(r.homeId, r.homeName, r.homeScore, final && r.homeScore! > r.awayScore!, true)}
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                        {final ? 'Final' : 'Scheduled'}
                        {r.tag ? ` · ${r.tag}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

const teamLink: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'inherit',
  fontWeight: 'inherit',
  fontSize: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  // A full-height tap target on phones (the row is taller than the text)
  minHeight: '40px',
  display: 'inline-flex',
  alignItems: 'center'
};
