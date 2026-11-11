// A school's short name (12 characters at most) for the places where space is tight: the match scoreboards, the end
// zone, the play-by-play, the stats sheets and the compact score lists. The full name stays everywhere else.
// Short names live in the state data (shortName on a school whose name is longer than 12 characters); a school without
// one is short enough already. Looked up by state and name, so saves made before short names existed get them too.
import { STATE_DATA } from '../data/stateWorlds';

const byStateAndName = new Map<string, string>();
const byName = new Map<string, string | null>(); // null: two states disagree, so the state must decide
for (const [state, data] of Object.entries(STATE_DATA)) {
  for (const region of data.regions)
    for (const district of region.districts)
      for (const s of district.schools) {
        if (!s.shortName) continue;
        byStateAndName.set(`${state}|${s.name}`, s.shortName);
        const seen = byName.get(s.name);
        byName.set(s.name, seen === undefined || seen === s.shortName ? s.shortName : null);
      }
}

/** The short name of a school (a team, or just its name), or its full name when it's short enough or isn't known. */
export function shortName(team: { name: string; state?: string } | string): string {
  const name = typeof team === 'string' ? team : team.name;
  const state = typeof team === 'string' ? undefined : team.state;
  return (state && byStateAndName.get(`${state}|${name}`)) || byName.get(name) || (state ? undefined : byStateAndName.get(`Texas|${name}`)) || name;
}
