import React from 'react';
import { OffensiveScheme, Team, WeatherType } from '../types/game';
import { Chevrons } from './ui/Chevrons';
import {
  ArrowLevel,
  DEFENSE_FOCUS_NOTES,
  DefensiveFocus,
  FOCUS_NAMES,
  OFFENSE_NAMES,
  OFFENSE_STYLES,
  bestOffense,
  defenseFocusArrows,
  fitsTheirOffense,
  offenseMatchup,
  offenseNote,
  SECOND_STRING_LEADS,
  secondStringNote
} from '../sim/gamePlan';

const OFFENSES: OffensiveScheme[] = ['TRIPLE_OPTION', 'POWER_I', 'SPREAD', 'AIR_RAID'];
const FOCUSES: DefensiveFocus[] = ['BALANCED', 'STOP_RUN', 'STOP_PASS', 'BLITZ'];

/**
 * The game plan boxes, shared by the pre-game strategy room and the in-game plan sheet: four offenses and four defenses
 * with arrows for how each matches up against this opponent, a star on the best fit, and a note on the one selected.
 */
export const GamePlanPicker: React.FC<{
  offense: OffensiveScheme;
  onOffense: (scheme: OffensiveScheme) => void;
  focus: DefensiveFocus;
  onFocus: (focus: DefensiveFocus) => void;
  opponent: Team;
  usualOffense: OffensiveScheme;
  weather: WeatherType;
  bench: number | null;
  onBench: (lead: number | null) => void;
}> = ({ offense, onOffense, focus, onFocus, opponent, usualOffense, weather, bench, onBench }) => {
  const theirDefense = opponent.schemeDefense;
  const best = bestOffense(theirDefense, weather);
  const fits = fitsTheirOffense(opponent.schemeOffense);
  return (
    <>
      <GroupLabel title="Offense" keyText="★ best vs. their defense" />
      <div style={grid}>
        {OFFENSES.map((scheme) => {
          const m = offenseMatchup(scheme, theirDefense, weather);
          return (
            <OptionBox key={scheme} selected={offense === scheme} tone="offense" star={best === scheme} onClick={() => onOffense(scheme)}>
              <div style={optionName}>{OFFENSE_NAMES[scheme]}</div>
              <div style={optionStyle}>{OFFENSE_STYLES[scheme]}</div>
              <ArrowRow items={[['Run', m.runArrows], ['Pass', m.passArrows]]} />
            </OptionBox>
          );
        })}
      </div>
      <div style={note}>{offenseNote(offense, usualOffense, theirDefense, weather)}</div>

      <GroupLabel title="Defense" keyText="★ fits their offense" />
      <div style={grid}>
        {FOCUSES.map((f) => {
          const a = defenseFocusArrows(f);
          return (
            <OptionBox key={f} selected={focus === f} tone="defense" star={fits === f} onClick={() => onFocus(f)}>
              <div style={optionName}>{FOCUS_NAMES[f]}</div>
              {a ? <ArrowRow items={[['Run', a.run], [a.passLabel, a.pass]]} /> : <div style={{ ...arrowRow, fontWeight: 600 }}>Adjusts each snap</div>}
            </OptionBox>
          );
        })}
      </div>
      <div style={note}>{DEFENSE_FOCUS_NOTES[focus]}</div>

      <GroupLabel title="Play second string when leading by" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
        {SECOND_STRING_LEADS.map((lead) => {
          const selected = bench === lead;
          return (
            <button
              key={lead ?? 'never'}
              onClick={() => onBench(lead)}
              aria-pressed={selected}
              style={{
                minHeight: '44px',
                borderRadius: '10px',
                border: selected ? '2px solid #0F172A' : '1px solid #CBD5E1',
                background: selected ? '#F1F5F9' : '#fff',
                color: '#0F172A',
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 800,
                fontSize: '15px'
              }}
            >
              {lead ?? 'Never'}
            </button>
          );
        })}
      </div>
      <div style={note}>{secondStringNote(bench)}</div>
    </>
  );
};

const GroupLabel: React.FC<{ title: string; keyText?: string }> = ({ title, keyText }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '10px 0 6px' }}>
    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{title}</span>
    {keyText && <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>{keyText}</span>}
  </div>
);

const OptionBox: React.FC<{ selected: boolean; tone: 'offense' | 'defense'; star: boolean; onClick: () => void; children: React.ReactNode }> = ({
  selected,
  tone,
  star,
  onClick,
  children
}) => (
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

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' };
const optionName: React.CSSProperties = { fontWeight: 700, fontSize: '14px' };
const optionStyle: React.CSSProperties = { fontSize: '12px', color: '#475569', fontWeight: 600 };
const arrowRow: React.CSSProperties = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '3px', fontSize: '12px', fontWeight: 700, color: '#334155' };
const note: React.CSSProperties = { fontSize: '12px', color: '#475569', marginTop: '6px', lineHeight: 1.35, minHeight: '16px' };
