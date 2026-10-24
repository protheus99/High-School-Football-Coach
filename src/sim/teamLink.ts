import { SCENARIOS, ScenarioId } from '../data/scenarios';
import { stateSchools } from './league';
import { PLAYABLE_STATES } from './stateRules';

// ---------------------------------------------------------------------------
// Links into New Game from the team pages (footballcoachgame.com/texas/duncanville/): /?state=texas&school=duncanville
// opens New Game with that state and school picked. A featured program opens in its scenario (Powerhouses or
// Reclaiming the Crown), any other school in Your Pick. The slugs are the names in lowercase with hyphens, the same
// ones scripts/team-pages/build.mjs writes into the pages.
// ---------------------------------------------------------------------------

/** "St. Peter's Prep" → "st-peter-s-prep" */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export interface TeamLink {
  state: string;
  school: string; // the school's name in the state's world data
  scenario: ScenarioId;
  source?: string; // where the visitor came from, e.g. team_page
  variant?: string; // the team page test version they saw
}

/** The school a page address asks for, or null when the link names no school in the game. */
export function parseTeamLink(search: string): TeamLink | null {
  const params = new URLSearchParams(search);
  const stateSlug = params.get('state');
  const schoolSlug = params.get('school');
  if (!stateSlug || !schoolSlug) return null;
  const state = PLAYABLE_STATES.find((s) => slugify(s) === slugify(stateSlug));
  if (!state) return null;
  const school = stateSchools(state).find((s) => slugify(s.name) === slugify(schoolSlug));
  if (!school) return null;
  const featured = SCENARIOS.find((sc) => sc.programs.some((p) => p.state === state && p.school === school.name));
  const clean = (v: string | null) => (v && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : undefined);
  return { state, school: school.name, scenario: featured?.id ?? 'OPEN', source: clean(params.get('src')), variant: clean(params.get('v')) };
}
