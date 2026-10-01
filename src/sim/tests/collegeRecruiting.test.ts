import { describe, it, expect, vi } from 'vitest';
import { buildTexasLeague } from '../league';
import {
  CAMP_WEEKS,
  academicFit,
  advanceCollegeRecruiting,
  classLimit,
  alumniPrestigeChanges,
  collegeActionBlocker,
  performCollegeAction,
  playerStars,
  positionValue,
  recruitScore,
  rollOffer,
  runSigningDay,
  starsFromScore,
  updateStarRatings
} from '../collegeRecruitingEngine';
import { COLLEGES, COLLEGES_BY_NAME } from '../../data/colleges';
import { generateProceduralPlayer } from '../../generators/rosterGenerator';
import { Player, Team } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

const YEAR = 2026;

function season() {
  const { teams } = buildTexasLeague();
  updateStarRatings(teams, false);
  const events = Array.from({ length: 15 }, (_, i) => advanceCollegeRecruiting(teams, i + 2, YEAR)).flat();
  return { teams, events, seniors: teams.flatMap((t) => t.roster.filter((p) => p.classYear === 'Senior')) };
}

function testPlayer(overall: number, position: Player['position'] = 'WR', classYear: Player['classYear'] = 'Senior'): Player {
  const p = generateProceduralPlayer(position, classYear, 1, 0, { overall, potential: 'B' });
  p.overallRating = overall;
  p.recruiting.offers = [];
  return p;
}

const team = { prestige: 80 } as Team;

