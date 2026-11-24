import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { GameSaveRecord } from '../../services/db';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (_record: GameSaveRecord) => undefined) }));
import { useGameStore } from '../../store/gameStore';
import { cachedStateTeams, loadStateTeams, TEAM_STATES } from '../../data/teamData';
import { TEAM_MANIFEST } from '../../data/teamManifest';
import { buildStateWorld, stateSchools } from '../league';
import { PLAYABLE_STATES } from '../stateRules';
import { buildClassWorld, classPlayoffs, classSchedule, classSchools, LEGACY_TOP_CLASS, onOriginalTopClass, pickClassSchool } from '../classLeague';
import { buildNationalWorld, simulateLightWeek } from '../nationalWorld';

import { STATE_FINAL_WEEK } from '../scheduleEngine';
import { shortName } from '../../utils/shortName';

// The team data built by scripts/build-all-teams.mjs and the classes played from it.

describe('Team data', () => {
  it('every state loads lazily, with stable globally unique ids and no invented facts', async () => {
    const ids = new Set<string>();
    let schools = 0;
    for (const state of TEAM_STATES) {
      const data = (await loadStateTeams(state))!;
      expect(data.state).toBe(state);
      expect(data.classes.map((c) => c.className)).toEqual(TEAM_MANIFEST.find((m) => m.state === state)!.classes.map((c) => c.className));
      for (const cls of data.classes)
        for (const d of cls.districts)
          for (const s of d.schools) {
            schools++;
            expect(ids.has(s.id), s.id).toBe(false);
            ids.add(s.id);
            expect(s.id.startsWith('team_')).toBe(true);
            expect(s.shortName === undefined || s.shortName.length <= 12).toBe(true);
            expect(s.mascot === undefined || s.mascot.length > 0).toBe(true); // a missing mascot is absent, never made up
            if (s.colorsConfirmed === false) {
              expect([s.primaryColor, s.secondaryColor]).toEqual(['#475569', '#FFFFFF']); // the one neutral pair
            } else {
              expect(s.colorsConfirmed).toBeUndefined();
            }
            expect(s.prestige).toBeGreaterThanOrEqual(40);
            expect(s.prestige).toBeLessThanOrEqual(99);
          }
    }
    expect(schools).toBe(TEAM_MANIFEST.reduce((n, m) => n + m.schools, 0));
    expect(ids.size).toBe(schools);
  }, 60_000); // loads all 51 state files: slow when the whole suite runs at once

  it('school ids are permanent: from the id file, never the class, and never an original top-class id', async () => {
    const lock: Record<string, string> = JSON.parse(readFileSync(resolve(__dirname, '../../../scripts/data/school-ids.json'), 'utf8'));
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const legacy = new Set(PLAYABLE_STATES.flatMap((st) => stateSchools(st).map((s) => `team_${slug(s.name)}`)));
    for (const state of TEAM_STATES) {
      const data = (await loadStateTeams(state))!;
      for (const cls of data.classes)
        for (const d of cls.districts)
          for (const s of d.schools) {
            // The build gives each school the id the file holds for it, so a class change keeps the id
            expect(lock[`${state}|${slug(s.name)}|${slug(s.city ?? '')}`], `${state} ${s.name}`).toBe(s.id);
            expect(s.id.startsWith(`team_${slug(state)}_`)).toBe(true);
            expect(legacy.has(s.id), s.id).toBe(false);
          }
    }
    expect(new Set(Object.values(lock)).size).toBe(Object.keys(lock).length); // no id handed out twice, ever
  }, 60_000);

  it("the original 12 states' hand-tuned top classes keep their teams and ids", () => {
    const texas = buildStateWorld('Texas', 'Austin Westlake');
    expect(texas.userTeamId).toBe('team_austin_westlake');
    expect(texas.league.className).toBeUndefined();
    expect(LEGACY_TOP_CLASS.Texas).toBe('6A');
  });

  it('a class with no mascot, colors or districts: blanks stay blank, neutral colors, grouped districts', async () => {
    const data = (await loadStateTeams('Colorado'))!;
    const world = buildClassWorld(data, '5A', undefined, { light: true });
    expect(world.league.className).toBe('5A');
    expect(world.teams.length).toBe(42);
    world.teams.forEach((t) => {
      expect(t.mascot).toBe('');
      expect(t.className).toBe('5A');
    });
    const unconfirmed = world.teams.filter((t) => t.colorsConfirmed === false);
    expect(unconfirmed.length).toBeGreaterThan(0);
    unconfirmed.forEach((t) => expect([t.primaryColor, t.secondaryColor]).toEqual(['#475569', '#FFFFFF']));
    // No district data: the game groups the class, and marks the groups as placeholders
    expect(world.league.regions[0].districts.every((d) => d.synthetic)).toBe(true);
    expect(shortName(world.teams[0])).toBe(world.teams[0].shortName ?? world.teams[0].name);
  });

  it('a class league plays a season and a bracket to a champion', async () => {
    const data = (await loadStateTeams('Ohio'))!;
    const world = buildClassWorld(data, 'D3', undefined, { light: true });
    const schedule = classSchedule(world.league, world.teams, 2026, [8]);
    expect(schedule.length).toBeGreaterThan(world.teams.length * 3);
    const light = { state: 'Ohio', className: 'D3', league: world.league, teams: world.teams, schedule, bracket: null };
    for (let week = 1; week <= STATE_FINAL_WEEK; week++) simulateLightWeek(light as never, week);
    const bracket = light.bracket as never as ReturnType<typeof classPlayoffs>;
    expect(bracket.isPlayoffsActive).toBe(false);
    expect(bracket.divisions.every((d) => d.championTeamId)).toBe(true);
  });
});

