import { describe, it, expect } from 'vitest';
import { canCompressSaves, compressText, decompressText } from '../../services/saveCodec';
import { buildTexasLeague } from '../league';

describe('Save compression', () => {
  it('round-trips a full league exactly and shrinks it several times over', async () => {
    expect(canCompressSaves()).toBe(true);
    const { league, teams } = buildTexasLeague();
    const json = JSON.stringify({ league, teams });
    const compressed = await compressText(json);
    expect(compressed.length).toBeLessThan(json.length / 5);
    expect(await decompressText(compressed)).toBe(json);
  }, 60000);
});
