// The cookie choice: necessary cookies only (sign-in), or analytics too (Google Analytics). Nothing is decided until
// the player answers the banner; the choice lives in this browser and can be changed in Settings. The site build's
// page (vite.config.ts) sets up window.fcLoadAnalytics and runs it on load for a player who already agreed.

export type CookieChoice = 'analytics' | 'necessary';
const KEY = 'fc.cookieConsent';

declare global {
  interface Window {
    fcLoadAnalytics?: () => void;
    fcAnalyticsId?: string;
  }
}

const listeners = new Set<() => void>();
let bannerReopened = false;

/** The player's choice, or null before they've answered. */
export function cookieChoice(): CookieChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'analytics' || v === 'necessary' ? v : null;
  } catch {
    return null;
  }
}

/** Saves the choice; analytics starts now, or stops (its cookies removed) when taken back. */
export function setCookieChoice(choice: CookieChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: the banner asks again next visit
  }
  bannerReopened = false;
  if (choice === 'analytics') window.fcLoadAnalytics?.();
  else stopAnalytics();
  listeners.forEach((l) => l());
}

function stopAnalytics(): void {
  const id = window.fcAnalyticsId;
  if (id) (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = true;
  // Google Analytics cookies: _ga and _ga_<id>, on this host and the parent domain
  document.cookie
    .split(';')
    .map((c) => c.trim().split('=')[0])
    .filter((name) => name === '_ga' || name.startsWith('_ga_') || name === '_gid')
    .forEach((name) => {
      const domain = location.hostname.replace(/^www\./, '');
      [``, `; domain=${domain}`, `; domain=.${domain}`].forEach((d) => (document.cookie = `${name}=; Max-Age=0; path=/${d}`));
    });
}

/** Shows the banner again (Settings › Cookies, or the Cookies link). */
export function reopenCookieBanner(): void {
  bannerReopened = true;
  listeners.forEach((l) => l());
}

/** Whether the banner should show: no choice yet, or the player asked to change it. */
export const cookieBannerOpen = () => bannerReopened || cookieChoice() === null;

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
