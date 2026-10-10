import { describe, it, expect } from 'vitest';
import { Song, shuffledRound, songColor, songInitials } from '../../utils/soundtrack';
import { DEFAULT_MUSIC_SETTINGS, getMusicSettings, setMusicSettings } from '../../utils/musicSettings';

const song = (file: string, title = file): Song => ({ file, title, artist: 'Artist' });
const songs = ['a', 'b', 'c', 'd', 'e'].map((f) => song(`${f}.mp3`));

describe('The soundtrack', () => {
  it('plays every song once a round, in a shuffled order', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const round = shuffledRound(songs, null);
      expect(round.map((s) => s.file).sort()).toEqual(songs.map((s) => s.file));
      orders.add(round.map((s) => s.file).join());
    }
    expect(orders.size).toBeGreaterThan(5);
  });

  it('never repeats the last song at the start of a new round', () => {
    for (let i = 0; i < 50; i++) {
      const last = songs[i % songs.length];
      expect(shuffledRound(songs, last)[0].file).not.toBe(last.file);
    }
    expect(shuffledRound([songs[0]], songs[0])).toEqual([songs[0]]); // one song just plays again
  });

  it('gives a cover-less song its initials and a color of its own', () => {
    expect(songInitials('Friday Lights')).toBe('FL');
    expect(songInitials('Overtime')).toBe('OV');
    expect(songInitials('Under the Lights (Homecoming Remix)')).toBe('UL');
    expect(songInitials('Fourth and Long')).toBe('FL');
    expect(songInitials('The End')).toBe('EN');
    expect(songInitials('!!!')).toBe('♪');
    expect(songColor('Friday Lights')).toBe(songColor('Friday Lights'));
  });
});

describe('Music settings', () => {
  it('start on, at 60%, with the Classic pop-up, and remember changes in this browser', () => {
    expect(DEFAULT_MUSIC_SETTINGS).toEqual({ enabled: true, volume: 0.6, popupStyle: 'CLASSIC' });
    setMusicSettings({ popupStyle: 'VINYL', volume: 0.3 });
    expect(getMusicSettings()).toMatchObject({ popupStyle: 'VINYL', volume: 0.3, enabled: true });
    expect(JSON.parse(localStorage.getItem('hsfhc.music')!)).toMatchObject({ popupStyle: 'VINYL', volume: 0.3 });
    setMusicSettings(DEFAULT_MUSIC_SETTINGS);
  });
});
