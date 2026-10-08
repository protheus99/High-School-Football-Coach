import { describe, it, expect } from 'vitest';
import { FOCUS_CALL, bestOffense, defenseFocusArrows, fitsTheirOffense, offenseMatchup, offenseNote } from '../gamePlan';

describe('Game plan arrows', () => {
  it('reads a 3-3-5 (light box) like the engine plays it: run-first playbooks have the edge', () => {
    expect(offenseMatchup('TRIPLE_OPTION', 'THREE_THREE_FIVE')).toMatchObject({ runArrows: 2, passArrows: 0 });
    expect(offenseMatchup('POWER_I', 'THREE_THREE_FIVE')).toMatchObject({ runArrows: 1, passArrows: 0 });
    expect(offenseMatchup('SPREAD', 'THREE_THREE_FIVE')).toMatchObject({ runArrows: 0, passArrows: -1 });
    expect(offenseMatchup('AIR_RAID', 'THREE_THREE_FIVE')).toMatchObject({ runArrows: 0, passArrows: 0 });
    expect(bestOffense('THREE_THREE_FIVE')).toBe('TRIPLE_OPTION');
  });

  it('turns with the defense: the Air Raid throws over a heavy box, and heavy rain hurts the passing playbooks', () => {
    expect(offenseMatchup('AIR_RAID', 'FOUR_FOUR').passArrows).toBeGreaterThanOrEqual(1);
    expect(bestOffense('FOUR_FOUR')).toBe('AIR_RAID');
    expect(offenseMatchup('TRIPLE_OPTION', 'FOUR_FOUR').runArrows).toBeLessThanOrEqual(-1);
    expect(offenseMatchup('SPREAD', 'FOUR_THREE', 'HEAVY_RAIN').pass).toBeLessThan(offenseMatchup('SPREAD', 'FOUR_THREE').pass);
    expect(offenseNote('SPREAD', 'SPREAD', 'THREE_THREE_FIVE')).toMatch(/^Your usual\. .*built to stop it\.$/);
  });

  it('shows each defensive plan as its trade-off, with Balanced left to the staff', () => {
    expect(defenseFocusArrows('BALANCED')).toBeNull();
    expect(FOCUS_CALL.BALANCED).toBeUndefined(); // no fixed call: the staff picks by down and distance
    expect(defenseFocusArrows('STOP_RUN')).toEqual({ run: 2, pass: -2, passLabel: 'Pass' });
    expect(defenseFocusArrows('STOP_PASS')).toEqual({ run: -2, pass: 2, passLabel: 'Pass' });
    expect(defenseFocusArrows('BLITZ')).toEqual({ run: 1, pass: -1, passLabel: 'Deep' });
    expect(fitsTheirOffense('SPREAD')).toBe('STOP_PASS');
    expect(fitsTheirOffense('POWER_I')).toBe('STOP_RUN');
  });
});
