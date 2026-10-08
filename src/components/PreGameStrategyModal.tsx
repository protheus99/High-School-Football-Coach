import React, { useState } from 'react';
import { Team, OffensiveScheme, DefensiveScheme, WeatherType } from '../types/game';
import { Sheet } from './ui/Sheet';
import { Chevrons } from './ui/Chevrons';
import {
  ArrowLevel,
  DEFENSE_FOCUS_NOTES,
  DEFENSE_NAMES,
  DEFENSE_STYLES,
  DefensiveFocus,
  OFFENSE_NAMES,
  OFFENSE_STYLES,
  bestOffense,
  defenseFocusArrows,
  fitsTheirOffense,
  offenseMatchup,
  offenseNote
} from '../sim/gamePlan';

interface PreGameStrategyModalProps {
  userTeam: Team;
  opponentTeam: Team;
  forecast: { weather: WeatherType; temp: number; wind: number };
  onKickoff: (strategy: { selectedOffScheme: OffensiveScheme; selectedDefScheme: DefensiveScheme; focusTarget: DefensiveFocus }) => void;
  onCancel: () => void;
}

const OFFENSES: OffensiveScheme[] = ['TRIPLE_OPTION', 'POWER_I', 'SPREAD', 'AIR_RAID'];
const FOCUSES: DefensiveFocus[] = ['BALANCED', 'STOP_RUN', 'STOP_PASS', 'BLITZ'];
const FOCUS_NAMES: Record<DefensiveFocus, string> = { BALANCED: 'Balanced', STOP_RUN: 'Stop Run', STOP_PASS: 'Stop Pass', BLITZ: 'Blitz' };
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
  const best = bestOffense(theirDefense, forecast.weather);
  const fits = fitsTheirOffense(opponentTeam.schemeOffense);
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

      <GroupLabel title="Offense" keyText="★ best vs. their defense" />
      <div style={grid}>
        {OFFENSES.map((scheme) => {
          const m = offenseMatchup(scheme, theirDefense, forecast.weather);
          return (
            <OptionBox key={scheme} selected={offScheme === scheme} tone="offense" star={best === scheme} onClick={() => setOffScheme(scheme)}>
              <div style={optionName}>{OFFENSE_NAMES[scheme]}</div>
              <div style={optionStyle}>{OFFENSE_STYLES[scheme]}</div>
              <ArrowRow items={[['Run', m.runArrows], ['Pass', m.passArrows]]} />
            </OptionBox>
          );
        })}
      </div>
      <div style={note}>{offenseNote(offScheme, userTeam.schemeOffense, theirDefense, forecast.weather)}</div>

      <GroupLabel title="Defense" keyText="★ fits their offense" />
      <div style={grid}>
        {FOCUSES.map((f) => {
          const a = defenseFocusArrows(f);
          return (
            <OptionBox key={f} selected={focus === f} tone="defense" star={fits === f} onClick={() => setFocus(f)}>
              <div style={optionName}>{FOCUS_NAMES[f]}</div>
              {a ? (
                <ArrowRow items={[['Run', a.run], [a.passLabel, a.pass]]} />
              ) : (
                <div style={{ ...arrowRow, fontWeight: 600 }}>Adjusts each snap</div>
              )}
            </OptionBox>
          );
        })}
      </div>
      <div style={note}>{DEFENSE_FOCUS_NOTES[focus]}</div>
    </Sheet>
  );
};

const GroupLabel: React.FC<{ title: string; keyText: string }> = ({ title, keyText }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '10px 0 6px' }}>
    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{title}</span>
    <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>{keyText}</span>
  </div>
);

const OptionBox: React.FC<{ selected: boolean; tone: 'offense' | 'defense'; star: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, tone, star, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={selected}
    style={{
      position: 'relative',
      minHeight: '60px',
      padding: selected ? '7px' : '8px',
      borderRadius: '10px',
      border: selected ? `2px solid ${tone === 'offense' ? '#2563EB' : '#0F172A'}` : '1px solid #CBD5E1',
      background: selected ? (tone === 'offense' ? '#EFF6FF' : '#F1F5F9') : '#fff',
      color: '#0F172A',
      cursor: 'pointer',
      textAlign: 'center',
      font: 'inherit'
    }}
  >
    {star && (
      <span aria-label="best fit" style={{ position: 'absolute', top: '4px', right: '7px', fontSize: '12px', fontWeight: 700, color: '#1E40AF' }}>
        ★
      </span>
    )}
    {children}
  </button>
);

/** "Run ⌃⌃  Pass –": an arrow pair, or a dash when it's even. */
const ArrowRow: React.FC<{ items: [string, ArrowLevel][] }> = ({ items }) => (
  <div style={arrowRow}>
    {items.map(([label, level]) => (
      <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        {label} <Chevrons level={level} />
      </span>
    ))}
  </div>
);

const chip: React.CSSProperties = { fontSize: '12px', background: '#F1F5F9', color: '#334155', borderRadius: '999px', padding: '3px 8px', whiteSpace: 'nowrap' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' };
const optionName: React.CSSProperties = { fontWeight: 700, fontSize: '14px' };
const optionStyle: React.CSSProperties = { fontSize: '12px', color: '#475569', fontWeight: 600 };
const arrowRow: React.CSSProperties = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '3px', fontSize: '12px', fontWeight: 700, color: '#334155' };
const note: React.CSSProperties = { fontSize: '12px', color: '#475569', marginTop: '6px', lineHeight: 1.35, minHeight: '16px' };
