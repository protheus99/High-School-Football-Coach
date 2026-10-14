import { describe, it, expect } from 'vitest';
import { schoolWithState } from '../../utils/format';

describe('Hall of Fame school names', () => {
  it('shows the full school with its state, without doubled brackets', () => {
    expect(schoolWithState('Miami Northwestern', 'Florida')).toBe('Miami Northwestern (FL)');
    expect(schoolWithState('St. Thomas Aquinas', 'Florida')).toBe('St. Thomas Aquinas (FL)');
    expect(schoolWithState('Catholic (Baton Rouge)', 'Louisiana')).toBe('Catholic, Baton Rouge (LA)');
  });
});
