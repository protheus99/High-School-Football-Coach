import { TEAM_MANIFEST, ManifestState } from './teamManifest';

// ---------------------------------------------------------------------------
// Every state's classes, districts and schools (src/data/teams/<slug>.json, built from expansion/final by
// scripts/build-all-teams.mjs). Each state is its own chunk: it loads the first time a game needs it, so the main bundle
// carries only the small manifest. The original 12 states' hand-tuned top classes still come from stateWorlds.ts.
// ---------------------------------------------------------------------------

/** A school as the build script writes it. Missing mascot, city and short name are simply not on file. */
export interface TeamSchool {
  id: string; // stable: team_<state>_<class>_<name> (see build-all-teams.mjs)
  name: string;
  shortName?: string;
  city?: string;
  mascot?: string;
  primaryColor: string;
  secondaryColor: string;
  colorsConfirmed?: false; // present only when the school's colors are not on file (a neutral slate/white pair)
  prestige: number;
  offenseScheme: string;
  defenseScheme: string;
}

export interface TeamDistrict {
  name: string; // '' when the data has no district for these schools
  schools: TeamSchool[];
}

export interface TeamClass {
  className: string;
  districts: TeamDistrict[];
}

export interface StateTeamData {
  state: string;
  classes: TeamClass[];
}

const loaders = import.meta.glob<StateTeamData>('./teams/*.json', { import: 'default' });
const cache = new Map<string, StateTeamData>();

/** Every state with a team list, in the manifest's order. */
export const TEAM_STATES: string[] = TEAM_MANIFEST.map((m) => m.state);

export const manifestFor = (state: string): ManifestState | undefined => TEAM_MANIFEST.find((m) => m.state === state);

/** Loads one state's teams (its own chunk); resolves undefined for a state with no team list. */
export async function loadStateTeams(state: string): Promise<StateTeamData | undefined> {
  const cached = cache.get(state);
  if (cached) return cached;
  const entry = manifestFor(state);
  const load = entry && loaders[`./teams/${entry.slug}.json`];
  if (!load) return undefined;
  const data = await load();
  cache.set(state, data);
  return data;
}

/**
 * Before loading a save: its state's teams. A career in a class from the team data needs them (the throw becomes the
 * load screen's error); a career in an original top class plays without them (its state's other classes just stay out of
 * the background world), so a failed download (offline, or a chunk gone after an update) never stops an old save.
 */
export async function loadTeamsForSave(league?: { state?: string; className?: string } | null): Promise<void> {
  if (!league?.state) return;
  try {
    await loadStateTeams(league.state);
  } catch (e) {
    if (league.className) throw e;
  }
}

/** A state's teams if they are already loaded (after loadStateTeams). */
export const cachedStateTeams = (state: string): StateTeamData | undefined => cache.get(state);
