import { describe, it, expect, vi } from 'vitest';
import type { GameSaveRecord } from '../../services/db';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (_record: GameSaveRecord) => undefined) }));
import { useGameStore } from '../../store/gameStore';
import SCHOOL_INDEX from '../../data/schoolIndex.json';
import { SCENARIOS } from '../../data/scenarios';
import { STATE_DATA } from '../../data/stateWorlds';
import { loadStateTeams, TEAM_STATES } from '../../data/teamData';
import { TEAM_MANIFEST } from '../../data/teamManifest';
import { buildProgramIndex, SchoolIndexState } from '../programIndex';
import { dealPrograms, groupOf, HAND_SIZE, Program, QUICK_GROUPS, scenarioForGroup, searchPrograms, startingPrestige } from '../quickPick';
import { applySchoolFacts, careerArgs } from '../newGameStart';
import { isLegacyClass, LEGACY_TOP_CLASS, onOriginalTopClass } from '../classLeague';
import type { Team } from '../../types/game';

// New Game's Quick Pick jobs and the country's school list they are dealt from.

const { programs, states } = buildProgramIndex(SCHOOL_INDEX as unknown as SchoolIndexState[]);
const fake = (over: Partial<Program>): Program => ({ key: over.name ?? 'x', name: 'X', prestige: 70, state: 'Texas', className: '5A', level: 1, group: 'REBUILD', ...over });

describe('The Quick Pick jobs', () => {
  it('follow the approved rules at their edges', () => {
    expect(groupOf({ prestige: 99, level: 5 })).toBe('POWER');
    expect(groupOf({ prestige: 98, level: 3 })).toBe('POWER');
    expect(groupOf({ prestige: 97, level: 1 })).toBe('CONTEND');
    expect(groupOf({ prestige: 75, level: 5 })).toBe('CONTEND');
    expect(groupOf({ prestige: 74, level: 2 })).toBe('RECLAIM'); // a big school stuck in the middle
    expect(groupOf({ prestige: 60, level: 1 })).toBe('RECLAIM');
    expect(groupOf({ prestige: 59, level: 1 })).toBe('REBUILD'); // under 60 is a rebuild anywhere
    expect(groupOf({ prestige: 74, level: 3 })).toBe('REBUILD'); // a smaller school under 75
    // A hand-written fallen giant stays a Reclaim job whatever its rating
    expect(groupOf({ prestige: 90, level: 1, legend: { scenario: 'RECLAIM', displayName: 'X', legacy: '' } })).toBe('RECLAIM');
  });

  it('start where the job says: a fallen giant drops to 72, everyone else keeps their prestige', () => {
    expect(startingPrestige(fake({ prestige: 99, group: 'POWER' }))).toBe(99);
    expect(startingPrestige(fake({ prestige: 73, group: 'RECLAIM' }))).toBe(73);
    expect(startingPrestige(fake({ prestige: 90, group: 'RECLAIM', legend: { scenario: 'RECLAIM', displayName: 'X', legacy: '' } }))).toBe(72);
    expect(startingPrestige(fake({ prestige: 82, group: 'CONTEND' }))).toBe(82);
    expect(startingPrestige(fake({ prestige: 51, group: 'REBUILD' }))).toBe(51);
    expect(QUICK_GROUPS.map((g) => scenarioForGroup(g.id))).toEqual(['POWERHOUSE', 'RECLAIM', 'OPEN', 'OPEN']);
  });
});

