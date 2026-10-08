import React, { useState } from 'react';
import { OffensiveScheme, Team, WeatherType } from '../types/game';
import { Sheet } from './ui/Sheet';
import { GamePlanPicker } from './GamePlanPicker';
import { DefensiveFocus, FOCUS_NAMES, OFFENSE_NAMES } from '../sim/gamePlan';

/**
 * "Current Gameplan · Update" over "Offense [Power I] | Defense [Balanced]": the plan a game is running, one tap from
 * changing. Update sits on the title line so the plan itself never has to be cut short on a phone.
 */
export const GamePlanBar: React.FC<{ offense: OffensiveScheme; focus: DefensiveFocus; onUpdate: () => void }> = ({ offense, focus, onUpdate }) => (
  <div style={{ background: '#fff', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '4px 4px 8px 10px', marginBottom: '10px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Current Gameplan</span>
      <button onClick={onUpdate} style={{ minHeight: '40px', padding: '0 10px', background: 'none', border: 'none', color: '#1D4ED8', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
        Update
      </button>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', fontSize: '13px', color: '#334155' }}>
      <span style={{ whiteSpace: 'nowrap' }}>
        Offense <b style={planValue}>{OFFENSE_NAMES[offense]}</b>
      </span>
      <span aria-hidden="true" style={{ color: '#CBD5E1' }}>
        |
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>
        Defense <b style={planValue}>{FOCUS_NAMES[focus]}</b>
      </span>
    </div>
  </div>
);

/** The plan sheet during a game (or at halftime): the same boxes as the strategy room; the change applies from the next snap. */
export const GamePlanSheet: React.FC<{
  offense: OffensiveScheme;
  focus: DefensiveFocus;
  opponent: Team;
  usualOffense: OffensiveScheme;
  weather: WeatherType;
  when: string;
  onDone: (offense: OffensiveScheme, focus: DefensiveFocus) => void;
  onCancel: () => void;
}> = ({ offense, focus, opponent, usualOffense, weather, when, onDone, onCancel }) => {
  const [pickedOffense, setPickedOffense] = useState(offense);
  const [pickedFocus, setPickedFocus] = useState(focus);
  return (
    <Sheet
      title="Game Plan"
      subtitle={`${when} · applies from the next snap`}
      onClose={onCancel}
      footer={
        <button className="ui-btn ui-btn-block" style={{ background: '#047857', borderColor: '#047857', color: '#fff', minHeight: '50px', fontSize: '15px' }} onClick={() => onDone(pickedOffense, pickedFocus)}>
          Done
        </button>
      }
    >
      <div style={{ fontSize: '12px', color: '#475569' }}>Arrows show how each option matches up against {opponent.name}.</div>
      <GamePlanPicker
        offense={pickedOffense}
        onOffense={setPickedOffense}
        focus={pickedFocus}
        onFocus={setPickedFocus}
        opponent={opponent}
        usualOffense={usualOffense}
        weather={weather}
      />
    </Sheet>
  );
};

const planValue: React.CSSProperties = { display: 'inline-block', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '1px 6px', color: '#0F172A' };
