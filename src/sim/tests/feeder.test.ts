import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams, generateProceduralPlayer } from '../../generators/rosterGenerator';
import {
  MAX_POOL_SIZE,
  MIN_POOL_SIZE,
  MAX_VARSITY_ROSTER,
  STAR_RECRUIT_MIN_PRESTIGE,
  createProspect,
  enforceVarsityRosterLimit,
  generateFeederPool,
  pitchStarRecruit,
  resolveFeederClass,
  runFeederEvent,
  scoutProspect,
  visitProspect
} from '../feederEngine';
import { STARTING_COACH_POINTS, weeklyCoachPoints } from '../coachPoints';
import { FeederOutcome, Team } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

const teamWithPrestige = (prestige: number): Team => {
  const [team] = generateDistrictTeams();
  team.prestige = prestige;
  return team;
};

describe('Feeder pool', () => {
  it('holds 15-40 prospects from every source, with stars only for top programs', () => {
    for (const prestige of [45, 70, 84, 85, 99]) {
      for (let i = 0; i < 30; i++) {
        const pool = generateFeederPool(teamWithPrestige(prestige));
        expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE);
        expect(pool.length).toBeLessThanOrEqual(MAX_POOL_SIZE);
        const sources = new Set(pool.map((p) => p.source));
        ['FEEDER_MIDDLE_SCHOOL', 'SEVEN_ON_SEVEN', 'MOVE_IN', 'TRYOUT'].forEach((s) => expect(sources.has(s as never)).toBe(true));
        expect(sources.has('STAR_RECRUIT')).toBe(prestige >= STAR_RECRUIT_MIN_PRESTIGE);
      }
    }
  });

  it('covers every position over time and gives each source its own profile', () => {
    const team = teamWithPrestige(80);
    const many = Array.from({ length: 40 }, () => generateFeederPool(team)).flat();
    expect(new Set(many.map((p) => p.projectedPosition)).size).toBe(14);
    const avg = (source: string) => {
      const group = many.filter((p) => p.source === source);
      return group.reduce((s, p) => s + p.trueOverall, 0) / group.length;
    };
    expect(avg('TRYOUT')).toBeLessThan(avg('FEEDER_MIDDLE_SCHOOL'));
    const stars = Array.from({ length: 200 }, () => createProspect('STAR_RECRUIT', teamWithPrestige(95)));
    expect(Math.min(...stars.map((p) => p.trueOverall))).toBeGreaterThanOrEqual(76);
    many.filter((p) => p.source === 'SEVEN_ON_SEVEN').forEach((p) => expect(['QB', 'RB', 'WR', 'TE', 'LB', 'CB', 'S']).toContain(p.projectedPosition));
  });
});

describe('Coach actions', () => {
  it('scouting reveals true ratings without changing interest', () => {
    const p = createProspect('FEEDER_MIDDLE_SCHOOL', teamWithPrestige(80));
    const scouted = scoutProspect(p);
    expect(scouted.revealedPotential).toBe(p.truePotential);
    expect(scouted.scoutedSpeed).toBe(p.trueSpeed);
    expect(scouted.interestScore).toBe(p.interestScore);
  });

  it('home visits raise interest with diminishing returns; stars barely move', () => {
    const team = teamWithPrestige(90);
    let p = { ...createProspect('FEEDER_MIDDLE_SCHOOL', team), interestScore: 20 };
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const next = visitProspect(p);
      gains.push(next.interestScore - p.interestScore);
      p = next;
    }
    expect(gains[0]).toBeGreaterThan(gains[3]);
    const star = { ...createProspect('STAR_RECRUIT', team), interestScore: 10 };
    expect(visitProspect(star).interestScore - star.interestScore).toBeLessThanOrEqual(4);
    expect(pitchStarRecruit(star, team).interestScore).toBeGreaterThan(star.interestScore);
    const regular = createProspect('MOVE_IN', team);
    expect(pitchStarRecruit(regular, team)).toBe(regular);
  });

  it('program events grow interest and discover new prospects, capped at 40', () => {
    const team = teamWithPrestige(80);
    const pool = generateFeederPool(team);
    const clinic = runFeederEvent(pool, 'YOUTH_CLINIC', team);
    const before = pool.filter((p) => p.source === 'FEEDER_MIDDLE_SCHOOL');
    before.forEach((p) => {
      const after = clinic.pool.find((x) => x.id === p.id)!;
      expect(after.interestScore).toBeGreaterThanOrEqual(p.interestScore);
      expect(after.trueOverall).toBe(Math.min(99, p.trueOverall + 1));
    });
    const tryout = runFeederEvent(pool, 'TRYOUT_DAY', team);
    expect(tryout.discovered.length).toBeGreaterThanOrEqual(Math.min(2, MAX_POOL_SIZE - pool.length));
    tryout.discovered.forEach((p) => expect(p.source).toBe('TRYOUT'));

    let big = pool;
    for (let i = 0; i < 30; i++) big = runFeederEvent(big, 'TRYOUT_DAY', team).pool;
    expect(big.length).toBeLessThanOrEqual(MAX_POOL_SIZE);
  });
});

