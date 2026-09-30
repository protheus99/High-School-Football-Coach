import React, { useState } from 'react';
import { Team, OffensiveScheme, DefensiveScheme, WeatherType } from '../types/game';

interface PreGameStrategyModalProps {
  userTeam: Team;
  opponentTeam: Team;
  forecast: { weather: WeatherType; temp: number; wind: number };
  onKickoff: (strategy: {
    selectedOffScheme: OffensiveScheme;
    selectedDefScheme: DefensiveScheme;
    focusTarget: 'STOP_RUN' | 'STOP_PASS' | 'BALANCED';
  }) => void;
  onCancel: () => void;
}

export const PreGameStrategyModal: React.FC<PreGameStrategyModalProps> = ({
  userTeam,
  opponentTeam,
  forecast,
  onKickoff,
  onCancel
}) => {
  const [offScheme, setOffScheme] = useState<OffensiveScheme>(userTeam.schemeOffense);
  const [defScheme, setDefScheme] = useState<DefensiveScheme>(userTeam.schemeDefense);
  const [focus, setFocus] = useState<'STOP_RUN' | 'STOP_PASS' | 'BALANCED'>('BALANCED');

  const getSchemeMatchupTip = () => {
    if (opponentTeam.schemeOffense === 'AIR_RAID') {
      return 'Opponent runs Air Raid. Nickel (4-2-5) or Drop-8 Zone will flood passing lanes and limit deep explosives.';
    }
    if (opponentTeam.schemeOffense === 'TRIPLE_OPTION' || opponentTeam.schemeOffense === 'POWER_I') {
      return 'Opponent is heavy ground-and-pound. 4-4 Heavy Box will stack the line of scrimmage and force turnovers.';
    }
    return 'Opponent runs balanced Spread. Maintain fundamental gap discipline.';
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0F172A' }}>GAME NIGHT STRATEGY ROOM</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              Matchup: {userTeam.name} vs. {opponentTeam.name} ({opponentTeam.mascot})
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Scouting & Weather Report */}
        <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '14px', margin: '16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span><strong>Opponent Scheme:</strong> {opponentTeam.schemeOffense.replace('_', ' ')} / {opponentTeam.schemeDefense.replace('_', ' ')}</span>
            <span><strong>Weather:</strong> {forecast.weather.replace('_', ' ')} ({forecast.temp}°F, {forecast.wind} mph)</span>
          </div>
          <div style={{ fontSize: '12px', color: '#1E40AF', background: '#EFF6FF', padding: '8px', borderRadius: '4px' }}>
            💡 <strong>Scouting Intel:</strong> {getSchemeMatchupTip()}
          </div>
        </div>

        {/* Offensive Scheme Selection */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>Offensive Playbook Installation:</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {(['SPREAD', 'AIR_RAID', 'POWER_I', 'TRIPLE_OPTION'] as const).map((scheme) => (
              <button
                key={scheme}
                onClick={() => setOffScheme(scheme)}
                style={schemeBtnStyle(offScheme === scheme)}
              >
                {scheme.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Defensive Scheme & Focus */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>Defensive Matchup Assignment:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['BALANCED', 'STOP_RUN', 'STOP_PASS'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFocus(f)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: focus === f ? '#0F172A' : '#F1F5F9',
                  color: focus === f ? '#fff' : '#334155',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onKickoff({ selectedOffScheme: offScheme, selectedDefScheme: defScheme, focusTarget: focus })}
          style={kickoffBtnStyle}
        >
          🏈 Confirm Strategy & Take the Field
        </button>
      </div>
    </div>
  );
};

const schemeBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px',
  background: active ? '#2563EB' : '#F8FAFC',
  color: active ? '#fff' : '#334155',
  border: active ? '2px solid #1D4ED8' : '1px solid #CBD5E1',
  borderRadius: '6px',
  fontWeight: 'bold',
  fontSize: '12px',
  cursor: 'pointer'
});

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
  zIndex: 1300
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '580px'
};

const kickoffBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: '#10B981',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  fontSize: '15px',
  cursor: 'pointer'
};
