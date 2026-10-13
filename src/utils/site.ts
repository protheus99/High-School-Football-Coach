// The game's own website (footballcoachgame.com): its Privacy and Terms pages. The game usually runs there, so a
// page is a plain path; a copy hosted somewhere else (a game portal's frame) is built with VITE_SITE_ORIGIN, e.g.
// `VITE_SITE_ORIGIN=https://footballcoachgame.com`, and links back to the site instead.

const SITE_ORIGIN = ((import.meta.env.VITE_SITE_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '');

/** A page on the game's website, e.g. sitePage('/privacy'). */
export const sitePage = (path: string) => `${SITE_ORIGIN}${path}`;

/** A file the game ships with (in public/), under the build's base path, e.g. assetUrl('logo/x.webp'). */
export const assetUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`;
