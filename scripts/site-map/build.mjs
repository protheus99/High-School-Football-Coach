// Writes the sitemap and the vendor list from the page list (scripts/site-map/pages.mjs):
//   public/sitemap.xml              the sitemap index search engines read (named in robots.txt)
//   public/sitemaps/site.xml        the site's own pages
//   public/sitemaps/<state>.xml     one file per state with school pages (a file holds up to 50,000 addresses)
//   public/vendor-pages.json        the pages outside vendors may use, with the rules
//   docs/SITEMAP.md                 the map for people: every page, what it allows, and what is planned
//   docs/site-pages.csv             every page, live or planned, one per line (for a spreadsheet or a vendor)
// Run it after adding or removing pages: `node scripts/site-map/build.mjs` (scripts/team-pages/build.mjs runs it).
// `--check` writes nothing and fails when a file is out of date (the test suite runs it).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { OVERRIDES, RULES, root, SITE, sitePages, slugify } from './pages.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csv = (s) => (s === undefined || s === null ? '' : /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const yes = (b) => (b ? 'yes' : 'no');

const urlset = (pages) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${esc(p.url)}</loc></url>`).join('\n')}
</urlset>
`;

/** Every file this script writes, by path from the project folder, and its content. */
export function outputs() {
  const pages = sitePages();
  const files = {};

  // Sitemaps: only live pages open to search engines
  const indexed = pages.filter((p) => p.index);
  const site = indexed.filter((p) => !p.state);
  const states = [...new Set(indexed.filter((p) => p.state).map((p) => p.state))];
  if (indexed.length > 50000 * (states.length + 1)) throw new Error('A sitemap file holds 50,000 addresses at most: split the states');
  files['public/sitemaps/site.xml'] = urlset(site);
  for (const state of states) files[`public/sitemaps/${slugify(state)}.xml`] = urlset(indexed.filter((p) => p.state === state));
  files['public/sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['site', ...states.map(slugify)].map((name) => `  <sitemap><loc>${SITE}/sitemaps/${name}.xml</loc></sitemap>`).join('\n')}
</sitemapindex>
`;

  // The vendor list: what outside vendors may use, and the rules behind it
  const vendorPages = pages.filter((p) => p.vendors);
  files['public/vendor-pages.json'] =
    JSON.stringify(
      {
        site: SITE,
        about: 'The pages of Football Coach High School Edition that outside vendors may link to, send traffic or ads to, or feature. Pages not listed here are not for vendor use.',
        rules: Object.fromEntries(Object.entries(RULES).map(([kind, r]) => [kind, { vendors: r.vendors, about: r.about }])),
        count: vendorPages.length,
        pages: vendorPages.map((p) => ({ url: p.url, kind: p.kind, title: p.title, ...(p.state ? { state: p.state, school: p.school } : {}) }))
      },
      null,
      2
    ) + '\n';

  // Every page, live or planned
  const columns = ['path', 'url', 'kind', 'state', 'school', 'status', 'index', 'vendors', 'title', 'note'];
  files['docs/site-pages.csv'] =
    [columns.join(','), ...pages.map((p) => columns.map((c) => csv(typeof p[c] === 'boolean' ? yes(p[c]) : p[c])).join(','))].join('\n') + '\n';

  // The map for people
  const live = pages.filter((p) => p.status === 'live');
  const row = (p) => `| \`${p.path}\` | ${p.title.replace(/\|/g, '\\|')} | ${p.kind} | ${yes(p.index)} | ${yes(p.vendors)} |`;
  const byState = [...new Set(pages.filter((p) => p.state).map((p) => p.state))].map((state) => {
    const schools = pages.filter((p) => p.state === state && p.kind === 'school');
    const built = schools.filter((p) => p.status === 'live').length;
    return `| ${state} | ${built} | ${schools.length} | ${built ? `\`/sitemaps/${slugify(state)}.xml\`` : 'none yet'} |`;
  });
  const schoolCount = pages.filter((p) => p.kind === 'school');
  const overrides = Object.entries(OVERRIDES);
  files['docs/SITEMAP.md'] = `# Site map

Written by \`node scripts/site-map/build.mjs\` from \`scripts/site-map/pages.mjs\`. Don't edit this file by hand.

The game is one address (\`/\`). Its screens (Hub, Team, Rankings, Leaders, Prospects, News) have no addresses of
their own, so the sitemap lists the game once. Everything else is a static page in \`public/\`.

## The rules, by kind of page

Index: listed in the sitemap and open to search engines. Vendors: outside vendors may link to it, send traffic or ads
to it, or feature it. A page that isn't built yet allows neither.

| Kind | Index | Vendors | What it is |
| --- | --- | --- | --- |
${Object.entries(RULES).map(([kind, r]) => `| ${kind} | ${yes(r.index)} | ${yes(r.vendors)} | ${r.about} |`).join('\n')}

Exceptions (\`OVERRIDES\` in \`pages.mjs\`): ${overrides.length ? '' : 'none.'}
${overrides.map(([path, o]) => `- \`${path}\`: ${Object.entries(o).filter(([k]) => k !== 'note').map(([k, v]) => `${k} ${yes(v)}`).join(', ')}${o.note ? ` (${o.note})` : ''}`).join('\n')}

## What vendors get

- \`${SITE}/vendor-pages.json\`: every page they may use, with the rules (${vendorPages.length} pages today).
- \`${SITE}/sitemap.xml\`: what search engines may list, split into one file per state.
- \`docs/site-pages.csv\` (not on the site): every page, live or planned, for a spreadsheet.

## Live pages (${live.length})

| Address | Title | Kind | Index | Vendors |
| --- | --- | --- | --- | --- |
${live.map(row).join('\n')}

## School pages by state (${schoolCount.filter((p) => p.status === 'live').length} of ${schoolCount.length} built)

Every school in the game already has its address: \`/<state>/<school>/\`, in lowercase with hyphens
("St. Peter's Prep" → \`st-peter-s-prep\`). A page goes live, and into its state's sitemap, once
\`scripts/team-pages/build.mjs\` builds it.

| State | Built | Schools | Sitemap |
| --- | --- | --- | --- |
${byState.join('\n')}
`;
  return files;
}