describe("The country's school list", () => {
  it('holds every school a career can start at, once, each in exactly one job', () => {
    expect(new Set(programs.map((p) => p.key)).size).toBe(programs.length);
    // The team data, less each original state's hand-tuned top class (and its schools listed lower down) ...
    let fromData = 0;
    for (const m of TEAM_MANIFEST) {
      const st = (SCHOOL_INDEX as unknown as SchoolIndexState[]).find((s) => s.state === m.state)!;
      const onTop = onOriginalTopClass(m.state);
      for (const c of st.c) if (!isLegacyClass(m.state, c.n)) fromData += c.s.filter(([name, , mascot]) => !onTop?.({ name, mascot })).length;
    }
    // ... plus those hand-tuned top classes
    const legacy = Object.keys(LEGACY_TOP_CLASS).reduce((n, st) => n + STATE_DATA[st].regions.reduce((a, r) => a + r.districts.reduce((b, d) => b + d.schools.length, 0), 0), 0);
    expect(programs.length).toBe(fromData + legacy);
    programs.forEach((p) => expect(p.group, p.key).toBe(groupOf(p)));
    // The class counts add up
    expect(states.reduce((n, s) => n + s.total, 0)).toBe(programs.length);
    for (const s of states) for (const c of s.classes) expect(Object.values(c.groups).reduce((a, b) => a + b, 0)).toBe(c.total);
  });

  it('has a powerhouse in every state and enough of every other job to deal three', () => {
    for (const s of states) {
      const count = (g: string) => s.classes.reduce((n, c) => n + c.groups[g as keyof typeof c.groups], 0);
      expect(count('POWER'), s.state).toBeGreaterThanOrEqual(1);
      expect(count('CONTEND'), s.state).toBeGreaterThanOrEqual(HAND_SIZE);
      expect(count('RECLAIM') + count('REBUILD'), s.state).toBeGreaterThanOrEqual(HAND_SIZE);
    }
    const share = (g: string) => programs.filter((p) => p.group === g).length / programs.length;
    expect(share('POWER')).toBeLessThan(0.01); // 98-99 stays rare
    expect(share('CONTEND')).toBeGreaterThan(0.4);
  });

  it('matches the team files: same ids, names and prestige', async () => {
    for (const state of ['Kansas', 'Ohio', 'California', 'Wyoming']) {
      const data = (await loadStateTeams(state))!;
      const byId = new Map(programs.filter((p) => p.id && p.state === state).map((p) => [p.id, p]));
      const onTop = onOriginalTopClass(state);
      for (const c of data.classes) {
        if (isLegacyClass(state, c.className)) continue;
        for (const s of c.districts.flatMap((d) => d.schools)) {
          if (onTop?.(s)) continue;
          const p = byId.get(s.id);
          expect(p, s.id).toBeDefined();
          expect([p!.name, p!.prestige, p!.className, p!.mascot, p!.colors === undefined]).toEqual([s.name, s.prestige, c.className, s.mascot, s.colorsConfirmed === false]);
        }
      }
    }
    expect(TEAM_STATES.every((st) => states.some((s) => s.state === st))).toBe(true);
  }, 60_000);

  it('lists every legend in its state, and puts the fallen giants in Reclaiming the Crown', () => {
    const legends = programs.filter((p) => p.legend);
    expect(legends).toHaveLength(SCENARIOS.reduce((n, s) => n + s.programs.length, 0));
    legends.filter((p) => p.legend!.scenario === 'RECLAIM').forEach((p) => expect(p.group).toBe('RECLAIM'));
    // Legends are original top-class schools: they start by name
    legends.forEach((p) => expect(careerArgs(p).target).toBeUndefined());
  });

  it("puts each state's hand-tuned top class first, at level 1", () => {
    const texas = states.find((s) => s.state === 'Texas')!;
    expect(texas.classes[0]).toMatchObject({ name: '6A', legacy: true, level: 1 });
    expect(texas.classes.slice(1).some((c) => c.name === '6A')).toBe(false);
    expect(states.find((s) => s.state === 'Kansas')!.classes.every((c) => !c.legacy)).toBe(true);
  });
});

