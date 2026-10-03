import { describe, it, expect, vi } from 'vitest';
import { buildTexasLeague, LeagueStructure } from '../league';
import {
  advanceRivalRecruiting,
  assignSuitors,
  buildRecruitingContext,
  chooseFeederStrategy,
  choiceShares,
  initialFeederProfile,
  programPull,
  rollPriorities,
  weeklyDetectionChance,
  yearEndDetectionChance
} from '../feederCompetition';
import { createProspect, generateStatewideElite, resolveStatewideElite } from '../feederEngine';
import { FeederProspect, Team } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

function world() {
  const { league, teams, userTeamId } = buildTexasLeague();
  teams.forEach((t) => {
    t.feederProfile = initialFeederProfile();
    t.feederProfile.strategy = chooseFeederStrategy(t);
  });
  const user = teams.find((t) => t.id === userTeamId)!;
  return { league: league as LeagueStructure, teams, user, ctx: buildRecruitingContext(league, teams, userTeamId) };
}

describe('Per-player push and pull', () => {
  const { teams, user, ctx } = world();

  it('gives every prospect their own priorities', () => {
    const a = rollPriorities('MOVE_IN');
    const b = rollPriorities('MOVE_IN');
    expect(Object.values(a).reduce((s, w) => s + w, 0)).toBeCloseTo(1);
    expect(a).not.toEqual(b);
  });

  it('a player who cares about staying home favors his zoned school', () => {
    const home = teams.find((t) => t.id !== user.id && ctx.regionOf.get(t.id) === ctx.regionOf.get(user.id))!;
    const p: FeederProspect = {
      ...createProspect('OUT_OF_DISTRICT', user, new Set(), home),
      priorities: { HOME: 0.9, RELATIONSHIP: 0.025, PLAYING_TIME: 0.025, WINNING: 0.025, BOOSTERS: 0.025 }
    };
    expect(programPull(p, home, 50, false, ctx)).toBeGreaterThan(programPull(p, user, 50, false, ctx));
  });

  it('a player who cares about playing time favors an open starting job', () => {
    const p: FeederProspect = {
      ...createProspect('MOVE_IN', user),
      projectedPosition: 'QB',
      trueOverall: 60,
      priorities: { PLAYING_TIME: 0.96, HOME: 0.01, RELATIONSHIP: 0.01, WINNING: 0.01, BOOSTERS: 0.01 }
    };
    const crowded = { ...user, roster: user.roster.map((pl) => (pl.position === 'QB' && pl.depthChartTier === 1 ? { ...pl, overallRating: 90, classYear: 'Junior' as const } : pl)) };
    const open = { ...user, roster: user.roster.filter((pl) => pl.position !== 'QB') };
    expect(programPull(p, open, 50, false, ctx)).toBeGreaterThan(programPull(p, crowded, 50, false, ctx));
  });

  it('stars ignore programs that never recruited them', () => {
    const star = assignSuitors(createProspect('STAR_RECRUIT', user), ctx);
    const share = (interest: number) => choiceShares({ ...star, interestScore: interest }, ctx).find((c) => c.teamId === user.id)!.share;
    expect(share(90)).toBeGreaterThan(share(10) * 5);
  });
});

describe('Rival suitors', () => {
  const { user, ctx } = world();
  const many = (source: Parameters<typeof createProspect>[0]) => Array.from({ length: 300 }, () => assignSuitors(createProspect(source, user), ctx));

  it('rarely compete for district middle schoolers but often for move-ins, and never list the user', () => {
    const feeder = many('FEEDER_MIDDLE_SCHOOL').filter((p) => p.suitors.length > 0).length / 300;
    const moveIns = many('MOVE_IN').filter((p) => p.suitors.length > 0).length / 300;
    expect(feeder).toBeLessThan(0.2);
    expect(moveIns).toBeGreaterThan(0.5);
    [...many('MOVE_IN'), ...many('STAR_RECRUIT')].forEach((p) => p.suitors.forEach((s) => expect(s.teamId).not.toBe(user.id)));
  });

  it('only powerhouse programs chase out-of-area stars', () => {
    many('STAR_RECRUIT').forEach((p) => p.suitors.forEach((s) => expect(ctx.teamsById.get(s.teamId)!.prestige).toBeGreaterThanOrEqual(85)));
  });
});

