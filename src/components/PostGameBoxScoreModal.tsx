import React from 'react';
import { GameSimulationState, Player, PlayerStats, Team } from '../types/game';
import { addPlayerStats, createEmptyPlayerStats } from '../sim/playerStats';

interface BoxScoreProps {
  gameState: GameSimulationState;
  onClose: () => void;
}

export const PostGameBoxScoreModal: React.FC<BoxScoreProps> = ({ gameState, onClose }) => {
  const { homeTeam, awayTeam, homeScore, awayScore } = gameState;
  const gameStats = gameState.playerGameStats ?? {};

  // Team totals are summed from the individual stat lines credited on each play
  const teamTotals = (team: Team): PlayerStats => {
    const total = createEmptyPlayerStats();
    team.roster.forEach((p) => gameStats[p.id] && addPlayerStats(total, gameStats[p.id]));
    return total;
  };
  const home = teamTotals(homeTeam);
  const away = teamTotals(awayTeam);
  const turnovers = (t: PlayerStats) => t.interceptionsThrown + t.fumblesLost;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <h2 style={{ margin: 0, color: '#0F172A' }}>FINAL BOX SCORE</h2>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Final Score Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: '#F8FAFC', padding: '16px', borderRadius: '8px', margin: '16px 0' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: 0, color: homeTeam.primaryColor }}>{homeTeam.name}</h3>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{homeScore}</div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#94A3B8' }}>FINAL</div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ margin: 0, color: awayTeam.primaryColor }}>{awayTeam.name}</h3>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{awayScore}</div>
          </div>
        </div>

        {/* Team Comparison Matrix */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px', marginBottom: '20px' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Team Metric</th>
                <th style={{ padding: '8px' }}>{homeTeam.name}</th>
                <th style={{ padding: '8px' }}>{awayTeam.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Total Yards</td>
                <td>{home.passYards + home.rushYards}</td>
                <td>{away.passYards + away.rushYards}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Passing Yards</td>
                <td>{home.passYards} ({home.passCompletions}/{home.passAttempts})</td>
                <td>{away.passYards} ({away.passCompletions}/{away.passAttempts})</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Rushing Yards</td>
                <td>{home.rushYards} ({home.rushAttempts} car)</td>
                <td>{away.rushYards} ({away.rushAttempts} car)</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Turnovers Lost</td>
                <td style={{ color: turnovers(home) > 0 ? '#DC2626' : '#059669' }}>{turnovers(home)}</td>
                <td style={{ color: turnovers(away) > 0 ? '#DC2626' : '#059669' }}>{turnovers(away)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Individual Player Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '20px', maxHeight: '260px', overflowY: 'auto' }}>
          <TeamPlayerStats team={homeTeam} gameStats={gameStats} />
          <TeamPlayerStats team={awayTeam} gameStats={gameStats} />
        </div>

        <button onClick={onClose} style={confirmBtnStyle}>Return to Team Dashboard</button>
      </div>
    </div>
  );
};

/** Per-team player lines: passing, top rushers, top receivers, top defenders. */
const TeamPlayerStats: React.FC<{ team: Team; gameStats: Record<string, PlayerStats> }> = ({ team, gameStats }) => {
  const lines = team.roster
    .filter((p) => gameStats[p.id])
    .map((p) => ({ player: p, s: gameStats[p.id] }));
  const top = (score: (s: PlayerStats) => number, n: number) =>
    lines.filter((l) => score(l.s) !== 0).sort((a, b) => score(b.s) - score(a.s)).slice(0, n);
  const name = (p: Player) => `${p.position} ${p.firstName[0]}. ${p.lastName}`;
  const td = (n: number) => (n ? `, ${n} TD` : '');

  const sections: { title: string; rows: string[] }[] = [
    { title: 'Passing', rows: top((s) => s.passAttempts, 2).map(({ player, s }) => `${name(player)}: ${s.passCompletions}/${s.passAttempts}, ${s.passYards} yds${td(s.passTDs)}${s.interceptionsThrown ? `, ${s.interceptionsThrown} INT` : ''}`) },
    { title: 'Rushing', rows: top((s) => s.rushAttempts, 3).map(({ player, s }) => `${name(player)}: ${s.rushAttempts} car, ${s.rushYards} yds${td(s.rushTDs)}`) },
    { title: 'Receiving', rows: top((s) => s.receptions, 4).map(({ player, s }) => `${name(player)}: ${s.receptions} rec, ${s.receivingYards} yds${td(s.receivingTDs)}`) },
    { title: 'Defense', rows: top((s) => s.tackles + s.sacks * 2 + s.interceptionsCaught * 3, 4).map(({ player, s }) =>
      `${name(player)}: ${s.tackles} tkl${s.tacklesForLoss ? `, ${s.tacklesForLoss} TFL` : ''}${s.sacks ? `, ${s.sacks} sack` : ''}${s.interceptionsCaught ? `, ${s.interceptionsCaught} INT` : ''}`) },
    { title: 'Kicking', rows: top((s) => s.fieldGoalsAttempted, 1).map(({ player, s }) => `${name(player)}: ${s.fieldGoalsMade}/${s.fieldGoalsAttempted} FG`) }
  ];

  return (
    <div style={{ fontSize: '12px', color: '#334155' }}>
      <div style={{ fontWeight: 'bold', color: team.primaryColor, borderBottom: '1px solid #E2E8F0', marginBottom: '6px' }}>{team.name}</div>
      {sections.filter((sec) => sec.rows.length > 0).map((sec) => (
        <div key={sec.title} style={{ marginBottom: '6px' }}>
          <div style={{ fontWeight: 'bold', color: '#64748B', fontSize: '11px', textTransform: 'uppercase' }}>{sec.title}</div>
          {sec.rows.map((row) => <div key={row}>{row}</div>)}
        </div>
      ))}
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '600px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '18px',
  cursor: 'pointer',
  color: '#64748B'
};

const confirmBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: '#2563EB',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer'
};
