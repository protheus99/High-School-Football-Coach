import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Song } from '../../utils/soundtrack';

const SONGS: Song[] = [
  { file: 'a.mp3', title: 'Alpha', artist: 'One' },
  { file: 'intro.mp3', title: 'Main Theme', artist: 'Two', intro: true },
  { file: 'b.mp3', title: 'Bravo', artist: 'Three' }
];

// A stand-in for the browser's audio element: play() succeeds only when the browser allows sound
let allowSound = false;
class FakeAudio {
  src = '';
  paused = true;
  error: null = null;
  currentTime = 0;
  duration = 100;
  preload = '';
  crossOrigin: string | null = null;
  volume = 1;
  private handlers: Record<string, (() => void)[]> = {};
  addEventListener(type: string, fn: () => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  removeAttribute() {
    this.src = '';
  }
  pause() {
    this.paused = true;
  }
  play() {
    if (!allowSound) return Promise.reject(Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }));
    this.paused = false;
    (this.handlers.playing ?? []).forEach((fn) => fn());
    return Promise.resolve();
  }
}

/** A fresh player (the module builds one when it loads), with the song list loaded. */
async function freshPlayer() {
  vi.resetModules();
  vi.doMock('../../utils/soundtrack', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../utils/soundtrack')>()),
    loadSoundtrack: async () => SONGS
  }));
  const { musicPlayer } = await import('../../utils/musicPlayer');
  await new Promise((r) => setTimeout(r, 0)); // the list loads
  await new Promise((r) => setTimeout(r, 0)); // the load-time start settles
  return musicPlayer;
}

describe('The soundtrack starting on its own', () => {
  beforeEach(() => {
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('AudioContext', undefined); // the element's own volume, no Web Audio
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts the intro as the game loads when the browser allows sound', async () => {
    allowSound = true;
    const player = await freshPlayer();
    expect(player.getState().song?.title).toBe('Main Theme');
    expect(player.hasStarted()).toBe(true);
  });

  it('waits for the first tap when the browser refuses, then plays the intro', async () => {
    allowSound = false;
    const player = await freshPlayer();
    // Refused: nothing is playing and the intro is still lined up (no pop-up for a song that never played)
    expect(player.getState()).toEqual({ song: null, playId: 0 });
    expect(player.hasStarted()).toBe(false);

    const shown: (string | undefined)[] = [];
    player.subscribe(() => shown.push(player.getState().song?.title));
    allowSound = true; // the tap allows sound
    player.unlock();
    await new Promise((r) => setTimeout(r, 0));
    expect(player.getState().song?.title).toBe('Main Theme');
    expect(shown).toContain('Main Theme');
    expect(player.hasStarted()).toBe(true);
  });
});