describe('A coach in another class', () => {
  it("plays a whole season in the class engine while the state's other classes finish in the background", async () => {
    const data = (await loadStateTeams('Kansas'))!;
    const target = data.classes.find((c) => c.className === '4A')!.districts[0].schools[0];
    const store = useGameStore;
    store.getState().newScenarioGame('OPEN', 'Kansas', target.name, 'Coach Test', 3, { className: '4A', schoolId: target.id });
    let s = store.getState();
    expect(s.league?.className).toBe('4A');
    expect(s.leagueTeams.find((t) => t.id === s.userTeamId)?.name).toBe(target.name);
    expect(s.career?.className).toBe('4A');
    // Every other Kansas class plays in the background, beside the original states' top classes
    const classes = s.nationalLeagues.filter((l) => l.state === 'Kansas').map((l) => l.className).sort();
    expect(classes).toEqual(['1A', '2A', '3A', '5A', '6A']);
    expect(s.nationalLeagues.filter((l) => !l.className)).toHaveLength(12);

    let guard = 0;
    while (!store.getState().isBanquetActive && guard++ < 40) store.getState().advanceWeek();
    s = store.getState();
    expect(s.isBanquetActive).toBe(true);
    expect(s.playoffBracket?.isPlayoffsActive).toBe(false);
    expect(s.playoffBracket?.divisions.every((d) => d.championTeamId)).toBe(true);
    s.nationalLeagues.forEach((l) => {
      expect(l.bracket?.isPlayoffsActive, `${l.state} ${l.className ?? 'top'}`).toBe(false);
      expect(l.bracket?.divisions.every((d) => d.championTeamId)).toBe(true);
    });
    expect(cachedStateTeams('Kansas')).toBeDefined();
  }, 120_000);

  it('a coach in an original top class never meets his own top-class schools again in a lower class', async () => {
    for (const state of ['Texas', 'Florida', 'California']) {
      const data = (await loadStateTeams(state))!;
      const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const top = new Map(stateSchools(state).map((s) => [key(s.name), s.mascot.toLowerCase()]));
      const leagues = buildNationalWorld({ state }, 2026).filter((l) => l.className);
      const twice = leagues.flatMap((l) => l.teams).filter((t) => top.has(key(t.name)) && (!t.mascot || top.get(key(t.name)) === t.mascot.toLowerCase()));
      expect(twice.map((t) => t.name), state).toEqual([]);
      // ...and only those schools are left out
      const inData = data.classes.filter((c) => c.className !== LEGACY_TOP_CLASS[state]).reduce((n, c) => n + c.districts.reduce((m, d) => m + d.schools.length, 0), 0);
      const played = leagues.reduce((n, l) => n + l.teams.length, 0);
      expect(inData - played, state).toBeGreaterThan(0);
    }
  });

  it('a coach in a lower class of an original state: every school plays once, the hand-tuned top-class ones only up top', async () => {
    const data = (await loadStateTeams('Texas'))!;
    const onTop = onOriginalTopClass('Texas')!;
    const moved = data.classes.find((c) => c.className === '5A-D1')!.districts.flatMap((d) => d.schools).filter(onTop);
    expect(moved.length).toBeGreaterThan(0); // the latest alignment moved some 6A schools down
    expect(classSchools(data, '5A-D1').some((s) => onTop(s))).toBe(false); // New Game doesn't offer them in 5A-D1
    for (let i = 0; i < 5; i++) expect(onTop(pickClassSchool(data, '5A-D1', 'MEDIUM'))).toBe(false);
    const school = classSchools(data, '5A-D1')[0];
    const store = useGameStore;
    store.getState().newScenarioGame('OPEN', 'Texas', school.name, 'Coach Test', 3, { className: '5A-D1', schoolId: school.id! });
    const s = store.getState();
    const key = (t: { name: string; mascot: string }) => `${t.name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${t.mascot.toLowerCase()}`;
    const texas = [...s.leagueTeams, ...s.nationalLeagues.filter((l) => l.state === 'Texas').flatMap((l) => l.teams)];
    const seen = new Map<string, number>();
    texas.forEach((t) => seen.set(key(t), (seen.get(key(t)) ?? 0) + 1));
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
    expect(s.leagueTeams.some((t) => t.id !== s.userTeamId && onTop(t))).toBe(false);
  }, 120_000);

  it('the national world of a coach in an original top class also plays that state\'s other classes', async () => {
    await loadStateTeams('Ohio');
    const leagues = buildNationalWorld({ state: 'Ohio' }, 2026);
    expect(leagues.filter((l) => l.state === 'Ohio').map((l) => l.className).sort()).toEqual(['D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(leagues.some((l) => l.state === 'Ohio' && !l.className)).toBe(false);
  });
});
