import React from 'react';
import { Sheet } from './ui/Sheet';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict, leagueRegionTeams } from '../sim/league';
import { bracketRoundWeek } from '../sim/playoffEngine';
import { rulesForState } from '../sim/stateRules';
import { nationalTeams } from '../sim/nationalWorld';
import { Player, PlayerStats, Team } from '../types/game';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const scheme = (s: string) => s.replace(/_/g, ' ').toLowerCase();

/** Season leaders shown on a team page: the stat, its label, and how to read it. */
const LEADERS: { stat: keyof PlayerStats; label: string; unit: string }[] = [
  { stat: 'passYards', label: 'Passing', unit: 'yds' },
  { stat: 'rushYards', label: 'Rushing', unit: 'yds' },
  { stat: 'receivingYards', label: 'Receiving', unit: 'yds' },
  { stat: 'tackles', label: 'Tackles', unit: 'tkl' },
  { stat: 'sacks', label: 'Sacks', unit: 'sacks' },
  { stat: 'interceptionsCaught', label: 'Interceptions', unit: 'INT' }
];

/**
 * A team's page: record and standing, how they play, the season schedule with results, season leaders and
 * the top college prospects. Ratings stay hidden for other programs (stats and star ratings are public).
 */
export const TeamProfileSheet: React.FC<{ teamId: string; onClose: () => void; onOpenPlayer: (player: Player) => void }> = ({ teamId, onClose, onOpenPlayer }) => {
  const { leagueTeams, league, seasonSchedule, playoffBracket, userTeamId, polls, openTeamProfile, nationalLeagues } = useGameStore();
  const team = leagueTeams.find((t) => t.id === teamId);
  if (!team) return null;
  const isUser = team.id === userTeamId;
  const ROUND_LABELS = rulesForState(league?.state).playoffs.roundLabels;
  const districtLabel = rulesForState(league?.state).districtLabel;

  const district = league ? findDistrict(league, team.id) : undefined;
  const districtTeams = league && district ? leagueRegionTeams(league, leagueTeams).flat().find((d) => d.some((t) => t.id === team.id)) ?? [] : [];
  const standing = calculateDistrictStandings(districtTeams).find((r) => r.teamId === team.id);
  const stateRank = polls?.stateRankings[team.state ?? '']?.find((e) => e.teamId === team.id)?.rank;
  const nationalRank = polls?.nationalTop25.find((e) => e.teamId === team.id)?.rank;
  const byId = new Map(nationalTeams(leagueTeams, nationalLeagues).map((t) => [t.id, t]));

  // Regular season from the schedule, then playoff games from the bracket
  const games: { week: number; label?: string; opponent?: Team; isHome: boolean; result?: string; won?: boolean }[] = seasonSchedule
    .filter((g) => g.homeTeamId === team.id || g.awayTeamId === team.id)
    .sort((a, b) => a.week - b.week)
    .map((g) => {
      const isHome = g.homeTeamId === team.id;
      const opponent = byId.get(isHome ? g.awayTeamId : g.homeTeamId);
      if (g.homeScore === undefined || g.awayScore === undefined) return { week: g.week, opponent, isHome, label: g.isDistrictGame ? districtLabel : undefined };
      const mine = isHome ? g.homeScore : g.awayScore;
      const theirs = isHome ? g.awayScore : g.homeScore;
      const won = g.forfeitedByTeamId ? g.forfeitedByTeamId !== team.id : mine > theirs;
      return { week: g.week, opponent, isHome, won, label: g.isDistrictGame ? districtLabel : undefined, result: g.forfeitedByTeamId ? 'forfeit' : `${mine}-${theirs}` };
    });
  playoffBracket?.divisions.forEach((d) =>
    d.rounds.forEach((round, i) =>
      round
        .filter((n) => !n.isBye && (n.team1.id === team.id || n.team2.id === team.id))
        .forEach((n) => {
          const isHome = n.team1.id === team.id;
          const opponent = byId.get(isHome ? n.team2.id : n.team1.id) ?? (isHome ? n.team2 : n.team1);
          const mine = isHome ? n.team1Score : n.team2Score;
          const theirs = isHome ? n.team2Score : n.team1Score;
          games.push({
            week: bracketRoundWeek(playoffBracket, i),
            label: ROUND_LABELS[playoffBracket.roundNames[i]],
            opponent,
            isHome,
            ...(n.winnerTeamId && { won: n.winnerTeamId === team.id, result: `${mine}-${theirs}` })
          });
        })
    )
  );

  const leaders = LEADERS.map(({ stat, label, unit }) => {
    const best = [...team.roster].sort((a, b) => (b.stats[stat] as number) - (a.stats[stat] as number))[0];
    return best && (best.stats[stat] as number) > 0 ? { label, unit, player: best, value: best.stats[stat] as number } : null;
  }).filter((l): l is NonNullable<typeof l> => l !== null);
  const topProspects = [...team.roster]
    .filter((p) => p.recruiting.starRating >= 3)
    .sort((a, b) => b.recruiting.starRating - a.recruiting.starRating || b.overallRating - a.overallRating)
    .slice(0, 5);

  const playerBtn = (p: Player, text: React.ReactNode) => (
    <button onClick={() => onOpenPlayer(p)} style={linkBtn}>
      {text}
    </button>
  );

  return (
    <Sheet
      title={`${team.name} ${team.mascot}`}
      subtitle={
        <>
          {team.record.wins}-{team.record.losses}
          {standing && ` · ${ordinal(standing.rank)} in ${district?.name ?? `the ${districtLabel.toLowerCase()}`} (${standing.districtRecord})`}
          {nationalRank ? ` · #${nationalRank} nationally` : stateRank ? ` · #${stateRank} in ${team.state}` : ''}
        </>
      }
      onClose={onClose}
    >
      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
        {/^coach /i.test(team.staff.headCoachName) ? team.staff.headCoachName : `Coach ${team.staff.headCoachName}`} · {scheme(team.schemeOffense)} offense, {scheme(team.schemeDefense)} defense · Prestige {team.prestige}
      </div>

      <h3 style={sectionTitle}>Schedule</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px' }}>
        {games.length === 0 && <div className="ui-muted">No games scheduled.</div>}
        {games.map((g) => (
          <div key={`${g.week}-${g.opponent?.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ color: '#64748B' }}>Wk {g.week}</span> {g.isHome ? 'vs' : 'at'}{' '}
              {g.opponent ? (
                <button onClick={() => openTeamProfile(g.opponent!.id)} style={{ ...linkBtn, fontWeight: g.opponent.id === userTeamId ? 'bold' : 'normal' }}>
                  {g.opponent.name}
                </button>
              ) : (
                'TBD'
              )}
              {g.label && <span style={{ color: '#64748B', fontSize: '12px' }}> · {g.label}</span>}
            </span>
            <strong style={{ whiteSpace: 'nowrap', color: g.won === undefined ? '#94A3B8' : g.won ? '#059669' : '#DC2626' }}>
              {g.won === undefined ? '—' : `${g.won ? 'W' : 'L'} ${g.result}`}
            </strong>
          </div>
        ))}
      </div>

      <h3 style={sectionTitle}>Season leaders</h3>
      {leaders.length === 0 ? (
        <div className="ui-muted" style={{ marginBottom: '14px' }}>
          No games played yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '6px', marginBottom: '14px' }}>
          {leaders.map((l) => (
            <div key={l.label} style={leaderCard}>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>{l.label}</div>
              {playerBtn(l.player, `${l.player.position} ${l.player.firstName.charAt(0)}. ${l.player.lastName}`)}
              <div style={{ fontSize: '12px', color: '#334155' }}>
                {l.value} {l.unit}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={sectionTitle}>Top college prospects</h3>
      {topProspects.length === 0 ? (
        <div className="ui-muted">No 3-star or better prospects.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {topProspects.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
              {playerBtn(p, `${p.position} ${p.firstName} ${p.lastName}`)}
              <span style={{ color: '#B45309', whiteSpace: 'nowrap' }}>
                {'★'.repeat(p.recruiting.starRating)} {p.classYear}
                {isUser && ` · ${p.overallRating}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
};

const sectionTitle: React.CSSProperties = { margin: '0 0 6px 0', fontSize: '14px', color: '#334155' };
const leaderCard: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px' };
const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#1D4ED8',
  cursor: 'pointer',
  fontSize: 'inherit',
  textAlign: 'left',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  // A finger-sized tap area around the text
  minHeight: '40px',
  display: 'inline-flex',
  alignItems: 'center'
};
