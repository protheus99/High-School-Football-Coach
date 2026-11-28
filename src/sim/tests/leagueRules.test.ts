import { describe, it, expect, vi } from 'vitest';
import type { GameSaveRecord } from '../../services/db';
const saved: GameSaveRecord[] = [];
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (record: GameSaveRecord) => void saved.push(record)) }));
import { useGameStore } from '../../store/gameStore';
import { loadStateTeams } from '../../data/teamData';
import { rulesForLeague } from '../leagueRules';
import { leagueRoundNames } from '../playoffEngine';
import { buildLightLeague, simulateLightWeek } from '../nationalWorld';
import { LAST_REGULAR_SEASON_WEEK } from '../scheduleEngine';
import { playoffRoundCount } from '../league';

/** A class's league before its season, and the playoffs it then plays (seeded after the regular season). */
async function classSeason(state: string, className: string) {
  await loadStateTeams(state);
  const light = buildLightLeague(state, 2026, undefined, className);
  const before = { rounds: playoffRoundCount(light.league), names: leagueRoundNames(light.league) };
  for (let week = 1; week <= LAST_REGULAR_SEASON_WEEK; week++) simulateLightWeek(light, week);
  return { light, before };
}

// Classes whose rounds the data's rough estimate got wrong: a round too many (Kentucky, Missouri, Mississippi 7A), too few
// (Iowa, Indiana), small classes (Hawaii, Maine), Tennessee's DII
const CLASSES: [string, string][] = [
  ...['6A', '5A', '4A', '3A', '2A', '1A'].map((c): [string, string] => ['Kansas', c]),
  ...['5A', '4A', '3A', '2A', '1A', 'DII-AAA', 'DII-AA', 'DII-A'].map((c): [string, string] => ['Tennessee', c]),
  ...['1A', '3A', '6A'].map((c): [string, string] => ['Kentucky', c]),
  ['Missouri', 'Class 3'],
  ['Mississippi', '7A'],
  ['Iowa', '1A'],
  ['Indiana', '6A'],
  ['Hawaii', 'Open'],
  ['Hawaii', 'Division I'],
  ['Maine', 'B']
];

describe("A class league's playoff weeks before its field is set", () => {
  it('has as many playoff rounds as its playoffs then play, with the same round names', async () => {
    for (const [state, className] of CLASSES) {
      const { light, before } = await classSeason(state, className);
      const bracket = light.bracket!;
      expect(before.rounds, `${state} ${className}`).toBe(bracket.roundNames.length);
      expect(before.names, `${state} ${className}`).toEqual(bracket.roundNames);
      const labels = rulesForLeague(light.league).playoffs.roundLabels;
      expect(before.names.map((r) => labels[r]), `${state} ${className}`).toEqual(bracket.roundLabels);
    }
  }, 180000);

  it('uses the class’s own round names, not its state’s top class', async () => {
    const { light } = await classSeason('Kansas', '3A');
    const labels = rulesForLeague(light.league).playoffs.roundLabels;
    expect(leagueRoundNames(light.league).map((r) => labels[r])).toEqual(['Round of 32', 'Regional', 'Sectional', 'Substate', 'State Championship']); // not Texas's Bi-District, Area...
  }, 60000);

  it('a 1.24.0 save of a class league gets its playoff rounds on load', async () => {
    const data = (await loadStateTeams('Kentucky'))!;
    const target = data.classes.find((c) => c.className === '3A')!.districts[0].schools[0];
    const store = useGameStore;
    store.getState().newScenarioGame('OPEN', 'Kentucky', target.name, 'Coach Test', 3, { className: '3A', schoolId: target.id });
    const rounds = store.getState().league!.playoffRounds;
    expect(rounds).toBe(4); // the data's estimate said 5
    const id = await store.getState().saveGame('class league');
    const record = JSON.parse(JSON.stringify(saved.find((r) => r.id === id)!));
    delete record.league.playoffRounds;
    store.getState().loadGame(record);
    expect(store.getState().league!.playoffRounds).toBe(rounds);
  }, 120000);

  it("leaves the original top classes' round names alone", () => {
    expect(rulesForLeague({ state: 'Texas' }).playoffs.roundLabels.BI_DISTRICT).toBe('Bi-District');
    expect(rulesForLeague(null).playoffs.roundLabels.AREA).toBe('Area');
  });
});
