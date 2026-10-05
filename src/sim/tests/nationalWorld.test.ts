import { describe, it, expect, vi } from 'vitest';
import type { GameSaveRecord } from '../../services/db';

const saved: GameSaveRecord[] = [];
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (record: GameSaveRecord) => void saved.push(record)) }));
import { useGameStore } from '../../store/gameStore';
import { buildLightLeague } from '../nationalWorld';
import { LIGHT_STARTERS } from '../../generators/rosterGenerator';
import { PLAYABLE_STATES } from '../stateRules';

describe('National world', () => {
  it('builds light teams: a team rating and only the stat leaders', () => {
    const light = buildLightLeague('Alabama', 2026);
    expect(light.teams).toHaveLength(34);
    const leaders = LIGHT_STARTERS.reduce((n, [, count]) => n + count, 0);
    light.teams.forEach((t) => {
      expect(t.roster).toHaveLength(leaders);
      expect(t.lightRating).toBeGreaterThan(40);
    });
    expect(light.schedule.length).toBeGreaterThan(0);
  });

  it('every other playable state plays the same season: champions, state polls and stat leaders for all', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Georgia');
    const { nationalLeagues } = store.getState();
    expect(nationalLeagues.map((l) => l.state).sort()).toEqual(PLAYABLE_STATES.filter((s) => s !== 'Georgia').sort());

    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    const s = store.getState();
    s.nationalLeagues.forEach((l) => {
      expect(l.bracket?.isPlayoffsActive).toBe(false);
      expect(l.bracket?.divisions.every((d) => d.championTeamId)).toBe(true);
      // About ten games each (uneven districts leave the odd team a game or two short)
      const games = l.teams.map((t) => t.record.wins + t.record.losses);
      expect(Math.min(...games)).toBeGreaterThanOrEqual(7);
      expect(games.reduce((sum, n) => sum + n, 0) / games.length).toBeGreaterThan(9.5);
    });
    expect(Object.keys(s.polls!.stateRankings).sort()).toEqual([...PLAYABLE_STATES].sort());
    Object.values(s.polls!.stateRankings).forEach((poll) => expect(poll).toHaveLength(25));
    expect(Object.keys(s.playerRankings!.stateStatLeaders).sort()).toEqual([...PLAYABLE_STATES].sort());
    expect(new Set(s.polls!.nationalTop25.map((e) => e.state)).size).toBeGreaterThan(1);
    // The final computer rankings (at the banquet) count the playoffs: the leaders' records include playoff
    // games, and state champions are among them
    expect(s.polls!.week).toBe(s.currentWeek);
    const champions = new Set([...(s.playoffBracket?.divisions ?? []), ...s.nationalLeagues.flatMap((l) => l.bracket?.divisions ?? [])].map((d) => d.championTeamId));
    const top = s.polls!.nationalTop25[0];
    expect(top.record.wins + top.record.losses).toBeGreaterThan(10);
    expect(s.polls!.nationalTop25.filter((e) => champions.has(e.teamId)).length).toBeGreaterThanOrEqual(2);
    // ratings: best first, an average team near zero
    expect(s.polls!.nationalTop25[0].pollPoints).toBeGreaterThanOrEqual(s.polls!.nationalTop25[24].pollPoints);
    expect(s.polls!.nationalTop25[24].pollPoints).toBeGreaterThan(0);
  }, 120000);

  it('saves brackets by team id and relinks them on load', async () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Florida');
    while (store.getState().currentWeek < 20) store.getState().advanceWeek();
    const id = await store.getState().saveGame('mid playoffs');
    const record = saved.find((r) => r.id === id)!;
    const savedNode = record.nationalLeagues![0].bracket!.divisions[0].rounds[0][0];
    expect(Object.keys(savedNode.team1)).toEqual(['id']); // no team copies in the save
    store.getState().loadGame(JSON.parse(JSON.stringify(record)));
    const light = store.getState().nationalLeagues[0];
    const node = light.bracket!.divisions[0].rounds[0][0];
    expect(light.teams).toContain(node.team1);
    expect(store.getState().leagueTeams).toContain(store.getState().playoffBracket!.divisions[0].rounds[0][0].team1);
    // the season carries on to every state's title game
    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    expect(store.getState().nationalLeagues.every((l) => l.bracket?.divisions[0].championTeamId)).toBe(true);
  }, 120000);

  it('older saves without the national world get one, played up to the current week', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Texas');
    while (store.getState().currentWeek < 12) store.getState().advanceWeek();
    const record = JSON.parse(JSON.stringify({ ...saved[saved.length - 1], nationalLeagues: undefined }));
    store.getState().loadGame(record);
    const light = store.getState().nationalLeagues;
    expect(light.length).toBe(PLAYABLE_STATES.length - 1);
    light.forEach((l) => expect(l.schedule.filter((g) => g.week < record.currentWeek).every((g) => g.homeScore !== undefined)).toBe(true));
  }, 120000);
});