describe('Bending the rules', () => {
  it('low-ethics programs make illegal offers and build heat; honest programs never do', () => {
    const { user, ctx } = world();
    const target = (ethics: number): Team => {
      const team = [...ctx.teamsById.values()].find((t) => t.id !== user.id && t.prestige >= 85)!;
      team.feederProfile = { strategy: 'RECRUIT_STARS', ethics, violationHeat: 0 };
      return team;
    };
    const run = (team: Team) => {
      let pool = Array.from({ length: 30 }, () => ({
        ...createProspect('STAR_RECRUIT', user),
        suitors: [{ teamId: team.id, teamName: team.name, effort: 50, inducement: false }]
      }));
      for (let week = 1; week <= 12; week++) pool = advanceRivalRecruiting(pool, ctx, week);
      return pool.filter((p) => p.suitors[0].inducement).length;
    };
    const cheater = target(10);
    expect(run(cheater)).toBeGreaterThan(0);
    expect(cheater.feederProfile!.violationHeat).toBeGreaterThan(0);
    const honest = target(95);
    expect(run(honest)).toBe(0);
    expect(honest.feederProfile!.violationHeat).toBe(0);
  });

  it('detection scales with evidence and is impossible with none', () => {
    expect(weeklyDetectionChance(0)).toBe(0);
    expect(yearEndDetectionChance(60)).toBeGreaterThan(weeklyDetectionChance(60));
    expect(yearEndDetectionChance(30)).toBeLessThan(yearEndDetectionChance(90));
  });
});

describe('Statewide elite recruits', () => {
  it('sign only with programs that recruited them', () => {
    const { ctx } = world();
    const elite = generateStatewideElite(ctx);
    const { signings } = resolveStatewideElite(elite, ctx);
    signings.forEach((s) => {
      const recruit = elite.find((p) => p.name === `${s.player.firstName} ${s.player.lastName}`)!;
      expect(recruit.suitors.map((x) => x.teamId)).toContain(s.teamId);
    });
  });
});

describe('Competition through the store', () => {
  it('bans caught programs, charges for inducements and sends poached prospects to rival rosters', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    const { leagueTeams, userTeamId } = store.getState();

    // A rival with overwhelming evidence gets caught during the season and misses the playoffs
    const cheater = leagueTeams.find((t) => t.id !== userTeamId)!;
    cheater.feederProfile!.violationHeat = 1500;
    store.getState().advanceWeek();
    expect(cheater.feederProfile!.bannedSeason).toBe(store.getState().currentYear);

    // User inducement: costs AP and adds hidden heat
    const prospect = store.getState().scoutingPool.find((p) => p.source !== 'TRYOUT')!;
    const ap = store.getState().coachPoints;
    store.getState().offerFeederInducement(prospect.id);
    expect(store.getState().coachPoints).toBe(ap - 20);
    expect(store.getState().userViolationHeat).toBeGreaterThan(0);
    expect(store.getState().scoutingPool.find((p) => p.id === prospect.id)!.userInducement).toBe(true);

    while (!store.getState().playoffBracket) store.getState().advanceWeek();
    const bracketIds = store.getState().playoffBracket!.divisions.flatMap((d) => d.rounds[0]).flatMap((n) => [n.team1.id, n.team2.id]);
    expect(bracketIds).not.toContain(cheater.id);

    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    store.getState().transitionToNextYear();
    // Prospects pick their schools as pre season week 2 ends
    while (store.getState().currentWeek <= 2) store.getState().advanceWeek();
    const { lastFeederResults } = store.getState();
    lastFeederResults!
      .filter((o) => o.destinationTeamId)
      .forEach((o) => {
        const rival = store.getState().leagueTeams.find((t) => t.id === o.destinationTeamId)!;
        expect(rival.roster.some((pl) => `${pl.firstName} ${pl.lastName}` === o.prospectName)).toBe(true);
      });
  }, 120000);
});
