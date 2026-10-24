import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseTeamLink, slugify } from '../teamLink';
import { rulesForState } from '../stateRules';

describe('Links into New Game from the team pages', () => {
  it('turns names into the slugs the pages use', () => {
    expect(slugify('Cypress Lakes')).toBe('cypress-lakes');
    expect(slugify("St. Peter's Prep")).toBe('st-peter-s-prep');
    expect(slugify('North Carolina')).toBe('north-carolina');
  });

  it('opens a featured program in its scenario', () => {
    expect(parseTeamLink('?state=alabama&school=thompson&src=team_page&v=page')).toEqual({
      state: 'Alabama',
      school: 'Thompson',
      scenario: 'POWERHOUSE',
      source: 'team_page',
      variant: 'page'
    });
    expect(parseTeamLink('?state=georgia&school=valdosta')?.scenario).toBe('RECLAIM');
  });

  it('opens any other school in Your Pick', () => {
    expect(parseTeamLink('?state=texas&school=cypress-lakes')).toMatchObject({ state: 'Texas', school: 'Cypress Lakes', scenario: 'OPEN' });
    expect(parseTeamLink('?state=texas&school=houston-wisdom')?.school).toBe('Houston Wisdom');
  });

  it('ignores links to schools or states that are not in the game, and odd tracking values', () => {
    expect(parseTeamLink('')).toBeNull();
    expect(parseTeamLink('?state=texas')).toBeNull();
    expect(parseTeamLink('?state=texas&school=nowhere-high')).toBeNull();
    expect(parseTeamLink('?state=oregon&school=jesuit')).toBeNull();
    expect(parseTeamLink('?state=texas&school=duncanville&src=<script>')?.source).toBeUndefined();
  });
});

// The pages written by scripts/team-pages/build.mjs: each one's button must open its own school in the game
describe('The team pages in public/', () => {
  const publicDir = join(__dirname, '..', '..', '..', 'public');
  const pages = readdirSync(publicDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((state) =>
      readdirSync(join(publicDir, state.name), { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(publicDir, state.name, d.name, 'start', 'index.html')))
        .map((school) => ({ path: `/${state.name}/${school.name}/`, dir: join(publicDir, state.name, school.name) }))
    );

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pages)('$path opens its school in New Game', ({ path, dir }) => {
    for (const file of ['index.html', join('start', 'index.html')]) {
      const html = readFileSync(join(dir, file), 'utf8');
      const game = html.match(/data-game="([^"]+)"/)![1].replace(/&amp;/g, '&');
      const link = parseTeamLink(game.slice(1));
      expect(link, `${path}${file}`).not.toBeNull();
      expect(`/${slugify(link!.state)}/${slugify(link!.school)}/`).toBe(path);
      expect(html).toContain(`data-scenario="${link!.scenario}"`);
      // The stadium named on the page is the state's real title game venue (a powerhouse's team page names none)
      const venue = rulesForState(link!.state).playoffs.championshipVenue.replace(/\s*\(.*\)$/, '');
      if (!html.includes('chase a national title')) expect(html).toContain(venue.replace(/&/g, '&amp;'));
      expect(html.toLowerCase()).not.toContain('bracket');
    }
  });
});
