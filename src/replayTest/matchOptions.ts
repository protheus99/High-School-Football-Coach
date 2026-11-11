// The match page's options (kept in each browser) and the contexts that hand them to the live match screen.
import { createContext } from 'react';
import { FieldLook } from './ReplayField';

export interface ReplayOptions {
  look: FieldLook;
  /** How long the down card shows before the snap, and the result banner after the whistle (ms) */
  cardMs: number;
  bannerMs: number;
  /** Act out every snap, or only the big ones (the rest show where they ended) */
  show: 'every' | 'big';
  /** The scoreboard above the field: the stadium board (the default), a generic stadium board, or just the score */
  scoreboard: 'stadium' | 'simple' | 'score';
  /** The last two plays under the controls (tap them for the whole list) */
  pbp: boolean;
  /** Players hurt during the game (the real game only rolls injuries after the final whistle) */
  injuries: 'off' | 'normal' | 'often';
  /** Flags as often as the game calls them, or twice as often */
  penalties: 'normal' | 'often';
  /** The playtest pages: the injury and flag test switches show, and reach the engine (the game itself: never) */
  playtest?: boolean;
}
/** What the engine is told for each setting */
export const testRatesFor = (o: ReplayOptions) => ({
  injuries: o.injuries === 'off' ? 0 : o.injuries === 'often' ? 3 : 1,
  penalties: o.penalties === 'often' ? 2 : 1
});
export const DEFAULT_REPLAY_OPTIONS: ReplayOptions = {
  look: { style: 'new', numbers: 'near', big: false, height: true, flip: true, spotting: true, marks: 'team', colors: 'school' },
  cardMs: 1000,
  bannerMs: 1500,
  show: 'every',
  scoreboard: 'stadium',
  pbp: false,
  injuries: 'normal',
  penalties: 'normal'
};
/** Set by the playtest page; null on any other screen (the field then behaves as before) */
export const ReplayOptionsContext = createContext<ReplayOptions | null>(null);
/** The match page's Options sheet changes them through this */
export const ReplayOptionsSetContext = createContext<((o: ReplayOptions) => void) | null>(null);

export type ReplayPhase = 'pre' | 'live' | 'post' | 'done';
