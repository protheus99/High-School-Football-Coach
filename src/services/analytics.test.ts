import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './analytics';
import { setCookieChoice } from './consent';

describe('game events', () => {
  afterEach(() => {
    delete window.gtag;
    localStorage.clear();
  });

  it('go to Google Analytics only for a player who allowed analytics, without empty values', () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    track('program_run', { program: 'YOUTH_CLINIC', cost: 60 });
    expect(gtag).not.toHaveBeenCalled(); // no answer yet: nothing is sent or queued

    setCookieChoice('necessary');
    track('program_run', { program: 'YOUTH_CLINIC', cost: 60 });
    expect(gtag).not.toHaveBeenCalled();

    setCookieChoice('analytics');
    track('season_end', { wins: 12, losses: 1, state_champion: true, national_rank: undefined });
    expect(gtag).toHaveBeenCalledWith('event', 'season_end', { wins: 12, losses: 1, state_champion: true });
  });

  it('never break the game when the tag is missing or fails', () => {
    setCookieChoice('analytics');
    expect(() => track('save_game')).not.toThrow();
    window.gtag = () => {
      throw new Error('blocked');
    };
    expect(() => track('save_game')).not.toThrow();
  });
});