describe('Year-end decisions', () => {
  it('not everyone joins, and those who do keep their name and ratings', () => {
    const team = teamWithPrestige(80);
    const outcomes: FeederOutcome[] = [];
    for (let i = 0; i < 50; i++) {
      const pool = generateFeederPool(team);
      const res = resolveFeederClass(pool, team);
      outcomes.push(...res.outcomes);
      expect(new Set(pool.map((p) => p.name)).size).toBe(pool.length);
      res.joined.forEach((player) => {
        const prospectId = res.outcomes.find((o) => o.playerId === player.id)!.prospectId;
        const prospect = pool.find((p) => p.id === prospectId)!;
        expect(`${player.firstName} ${player.lastName}`).toBe(prospect.name);
        expect(player.overallRating).toBe(prospect.trueOverall);
        expect(player.classYear).toBe(prospect.incomingClass);
      });
    }
    const kinds = new Set(outcomes.map((o) => o.outcome));
    ['JOINED', 'NOT_PLAYING', 'LEFT_AREA', 'OTHER_SCHOOL'].forEach((k) => expect(kinds.has(k as never)).toBe(true));
    const joinRate = outcomes.filter((o) => o.outcome === 'JOINED').length / outcomes.length;
    expect(joinRate).toBeGreaterThan(0.2);
    expect(joinRate).toBeLessThan(0.6);
  });

  it('coaching attention pays off, and uncourted stars never come', () => {
    const team = teamWithPrestige(95);
    let cold = 0;
    let courted = 0;
    let uncourtedStars = 0;
    // True ratio is about 1.7; 1,500 samples keep random dips below 1.4 practically impossible
    for (let i = 0; i < 1500; i++) {
      const base = { ...createProspect('FEEDER_MIDDLE_SCHOOL', team), interestScore: 25, isTransferRisk: false };
      let warm = base;
      for (let v = 0; v < 4; v++) warm = visitProspect(warm);
      if (resolveFeederClass([base], team).joined.length) cold++;
      if (resolveFeederClass([warm], team).joined.length) courted++;
      const star = { ...createProspect('STAR_RECRUIT', team), interestScore: 20 };
      uncourtedStars += resolveFeederClass([star], team).joined.length;
    }
    expect(courted).toBeGreaterThan(cold * 1.4);
    expect(uncourtedStars).toBe(0);
  });

  it('sends the lowest-rated newcomers to JV when the varsity roster is full', () => {
    const team = teamWithPrestige(80);
    while (team.roster.length < MAX_VARSITY_ROSTER - 1) team.roster.push(generateProceduralPlayer('WR', 'Junior', 2));
    const newcomers = [55, 40, 70, 45].map((ovr) => generateProceduralPlayer('LB', 'Freshman', 1, 0, { overall: ovr }));
    team.roster.push(...newcomers);
    const outcomes: FeederOutcome[] = newcomers.map((p, i) => ({ prospectId: `x${i}`, playerId: p.id, prospectName: `${p.firstName} ${p.lastName}`, source: 'FEEDER_MIDDLE_SCHOOL', position: 'LB', outcome: 'JOINED', overall: p.overallRating }));
    const moved = enforceVarsityRosterLimit(team, newcomers, outcomes);
    expect(team.roster).toHaveLength(MAX_VARSITY_ROSTER);
    expect(moved.map((p) => p.overallRating).sort()).toEqual([40, 45, 55]);
    expect(outcomes.filter((o) => o.outcome === 'JV_TEAM')).toHaveLength(3);
  });
});