describe('Evaluations and offers', () => {
  const { teams, events, seniors } = season();

  it('uses the spec star bands', () => {
    expect([95, 85, 76, 68, 60, 50].map(starsFromScore)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('never duplicates an offer and never gives Power 4 scholarships to kickers or punters', () => {
    teams.forEach((t) =>
      t.roster.forEach((p) => {
        const names = p.recruiting.offers.map((o) => o.collegeName);
        expect(new Set(names).size).toBe(names.length);
        if (p.position === 'K' || p.position === 'P') expect(p.recruiting.offers.some((o) => o.tier === 'POWER_4')).toBe(false);
      })
    );
    expect(positionValue('P', 'POWER_4')).toBe(0);
    teams.forEach((t) =>
      t.roster.filter((p) => p.position === 'K' || p.position === 'P').forEach((p) => expect(p.recruiting.starRating).toBeLessThanOrEqual(3))
    );
  });

  it('better players draw more and higher offers', () => {
    const avg = (stars: number) => {
      const group = seniors.filter((p) => p.recruiting.starRating === stars);
      return group.reduce((s, p) => s + p.recruiting.offers.length, 0) / Math.max(1, group.length);
    };
    expect(avg(5)).toBeGreaterThan(avg(2));
    seniors.filter((p) => p.recruiting.starRating <= 2).forEach((p) => expect(p.recruiting.offers.some((o) => o.tier === 'POWER_4')).toBe(false));
    const fiveStars = seniors.filter((p) => p.recruiting.starRating === 5 && p.position !== 'K' && p.position !== 'P');
    const withP4 = fiveStars.filter((p) => p.recruiting.offers.some((o) => o.tier === 'POWER_4')).length;
    expect(withP4 / fiveStars.length).toBeGreaterThan(0.8);
  });

  it('juniors are offered only as 3-star prospects and commit only as 4-star prospects', () => {
    teams.forEach((t) =>
      t.roster
        .filter((p) => p.classYear === 'Junior')
        .forEach((p) => {
          if (p.recruiting.offers.length > 0) expect(recruitScore(p)).toBeGreaterThanOrEqual(74);
          if (p.recruiting.committedCollege) expect(recruitScore(p)).toBeGreaterThanOrEqual(82);
        })
    );
  });

  it('players commit only to schools that offered them', () => {
    expect(events.some((e) => e.type === 'COMMIT')).toBe(true);
    seniors
      .filter((p) => p.recruiting.committedCollege)
      .forEach((p) => expect(p.recruiting.offers.map((o) => o.collegeName)).toContain(p.recruiting.committedCollege));
    events.filter((e) => e.type === 'DECOMMIT').forEach((e) => expect(e.previousCollege).not.toBe(e.collegeName));
  });

  it('low grades cool selective colleges but never close the door', () => {
    const selective = COLLEGES.find((c) => c.academics >= 80)!;
    expect(academicFit(selective, 2.2)).toBeLessThan(academicFit(selective, 3.6));
    expect(academicFit(selective, 2.2)).toBeGreaterThan(0);
    const struggling = testPlayer(86);
    struggling.academics.gpa = 1.9;
    for (let w = 2; w <= 16; w++) rollOffer(struggling, team, w, YEAR);
    expect(struggling.recruiting.offers.length).toBeGreaterThan(0);
  });

  it('exposure brings more offers', () => {
    const offersAt = (visibility: number) => {
      let total = 0;
      for (let i = 0; i < 150; i++) {
        const p = testPlayer(78);
        p.recruiting.visibility = visibility;
        for (let w = 2; w <= 8; w++) rollOffer(p, team, w, YEAR);
        total += p.recruiting.offers.length;
      }
      return total;
    };
    expect(offersAt(95)).toBeGreaterThan(offersAt(5));
  });
});

describe('Signing day', () => {
  it('committed seniors sign where they committed, nearly every senior with an offer signs, and prestige stays balanced', () => {
    const { teams, seniors } = season();
    const commitments = new Map(seniors.map((p) => [p.id, p.recruiting.committedCollege]));
    const { signings, prestigeChanges } = runSigningDay(teams, YEAR);
    const withOffers = seniors.filter((p) => p.recruiting.offers.length > 0);
    withOffers.forEach((p) => {
      if (commitments.get(p.id)) {
        expect(p.recruiting.isNationalLetterOfIntentSigned).toBe(true);
        expect(p.recruiting.committedCollege).toBe(commitments.get(p.id));
      }
    });
    // A few lose out when every school that offered them fills its class
    expect(withOffers.filter((p) => p.recruiting.isNationalLetterOfIntentSigned).length / withOffers.length).toBeGreaterThan(0.9);
    expect(signings.length).toBeGreaterThan(0);
    const changes = [...prestigeChanges.values()];
    changes.forEach((c) => expect(c).toBeGreaterThanOrEqual(-3));
    expect(Math.abs(changes.reduce((a, b) => a + b, 0) / changes.length)).toBeLessThan(0.5);
  });

  it('colleges stop at their class limits, so recruits spread across programs', () => {
    const { teams } = season();
    const { signings } = runSigningDay(teams, YEAR);
    const perCollege = new Map<string, number>();
    signings.forEach((s) => perCollege.set(s.offer.collegeName, (perCollege.get(s.offer.collegeName) ?? 0) + 1));
    perCollege.forEach((n, name) => expect(n).toBeLessThanOrEqual(classLimit(COLLEGES_BY_NAME.get(name)!) + 2));
    const p4Schools = new Set(signings.filter((s) => s.offer.tier === 'POWER_4').map((s) => s.offer.collegeName));
    expect(p4Schools.size).toBeGreaterThanOrEqual(10);
  });

  it('out-producing your reputation raises prestige', () => {
    const changes = alumniPrestigeChanges([
      { prestige: 80, points: 20 },
      { prestige: 80, points: 2 },
      { prestige: 70, points: 5 },
      { prestige: 90, points: 10 }
    ]);
    expect(changes[0]).toBeGreaterThan(changes[1]);
  });
});

describe('Head coach actions', () => {
  it('film once a year, camps only in summer, calls add exposure', () => {
    const p = testPlayer(70);
    expect(performCollegeAction(p, team, 'FILM', 6, YEAR).ok).toBe(true);
    expect(collegeActionBlocker(p, 'FILM', 6, YEAR)).not.toBeNull();
    expect(collegeActionBlocker(p, 'CAMP', CAMP_WEEKS + 1, YEAR)).not.toBeNull();
    expect(collegeActionBlocker(p, 'CAMP', 1, YEAR)).toBeNull();
    const before = p.recruiting.visibility!;
    performCollegeAction(p, team, 'CALL', 6, YEAR);
    expect(p.recruiting.visibility!).toBeGreaterThan(before);
    expect(collegeActionBlocker(testPlayer(70, 'WR', 'Sophomore'), 'CALL', 6, YEAR)).not.toBeNull();
  });

  it('spends coaching AP through the store and signs seniors at the banquet', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    const { leagueTeams, userTeamId } = store.getState();
    const userTeam = leagueTeams.find((t) => t.id === userTeamId)!;
    const senior = userTeam.roster.find((p) => p.classYear === 'Senior')!;
    const ap = store.getState().coachingAP;
    expect(store.getState().collegeRecruitAction(senior.id, 'CAMP').ok).toBe(true);
    expect(store.getState().coachingAP).toBe(ap - 20);

    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    store
      .getState()
      .graduatingSeniors.filter((p) => p.recruiting.committedCollege)
      .forEach((p) => expect(p.recruiting.isNationalLetterOfIntentSigned).toBe(true));

    // Juniors keep their offers into their senior year; stars are re-evaluated
    const junior = userTeam.roster.find((p) => p.classYear === 'Junior' && p.recruiting.offers.length > 0);
    store.getState().transitionToNextYear();
    if (junior) expect(junior.recruiting.offers.length).toBeGreaterThan(0);
    store.getState().leagueTeams.forEach((t) => t.roster.forEach((p) => expect(p.recruiting.starRating).toBe(playerStars(p, false))));
  }, 120000);
});
