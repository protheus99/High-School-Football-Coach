import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams, generateProceduralPlayer, INTAKE_SHIFT } from '../../generators/rosterGenerator';
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
  visitProspect,
  inUserPipeline,
  contactGain
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
  it('holds 15-40 prospects of your own from every source (the Top 10 lists replace out-of-area stars)', () => {
    for (const prestige of [45, 70, 84, 85, 99]) {
      for (let i = 0; i < 30; i++) {
        const pool = generateFeederPool(teamWithPrestige(prestige));
        expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE);
        expect(pool.length).toBeLessThanOrEqual(MAX_POOL_SIZE);
        const sources = new Set(pool.map((p) => p.source));
        ['FEEDER_MIDDLE_SCHOOL', 'SEVEN_ON_SEVEN', 'MOVE_IN', 'TRYOUT'].forEach((s) => expect(sources.has(s as never)).toBe(true));
        expect(sources.has('STAR_RECRUIT')).toBe(false);
        expect(STAR_RECRUIT_MIN_PRESTIGE).toBeGreaterThan(0); // still used by older saves
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
    expect(Math.min(...stars.map((p) => p.trueOverall))).toBeGreaterThanOrEqual(80 - 4 - INTAKE_SHIFT); // freshmen arrive raw
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

  it('camps only find new players: nobody already in the pool changes, and the pool stops at 60', () => {
    const team = teamWithPrestige(80);
    const pool = generateFeederPool(team);
    const clinic = runFeederEvent(pool, 'YOUTH_CLINIC', team);
    expect(clinic.discovered.length).toBe(Math.min(clinic.discovered.length, 3));
    pool.forEach((p) => {
      const after = clinic.pool.find((x) => x.id === p.id)!;
      expect([after.interestScore, after.trueOverall]).toEqual([p.interestScore, p.trueOverall]);
    });
    expect(clinic.warmed).toEqual([]);
    const big = runFeederEvent(pool, 'BIG_MAN_CAMP', team);
    big.discovered.forEach((p) => expect(['OT', 'OG', 'C', 'DE', 'DT']).toContain(p.projectedPosition));
    const kickers = runFeederEvent(pool, 'SPECIAL_TEAMS_CAMP', team);
    kickers.discovered.forEach((p) => expect(['K', 'P']).toContain(p.projectedPosition));

    let full = pool;
    for (let i = 0; i < 40; i++) full = runFeederEvent(full, 'YOUTH_CLINIC', team).pool;
    expect(full.filter((p) => !p.homeTeamId).length).toBeLessThanOrEqual(MAX_POOL_SIZE);
  });

  it('the Multi-Sport Tryout finds one raw athlete at a position his sport plays, with B to A+ potential', () => {
    const team = teamWithPrestige(70);
    const grades = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const [athlete] = runFeederEvent([], 'TRYOUT_DAY', team, undefined, undefined, { sport: 'SOCCER' }).discovered;
      expect(athlete.source).toBe('MULTI_SPORT');
      expect(['K', 'P']).toContain(athlete.projectedPosition);
      expect(athlete.trueOverall).toBeGreaterThanOrEqual(52);
      expect(athlete.trueOverall).toBeLessThanOrEqual(62);
      expect(athlete.suitors).toEqual([]);
      grades.set(athlete.truePotential, (grades.get(athlete.truePotential) ?? 0) + 1);
    }
    expect([...grades.keys()].every((g) => ['B', 'A', 'A+'].includes(g))).toBe(true);
    expect(grades.get('B')!).toBeGreaterThan(grades.get('A')!); // B likely, A sometimes, A+ rare
    expect(grades.get('A')!).toBeGreaterThan(grades.get('A+') ?? 0);
  });

  it('a multi-sport athlete always signs, even at no interest from rivals or a long-shot program', () => {
    const team = teamWithPrestige(45);
    const athletes = Array.from({ length: 20 }, () => runFeederEvent([], 'TRYOUT_DAY', team, undefined, undefined, { sport: 'TRACK' }).discovered[0]);
    const { joined } = resolveFeederClass(athletes, team);
    expect(joined.length).toBe(20);
  });

  it('position programs and Family Night only raise interest; the combine reveals potential only', () => {
    const team = teamWithPrestige(80);
    const pool = generateFeederPool(team).map((p) => ({ ...p, interestScore: Math.min(p.interestScore, 40), revealedPotential: 'UNKNOWN' as const }));
    const qb = runFeederEvent(pool, 'QB_ACADEMY', team);
    expect(qb.discovered).toEqual([]);
    qb.warmed.forEach((w) => {
      const before = pool.find((p) => p.id === w.id)!;
      expect(before.projectedPosition).toBe('QB');
      expect(w.after - w.before).toBeGreaterThanOrEqual(6);
      expect(w.after - w.before).toBeLessThanOrEqual(10);
      expect(qb.pool.find((p) => p.id === w.id)!.trueOverall).toBe(before.trueOverall); // no rating boost
    });
    // Family Night: the coach's list only, +10 each
    const list = pool.slice(0, 3).map((p) => p.id);
    const family = runFeederEvent(pool, 'FAMILY_NIGHT', team, undefined, undefined, { shortlist: list });
    expect(family.warmed.map((w) => w.id).sort()).toEqual(pool.slice(0, 3).filter((p) => p.interestScore < 100 && p.source !== 'STAR_RECRUIT').map((p) => p.id).sort());
    family.warmed.forEach((w) => expect(w.after - w.before).toBe(Math.min(10, 100 - w.before)));
    // The combine: potential for up to five, speed and strength still hidden
    const combine = runFeederEvent(pool, 'COMBINE', team);
    expect(combine.scouted.length).toBe(Math.min(5, pool.filter(inUserPipeline).length));
    combine.scouted.forEach((id) => {
      const p = combine.pool.find((q) => q.id === id)!;
      expect(p.revealedPotential).toBe(p.truePotential);
      expect(p.scoutedSpeed).toBeNull();
    });
  });
});

