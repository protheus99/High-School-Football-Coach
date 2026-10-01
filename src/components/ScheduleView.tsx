import React from 'react';
import { useGameStore } from '../store/gameStore';

export const ScheduleView: React.FC = () => {
  const { currentWeek, districtTeams, userTeamId } = useGameStore();
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (!userTeam) return null;

  const opponentList = districtTeams.filter((t) => t.id !== userTeamId);

  // Generate 20-week season schedule
  const schedule = Array.from({ length: 20 }, (_, i) => {
    const weekNum = i + 1;
    let type = 'REGULAR_SEASON';
    const opponent = opponentList[(weekNum - 1) % opponentList.length];

    if (weekNum <= 2) type = 'SPRING_EVALUATION';
    else if (weekNum <= 4) type = 'SUMMER_CAMP';
    else if (weekNum <= 7) type = 'NON_DISTRICT';
    else if (weekNum <= 14) type = 'DISTRICT_PLAY';
    else if (weekNum <= 18) type = 'STATE_PLAYOFFS';
    else type = 'OFF_SEASON';

    return {
      week: weekNum,
      type,
      opponent: type === 'DISTRICT_PLAY' || type === 'NON_DISTRICT' ? opponent : null,
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
                {game.type.replace('_', ' ')}
              </span>
            </div>

            <div style={{ textAlign: 'right', fontSize: '13px' }}>
              {game.opponent ? (
                <div>
                  vs. <strong style={{ color: game.opponent.primaryColor }}>{game.opponent.name} {game.opponent.mascot}</strong>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Prestige: {game.opponent.prestige} | Scheme: {game.opponent.schemeOffense.replace('_', ' ')}</div>
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
