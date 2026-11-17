// The site's page list: every public address of footballcoachgame.com, with what search engines and outside vendors
// may do with it. scripts/site-map/build.mjs turns it into the sitemap, the vendor list and docs/SITEMAP.md.
//
// How it scales: no page carries its own settings. Each page has a KIND, and the kind's RULES say whether search
// engines list it (index) and whether outside vendors may use it (vendors: link to it, send traffic or ads to it,
// feature it). Every school in the game's data already has its address here; it counts as live once its page is
// built (public/<state>/<school>/index.html, written by scripts/team-pages/build.mjs). Exceptions, such as a school
// that asks to be left out, go in OVERRIDES.
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE = 'https://footballcoachgame.com';

/** What each kind of page allows. index: in the sitemap and open to search engines. vendors: outside vendors may use it. */
export const RULES = {
  game: { index: true, vendors: true, about: 'The game itself (one address; its screens have no addresses of their own)' },
  info: { index: true, vendors: true, about: 'About the game' },
  legal: { index: true, vendors: false, about: 'Privacy and terms: open to read, not for promotion' },
  school: { index: true, vendors: true, about: 'One page per school: "Can you help ... win state?"' },
  start: { index: false, vendors: false, about: 'A school page\'s "what to expect" step: reached only from its school page (and part of a test)' },
  private: { index: false, vendors: false, about: 'Test tools and match data: blocked in robots.txt' }
};

/** Single pages that differ from their kind's rule. Key: the address. Example: { '/texas/allen/': { vendors: false, note: 'The school asked' } } */
export const OVERRIDES = {};

/** The site's own pages (the school pages come from the game's data). */
const FIXED = [
  { path: '/', kind: 'game', title: 'Football Coach High School Edition', file: 'index.html' },
  { path: '/about', kind: 'info', title: 'About the Game', file: 'public/about.html' },
  { path: '/privacy', kind: 'legal', title: 'Privacy Policy', file: 'public/privacy.html' },
  { path: '/terms', kind: 'legal', title: 'Terms of Service', file: 'public/terms.html' },
  { path: '/replay-data/', kind: 'private', title: 'Match field play data' },
  { path: '/playtest/', kind: 'private', title: 'Playtest pages' }
];

/** "St. Peter's Prep" → "st-peter-s-prep" (the same slugs as src/sim/teamLink.ts and the team pages). */
export const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Every state's schools in the game's data (src/data/<state>-<class>.json), by state. */
export function schoolsByState() {
  const dir = join(root, 'src', 'data');
  const states = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f === 'teamPages.json') continue;
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!data.state || !data.regions) continue;
    const schools = [];
    for (const region of data.regions) for (const district of region.districts) for (const s of district.schools) schools.push(s.name);
    states.push({ state: data.state, schools: schools.sort((a, b) => a.localeCompare(b)) });
  }
  return states.sort((a, b) => a.state.localeCompare(b.state));
}

function titleOf(file) {
  if (!file || !existsSync(file)) return null;
  const m = /<title>([^<]*)<\/title>/i.exec(readFileSync(file, 'utf8'));
  return m ? m[1].replace(/ · Football Coach High School Edition$/, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : null;
}

function withRules(page) {
  const rule = { ...RULES[page.kind], ...(OVERRIDES[page.path] ?? {}) };
  return { ...page, index: page.status === 'live' && rule.index, vendors: page.status === 'live' && rule.vendors, note: OVERRIDES[page.path]?.note };
}

/**
 * Every page, live or planned. A school page (and its start step) is live once its folder is built.
 * Fields: path, url, kind, title, state, school, status ('live' | 'planned'), index, vendors, note.
 */
export function sitePages() {
  const pages = FIXED.map((p) => ({ ...p, status: 'live', title: titleOf(p.file && join(root, p.file)) ?? p.title }));
  for (const { state, schools } of schoolsByState()) {
    const seen = new Map();
    for (const school of schools) {
      const slug = slugify(school);
      if (seen.has(slug)) throw new Error(`${state}: "${school}" and "${seen.get(slug)}" would share the address /${slugify(state)}/${slug}/`);
      seen.set(slug, school);
      const path = `/${slugify(state)}/${slug}/`;
      const page = join(root, 'public', slugify(state), slug, 'index.html');
      const start = join(root, 'public', slugify(state), slug, 'start', 'index.html');
      pages.push({ path, kind: 'school', state, school, status: existsSync(page) ? 'live' : 'planned', title: titleOf(page) ?? `${school} (not built yet)` });
      pages.push({ path: `${path}start/`, kind: 'start', state, school, status: existsSync(start) ? 'live' : 'planned', title: titleOf(start) ?? `${school} start (not built yet)` });
    }
  }
  return pages.map((p) => withRules({ ...p, url: SITE + p.path }));
}
