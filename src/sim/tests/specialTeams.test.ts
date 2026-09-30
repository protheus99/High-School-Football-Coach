import { describe, it, expect } from 'vitest';
import { resolveFieldGoal } from '../matchEngine';
import { generateProceduralPlayer } from '../../generators/rosterGenerator';

describe('Special Teams & Field Goal Probability Model', () => {
  const eliteKicker = generateProceduralPlayer('K', 'Senior', 1);
  eliteKicker.attributes.kickingAccuracy = 90;

  const freshmanKicker = generateProceduralPlayer('K', 'Freshman', 2);
  freshmanKicker.attributes.kickingAccuracy = 45;

  it('grants high conversion rate on short field goals for elite kickers', () => {
    let successCount = 0;
    const trials = 500;

    for (let i = 0; i < trials; i++) {
      const result = resolveFieldGoal(eliteKicker, 22, 0); // 22-yard chip shot in 0 mph wind
      if (result.isSuccess) successCount++;
    }

    const conversionRate = (successCount / trials) * 100;
    expect(conversionRate).toBeGreaterThan(85);
  });

  it('sharply degrades conversion rate on 45+ yard attempts with high winds', () => {
    let successCount = 0;
    const trials = 500;

    for (let i = 0; i < trials; i++) {
      const result = resolveFieldGoal(freshmanKicker, 48, 25); // 48-yard kick in 25 mph wind
      if (result.isSuccess) successCount++;
    }

    const conversionRate = (successCount / trials) * 100;
    expect(conversionRate).toBeLessThan(20);
  });
});
