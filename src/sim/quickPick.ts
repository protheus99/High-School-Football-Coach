import { scenarioById, ScenarioId } from '../data/scenarios';

// ---------------------------------------------------------------------------
// New Game's four Quick Pick jobs. Every school in the country is in exactly one, from data every school has: its game
// prestige (the bell curve) and its national size level (1 = each state's top class ... 5 = the smallest schools).
//   👑 Powerhouses           98-99: the best program in its state (1 to 6 per state)
//   📈 Contenders            75-97
//   🔥 Reclaiming the Crown  60-74 at a big school (levels 1-2), plus the hand-written fallen giants (⭐ legends)
//   🔨 Rebuild               under 60 anywhere, or 60-74 at a smaller school (levels 3-5)
// ---------------------------------------------------------------------------

export type QuickGroup = 'POWER' | 'RECLAIM' | 'CONTEND' | 'REBUILD';

/** A school New Game can start a career at: from the team data, or an original state's hand-tuned top class. */
export interface Program {
  key: string; // unique in the country
  id?: string; // the team data's school id; undefined for an original top-class school (started by name)
  name: string;
  city?: string;
  mascot?: string;
  colors?: [string, string]; // undefined: the school's colors are not on file
  prestige: number;
  state: string;
  className: string;
  district?: string;
  level: number;
  legend?: { scenario: 'RECLAIM' | 'POWERHOUSE'; displayName: string; legacy: string };
  group: QuickGroup;
}

export interface GroupInfo {
  id: QuickGroup;
  icon: string;
  name: string;
  short: string;
  one: string; // one school of the group, e.g. "powerhouse"
  many: string;
  range: string; // the prestige the group covers
  color: string;
  bg: string;
  fg: string;
  blurb: string; // one line, on the dealt screen
  about: string; // what the job is
  expect: string; // what is expected of the coach
}

export const QUICK_GROUPS: GroupInfo[] = [
  {
    id: 'POWER',
    icon: '👑',
    name: 'Powerhouses',
    short: 'Power',
    one: 'powerhouse',
    many: 'powerhouses',
    range: '98–99',
    color: '#F59E0B',
    bg: '#FEF3C7',
    fg: '#92400E',
    blurb: 'The best program in its state. Anything less than a title is a letdown.',
    about: 'The best in the state: deep roster, rich boosters, packed stands.',
    expect: 'Win now. A state or national title is the goal every season.'
  },
  {
    id: 'RECLAIM',
    icon: '🔥',
    name: 'Reclaiming the Crown',
    short: 'Reclaim',
    one: 'sleeping giant',
    many: 'sleeping giants',
    range: '60–74 · big',
    color: '#EF4444',
    bg: '#FEE2E2',
    fg: '#991B1B',
    blurb: 'A big school that has slipped to the middle. Wake the giant.',
    about: 'A big school stuck in the middle: the numbers to win, not the results.',
    expect: 'Wake the giant. Turn it into a contender within a few seasons.'
  },
  {
    id: 'CONTEND',
    icon: '📈',
    name: 'Contenders',
    short: 'Contend',
    one: 'contender',
    many: 'contenders',
    range: '75–97',
    color: '#3B82F6',
    bg: '#DBEAFE',
    fg: '#1E40AF',
    blurb: 'A good program. You have to win the big games to reach the top.',
    about: 'Good to very good: solid players and support, but it needs that special something to win.',
    expect: 'Playoffs, plus some luck to win the big games and climb to the top.'
  },
  {
    id: 'REBUILD',
    icon: '🔨',
    name: 'Rebuild',
    short: 'Rebuild',
    one: 'rebuild job',
    many: 'rebuild jobs',
    range: '40–74',
    color: '#22C55E',
    bg: '#DCFCE7',
    fg: '#166534',
    blurb: 'A program that needs a rebuild. Build it from the ground up.',
    about: 'A smaller school with a thin roster, small budget, few wins and not much hope.',
    expect: 'Patience. The board judges progress, not titles.'
  }
];

