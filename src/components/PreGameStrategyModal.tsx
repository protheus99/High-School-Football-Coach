import React, { useState } from 'react';
import { Team, OffensiveScheme, DefensiveScheme, WeatherType } from '../types/game';
import { Sheet } from './ui/Sheet';
import { GamePlanPicker } from './GamePlanPicker';
import { DEFENSE_NAMES, DEFENSE_STYLES, DefensiveFocus, OFFENSE_NAMES, OFFENSE_STYLES } from '../sim/gamePlan';

interface PreGameStrategyModalProps {
  userTeam: Team;
  opponentTeam: Team;
  forecast: { weather: WeatherType; temp: number; wind: number };
  onKickoff: (strategy: { selectedOffScheme: OffensiveScheme; selectedDefScheme: DefensiveScheme; focusTarget: DefensiveFocus }) => void;
  onCancel: () => void;
}

const WEATHER_NAMES: Record<WeatherType, string> = { CLEAR: 'Clear', HEAVY_RAIN: 'Heavy rain', HIGH_WIND: 'High wind', EXTREME_HEAT: 'Extreme heat', FREEZING_SNOW: 'Snow' };

/**
 * The game plan, on one phone screen: the opponent at a glance, then four offenses and four defenses. Arrows show how
 * each one matches up against this opponent (from the engine's own tables); a star marks the best fit; the line under
 * each group explains the one selected.
 */
export const PreGameStrategyModal: React.FC<PreGameStrategyModalProps> = ({ userTeam, opponentTeam, forecast, onKickoff, onCancel }) => {
  const [offScheme, setOffScheme] = useState<OffensiveScheme>(userTeam.schemeOffense);
  const [focus, setFocus] = useState<DefensiveFocus>('BALANCED');
  const theirDefense = opponentTeam.schemeDefense;
  const passFirst = OFFENSE_STYLES[opponentTeam.schemeOffense].toLowerCase();

  return (
    <Sheet
      title="Game Night Strategy Room"
      subtitle={`vs. ${opponentTeam.name} ${opponentTeam.mascot} (${opponentTeam.record.wins}-${opponentTeam.record.losses})`}
      onClose={onCancel}
      footer={
        <button
          className="ui-btn ui-btn-block"
          style={{ background: '#047857', borderColor: '#047857', color: '#fff', minHeight: '50px', fontSize: '15px' }}
          onClick={() => onKickoff({ selectedOffScheme: offScheme, selectedDefScheme: userTeam.schemeDefense, focusTarget: focus })}
        >
          🏈 Take the Field
        </button>
      }
    >
      {/* The opponent at a glance */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <span style={chip}>
          Offense: <b>{OFFENSE_NAMES[opponentTeam.schemeOffense]}</b> · {passFirst}
        </span>
        <span style={chip}>
          Defense: <b>{DEFENSE_NAMES[theirDefense]}</b> · {DEFENSE_STYLES[theirDefense]}
        </span>
        <span style={chip}>
          Weather: <b>{WEATHER_NAMES[forecast.weather]} {forecast.temp}°</b> · {forecast.wind} mph
        </span>
      </div>

      <h3 style={{ margin: '14px 0 0', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Playbook</h3>
      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>Arrows show how each option matches up against {opponentTeam.name}.</div>

      <GamePlanPicker
        offense={offScheme}
        onOffense={setOffScheme}
        focus={focus}
        onFocus={setFocus}
        opponent={opponentTeam}
        usualOffense={userTeam.schemeOffense}
        weather={forecast.weather}
      />
    </Sheet>
  );
};

const chip: React.CSSProperties = { fontSize: '12px', background: '#F1F5F9', color: '#334155', borderRadius: '999px', padding: '3px 8px', whiteSpace: 'nowrap' };
