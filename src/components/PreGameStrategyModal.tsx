import React, { useState } from 'react';
import { Team, OffensiveScheme, DefensiveScheme, WeatherType } from '../types/game';
import { Sheet } from './ui/Sheet';

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
  const [defScheme] = useState<DefensiveScheme>(userTeam.schemeDefense);
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

  const label = (text: string) => text.replace(/_/g, ' ');

  return (
    <Sheet
      title="Game Night Strategy Room"
      subtitle={`${userTeam.name} (${userTeam.record.wins}-${userTeam.record.losses}) vs. ${opponentTeam.name} ${opponentTeam.mascot} (${opponentTeam.record.wins}-${opponentTeam.record.losses})`}
      onClose={onCancel}
      footer={
        <button
          className="ui-btn ui-btn-block"
          style={{ background: '#047857', borderColor: '#047857', color: '#fff', minHeight: '50px', fontSize: '15px' }}
          onClick={() => onKickoff({ selectedOffScheme: offScheme, selectedDefScheme: defScheme, focusTarget: focus })}
        >
          🏈 Take the Field
        </button>
      }
    >
      <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
        <dl className="ui-card-pairs" style={{ marginTop: 0 }}>
          <div>
            <dt>Their offense</dt>
            <dd>{label(opponentTeam.schemeOffense)}</dd>
          </div>
          <div>
            <dt>Their defense</dt>
            <dd>{label(opponentTeam.schemeDefense)}</dd>
          </div>
          <div>
            <dt>Weather</dt>
            <dd>
              {label(forecast.weather)}, {forecast.temp}°F
            </dd>
          </div>
          <div>
            <dt>Wind</dt>
            <dd>{forecast.wind} mph</dd>
          </div>
        </dl>
        <div style={{ fontSize: '13px', color: '#1E40AF', background: '#EFF6FF', padding: '8px 10px', borderRadius: '8px', marginTop: '10px' }}>
          💡 <strong>Scouting intel:</strong> {getSchemeMatchupTip()}
        </div>
      </div>

      <h3 style={sectionTitle}>Offensive playbook</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginBottom: '16px' }}>
        {(['SPREAD', 'AIR_RAID', 'POWER_I', 'TRIPLE_OPTION'] as const).map((scheme) => (
          <button key={scheme} className={`ui-btn${offScheme === scheme ? ' ui-btn-primary' : ''}`} aria-pressed={offScheme === scheme} onClick={() => setOffScheme(scheme)}>
            {label(scheme)}
          </button>
        ))}
      </div>

      <h3 style={sectionTitle}>Defensive focus</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        {(['BALANCED', 'STOP_RUN', 'STOP_PASS'] as const).map((f) => (
          <button key={f} className={`ui-btn${focus === f ? ' ui-btn-dark' : ''}`} aria-pressed={focus === f} onClick={() => setFocus(f)}>
            {label(f)}
          </button>
        ))}
      </div>
    </Sheet>
  );
};

const sectionTitle: React.CSSProperties = { margin: '0 0 8px 0', fontSize: '15px', color: '#0F172A' };
