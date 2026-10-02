import React from 'react';
import { useGameStore } from '../store/gameStore';
import { getSeasonPhase, getTeamGameForWeek, LAST_REGULAR_SEASON_WEEK } from '../sim/scheduleEngine';
import { findDistrict, playoffRoundCount, seasonLength } from '../sim/league';
import { ROUND_LABELS } from '../sim/playoffEngine';
import { Team } from '../types/game';

export const ScheduleView: React.FC = () => {
  const { currentWeek, districtTeams, leagueTeams, league, seasonSchedule, playoffBracket, userTeamId } = useGameStore();
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (!userTeam) return null;

  const totalWeeks = league ? seasonLength(league) : 20;
  const playoffRounds = league ? playoffRoundCount(league) : 6;
  const districtName = league ? findDistrict(league, userTeamId)?.name : undefined;

  // Season built from the stored schedule, plus the user's playoff games from the bracket
  const schedule = Array.from({ length: totalWeeks }, (_, i) => {
    const weekNum = i + 1;
    const roundIndex = weekNum - LAST_REGULAR_SEASON_WEEK - 1;
    const base = { week: weekNum, type: getSeasonPhase(weekNum, playoffRounds), isCurrent: weekNum === currentWeek, isCompleted: weekNum < currentWeek };

    if (roundIndex >= 0 && playoffBracket) {
      const node = playoffBracket.divisions
        .map((d) => d.rounds[roundIndex]?.find((n) => n.team1.id === userTeamId || n.team2.id === userTeamId))
        .find(Boolean);
      const isHome = node?.team1.id === userTeamId;
      const opponent: Team | null = node ? (isHome ? node.team2 : node.team1) : null;
      const userScore = isHome ? node?.team1Score : node?.team2Score;
      const opponentScore = isHome ? node?.team2Score : node?.team1Score;
      return {
        ...base,
        label: playoffBracket.roundNames[roundIndex] ? ROUND_LABELS[playoffBracket.roundNames[roundIndex]] : undefined,
        opponent,
        isHome,
        result: node?.winnerTeamId ? `${node.winnerTeamId === userTeamId ? 'W' : 'L'} ${userScore}-${opponentScore}` : null
      };
    }

    const scheduled = getTeamGameForWeek(seasonSchedule, weekNum, userTeamId);
    const isHome = scheduled?.homeTeamId === userTeamId;
    const opponentId = scheduled && (isHome ? scheduled.awayTeamId : scheduled.homeTeamId);
    const played = scheduled?.homeScore !== undefined;
    const userScore = isHome ? scheduled?.homeScore : scheduled?.awayScore;
    const opponentScore = isHome ? scheduled?.awayScore : scheduled?.homeScore;

    return {
      ...base,
      label: undefined as string | undefined,
      opponent: leagueTeams.find((t) => t.id === opponentId) ?? null,
      isHome,
      result: !played
        ? null
        : scheduled!.forfeitedByTeamId === userTeamId
          ? 'L (forfeit)'
          : scheduled!.forfeitedByTeamId
            ? 'W (forfeit)'
            : `${userScore! > opponentScore! ? 'W' : 'L'} ${userScore}-${opponentScore}`
    };
  });

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto' }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: '17px' }}>{totalWeeks}-week schedule</h3>
      <p className="ui-muted" style={{ margin: '0 0 10px 0' }}>
        Spring drills, non-district tune-ups, the {districtName ?? 'district'} race and the state playoffs.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {schedule.map((game) => (
          <div
            key={game.week}
            style={{
              padding: '10px 12px',
              background: game.isCurrent ? '#EFF6FF' : '#fff',
              border: game.isCurrent ? '2px solid #3B82F6' : '1px solid #E2E8F0',
              borderRadius: '10px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'nowrap' }}>
              <span style={{ fontSize: '14px' }}>
                <strong>Week {game.week}</strong> <span style={{ color: '#64748B', fontSize: '13px' }}>· {game.label ?? game.type.replace(/_/g, ' ')}</span>
              </span>
              {game.result && <strong style={{ color: game.result.startsWith('W') ? '#059669' : '#DC2626', fontSize: '14px' }}>{game.result}</strong>}
            </div>
            {game.opponent ? (
              <div style={{ fontSize: '14px', marginTop: '2px' }}>
                {game.isHome ? 'vs.' : 'at'}{' '}
                <strong style={{ color: game.opponent.primaryColor }}>
                  {game.opponent.name} {game.opponent.mascot}
                </strong>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {game.opponent.record.wins}-{game.opponent.record.losses} · {game.opponent.schemeOffense.replace(/_/g, ' ')} offense
                </div>
              </div>
            ) : (
              <div style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>Practice and preparation</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
