// The soundtrack's song list (public/music/soundtrack.json) and the pure helpers around it: the play order and
// the stand-in cover for a song without one.

/** One song, as listed in public/music/soundtrack.json. */
export interface Song {
  file: string; // the MP3 in public/music
  title: string;
  artist: string;
  cover?: string; // an image in public/music/covers (optional)
}

const MUSIC_DIR = `${import.meta.env.BASE_URL}music/`;
export const songUrl = (song: Song) => `${MUSIC_DIR}${encodeURIComponent(song.file)}`;
export const coverUrl = (song: Song) => (song.cover ? `${MUSIC_DIR}covers/${encodeURIComponent(song.cover)}` : null);

/** The song list, skipping any entry without a file, title and artist. */
export async function loadSoundtrack(): Promise<Song[]> {
  try {
    const response = await fetch(`${MUSIC_DIR}soundtrack.json`);
    if (!response.ok) return [];
    const list: unknown = await response.json();
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is Song => !!s && typeof s.file === 'string' && typeof s.title === 'string' && typeof s.artist === 'string');
  } catch {
    return [];
  }
}

/**
 * The next round of songs: every song once, shuffled, and never the song that just played first (so a reshuffle
 * can't repeat it back to back).
 */
export function shuffledRound(songs: Song[], justPlayed: Song | null, random: () => number = Math.random): Song[] {
  const round = [...songs];
  for (let i = round.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [round[i], round[j]] = [round[j], round[i]];
  }
  if (round.length > 1 && justPlayed && round[0].file === justPlayed.file) round.push(round.shift()!);
  return round;
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'or']);

/** A song's initials for a cover-less pop-up: "Friday Lights" -> "FL", "Fourth and Long" -> "FL", "Overtime" -> "OV". */
export function songInitials(title: string): string {
  const all = title
    .replace(/\(.*?\)/g, ' ')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const meaningful = all.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const words = meaningful.length > 0 ? meaningful : all;
  if (words.length === 0) return '♪';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const COVER_COLORS = ['#B91C1C', '#1D4ED8', '#047857', '#7C3AED', '#C2410C', '#0E7490', '#A21CAF', '#4D7C0F'];

/** The same color for the same song, every time it plays. */
export function songColor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 1000003;
  return COVER_COLORS[h % COVER_COLORS.length];
}
