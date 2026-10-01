import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams, NEIGHBOR_DISTRICT_SCHOOLS } from '../../generators/rosterGenerator';
import {
  applyGameResult,
  generateSeasonSchedule,
  getTeamGameForWeek,
  roundRobinRounds,
  FIRST_DISTRICT_WEEK,
  FIRST_NON_DISTRICT_WEEK,
  LAST_REGULAR_SEASON_WEEK
} from '../scheduleEngine';

// Keep the store's weekly auto-save away from IndexedDB in tests
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

const district = generateDistrictTeams();
const neighbor = generateDistrictTeams('tx_6a_d25', NEIGHBOR_DISTRICT_SCHOOLS);

describe('Season schedule', () => {
  const schedule = generateSeasonSchedule(district, neighbor, 2026);

  it('plays every district opponent exactly once in district weeks', () => {
    for (const team of district) {
      const districtGames = schedule.filter((g) => g.isDistrictGame && (g.homeTeamId === team.id || g.awayTeamId === team.id));
      const opponents = districtGames.map((g) => (g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId));
      expect(districtGames).toHaveLength(district.length - 1);
      expect(new Set(opponents).size).toBe(district.length - 1);
      districtGames.forEach((g) => {
        expect(g.week).toBeGreaterThanOrEqual(FIRST_DISTRICT_WEEK);
        expect(g.week).toBeLessThanOrEqual(LAST_REGULAR_SEASON_WEEK);
      });
      const homeGames = districtGames.filter((g) => g.homeTeamId === team.id).length;
      expect(homeGames).toBeGreaterThanOrEqual(3);
      expect(homeGames).toBeLessThanOrEqual(4);
    }
  });

  it('gives each district team three different non-district opponents from the neighboring district', () => {
    const neighborIds = new Set(neighbor.map((t) => t.id));
    for (const team of district) {
      const games = schedule.filter((g) => !g.isDistrictGame && (g.homeTeamId === team.id || g.awayTeamId === team.id));
      const opponents = games.map((g) => (g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId));
      expect(games.map((g) => g.week).sort()).toEqual([FIRST_NON_DISTRICT_WEEK, FIRST_NON_DISTRICT_WEEK + 1, FIRST_NON_DISTRICT_WEEK + 2]);
      expect(new Set(opponents).size).toBe(3);
      opponents.forEach((id) => expect(neighborIds.has(id)).toBe(true));
    }
  });

  it('never books a team twice in the same week', () => {
    for (let week = 1; week <= 20; week++) {
      const ids = schedule.filter((g) => g.week === week).flatMap((g) => [g.homeTeamId, g.awayTeamId]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('has no games in spring, summer, playoff or off-season weeks', () => {
    expect(schedule.every((g) => g.week >= FIRST_NON_DISTRICT_WEEK && g.week <= LAST_REGULAR_SEASON_WEEK)).toBe(true);
  });

  it('handles an odd number of teams with byes', () => {
    const rounds = roundRobinRounds(['a', 'b', 'c', 'd', 'e']);
    expect(rounds).toHaveLength(5);
    expect(rounds.flat()).toHaveLength(10); // every pair once
  });
});

describe('Recording results', () => {
  it('updates district standings fields and head-to-head only for district games', () => {
    const [a, b, c] = generateDistrictTeams();
    applyGameResult(a, b, 28, 7, true);
    expect(a.record.districtWins).toBe(1);
    expect(b.record.districtLosses).toBe(1);
    expect(a.record.districtPointDifferential).toBe(17); // capped at +17
    expect(a.record.headToHeadHistory[b.id].won).toBe(true);
    expect(b.record.headToHeadHistory[a.id].won).toBe(false);

    applyGameResult(c, a, 10, 3, false);
    expect(c.record.wins).toBe(1);
    expect(c.record.districtWins).toBe(0);
    expect(a.record.losses).toBe(1);
    expect(a.record.districtLosses).toBe(0);
  });
});

describe('Playing a season through the store', () => {
  it('faces a different opponent each game week and seeds the playoffs from the real standings', () => {
    const store = useGameStore.getState();
    store.startNewSeason();
    const { userTeamId } = useGameStore.getState();

    const opponents: string[] = [];
    while (useGameStore.getState().currentWeek < 15) {
      const { seasonSchedule, currentWeek } = useGameStore.getState();
      const game = getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
      if (game) opponents.push(game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId);
      useGameStore.getState().advanceWeek();
    }

    const { districtTeams, neighborDistrictTeams, seasonSchedule, playoffBracket } = useGameStore.getState();
    expect(opponents).toHaveLength(10);
    expect(new Set(opponents).size).toBe(10);
    expect(seasonSchedule.every((g) => g.homeScore !== undefined)).toBe(true);

    for (const teams of [districtTeams, neighborDistrictTeams]) {
      const districtWins = teams.reduce((s, t) => s + t.record.districtWins, 0);
      const districtLosses = teams.reduce((s, t) => s + t.record.districtLosses, 0);
      expect(districtWins).toBe(28);
      expect(districtLosses).toBe(28);
      teams.forEach((t) => expect(t.record.wins + t.record.losses).toBe(10));
    }

    expect(playoffBracket).not.toBeNull();
    const bracketIds = playoffBracket!.bracket.biDistrict.flatMap((n) => [n.team1.id, n.team2.id]);
    const neighborIds = new Set(neighborDistrictTeams.map((t) => t.id));
    expect(bracketIds.some((id) => neighborIds.has(id))).toBe(true);
  });
});
