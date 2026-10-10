// The app scrolls inside #root, not the page itself: a page that never moves can't rubber-band past its end on
// iPhones (lifting the tab bar off the bottom of the screen) or pull-to-refresh back to the title screen.

/** The element the app scrolls in (the page itself where #root isn't there, such as in tests). */
export const scroller = (): HTMLElement => document.getElementById('root') ?? document.documentElement;

/** How far the app is scrolled down. */
export const pageScrollTop = () => scroller().scrollTop;

/** Scrolls the app to a position. */
export const scrollPageTo = (top: number) => scroller().scrollTo({ top });