/** Folders in public/<state>/ that match no school in the game's data (a renamed or removed school). */
function strays(pages) {
  const known = new Set(pages.filter((p) => p.kind === 'school').map((p) => p.path));
  const found = [];
  for (const state of new Set(pages.filter((p) => p.state).map((p) => slugify(p.state)))) {
    const dir = join(root, 'public', state);
    if (!existsSync(dir)) continue;
    for (const school of readdirSync(dir, { withFileTypes: true })) if (school.isDirectory() && !known.has(`/${state}/${school.name}/`)) found.push(`/${state}/${school.name}/`);
  }
  return found;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const files = outputs();
  const problems = strays(sitePages()).map((p) => `${p} matches no school in the game's data`);
  // State sitemaps that no longer have any page
  const dir = join(root, 'public', 'sitemaps');
  for (const f of existsSync(dir) ? readdirSync(dir) : []) if (!files[`public/sitemaps/${f}`]) problems.push(`public/sitemaps/${f} is left over`);
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, path);
    const old = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (old === text) continue;
    if (check) problems.push(`${path} is out of date`);
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      console.log(`wrote ${path}`);
    }
  }
  if (!check) for (const p of problems.filter((p) => p.endsWith('left over'))) rmSync(join(root, p.split(' ')[0]));
  if (check && problems.length) {
    console.error(`The site map is out of date (run node scripts/site-map/build.mjs):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  if (!check && problems.some((p) => !p.endsWith('left over'))) {
    console.error(problems.filter((p) => !p.endsWith('left over')).join('\n'));
    process.exit(1);
  }
  console.log('The site map is up to date.');
}
