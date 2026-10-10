import type { StateSchoolEntry } from './league';

/** Letters typed before the New Game search lists anything. */
export const SEARCH_MIN_LETTERS = 2;

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The schools whose name matches what was typed: every typed word starts a word of the name ("aus" finds Austin
 * Westlake, "aus la" finds Austin Lake Travis). Nothing until a couple of letters are in; best prestige first.
 */
export function searchSchools(schools: StateSchoolEntry[], query: string): StateSchoolEntry[] {
  const typed = words(query);
  if (typed.join('').length < SEARCH_MIN_LETTERS) return [];
  return schools
    .filter((s) => {
      const name = words(s.name);
      return typed.every((t) => name.some((w) => w.startsWith(t)));
    })
    .sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name));
}

/** The parts of a school's name to highlight for a search: [text, matched] pieces in order. */
export function highlightName(name: string, query: string): [string, boolean][] {
  const typed = words(query);
  return name.split(/(\s+)/).flatMap((part): [string, boolean][] => {
    const hit = typed.find((t) => t && part.toLowerCase().startsWith(t));
    return hit ? [[part.slice(0, hit.length), true], [part.slice(hit.length), false]] : [[part, false]];
  });
}
