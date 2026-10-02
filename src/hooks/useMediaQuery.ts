import { useEffect, useState } from 'react';

/**
 * Desktop breakpoint shared with the stylesheet. The game is mobile-first: phone layout is the default,
 * desktop layout applies only when this matches (and where matchMedia is unavailable, phone layout wins).
 */
export const DESKTOP_QUERY = '(min-width: 721px)';

/** True while the media query matches; updates on resize/rotation. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
