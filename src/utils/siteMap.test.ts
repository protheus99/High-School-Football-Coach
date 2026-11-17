import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// The sitemap, the vendor list and docs/SITEMAP.md are written by scripts/site-map/build.mjs from the pages in public/.
const root = join(__dirname, '..', '..');

describe('site map', () => {
  it('is up to date with the pages in public/ (run node scripts/site-map/build.mjs)', () => {
    expect(() => execFileSync(process.execPath, [join(root, 'scripts', 'site-map', 'build.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('lists only live, open pages: no start steps, test tools or match data', () => {
    const vendors = JSON.parse(readFileSync(join(root, 'public', 'vendor-pages.json'), 'utf8')) as { pages: { url: string; kind: string }[] };
    const urls = vendors.pages.map((p) => p.url);
    expect(urls).toContain('https://footballcoachgame.com/');
    expect(urls).toContain('https://footballcoachgame.com/georgia/valdosta/');
    expect(urls.some((u) => /\/start\/$|replay-data|playtest|privacy|terms/.test(u))).toBe(false);
    const texas = readFileSync(join(root, 'public', 'sitemaps', 'texas.xml'), 'utf8');
    expect(texas).toContain('<loc>https://footballcoachgame.com/texas/cypress-lakes/</loc>');
    expect(texas).not.toContain('/start/');
    // The start steps tell search engines not to list them; the team pages don't
    expect(readFileSync(join(root, 'public', 'texas', 'cypress-lakes', 'start', 'index.html'), 'utf8')).toContain('<meta name="robots" content="noindex, follow" />');
    expect(readFileSync(join(root, 'public', 'texas', 'cypress-lakes', 'index.html'), 'utf8')).not.toContain('noindex');
    expect(readFileSync(join(root, 'public', 'robots.txt'), 'utf8')).toContain('Sitemap: https://footballcoachgame.com/sitemap.xml');
  });
});
