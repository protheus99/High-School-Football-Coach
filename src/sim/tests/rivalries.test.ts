import { describe, it, expect } from 'vitest';
import { RIVALRIES, isRivalryGame, rivalOf, rivalryName } from '../../data/rivalries';
import { STATE_DATA } from '../../data/stateWorlds';

const schoolsOf = (state: string) =>
  new Set((STATE_DATA[state]?.regions ?? []).flatMap((r) => r.districts.flatMap((d) => d.schools.map((s) => s.name))));

describe('Rivalries data', () => {
  it('names a real school in a playable state for every school and every rival', () => {
    const entries = Object.entries(RIVALRIES).flatMap(([state, schools]) => Object.entries(schools).map(([school, r]) => ({ state, school, ...r })));
    expect(entries.length).toBeGreaterThan(600);
    for (const e of entries) {
      expect(schoolsOf(e.state).has(e.school), `${e.state}: ${e.school}`).toBe(true);
      const rivalState = e.rivalState ?? e.state;
      expect(schoolsOf(rivalState).has(e.rival), `${e.state}: ${e.school}'s rival ${rivalState}: ${e.rival}`).toBe(true);
      expect(rivalState === e.state && e.rival === e.school, `${e.school} is its own rival`).toBe(false);
      expect(e.name.trim().length, `${e.school} has a rivalry name`).toBeGreaterThan(0);
      if (e.rivalState) expect(e.rivalState).not.toBe(e.state);
    }
  });

  it('only lists states the game plays', () => {
    for (const state of Object.keys(RIVALRIES)) expect(STATE_DATA[state], state).toBeDefined();
  });
});

describe('Rivalry helpers', () => {
  const daphne = { name: 'Daphne', state: 'Alabama' };
  const fairhope = { name: 'Fairhope', state: 'Alabama' };

  it("finds a team's rival and the game's name", () => {
    expect(rivalOf(daphne)).toEqual({ school: 'Fairhope', state: 'Alabama', name: 'Jubilee Cup' });
    expect(rivalryName(daphne, fairhope)).toBe('Jubilee Cup');
    expect(rivalryName(fairhope, daphne)).toBe('Jubilee Cup');
    expect(isRivalryGame(fairhope, daphne)).toBe(true);
  });

  it('is not a rivalry game for other opponents, other states or schools without a rival', () => {
    expect(isRivalryGame(daphne, { name: 'Baker', state: 'Alabama' })).toBe(false);
    expect(rivalryName(daphne, { name: 'Fairhope', state: 'Georgia' })).toBeUndefined();
    expect(rivalOf({ name: 'Nowhere High', state: 'Alabama' })).toBeUndefined();
    expect(rivalOf({ name: 'Daphne', state: 'Wyoming' })).toBeUndefined();
  });

  it('counts a one-way rivalry for both sides, under the name of the school that lists it', () => {
    // Dallas Skyline lists Lake Highlands; Lake Highlands lists Pearce
    const skyline = { name: 'Dallas Skyline', state: 'Texas' };
    const lakeHighlands = { name: 'Richardson Lake Highlands', state: 'Texas' };
    expect(rivalOf(lakeHighlands)?.school).not.toBe('Dallas Skyline');
    expect(isRivalryGame(lakeHighlands, skyline)).toBe(true);
    expect(rivalryName(lakeHighlands, skyline)).toBe(RIVALRIES.Texas['Dallas Skyline'].name);
  });

  it("uses the first team's name when both schools list each other under different names", () => {
    const auburn = { name: 'Auburn High', state: 'Alabama' };
    const opelika = { name: 'Opelika', state: 'Alabama' };
    expect(rivalryName(auburn, opelika)).toBe('91-Year Rivalry');
    expect(rivalryName(opelika, auburn)).toBe('Lee County Rivalry');
  });

  it('treats a team without a state as Texas and matches rivals across a state line', () => {
    expect(rivalOf({ name: 'Southlake Carroll' })?.state).toBe('Texas');
    const easton = { name: 'Easton Area', state: 'Pennsylvania' };
    const phillipsburg = { name: 'Phillipsburg', state: 'New Jersey' };
    expect(rivalryName(easton, phillipsburg)).toBe('Thanksgiving Day Game');
    expect(isRivalryGame(easton, { name: 'Phillipsburg', state: 'Pennsylvania' })).toBe(false);
  });
});
