import { describe, it, expect } from 'vitest';
import { luminance, readableOnWhite } from '../../utils/color';

describe('Readable school colors', () => {
  it('measures luminance', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
    expect(luminance('#000')).toBeCloseTo(0);
    expect(luminance('not a color')).toBeUndefined();
  });

  it('keeps dark school colors and swaps out ones too light for a white background', () => {
    expect(readableOnWhite('#002D62')).toBe('#002D62');
    expect(readableOnWhite('#FFFFFF', '#8B0000')).toBe('#8B0000');
    expect(readableOnWhite('#FFD700', '#FFFFFF')).toBe('#0F172A');
  });
});
