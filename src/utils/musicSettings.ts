import { useSyncExternalStore } from 'react';

// The coach's music preferences: kept in this browser (not in a save), so they apply to every career.

export type NowPlayingStyle = 'CLASSIC' | 'VINYL' | 'BIG_COVER';

export interface MusicSettings {
  enabled: boolean;
  volume: number; // 0-1
  popupStyle: NowPlayingStyle;
}

export const NOW_PLAYING_STYLES: { id: NowPlayingStyle; label: string; help: string }[] = [
  { id: 'CLASSIC', label: 'Classic', help: 'A dark card with the cover, the song and the artist' },
  { id: 'VINYL', label: 'Vinyl', help: 'A slim strip with a spinning record' },
  { id: 'BIG_COVER', label: 'Big cover', help: 'A larger card with a big cover and a skip button' }
];

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = { enabled: true, volume: 0.6, popupStyle: 'CLASSIC' };
const KEY = 'hsfhc.music';

function read(): MusicSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<MusicSettings>;
    return {
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_MUSIC_SETTINGS.enabled,
      volume: typeof stored.volume === 'number' ? Math.max(0, Math.min(1, stored.volume)) : DEFAULT_MUSIC_SETTINGS.volume,
      popupStyle: NOW_PLAYING_STYLES.some((s) => s.id === stored.popupStyle) ? stored.popupStyle! : DEFAULT_MUSIC_SETTINGS.popupStyle
    };
  } catch {
    return DEFAULT_MUSIC_SETTINGS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export const getMusicSettings = () => current;

export function setMusicSettings(change: Partial<MusicSettings>): void {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private browsing: the choice lasts until the page closes
  }
  listeners.forEach((l) => l());
}

export function subscribeMusicSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The settings, kept current in a component. */
export const useMusicSettings = () => useSyncExternalStore(subscribeMusicSettings, getMusicSettings);