describe('Feeder pipeline through the store', () => {
  it('spends CP, holds events only in the off season, and turns the pool into a class on signing day', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    expect(store.getState().coachPoints).toBe(STARTING_COACH_POINTS);
    const pool = store.getState().scoutingPool;
    // Keep the board neutral (no income bonus or cut) so the CP math below is exact
    store.getState().leagueTeams.find((t) => t.id === store.getState().userTeamId)!.programMeters.schoolBoardTrust = 70;

    // Program events wait for the off season; personal visits work any time before signing day
    expect(store.getState().runFeederEvent('YOUTH_CLINIC')).toEqual([]);
    expect(store.getState().coachPoints).toBe(100);
    store.getState().visitFeederProspect(pool[0].id);
    expect(store.getState().coachPoints).toBe(85);
    expect(store.getState().scoutingPool.find((p) => p.id === pool[0].id)!.coachContacts).toBe(1);

    // A new game's rosters already hold this year's freshmen: no signing day until next season
    while (store.getState().currentWeek < 9) store.getState().advanceWeek();
    expect(store.getState().lastFeederResults).toBeNull();
    // Unspent CP carries over: 85 left + six 100-CP pre season/camp weeks (2-7) + game weeks 8 and 9 (+ any win bonus)
    expect(store.getState().coachPoints).toBeGreaterThanOrEqual(85 + 6 * weeklyCoachPoints(2) + 2 * weeklyCoachPoints(9));
    expect(weeklyCoachPoints(9)).toBeLessThan(weeklyCoachPoints(1));

    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    store.getState().finishBanquet(); // off season
    const cp = store.getState().coachPoints;
    store.getState().runFeederEvent('YOUTH_CLINIC');
    expect(store.getState().coachPoints).toBe(cp - 50);
    store.getState().runFeederEvent('YOUTH_CLINIC'); // already held this week
    expect(store.getState().coachPoints).toBe(cp - 50);

    const year = store.getState().currentYear;
    while (store.getState().currentYear === year) store.getState().advanceWeek(); // off season ends: new year
    while (store.getState().currentWeek < 2) store.getState().advanceWeek();
    const finalPool = store.getState().scoutingPool;
    store.getState().advanceWeek(); // signing day closes pre season week 2
    const { lastFeederResults, scoutingPool } = store.getState();
    expect(lastFeederResults).toHaveLength(finalPool.length);
    expect(scoutingPool.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE);
    const team = store.getState().districtTeams.find((t) => t.id === store.getState().userTeamId)!;
    expect(team.roster.length).toBeLessThanOrEqual(MAX_VARSITY_ROSTER);
    lastFeederResults!.filter((o) => o.outcome === 'JOINED').forEach((o) => {
      expect(team.roster.some((p) => p.id === o.playerId)).toBe(true);
    });
  }, 120000);
});

describe('Removing prospects', () => {
  it('drops a prospect from the pipeline for good', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    const [first, second] = store.getState().scoutingPool;
    store.getState().removeFeederProspect(first.id);
    const pool = store.getState().scoutingPool;
    expect(pool.some((p) => p.id === first.id)).toBe(false);
    expect(pool.some((p) => p.id === second.id)).toBe(true);
  });
});
