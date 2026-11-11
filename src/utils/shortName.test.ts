import { describe, it, expect } from 'vitest';
import { shortName } from './shortName';
import { STATE_DATA } from '../data/stateWorlds';

describe('school short names', () => {
  it('gives every long name a short one of 12 characters at most, unique in its state', () => {
    for (const [state, data] of Object.entries(STATE_DATA)) {
      const shown = new Map<string, string>();
      for (const region of data.regions)
        for (const district of region.districts)
          for (const s of district.schools) {
            const name = shortName({ name: s.name, state });
            if (s.name.length > 12) expect(name.length, `${state}: ${s.name}`).toBeLessThanOrEqual(12);
            else expect(name).toBe(s.name);
            expect(shown.get(name.toLowerCase()), `${state}: ${name}`).toBeUndefined();
            shown.set(name.toLowerCase(), s.name);
          }
    }
  });

  it('finds a school by its name alone (older saves, Texas teams without a state)', () => {
    expect(shortName('Cincinnati Archbishop Moeller')).toBe('Moeller');
    expect(shortName({ name: 'Brownsville Veterans Memorial' })).toBe('Veterans Mem');
    expect(shortName({ name: 'Lakewood St. Edward', state: 'Ohio' })).toBe('St. Edward');
  });

  it('leaves short and unknown names as they are', () => {
    expect(shortName({ name: 'Westlake', state: 'Texas' })).toBe('Westlake');
    expect(shortName('Some Out Of State Academy Prep')).toBe('Some Out Of State Academy Prep');
  });
});
