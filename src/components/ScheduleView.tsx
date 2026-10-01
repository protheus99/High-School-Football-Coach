import React from 'react';
import { useGameStore } from '../store/gameStore';
import { getSeasonPhase, getTeamGameForWeek } from '../sim/scheduleEngine';

export const ScheduleView: React.FC = () => {
  const { currentWeek, districtTeams, neighborDistrictTeams, seasonSchedule, userTeamId } = useGameStore();
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (!userTeam) return null;

  const allTeams = [...districtTeams, ...neighborDistrictTeams];

  // 20-week season built from the stored schedule
  const schedule = Array.from({ length: 20 }, (_, i) => {
    const weekNum = i + 1;
    const scheduled = getTeamGameForWeek(seasonSchedule, weekNum, userTeamId);
    const isHome = scheduled?.homeTeamId === userTeamId;
    const opponentId = scheduled && (isHome ? scheduled.awayTeamId : scheduled.homeTeamId);
    const played = scheduled?.homeScore !== undefined;
    const userScore = isHome ? scheduled?.homeScore : scheduled?.awayScore;
    const opponentScore = isHome ? scheduled?.awayScore : scheduled?.homeScore;

    return {
      week: weekNum,
      type: getSeasonPhase(weekNum),
      opponent: allTeams.find((t) => t.id === opponentId) ?? null,
      isHome,
      result: !played
        ? null
        : scheduled!.forfeitedByTeamId === userTeamId
          ? 'L (forfeit)'
          : scheduled!.forfeitedByTeamId
            ? 'W (forfeit)'
            : `${userScore! > opponentScore! ? 'W' : 'L'} ${userScore}-${opponentScore}`,
      isCurrent: weekNum === currentWeek,
      isCompleted: weekNum < currentWeek
    };
  });

  return (
    <div style={{ padding: '20px', maxWidth: '850px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>20-Week Season Schedule & Film Room</h2>
      <p style={{ color: '#64748B', fontSize: '13px' }}>Track your path through Spring Drills, Non-District tune-ups, the District 26-6A race, and the State Tournament.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {schedule.map((game) => (
          <div
            key={game.week}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: game.isCurrent ? '#EFF6FF' : '#fff',
              border: game.isCurrent ? '2px solid #3B82F6' : '1px solid #E2E8F0',
              borderRadius: '8px'
            }}
          >
            <div>
              <span style={{ fontWeight: 'bold', fontSize: '14px', marginRight: '10px' }}>Week {game.week}</span>
              <span style={{ fontSize: '12px', background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', color: '#475569' }}>
                {game.type.replace(/_/g, ' ')}
              </span>
            </div>

            <div style={{ textAlign: 'right', fontSize: '13px' }}>
              {game.opponent ? (
                <div>
                  {game.isHome ? 'vs.' : 'at'} <strong style={{ color: game.opponent.primaryColor }}>{game.opponent.name} {game.opponent.mascot}</strong>
                  {game.result && (
                    <strong style={{ marginLeft: '8px', color: game.result.startsWith('W') ? '#059669' : '#DC2626' }}>{game.result}</strong>
                  )}
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Record: {game.opponent.record.wins}-{game.opponent.record.losses} | Scheme: {game.opponent.schemeOffense.replace('_', ' ')}</div>
                </div>
              ) : (
                <span style={{ color: '#94A3B8' }}>Practice / Internal Preparation</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
