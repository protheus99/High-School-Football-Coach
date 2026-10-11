import React from 'react';
import { useGameStore } from '../store/gameStore';
import { CAREER_POINTS, careerBasePoints, careerPoints, prestigeMultiplier } from '../sim/careerScore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict } from '../sim/league';
import { rulesForState } from '../sim/stateRules';
import { Team } from '../types/game';
import { StatePennant, UsFlag } from './ui/TitleMarks';
import { ordinal } from '../utils/format';
import { useHallOfFame } from '../utils/useHallOfFame';

/**
 * The banquet's season scorecard: how the year went (record, finish, playoffs, rankings) and the points it earned,
 * line by line, with the career total and where it stands in the Hall of Fame.
 */
export const SeasonScorecard: React.FC<{ team: Team }> = ({ team }) => {
  const { career, currentYear, playoffBracket, polls, districtTeams, league, userTeamId } = useGameStore();
  const season = career?.seasons.find((s) => s.year === currentYear);
  const rules = rulesForState(league?.state);
  const myRow = calculateDistrictStandings(districtTeams).find((r) => r.teamId === userTeamId);
  const districtName = (league && findDistrict(league, userTeamId)?.name) ?? rules.districtLabel;

  // The playoffs: every round the coach played, and how it ended
  const rounds = playoffBracket?.roundNames ?? [];
  const games = (playoffBracket?.divisions ?? []).flatMap((d) => d.rounds.flatMap((round, i) => round.filter((n) => !n.isBye && n.winnerTeamId && (n.team1.id === team.id || n.team2.id === team.id)).map((n) => ({ n, i }))));
  const playoffWins = games.filter((g) => g.n.winnerTeamId === team.id).length;
  const champion = !!playoffBracket?.divisions.some((d) => d.championTeamId === team.id);
  const lastLoss = games.find((g) => g.n.winnerTeamId !== team.id);
  const lostIn = lastLoss ? rules.playoffs.roundLabels[rounds[lastLoss.i]] : null;
  const winsLabel = `${playoffWins} playoff win${playoffWins === 1 ? '' : 's'}`;
  const headline = champion
    ? '🏆 State champions'
    : lastLoss
      ? lastLoss.i === rounds.length - 1
        ? '🥈 State runners-up'
        : lastLoss.i === rounds.length - 2
          ? '🏟️ State semifinalists'
          : '🏟️ Playoff team'
      : '📉 Season over';
  const playoffLine = champion ? `Won the ${rules.playoffs.roundLabels[rounds[rounds.length - 1]]} (${winsLabel})` : lostIn ? `Lost in the ${lostIn} (${winsLabel})` : 'Missed the playoffs';
  const tone = champion ? '#F59E0B' : lastLoss ? '#2563EB' : '#94A3B8';
  const ranks = polls?.teamRanks?.[team.id];
  const nationalChampion = polls?.nationalTop25[0]?.teamId === team.id;
  const wins = team.record.wins + playoffWins;
  const losses = team.record.losses + (lastLoss ? 1 : 0);

  // Where the career stands on its Hall of Fame board: this device's careers and, when there's a server, everyone's
  const board = useHallOfFame(career?.length ?? 3, career);
  const place = career ? board.findIndex((e) => e.careerId === career.id) + 1 : 0;

  const lines: [string, string, number][] = season
    ? [
        ['Wins', `${season.wins} × ${CAREER_POINTS.win}`, season.wins * CAREER_POINTS.win],
        ['Losses', `${season.losses} × ${CAREER_POINTS.loss}`, season.losses * CAREER_POINTS.loss],
        ['Playoff wins', `${season.playoffWins} × ${CAREER_POINTS.playoffWin}`, season.playoffWins * CAREER_POINTS.playoffWin],
        ['State title', season.stateTitle ? `1 × ${CAREER_POINTS.stateTitle}` : '—', season.stateTitle ? CAREER_POINTS.stateTitle : 0],
        ['National title', season.nationalTitle ? `1 × ${CAREER_POINTS.nationalTitle}` : '—', season.nationalTitle ? CAREER_POINTS.nationalTitle : 0],
        ['College signees', `${season.collegeSignees} × ${CAREER_POINTS.collegeSignee}`, season.collegeSignees * CAREER_POINTS.collegeSignee]
      ]
    : [];

  return (
    <section aria-label="Season scorecard">
      <div style={{ ...card, borderTop: `5px solid ${tone}` }}>
        <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.06em', color: '#475569' }}>
          SEASON SCORECARD{career && season ? ` · YEAR ${career.seasons.indexOf(season) + 1} OF ${career.length}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '17px', fontWeight: 900, marginTop: '4px', flexWrap: 'wrap' }}>
          {headline}
          {champion && <StatePennant state={team.state ?? 'Texas'} />}
          {nationalChampion && <UsFlag />}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '30px', fontWeight: 900, lineHeight: 1 }}>
            {wins}-{losses}
          </span>
          <span style={{ fontSize: '13px', color: '#475569' }}>
            ({team.record.districtWins}-{team.record.districtLosses}){myRow ? ` · ${ordinal(myRow.rank)} in ${districtName}` : ''}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px' }}>{playoffLine}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', marginTop: '10px' }}>
          <Tile label={(team.state ?? 'Texas').toUpperCase()} value={ranks ? `#${ranks.state}` : '—'} bg="#EFF6FF" fg="#1E40AF" />
          <Tile label="NATIONAL" value={ranks ? `#${ranks.national}` : '—'} bg="#F5F3FF" fg="#5B21B6" />
          <Tile label="SIGNED" value={String(season?.collegeSignees ?? 0)} bg="#ECFDF5" fg="#166534" />
        </div>
      </div>

      {season && (
        <div style={card}>
          <div style={{ fontSize: '15px', fontWeight: 900, marginBottom: '4px' }}>Points this season</div>
          {lines.map(([label, math, pts], i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13.5px', padding: '5px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
              <span>
                {label} <span style={{ color: '#64748B' }}>{math}</span>
              </span>
              <span style={{ fontWeight: 800, color: pts ? '#15803D' : '#94A3B8' }}>{pts ? `+${pts}` : '0'}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '8px', borderTop: '2px solid #0F172A', fontWeight: 900, fontSize: '15px' }}>
            <span>Season score</span>
            <span>+{season.points}</span>
          </div>
        </div>
      )}

      {career && season && (
        <div style={arcade}>
          <div style={{ fontSize: '11px', letterSpacing: '0.18em', color: '#22D3EE' }}>CAREER SCORE</div>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#FACC15', textShadow: '0 0 6px rgba(250,204,21,.6)' }}>{careerPoints(career)}</div>
          <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
            {careerBasePoints(career)} PTS × {prestigeMultiplier(career.startingPrestige).toFixed(2)} START BONUS
          </div>
          {place > 0 && (
            <div style={{ fontSize: '12px', letterSpacing: '0.1em', marginTop: '4px' }}>
              {ordinal(place).toUpperCase()} OF {board.length} IN THE {career.length}-YEAR HALL OF FAME
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const Tile: React.FC<{ label: string; value: string; bg: string; fg: string }> = ({ label, value, bg, fg }) => (
  <div style={{ background: bg, borderRadius: '10px', padding: '7px 6px', textAlign: 'center' }}>
    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', color: fg }}>{label}</div>
    <div style={{ fontSize: '17px', fontWeight: 900 }}>{value}</div>
  </div>
);

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)', padding: '12px', marginBottom: '12px' };
const arcade: React.CSSProperties = {
  background: '#05060F',
  color: '#E2E8F0',
  borderRadius: '12px',
  padding: '14px 12px',
  fontFamily: "ui-monospace, 'Courier New', monospace",
  textAlign: 'center',
  marginBottom: '12px'
};