describe('Year-end decisions', () => {
  it('keeps the potential the coach had seen, for the signing day board (none for prospects never evaluated)', () => {
    const team = teamWithPrestige(80);
    const pool = generateFeederPool(team).map((p, i) =>
      i % 2 === 0 ? { ...p, revealedPotential: 'UNKNOWN' as const, interestScore: 10 } : { ...p, revealedPotential: 'UNKNOWN' as const, interestScore: 60 }
    );
    const { outcomes } = resolveFeederClass(pool, team);
    outcomes.forEach((o) => {
      const p = pool.find((x) => x.id === o.prospectId)!;
      expect(o.potential).toBe(p.interestScore >= 50 ? p.truePotential : undefined);
    });
  });

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

    // Programs run all year but the post season: the clinic costs 75, then waits out its cooldown
    expect(store.getState().runFeederEvent('YOUTH_CLINIC')!.discovered.length).toBeGreaterThan(0);
    expect(store.getState().coachPoints).toBe(STARTING_COACH_POINTS - 75);
    expect(store.getState().runFeederEvent('YOUTH_CLINIC')).toBeNull(); // cooling down: nothing happens
    expect(store.getState().coachPoints).toBe(STARTING_COACH_POINTS - 75);
    // Personal visits work any time before signing day
    store.getState().visitFeederProspect(pool[0].id);
    expect(store.getState().coachPoints).toBe(STARTING_COACH_POINTS - 90);
    expect(store.getState().scoutingPool.find((p) => p.id === pool[0].id)!.coachContacts).toBe(1);

    // A new game's rosters already hold this year's freshmen: no signing day until next season
    while (store.getState().currentWeek < 9) store.getState().advanceWeek();
    expect(store.getState().lastFeederResults).toBeNull();
    // Unspent CP carries over: what was left + pre season/camp weeks 2-7 + game weeks 8 and 9 (+ any win bonus)
    expect(store.getState().coachPoints).toBeGreaterThanOrEqual(STARTING_COACH_POINTS - 90 + 6 * weeklyCoachPoints(2) + 2 * weeklyCoachPoints(9));
    // A once-a-year program: the Multi-Sport Tryout, back only after the banquet
    expect(store.getState().runFeederEvent('TRYOUT_DAY', 'WRESTLING')!.discovered[0].source).toBe('MULTI_SPORT');
    store.getState().advanceWeek();
    expect(store.getState().runFeederEvent('TRYOUT_DAY', 'WRESTLING')).toBeNull();

    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    const atBanquet = store.getState().coachPoints;
    store.getState().runFeederEvent('YOUTH_CLINIC'); // the post season: closed
    expect(store.getState().coachPoints).toBe(atBanquet);
    store.getState().finishBanquet(); // off season
    expect(store.getState().programCooldowns.TRYOUT_DAY).toBeUndefined(); // the tryout is back
    const cp = store.getState().coachPoints;
    store.getState().runFeederEvent('YOUTH_CLINIC');
    expect(store.getState().coachPoints).toBe(cp - 75);
    store.getState().runFeederEvent('YOUTH_CLINIC'); // cooling down
    expect(store.getState().coachPoints).toBe(cp - 75);

    const year = store.getState().currentYear;
    while (store.getState().currentYear === year) store.getState().advanceWeek(); // off season ends: new year
    while (store.getState().currentWeek < 2) store.getState().advanceWeek();
    const finalPool = store.getState().scoutingPool;
    store.getState().advanceWeek(); // signing day closes pre season week 2
    const { lastFeederResults, scoutingPool } = store.getState();
    // The pool is shared across the region; results cover the user's own pipeline
    expect(lastFeederResults!.length).toBeGreaterThanOrEqual(finalPool.filter(inUserPipeline).length);
    expect(lastFeederResults!.length).toBeLessThanOrEqual(finalPool.length);
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

describe('Recruiting contacts', () => {
  it('costs Coach Points, adds interest, can be used once a week each, and resets the next week', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    // A prospect at 35 interest: a text and a visit leave him under 50, more contacts take him past it
    const pick = store.getState().scoutingPool.find((x) => !x.homeTeamId && x.revealedPotential === 'UNKNOWN')!;
    useGameStore.setState({ scoutingPool: store.getState().scoutingPool.map((x) => (x.id === pick.id ? { ...x, interestScore: 35 } : x)) });
    const p = store.getState().scoutingPool.find((x) => x.id === pick.id)!;
    const cp = store.getState().coachPoints;
    store.getState().contactFeederProspect(p.id, 'TEXT');
    store.getState().contactFeederProspect(p.id, 'TEXT'); // already texted this week
    store.getState().contactFeederProspect(p.id, 'VISIT');
    const after = store.getState().scoutingPool.find((x) => x.id === p.id)!;
    expect(store.getState().coachPoints).toBe(cp - 5 - 30);

    expect(after.interestScore).toBe(Math.min(100, p.interestScore + 2 + (p.interestScore + 2 >= 60 ? 7 : 9)));
    expect(after.revealedPotential).toBe('UNKNOWN'); // under 50 interest: not evaluated yet
    store.getState().contactFeederProspect(p.id, 'WINE_AND_DINE');
    store.getState().contactFeederProspect(p.id, 'INVITE');
    const warm = store.getState().scoutingPool.find((x) => x.id === p.id)!;
    expect(warm.interestScore).toBeGreaterThanOrEqual(50);
    expect(warm.revealedPotential).toBe(p.truePotential); // 50+ interest evaluates him
    store.getState().advanceWeek();
    expect(store.getState().scoutingPool.find((x) => x.id === p.id)!.actionsThisWeek ?? []).toEqual([]);
  });

  it('adds less once a prospect is warm and near committing', () => {
    const [team] = generateDistrictTeams();
    const p = createProspect('FEEDER_MIDDLE_SCHOOL', team);
    expect(contactGain({ ...p, interestScore: 30 }, 'WINE_AND_DINE')).toBe(15);
    expect(contactGain({ ...p, interestScore: 65 }, 'WINE_AND_DINE')).toBe(12);
    expect(contactGain({ ...p, interestScore: 85 }, 'WINE_AND_DINE')).toBe(9);
  });
});
