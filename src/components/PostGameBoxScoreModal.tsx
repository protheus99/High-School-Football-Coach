import React from 'react';
import { readableOnWhite } from '../utils/color';
import { GameSimulationState, Player, PlayerStats, Team } from '../types/game';
import { addPlayerStats, createEmptyPlayerStats } from '../sim/playerStats';
import { Sheet } from './ui/Sheet';
import { GameScoreHeader } from './ui/GameScoreHeader';
import { recordLine } from '../sim/lineScore';
import { useGameStore } from '../store/gameStore';

interface BoxScoreProps {
  gameState: GameSimulationState;
  onClose: () => void;
  closeLabel?: string;
}

export const PostGameBoxScoreModal: React.FC<BoxScoreProps> = ({ gameState, onClose, closeLabel = 'Back to Hub' }) => {
  const { homeTeam, awayTeam } = gameState;
  const gameStats = gameState.playerGameStats ?? {};
  const { seasonSchedule, interstateGames } = useGameStore();
  const schedule = [...seasonSchedule, ...interstateGames];

  // Team totals are summed from the individual stat lines credited on each play
  const teamTotals = (team: Team): PlayerStats => {
    const total = createEmptyPlayerStats();
    team.roster.forEach((p) => gameStats[p.id] && addPlayerStats(total, gameStats[p.id]));
    return total;
  };
  const home = teamTotals(homeTeam);
  const away = teamTotals(awayTeam);
  const turnovers = (t: PlayerStats) => t.interceptionsThrown + t.fumblesLost;

  // Away on the left, home on the right, like the score above
  const metrics: [string, string, string, boolean?][] = [
    ['Total yards', `${away.passYards + away.rushYards}`, `${home.passYards + home.rushYards}`],
    ['Passing', `${away.passYards} (${away.passCompletions}/${away.passAttempts})`, `${home.passYards} (${home.passCompletions}/${home.passAttempts})`],
    ['Rushing', `${away.rushYards} (${away.rushAttempts} car)`, `${home.rushYards} (${home.rushAttempts} car)`],
    ['Turnovers', `${turnovers(away)}`, `${turnovers(home)}`, true]
  ];

  return (
    <Sheet
      title="Final Box Score"
      onClose={onClose}
      width="wide"
      footer={
        <button className="ui-btn ui-btn-primary ui-btn-block" onClick={onClose}>
          {closeLabel}
        </button>
      }
    >
      {/* Final score: away on the left, home on the right, with the points by quarter */}
      <GameScoreHeader
        game={gameState}
        awayRecord={recordLine(awayTeam, 'away', gameState, schedule)}
        homeRecord={recordLine(homeTeam, 'home', gameState, schedule)}
      />

      {/* Team comparison: metric in the middle, each team on its side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', rowGap: '6px', columnGap: '10px', fontSize: '14px', marginBottom: '18px' }}>
        {metrics.map(([label, a, h, lowerIsBetter]) => (
          <React.Fragment key={label}>
            <div style={{ textAlign: 'right', color: lowerIsBetter && Number(a) > 0 ? '#DC2626' : undefined }}>{a}</div>
            <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', alignSelf: 'center' }}>{label}</div>
            <div style={{ textAlign: 'left', color: lowerIsBetter && Number(h) > 0 ? '#DC2626' : undefined }}>{h}</div>
          </React.Fragment>
        ))}
      </div>

      {/* Player stats: one team after the other on phones, side by side on desktop */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <TeamPlayerStats team={awayTeam} gameStats={gameStats} />
        <TeamPlayerStats team={homeTeam} gameStats={gameStats} />
      </div>
    </Sheet>
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
    <div style={{ fontSize: '13px', color: '#334155' }}>
      <div style={{ fontWeight: 'bold', fontSize: '15px', color: readableOnWhite(team.primaryColor, team.secondaryColor), borderBottom: '1px solid #E2E8F0', marginBottom: '6px', paddingBottom: '4px' }}>{team.name}</div>
      {sections.filter((sec) => sec.rows.length > 0).map((sec) => (
        <div key={sec.title} style={{ marginBottom: '6px' }}>
          <div style={{ fontWeight: 'bold', color: '#64748B', fontSize: '12px', textTransform: 'uppercase' }}>{sec.title}</div>
          {sec.rows.map((row) => <div key={row}>{row}</div>)}
        </div>
      ))}
    </div>
  );
};
