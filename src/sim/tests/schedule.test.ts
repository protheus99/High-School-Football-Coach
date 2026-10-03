import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import {
  applyGameResult,
  generateSeasonSchedule,
  getTeamGameForWeek,
  roundRobinRounds,
  FIRST_DISTRICT_WEEK,
  FIRST_NON_DISTRICT_WEEK,
  LAST_REGULAR_SEASON_WEEK
} from '../scheduleEngine';
import { buildTexasLeague, findDistrict, findRegion, leagueRegionTeams } from '../league';

// Keep the store's weekly auto-save away from IndexedDB in tests
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

describe('Texas 6A league', () => {
  const { league, teams, userTeamId } = buildTexasLeague();

  it('has 4 regions, 32 districts and every program from the database', () => {
    expect(league.regions).toHaveLength(4);
    expect(league.regions.flatMap((r) => r.districts)).toHaveLength(32);
    expect(teams.length).toBeGreaterThanOrEqual(250);
    expect(new Set(teams.map((t) => t.id)).size).toBe(teams.length);
    expect(teams.find((t) => t.id === userTeamId)?.name).toBe('Austin Westlake');
    expect(findDistrict(league, userTeamId)?.name).toBe('District 26-6A');
  });

  it('gives powerhouse programs stronger rosters than low-prestige programs', () => {
    const avg = (list: typeof teams) =>
      list.flatMap((t) => t.roster.filter((p) => p.depthChartTier === 1)).reduce((s, p, _, a) => s + p.overallRating / a.length, 0);
    const elite = teams.filter((t) => t.prestige >= 90);
    const weak = teams.filter((t) => t.prestige <= 60);
    expect(avg(elite)).toBeGreaterThan(avg(weak) + 5);
  });
});

describe('League season schedule', () => {
  const { league, teams } = buildTexasLeague();
  const schedule = generateSeasonSchedule(leagueRegionTeams(league, teams), 2026);
  const gamesFor = (teamId: string) => schedule.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);

  it('never books a team twice in the same week and only uses weeks 5-14', () => {
    for (let week = 1; week <= 20; week++) {
      const ids = schedule.filter((g) => g.week === week).flatMap((g) => [g.homeTeamId, g.awayTeamId]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(schedule.every((g) => g.week >= FIRST_NON_DISTRICT_WEEK && g.week <= LAST_REGULAR_SEASON_WEEK)).toBe(true);
  });

  it('plays district opponents in district weeks and non-district opponents from the same region (bar a few fill-ins)', () => {
    for (const team of teams) {
      const district = findDistrict(league, team.id)!;
      const region = findRegion(league, team.id)!;
      // An odd-sized region leaves a team idle some weeks: it may meet an idle team from another region instead
      const crossRegion = gamesFor(team.id).filter((g) => !region.districts.some((d) => d.teamIds.includes(g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId)));
      expect(crossRegion.length).toBeLessThanOrEqual(3);
      for (const game of gamesFor(team.id)) {
        const opponent = game.homeTeamId === team.id ? game.awayTeamId : game.homeTeamId;
        if (game.isDistrictGame) {
          expect(district.teamIds).toContain(opponent);
          expect(game.week).toBeGreaterThanOrEqual(FIRST_DISTRICT_WEEK);
        } else {
          expect(district.teamIds).not.toContain(opponent);
          // Non-district weeks, or a fill-in game in a week the team's district round robin leaves open
          if (game.week >= FIRST_DISTRICT_WEEK) expect(gamesFor(team.id).filter((g) => g.week === game.week)).toHaveLength(1);
        }
      }
      // No repeat opponents, and a full district slate up to the seven district weeks
      const opponents = gamesFor(team.id).map((g) => (g.homeTeamId === team.id ? g.awayTeamId : g.homeTeamId));
      expect(new Set(opponents).size).toBe(opponents.length);
      const districtGames = gamesFor(team.id).filter((g) => g.isDistrictGame).length;
      expect(districtGames).toBeGreaterThanOrEqual(Math.min(district.teamIds.length - 1, 7) - 1);
    }
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
  it('faces a different opponent each game week and records every game in the league', () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId } = useGameStore.getState();

    const opponents: string[] = [];
    while (useGameStore.getState().currentWeek <= LAST_REGULAR_SEASON_WEEK) {
      const { seasonSchedule, currentWeek } = useGameStore.getState();
      const game = getTeamGameForWeek(seasonSchedule, currentWeek, userTeamId);
      if (game) opponents.push(game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId);
      useGameStore.getState().advanceWeek();
    }

    const { leagueTeams, league, seasonSchedule, playoffBracket } = useGameStore.getState();
    expect(opponents.length).toBeGreaterThanOrEqual(9);
    expect(new Set(opponents).size).toBe(opponents.length);
    expect(seasonSchedule.every((g) => g.homeScore !== undefined)).toBe(true);

    for (const district of league!.regions.flatMap((r) => r.districts)) {
      const teams = leagueTeams.filter((t) => district.teamIds.includes(t.id));
      const wins = teams.reduce((s, t) => s + t.record.districtWins, 0);
      const losses = teams.reduce((s, t) => s + t.record.districtLosses, 0);
      expect(wins).toBe(losses);
    }
    expect(playoffBracket?.divisions).toHaveLength(2);
  }, 120000);
});
