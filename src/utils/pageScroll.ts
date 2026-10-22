import { useLayoutEffect, useRef } from 'react';

// The app scrolls inside #root, not the page itself: a page that never moves can't rubber-band past its end on
// iPhones (lifting the tab bar off the bottom of the screen) or pull-to-refresh back to the title screen.

/** The element the app scrolls in (the page itself where #root isn't there, such as in tests). */
export const scroller = (): HTMLElement => document.getElementById('root') ?? document.documentElement;

/** How far the app is scrolled down. */
export const pageScrollTop = () => scroller().scrollTop;

/** Scrolls the app to a position. */
export const scrollPageTo = (top: number) => scroller().scrollTo({ top });

/**
 * Back to the top for a new screen, in a way iPhone Safari can't ignore: its scrolling area skips a scroll made
 * while a swipe is still gliding, so the glide is stopped first (scrolling frozen for a moment), then the app jumps
 * up, and checks again shortly after in case the new screen's layout moved it. Timers, not animation frames: a
 * page in the background gets no frames, and scrolling must never stay frozen.
 *
 * Two new screens in a row (the season's end opens the banquet, then the honors page over it) land inside one
 * freeze: the second jump keeps the setting from before the first and thaws on its own timer, so it never takes
 * the freeze itself for the setting to put back.
 */
let freeze: { el: HTMLElement; overflow: string; thaw: ReturnType<typeof setTimeout> } | null = null;

export function scrollToTopNow(): void {
  const el = scroller();
  if (freeze) clearTimeout(freeze.thaw);
  const overflow = freeze?.el === el ? freeze.overflow : el.style.overflowY;
  if (freeze && freeze.el !== el) freeze.el.style.overflowY = freeze.overflow;
  el.style.overflowY = 'hidden';
  el.scrollTop = 0;
  const thaw = setTimeout(() => {
    freeze = null;
    el.style.overflowY = overflow;
    if (el.scrollTop !== 0) el.scrollTop = 0;
  }, 30);
  freeze = { el, overflow, thaw };
  setTimeout(() => {
    if (el.scrollTop !== 0) el.scrollTop = 0;
  }, 150);
}

/**
 * A new screen starts at the top: whenever `screen` changes (a tab, a section, a page), the app scrolls back up,
 * before the new screen is drawn so it never shows halfway down. In-page buttons that don't change the screen
 * leave the scroll where it is.
 */
export function useScrollTopOnScreenChange(screen: string): void {
  const last = useRef(screen);
  useLayoutEffect(() => {
    if (last.current === screen) return;
    last.current = screen;
    scrollToTopNow();
  }, [screen]);
}
