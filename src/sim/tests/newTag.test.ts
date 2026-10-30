import { describe, it, expect } from 'vitest';
import { generateProceduralPlayer } from '../../generators/rosterGenerator';
import { FIRST_NON_DISTRICT_WEEK, LAST_TRAINING_CAMP_WEEK } from '../scheduleEngine';
import { isNewcomer, showNewTag } from '../../utils/playerFormat';

describe('The NEW tag', () => {
  const p = generateProceduralPlayer('WR', 'Freshman');
  p.joinedYear = 2027;

  it('shows from signing day through training camp, and is gone when the season opener kicks off', () => {
    expect(showNewTag(p, 2027, 3)).toBe(true);
    expect(showNewTag(p, 2027, LAST_TRAINING_CAMP_WEEK)).toBe(true);
    expect(showNewTag(p, 2027, FIRST_NON_DISTRICT_WEEK)).toBe(false);
    expect(showNewTag(p, 2027, 20)).toBe(false);
  });

  it('is only for this year’s newcomers; the New filter still counts them all season', () => {
    expect(showNewTag(p, 2028, 3)).toBe(false);
    expect(isNewcomer(p, 2027)).toBe(true);
    expect(isNewcomer({ ...p, joinedYear: undefined }, 2027)).toBe(false);
  });
});
