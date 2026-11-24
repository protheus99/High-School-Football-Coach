import { describe, it, expect } from 'vitest';
import { schoolWithState, stateAbbreviation, STATE_ABBREVIATIONS } from '../../utils/format';
import { TEAM_MANIFEST } from '../../data/teamManifest';

describe('Hall of Fame school names', () => {
  it('shows the full school with its state, without doubled brackets', () => {
    expect(schoolWithState('Miami Northwestern', 'Florida')).toBe('Miami Northwestern (FL)');
    expect(schoolWithState('St. Thomas Aquinas', 'Florida')).toBe('St. Thomas Aquinas (FL)');
    expect(schoolWithState('Catholic (Baton Rouge)', 'Louisiana')).toBe('Catholic, Baton Rouge (LA)');
  });
});

describe('State abbreviations', () => {
  it('gives every state with teams its own two-letter code', () => {
    const states = TEAM_MANIFEST.map((m) => m.state);
    expect(states.length).toBe(51);
    states.forEach((state) => expect(STATE_ABBREVIATIONS[state], state).toMatch(/^[A-Z]{2}$/));
    expect(new Set(states.map(stateAbbreviation)).size).toBe(states.length);
  });

  it('uses the official codes where the first two letters would clash', () => {
    expect(stateAbbreviation('Mississippi')).toBe('MS');
    expect(stateAbbreviation('Michigan')).toBe('MI');
    expect(stateAbbreviation('Montana')).toBe('MT');
    expect(stateAbbreviation('Missouri')).toBe('MO');
    expect(['New Hampshire', 'New Jersey', 'New Mexico', 'New York'].map(stateAbbreviation)).toEqual(['NH', 'NJ', 'NM', 'NY']);
    expect(stateAbbreviation('District of Columbia')).toBe('DC');
  });
});
