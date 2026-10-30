import { describe, it, expect, vi } from 'vitest';
import { STATE_DATA } from '../../data/stateWorlds';
import { FIRST_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK, generateSeasonSchedule } from '../scheduleEngine';
import { INTERSTATE_WEEK } from '../interstate';
import { RIVALRY_WIN_BOOSTERS, RIVALRY_WIN_PRESTIGE, applyRivalryWin, isTrophyName, rivalryFor, rivalryHeadline, rivalryLocks } from '../rivalryEngine';
import type { Team } from '../../types/game';
import { MAX_RIVALRY_GAMES, gameRivalry, topGames } from '../topGames';
import type { PrecomputedGame } from '../runAhead';

// Keep the store's weekly auto-save away from IndexedDB in tests
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

// Just what the schedule reads: a state's real regions -> districts -> schools
const stateRegions = (state: string): Team[][][] =>
  STATE_DATA[state].regions.map((region, r) =>
    region.districts.map((district, d) =>
      district.schools.map((s, i) => ({ id: `${r}_${d}_${i}`, name: s.name, state, prestige: s.prestige, programMeters: { boosterApproval: 70 } }) as unknown as Team)
    )
  );

describe('Rival games on the schedule', () => {
  for (const state of Object.keys(STATE_DATA)) {
    it(`${state}: locks every rival pair it can, in the right week, without double-booking anyone`, () => {
      const regions = stateRegions(state);
      const locks = rivalryLocks(regions);
      const schedule = generateSeasonSchedule(regions, 2026, { reservedWeeks: [INTERSTATE_WEEK] });
      const meets = (a: string, b: string, week: number) =>
        schedule.some((g) => g.week === week && ((g.homeTeamId === a && g.awayTeamId === b) || (g.homeTeamId === b && g.awayTeamId === a)));
      locks.district.forEach(([a, b]) => expect(meets(a, b, LAST_REGULAR_SEASON_WEEK), `${a} vs ${b}`).toBe(true));
      locks.nonDistrict.forEach(([a, b]) => expect(meets(a, b, FIRST_DISTRICT_WEEK - 1), `${a} vs ${b}`).toBe(true));
      // One game a week, one meeting a season
      for (let week = 1; week <= LAST_REGULAR_SEASON_WEEK; week++) {
        const ids = schedule.filter((g) => g.week === week).flatMap((g) => [g.homeTeamId, g.awayTeamId]);
        expect(new Set(ids).size).toBe(ids.length);
      }
      const pairs = schedule.map((g) => [g.homeTeamId, g.awayTeamId].sort().join('|'));
      expect(new Set(pairs).size).toBe(pairs.length);
      // Nobody is locked in twice in the same week
      for (const list of [locks.district, locks.nonDistrict]) expect(new Set(list.flat()).size).toBe(list.flat().length);
    });
  }

  it('locks in pairs that list each other first, and one-way rivalries only when both schools are free', () => {
    const regions = stateRegions('Alabama');
    const name = new Map(regions.flat(2).map((t) => [t.id, t.name]));
    const locked = rivalryLocks(regions).district.map((p) => p.map((id) => name.get(id)).sort().join(' / '));
    expect(locked).toContain('Daphne / Fairhope');
    expect(locked).toContain('Hoover / Spain Park');
    // Oak Mountain lists Spain Park, which plays Hoover that week
    expect(locked.some((p) => p.includes('Oak Mountain'))).toBe(false);
  });
});

