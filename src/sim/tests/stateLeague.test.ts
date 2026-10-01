import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildStateLeague, leagueRegionTeams, nearestDistrictIndexes, playoffRoundCount, StateDistrictFile } from '../league';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

interface IndexEntry {
  state: string;
  districts: { name: string; file: string }[];
}

const leaguesDir = resolve(__dirname, '../../../public/leagues');
const index: IndexEntry[] = JSON.parse(readFileSync(resolve(leaguesDir, 'index.json'), 'utf-8'));
const readDistrict = (file: string): StateDistrictFile => JSON.parse(readFileSync(resolve(leaguesDir, file), 'utf-8'));

function stateWorld(state: string, userIndex = 0) {
  const districts = index.find((s) => s.state === state)!.districts;
  const neighbors = nearestDistrictIndexes(districts.length, userIndex).map((i) => readDistrict(districts[i].file));
  return { districts, world: buildStateLeague(readDistrict(districts[userIndex].file), neighbors) };
}

describe('State worlds', () => {
  it('picks the nearest districts in the state list', () => {
    expect(nearestDistrictIndexes(12, 0)).toEqual([1, 2, 3]);
    expect(nearestDistrictIndexes(12, 6)).toEqual([5, 7, 4]);
    expect(nearestDistrictIndexes(2, 1)).toEqual([0]);
  });

  it('builds an Ohio world entirely from Ohio districts', () => {
    const { districts, world } = stateWorld('Ohio', 5);
    expect(world.league.regions.flatMap((r) => r.districts)).toHaveLength(4);
    expect(world.teams.every((t) => t.state === 'Ohio')).toBe(true);
    const fileSchools = [5, ...nearestDistrictIndexes(districts.length, 5)].flatMap((i) => readDistrict(districts[i].file).schools.map((s) => s.name));
    expect(world.teams.map((t) => t.name).sort()).toEqual(fileSchools.sort());
    const userDistrict = readDistrict(districts[5].file);
    expect(world.teams.find((t) => t.id === world.userTeamId)!.name).toBe(userDistrict.schools[0].name);
    expect(new Set(world.teams.map((t) => t.id)).size).toBe(world.teams.length);
    expect(playoffRoundCount(world.league)).toBe(4);
  });

  it('fills a small state with generated schools from that state', () => {
    const { world } = stateWorld('Maryland');
    const regionTeams = leagueRegionTeams(world.league, world.teams);
    expect(regionTeams.flat()).toHaveLength(4);
    regionTeams.flat().forEach((district) => expect(district.length).toBeGreaterThanOrEqual(4));
    expect(world.teams.every((t) => t.state === 'Maryland')).toBe(true);
  });

  it('plays a full season with an all-Ohio schedule and bracket', () => {
    const { world } = stateWorld('Ohio', 2);
    const store = useGameStore;
    store.getState().startNewSeason(world);
    const ohioIds = new Set(world.teams.map((t) => t.id));
    expect(store.getState().seasonSchedule.every((g) => ohioIds.has(g.homeTeamId) && ohioIds.has(g.awayTeamId))).toBe(true);
    expect(store.getState().leagueTeams.filter((t) => t.id !== world.userTeamId).every((t) => t.feederProfile)).toBe(true);
    while (store.getState().currentWeek < 15) store.getState().advanceWeek();
    const bracket = store.getState().playoffBracket!;
    bracket.divisions.flatMap((d) => d.rounds[0]).forEach((n) => {
      expect(ohioIds.has(n.team1.id)).toBe(true);
      expect(ohioIds.has(n.team2.id)).toBe(true);
    });
    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    store.getState().transitionToNextYear();
    expect(store.getState().leagueTeams.every((t) => t.state === 'Ohio')).toBe(true);
  }, 120000);
});
