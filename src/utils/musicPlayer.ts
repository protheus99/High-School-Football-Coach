import { useSyncExternalStore } from 'react';
import { Song, introSong, loadSoundtrack, shuffledRound, songUrl } from './soundtrack';
import { getMusicSettings, subscribeMusicSettings } from './musicSettings';

// ---------------------------------------------------------------------------
// The soundtrack player: shuffled songs on every screen except a live game (which has its own sound effects).
// Browsers only allow sound after the player touches the page, so it starts on the first tap. Volume and fades
// go through the Web Audio API, because iPhones ignore an audio element's own volume.
// ---------------------------------------------------------------------------

const FADE_IN = 1.2; // seconds
const FADE_OUT = 0.8;

export interface NowPlaying {
  song: Song | null;
  playId: number; // goes up with every new song (the pop-up shows once per song)
}

class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private songs: Song[] = [];
  private round: Song[] = [];
  private unlocked = false;
  private started = false; // a song has actually played (iPhones may refuse the first tries)
  private inGame = false;
  private hidden = false;
  private failures = 0;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private state: NowPlaying = { song: null, playId: 0 };
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof document === 'undefined') return;
    // The list loads right away, so the first song can start inside the coach's first tap (iPhones allow sound
    // to start only while handling a tap)
    void loadSoundtrack().then((songs) => {
      this.songs = songs;
      this.update();
    });
    subscribeMusicSettings(() => {
      this.applyVolume(0.15);
      this.update();
    });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      this.update();
    });
  }

  /** Called on the coach's taps until a song has played: sound is allowed from here on. */
  unlock = () => {
    this.unlocked = true;
    this.ensureAudio();
    void this.ctx?.resume();
    this.update();
  };

  /** True once a song has started playing (the taps no longer need to unlock anything). */
  hasStarted = () => this.started;

  /** A live game is on screen (true) or over (false): the music fades out, and comes back with the next song. */
  setInGame = (inGame: boolean) => {
    if (this.inGame === inGame) return;
    this.inGame = inGame;
    if (inGame) this.stop();
    else this.update();
  };

  skip = () => {
    if (this.shouldPlay()) this.playNext();
  };

  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /** How far into the current song (0-1), for the pop-up's progress bar. */
  progress = () => (this.audio && this.audio.duration > 0 ? this.audio.currentTime / this.audio.duration : 0);
  /** The current song's length in seconds (0 until known). */
  duration = () => (this.audio && Number.isFinite(this.audio.duration) ? this.audio.duration : 0);

  private shouldPlay() {
    return this.unlocked && getMusicSettings().enabled && !this.inGame && !this.hidden && this.songs.length > 0;
  }

  private ensureAudio() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.playNext());
    this.audio.addEventListener('error', () => {
      // A missing or broken file: try the next song, but don't spin through a list that can't play
      this.failures++;
      if (this.failures < this.songs.length) this.playNext();
    });
    this.audio.addEventListener('playing', () => {
      this.failures = 0;
      this.started = true;
    });
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.ctx.createMediaElementSource(this.audio).connect(this.gain);
      this.gain.connect(this.ctx.destination);
    } catch {
      // No Web Audio: the element's own volume (fades are skipped)
      this.ctx = null;
      this.gain = null;
    }
  }

  /** Plays, resumes or fades out to match the settings, the screen and the page's visibility. */
  private update() {
    if (!this.audio) return;
    if (!this.shouldPlay()) {
      if (!this.audio.paused) this.fadeOutThenPause();
      return;
    }
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (!this.state.song || !this.audio.src) this.playNext();
    else if (this.audio.paused) {
      void this.ctx?.resume();
      void this.audio.play().catch(() => undefined);
      this.applyVolume(FADE_IN);
    } else this.applyVolume(FADE_IN);
  }

  private playNext() {
    if (!this.audio || this.songs.length === 0) return;
    // The game opens with the intro song (on the title screen); after it, everything shuffles
    const intro = this.state.playId === 0 ? introSong(this.songs) : null;
    if (!intro && this.round.length === 0) this.round = shuffledRound(this.songs, this.state.song);
    const song = intro ?? this.round.shift()!;
    this.setGain(0, 0);
    this.audio.src = songUrl(song);
    void this.ctx?.resume();
    void this.audio.play().catch(() => undefined);
    this.applyVolume(FADE_IN);
    this.state = { song, playId: this.state.playId + 1 };
    this.listeners.forEach((l) => l());
  }

  /** Leaving for a game: fade out, and start fresh (the next song) when the game is over. */
  private stop() {
    if (!this.audio) return;
    this.fadeOutThenPause(() => {
      if (this.audio) this.audio.removeAttribute('src');
      this.state = { song: null, playId: this.state.playId };
    });
  }

  private fadeOutThenPause(then?: () => void) {
    this.setGain(0, FADE_OUT);
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(
      () => {
        this.pauseTimer = null;
        this.audio?.pause();
        then?.();
      },
      this.gain ? FADE_OUT * 1000 : 0
    );
  }

  private applyVolume(seconds: number) {
    const { enabled, volume } = getMusicSettings();
    this.setGain(enabled ? volume : 0, seconds);
  }

  private setGain(value: number, seconds: number) {
    if (this.gain && this.ctx) {
      const g = this.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(value, now + seconds);
    } else if (this.audio) this.audio.volume = value;
  }
}

export const musicPlayer = new MusicPlayer();

/** The song playing now, kept current in a component. */
export const useNowPlaying = () => useSyncExternalStore(musicPlayer.subscribe, musicPlayer.getState);
