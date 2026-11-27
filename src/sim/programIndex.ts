import { SCENARIOS } from '../data/scenarios';
import { STATE_DATA } from '../data/stateWorlds';
import { LEGACY_TOP_CLASS, isLegacyClass, onOriginalTopClass } from './classLeague';
import { groupOf, Program, QuickGroup } from './quickPick';

// ---------------------------------------------------------------------------
// The country's schools for New Game: src/data/schoolIndex.json (every school in the team files, with its national size
// level; scripts/lib/schoolIndex.mjs) plus the original 12 states' hand-tuned top classes, which replace that class in
// the data. As in classSchools(), a hand-tuned top-class school listed in a lower class of the data plays only up top.
// ---------------------------------------------------------------------------

/** schoolIndex.json: [{ state, c: [{ n, d: [[district, level]], s: [[name, city, mascot, primary, secondary, prestige, id, district]] }] }] */
export type SchoolIndexRow = [string, string, string, string, string, number, string | 0, number];
export interface SchoolIndexState {
  state: string;
  c: { n: string; d: [string, number][]; s: SchoolIndexRow[] }[];
}

export interface ClassEntry {
  name: string;
  level: number; // the class's level (California: its biggest schools' level)
  legacy: boolean; // the state's hand-tuned top class
  total: number;
  groups: Record<QuickGroup, number>;
  districts: string[]; // named districts, in order
}

export interface StateEntry {
  state: string;
  total: number;
  classes: ClassEntry[]; // the hand-tuned top class first, then the data's classes in order
}

export interface ProgramIndex {
  programs: Program[];
  states: StateEntry[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** The legends (the hand-written scenario programs) by state and school name. */
const LEGENDS = new Map(
  SCENARIOS.flatMap((sc) => sc.programs.map((p) => [`${p.state}|${p.school}`, { scenario: sc.id as 'RECLAIM' | 'POWERHOUSE', displayName: p.displayName, legacy: p.legacy }] as const))
);

const emptyGroups = (): Record<QuickGroup, number> => ({ POWER: 0, RECLAIM: 0, CONTEND: 0, REBUILD: 0 });

export function buildProgramIndex(index: SchoolIndexState[]): ProgramIndex {
  const programs: Program[] = [];
  const states: StateEntry[] = [];
  const names = [...new Set([...index.map((s) => s.state), ...Object.keys(LEGACY_TOP_CLASS)])].sort();
  const byState = new Map(index.map((s) => [s.state, s]));
  for (const state of names) {
    const classes: ClassEntry[] = [];
    const add = (cls: ClassEntry, p: Omit<Program, 'group'>) => {
      const program = { ...p, group: groupOf(p) };
      programs.push(program);
      cls.total++;
      cls.groups[program.group]++;
    };
    // The hand-tuned top class (bundled with the game)
    const legacyClass = LEGACY_TOP_CLASS[state];
    const legacyData = legacyClass ? STATE_DATA[state] : undefined;
    if (legacyClass && legacyData) {
      const cls: ClassEntry = { name: legacyClass, level: 1, legacy: true, total: 0, groups: emptyGroups(), districts: [] };
      for (const region of legacyData.regions)
        for (const d of region.districts) {
          cls.districts.push(d.name);
          for (const s of d.schools)
            add(cls, {
              key: `legacy|${state}|${s.name}`,
              name: s.name,
              ...(s.city && { city: s.city }),
              ...(s.mascot && { mascot: s.mascot }),
              colors: [s.primaryColor, s.secondaryColor],
              prestige: s.prestige,
              state,
              className: legacyClass,
              district: d.name,
              level: 1,
              ...(LEGENDS.get(`${state}|${s.name}`) && { legend: LEGENDS.get(`${state}|${s.name}`) })
            });
        }
      classes.push(cls);
    }
    // The data's classes
    const onTop = onOriginalTopClass(state);
    for (const c of byState.get(state)?.c ?? []) {
      if (isLegacyClass(state, c.n)) continue;
      const cls: ClassEntry = { name: c.n, level: Math.min(...c.d.map(([, lv]) => lv)), legacy: false, total: 0, groups: emptyGroups(), districts: c.d.map(([n]) => n).filter(Boolean) };
      for (const [name, city, mascot, primary, secondary, prestige, id, di] of c.s) {
        if (onTop?.({ name, mascot })) continue;
        const [district, level] = c.d[di];
        add(cls, {
          key: `team_${slug(state)}_${id || slug(name)}`,
          id: `team_${slug(state)}_${id || slug(name)}`,
          name,
          ...(city && { city }),
          ...(mascot && { mascot }),
          ...(primary && { colors: [`#${primary}`, `#${secondary}`] as [string, string] }),
          prestige,
          state,
          className: c.n,
          ...(district && { district }),
          level
        });
      }
      if (cls.total > 0) classes.push(cls);
    }
    if (classes.length) states.push({ state, total: classes.reduce((n, c) => n + c.total, 0), classes });
  }
  return { programs, states };
}

let loading: Promise<ProgramIndex> | undefined;

/** The country's schools (the index is its own chunk, loaded the first time New Game opens). */
export function loadProgramIndex(): Promise<ProgramIndex> {
  loading ??= import('../data/schoolIndex.json').then((m) => buildProgramIndex(m.default as unknown as SchoolIndexState[]));
  loading.catch(() => (loading = undefined)); // a failed download can be tried again
  return loading;
}