describe('Rivalry results', () => {
  const team = (name: string, prestige = 80) => ({ name, state: 'Alabama', prestige, programMeters: { boosterApproval: 70 } }) as unknown as Team;

  it("lifts the coach's boosters and prestige for a win, capped at the top", () => {
    const daphne = team('Daphne');
    applyRivalryWin(daphne);
    expect(daphne.programMeters.boosterApproval).toBe(70 + RIVALRY_WIN_BOOSTERS);
    expect(daphne.prestige).toBe(80 + RIVALRY_WIN_PRESTIGE);
    const top = team('Daphne', 99);
    applyRivalryWin(top);
    expect(top.prestige).toBe(99);
  });

  it('writes trophy games and plain rivalries differently', () => {
    expect(isTrophyName('Jubilee Cup')).toBe(true);
    expect(isTrophyName('Wiregrass Rivalry')).toBe(false);
    expect(rivalryHeadline('Daphne', 'Fairhope', 'Jubilee Cup', 28, 21)).toBe('Daphne Wins the Jubilee Cup, 28-21');
    expect(rivalryHeadline('Daphne', 'Fairhope', 'Jubilee Cup', 21, 28)).toBe('Fairhope Takes the Jubilee Cup From Daphne, 28-21');
    expect(rivalryHeadline('Dothan', 'Enterprise', 'Wiregrass Rivalry', 24, 17)).toBe('Dothan Beats Enterprise 24-17 in the Wiregrass Rivalry');
    expect(rivalryHeadline('Dothan', 'Enterprise', 'Wiregrass Rivalry', 17, 24)).toBe('Dothan Falls to Enterprise 24-17 in the Wiregrass Rivalry');
  });

  it("tells the coach whose rivalry it is and the series at this school", () => {
    const log = [
      { year: 2026, week: 17, school: 'Daphne', opponent: 'Fairhope', name: 'Jubilee Cup', won: true, score: '28-21' },
      { year: 2027, week: 17, school: 'Daphne', opponent: 'Fairhope', name: 'Jubilee Cup', won: false, score: '14-17' },
      { year: 2028, week: 17, school: 'Baker', opponent: 'Fairhope', name: 'Jubilee Cup', won: true, score: '7-3' }
    ];
    expect(rivalryFor(team('Daphne'), team('Fairhope'), log)).toEqual({ name: 'Jubilee Cup', theirs: false, series: { wins: 1, losses: 1 } });
    const lakeHighlands = { name: 'Richardson Lake Highlands', state: 'Texas' } as Team;
    expect(rivalryFor(lakeHighlands, { name: 'Richardson Berkner', state: 'Texas' } as Team)?.theirs).toBe(true);
    expect(rivalryFor(team('Daphne'), team('Baker'))).toBeNull();
  });
});

describe('Rivalry week through the store', () => {
  it("plays the coach's rival in week 17, writes it in his log once, and rewards only a win", () => {
    useGameStore.getState().startNewSeason(); // Austin Westlake: the Battle of the Lakes with Austin Lake Travis
    const store = useGameStore.getState;
    const me = () => store().leagueTeams.find((t) => t.id === store().userTeamId)!;
    const rivalGame = store().seasonSchedule.find((g) => g.week === LAST_REGULAR_SEASON_WEEK && (g.homeTeamId === me().id || g.awayTeamId === me().id))!;
    const rivalId = rivalGame.homeTeamId === me().id ? rivalGame.awayTeamId : rivalGame.homeTeamId;
    expect(store().leagueTeams.find((t) => t.id === rivalId)?.name).toBe('Austin Lake Travis');

    let before = { prestige: 0, boosters: 0 };
    while (store().currentWeek <= LAST_REGULAR_SEASON_WEEK) {
      if (store().activeDilemma) {
        store().resolveDilemma(store().activeDilemma!.choices[0]);
        continue;
      }
      if (store().currentWeek === LAST_REGULAR_SEASON_WEEK) before = { prestige: me().prestige, boosters: me().programMeters.boosterApproval };
      store().advanceWeek();
    }
    const log = store().rivalryLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ week: LAST_REGULAR_SEASON_WEEK, school: 'Austin Westlake', opponent: 'Austin Lake Travis', name: 'Battle of the Lakes' });
    expect(me().prestige - before.prestige).toBe(log[0].won ? RIVALRY_WIN_PRESTIGE : 0);
    // The last regular-season game makes the news, under its rivalry name
    expect(store().newsArticles.some((a) => a.rivalry === 'Battle of the Lakes' && a.id.startsWith(`news_gm_${LAST_REGULAR_SEASON_WEEK + 1}_`))).toBe(true);
  }, 120000);
});

describe('Around the state', () => {
  const game = (homeName: string, awayName: string, i: number): PrecomputedGame => ({
    key: `Alabama|g${i}`, state: 'Alabama', homeId: `h${i}`, awayId: `a${i}`, homeName, awayName, homeScore: 24, awayScore: 17, timeline: []
  });

  it("spotlights a few rivalry games right after the league games, under the home team's name for it", () => {
    const results = [game('Baker', 'Foley', 0), game('Dothan', 'Enterprise', 1), game('Hoover', 'Spain Park', 2), game('Auburn High', 'Opelika', 3), game('Bob Jones', 'James Clemens', 4), game('Daphne', 'Saraland', 5)];
    const top = topGames({ results, userState: 'Alabama', districtIds: new Set(), polls: null });
    expect(top.filter((t) => t.tag === 'RIVALRY')).toHaveLength(MAX_RIVALRY_GAMES);
    expect(gameRivalry(results[3])).toBe('91-Year Rivalry');
    expect(gameRivalry(results[0])).toBeUndefined();
  });
});