describe('A Quick Pick deal', () => {
  const pool = programs.filter((p) => p.group === 'CONTEND' && p.state === 'Ohio');

  it('deals three different schools, and no school again until the pool has been dealt', () => {
    let seen = new Set<string>();
    const dealt = new Set<string>();
    for (let i = 0; i < Math.floor(pool.length / HAND_SIZE); i++) {
      const d = dealPrograms(pool, seen);
      expect(d.hand).toHaveLength(HAND_SIZE);
      expect(new Set(d.hand.map((p) => p.key)).size).toBe(HAND_SIZE);
      d.hand.forEach((p) => {
        expect(dealt.has(p.key)).toBe(false);
        dealt.add(p.key);
      });
      seen = d.seen;
    }
  });

  it('shows at most one legend, and only what a small pool has', () => {
    const reclaim = programs.filter((p) => p.group === 'RECLAIM' && p.state === 'Texas');
    for (let i = 0; i < 20; i++) expect(dealPrograms(reclaim, new Set()).hand.filter((p) => p.legend).length).toBeLessThanOrEqual(1);
    const wyoming = programs.filter((p) => p.group === 'POWER' && p.state === 'Wyoming');
    expect(dealPrograms(wyoming, new Set()).hand).toHaveLength(wyoming.length);
  });
});

describe('The search across every school', () => {
  it('waits for two letters, then matches names, towns and mascots, names first', () => {
    expect(searchPrograms(programs, 'a')).toEqual([]);
    const westlake = searchPrograms(programs, 'westlake');
    expect(westlake.length).toBeGreaterThan(1);
    expect(westlake.some((p) => p.name === 'Austin Westlake')).toBe(true);
    expect(searchPrograms(programs, 'aus la').map((p) => p.name)).toContain('Austin Lake Travis');
    const pirates = searchPrograms(programs, 'pirates');
    expect(pirates.length).toBeGreaterThan(10);
    pirates.forEach((p) => expect(`${p.name} ${p.mascot}`.toLowerCase()).toContain('pirates'));
    const canton = searchPrograms(programs, 'canton');
    const firstTown = canton.findIndex((p) => !p.name.toLowerCase().includes('canton'));
    if (firstTown >= 0) canton.slice(firstTown).forEach((p) => expect(p.name.toLowerCase().includes('canton')).toBe(false));
  });
});

describe('Starting from New Game', () => {
  it('a data-class school starts by id in its class, at its starting prestige', async () => {
    const p = programs.find((x) => x.state === 'Kansas' && x.group === 'RECLAIM')!;
    await loadStateTeams('Kansas');
    const { scenario, school, target } = careerArgs(p);
    expect(target).toEqual({ className: p.className, schoolId: p.id });
    useGameStore.getState().newScenarioGame(scenario, p.state, school, 'Coach Test', 3, target);
    const s = useGameStore.getState();
    const team = s.leagueTeams.find((t) => t.id === s.userTeamId)!;
    expect(team.id).toBe(p.id);
    expect(team.prestige).toBe(startingPrestige(p));
    expect(s.career).toMatchObject({ scenario: 'RECLAIM', className: p.className });
  }, 120_000);

  it('an original top-class school starts by name in the hand-tuned class', () => {
    const p = programs.find((x) => x.state === 'Texas' && x.group === 'POWER')!;
    const { scenario, school, target } = careerArgs(p);
    expect(target).toBeUndefined();
    useGameStore.getState().newScenarioGame(scenario, p.state, school, 'Coach Test', 3, target);
    const s = useGameStore.getState();
    const team = s.leagueTeams.find((t) => t.id === s.userTeamId)!;
    expect(team.name).toBe(p.name);
    expect(team.prestige).toBe(startingPrestige(p));
    expect(s.league?.className).toBeUndefined();
    expect(s.career?.scenario).toBe('POWERHOUSE');
  }, 120_000);

  it('a looked-up mascot and colors fill only what the data is missing', () => {
    const team = { mascot: '', primaryColor: '#475569', secondaryColor: '#FFFFFF', colorsConfirmed: false } as unknown as Team;
    expect(applySchoolFacts(team, null)).toBe(false);
    expect(applySchoolFacts(team, { mascot: 'Trojans', colors: ['#123456', '#FFCC00'] })).toBe(true);
    expect([team.mascot, team.primaryColor, team.secondaryColor, team.colorsConfirmed]).toEqual(['Trojans', '#123456', '#FFCC00', undefined]);
    // Facts on file are never replaced
    expect(applySchoolFacts(team, { mascot: 'Other', colors: ['#000000', '#FFFFFF'] })).toBe(false);
    expect(team.mascot).toBe('Trojans');
  });
});
