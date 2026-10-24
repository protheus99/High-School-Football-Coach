import { cookieChoice } from './consent';

// ---------------------------------------------------------------------------
// Game events for Google Analytics: what coaches do (new careers, games, seasons, programs, hires...), so we can see
// how the game is played and where players stop. Sent only for a player who allowed analytics cookies, and only from
// the site build, where the page defines gtag (vite.config.ts). Never names, emails or anything typed by the player:
// only the game's own ids, counts and results. The dev server logs each event to the console instead.
// ---------------------------------------------------------------------------

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const devLog = import.meta.env.DEV && import.meta.env.MODE !== 'test';

// Where this visit came from when it arrived through a link into New Game (a team page): new_game carries it
let entry: { source?: string; variant?: string } = {};
export function setEntrySource(source: string | undefined, variant?: string): void {
  entry = { source, variant };
}
export const entrySource = () => entry;

/** Sends one game event (snake_case name, up to 40 characters; values are ids, counts or results). */
export function track(event: string, params: EventParams = {}): void {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  if (devLog) console.debug('[analytics]', event, clean);
  // Without consent nothing is queued either: gtag would hold events until the tag loads
  if (cookieChoice() !== 'analytics' || typeof window === 'undefined' || !window.gtag) return;
  try {
    window.gtag('event', event, clean);
  } catch {
    // statistics never get in the way of the game
  }
}
