import { describe, it, expect } from 'vitest';
import { calculateMatchupDelta, getContextualModifier } from '../matchEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';

describe('Match Simulation Mathematical Engine', () => {
  const teams = generateDistrictTeams();
  const offense = teams[0];
  const defense = teams[1];

  it('calculates inside run delta using interior linemen and RB carrying', () => {
    const result = calculateMatchupDelta('INSIDE_RUN', offense, defense);

    expect(result.delta).toBeDefined();
    expect(typeof result.delta).toBe('number');
    expect(result.ballCarrier).toBeDefined();
    expect(result.ballCarrier?.position).toBe('RB');
    expect(result.tackler).toBeDefined();
  });

  it('calculates short pass delta using QB accuracy and WR route running', () => {
    const result = calculateMatchupDelta('SHORT_PASS', offense, defense);

    expect(result.passer).toBeDefined();
    expect(result.passer?.position).toBe('QB');
    expect(result.receiver).toBeDefined();
    expect(result.receiver?.position).toBe('WR');
    expect(result.sacker).toBeDefined();
  });

  it('applies negative passing modifiers in heavy rain', () => {
    const clearMod = getContextualModifier('CLEAR', 0, 'DEEP_PASS');
    const rainMod = getContextualModifier('HEAVY_RAIN', 0, 'DEEP_PASS');

    expect(clearMod).toBe(0);
    expect(rainMod).toBe(-15);
  });

  it('applies wind penalty to deep passing concepts', () => {
    const windMod = getContextualModifier('HIGH_WIND', 0, 'DEEP_PASS');
    expect(windMod).toBe(-20);
  });

  it('scales delta modifier with momentum tiers', () => {
    const onFireMod = getContextualModifier('CLEAR', 2, 'INSIDE_RUN');
    const iceColdMod = getContextualModifier('CLEAR', -2, 'INSIDE_RUN');

    expect(onFireMod).toBe(6);
    expect(iceColdMod).toBe(-6);
  });
});