export const groupInfo = (id: QuickGroup): GroupInfo => QUICK_GROUPS.find((g) => g.id === id)!;

/** Levels 1-2: the country's two biggest-school levels. */
export const BIG_SCHOOL_LEVEL = 2;

/** The Quick Pick job a school is. */
export function groupOf(school: { prestige: number; level: number; legend?: Program['legend'] }): QuickGroup {
  if (school.legend?.scenario === 'RECLAIM') return 'RECLAIM'; // a hand-written fallen giant stays a Reclaim job
  if (school.prestige >= 98) return 'POWER';
  if (school.prestige >= 75) return 'CONTEND';
  if (school.prestige >= 60 && school.level <= BIG_SCHOOL_LEVEL) return 'RECLAIM';
  return 'REBUILD';
}

/** The career scenario a job starts (it sets the leaderboard group and the starting prestige). */
export const scenarioForGroup = (group: QuickGroup): ScenarioId => (group === 'POWER' ? 'POWERHOUSE' : group === 'RECLAIM' ? 'RECLAIM' : 'OPEN');

/** The prestige a career at this school starts with. */
export const startingPrestige = (p: Program): number => scenarioById(scenarioForGroup(p.group)).startingPrestige(p.prestige);

/** What the job means for the start and the Hall of Fame, on the confirm card. */
export function jobNote(p: Program): string {
  if (p.group === 'POWER') return "Title expectations from day one. In the Hall of Fame you're ranked with other Powerhouse careers.";
  if (p.group === 'RECLAIM')
    return (
      (p.prestige >= 75
        ? "A real fallen giant: the name still carries weight, the roster doesn't, so prestige drops to 72. "
        : 'A big school with the numbers to win. You keep its current prestige. ') + "In the Hall of Fame you're ranked with other Reclaiming the Crown careers."
    );
  return "You keep the program's current prestige. In the Hall of Fame you're compared with coaches who took over programs like it.";
}

/** How a school is known: a legend by its program name. */
export const programName = (p: Program): string => p.legend?.displayName ?? p.name;

export const HAND_SIZE = 3;

/**
 * A Quick Pick deal: up to three schools from the pool nobody has been shown yet (all of them again once the pool runs
 * out), at most one ⭐ legend of the job, the rest at random.
 */
export function dealPrograms(pool: Program[], seen: ReadonlySet<string>, rand: () => number = Math.random): { hand: Program[]; seen: Set<string> } {
  let next = new Set(seen);
  let avail = pool.filter((p) => !next.has(p.key));
  if (avail.length === 0) {
    next = new Set();
    avail = pool;
  }
  const shuffle = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const legends = shuffle(avail.filter((p) => p.legend));
  const rest = shuffle(avail.filter((p) => !p.legend));
  const hand = [...legends.slice(0, 1), ...rest].slice(0, HAND_SIZE);
  hand.forEach((p) => next.add(p.key));
  return { hand, seen: next };
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Letters typed before the search lists anything. */
export const SEARCH_MIN_LETTERS = 2;

/**
 * The all-schools search: every typed word starts a word of the school's name, town or mascot ("pirates", "canton",
 * "aus la"). Schools whose name matches come first, then the best prestige.
 */
export function searchPrograms(list: Program[], query: string): Program[] {
  const typed = words(query);
  if (typed.join('').length < SEARCH_MIN_LETTERS) return [];
  const scored: [Program, boolean][] = [];
  for (const p of list) {
    const name = words(`${p.name} ${p.legend?.displayName ?? ''}`);
    const all = [...name, ...words(p.city ?? ''), ...words(p.mascot ?? '')];
    if (typed.every((t) => all.some((w) => w.startsWith(t)))) scored.push([p, typed.every((t) => name.some((w) => w.startsWith(t)))]);
  }
  return scored.sort(([a, an], [b, bn]) => Number(bn) - Number(an) || b.prestige - a.prestige || a.name.localeCompare(b.name)).map(([p]) => p);
}
