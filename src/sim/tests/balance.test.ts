import { describe, it, expect } from 'vitest';
import { districtEnrollments } from '../../generators/rosterGenerator';
import { prestigeReversion, PRESTIGE_REVERSION } from '../programMeters';
import { mapLightRating } from '../nationalWorld';
import { scheduleInterstateGames } from '../interstate';
import type { Team } from '../../types/game';

describe('Division balance', () => {
  it("sends a district's 1st and 4th programs to the larger enrollments and its 2nd and 3rd to the smaller", () => {
    const schools = [99, 96, 90, 88, 80, 75, 70, 60].map((prestige, i) => ({ name: `School ${i}`, prestige }));
    const e = districtEnrollments(schools);
    const enr = (i: number) => e.get(`School ${i}`)!;
    // The UIL's two largest qualifiers go to Division 1: the best and fourth-best there, the second and third in Division 2
    const qualifiers = [0, 1, 2, 3].sort((a, b) => enr(b) - enr(a));
    expect(qualifiers.slice(0, 2).sort()).toEqual([0, 3]);
    expect(Math.min(enr(0), enr(3))).toBeGreaterThan(Math.max(enr(1), enr(2)));
  });
});

describe('Prestige reversion', () => {
  it('pulls a tenth of the way back toward history each season, and leaves a program at its history alone', () => {
    expect(prestigeReversion(80, 80)).toBe(0);
    const pulls = Array.from({ length: 4000 }, () => prestigeReversion(99, 84));
    const mean = pulls.reduce((s, x) => s + x, 0) / pulls.length;
    expect(mean).toBeCloseTo(-15 * PRESTIGE_REVERSION, 0);
    expect(Array.from({ length: 200 }, () => prestigeReversion(60, 85)).every((p) => p >= 2 && p <= 3)).toBe(true);
  });
});

describe('National calibration', () => {
  const calibration = (rolled: number[], real: number[]) => ({ rolled: [...rolled].sort((a, b) => a - b), real: [...real].sort((a, b) => a - b), teamRatings: {} });

  it('maps rolled ratings onto the real league by rank, tails included', () => {
    const same = calibration([60, 65, 70, 75], [60, 65, 70, 75]);
    expect(mapLightRating(67.5, same)).toBeCloseTo(67.5, 5);
    // A real league with a fatter top tail: the rolled best maps to the real best, beyond it keeps climbing
    const fat = calibration([60, 64, 68, 72, 76], [60, 64, 68, 73, 80]);
    expect(mapLightRating(76, fat)).toBeCloseTo(80, 5);
    expect(mapLightRating(78, fat)).toBeGreaterThan(80);
    const ys = [58, 62, 66, 70, 74, 78].map((x) => mapLightRating(x, fat));
    ys.slice(1).forEach((y, i) => expect(y).toBeGreaterThan(ys[i]));
  });
});

describe('Out-of-state pairing', () => {
  const team = (id: string, state: string, rating: number) => ({ id, name: id, state, lightRating: rating, roster: [], record: { wins: 0, losses: 0 } }) as unknown as Team;
  const rolls = (n: number, state: string) => Array.from({ length: n }, (_, i) => team(`${state}_${i}`, state, 65 + 5 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414)));

  it("doesn't make a big state's teams the favorites against the rest of the country", () => {
    let diff = 0;
    let games = 0;
    for (let k = 0; k < 5; k++) {
      const big = rolls(250, 'Texas');
      const others = ['Georgia', 'Ohio', 'Florida'].map((s) => ({ state: s, teams: rolls(200, s), schedule: [] }));
      const all = new Map([...big, ...others.flatMap((l) => l.teams)].map((t) => [t.id, t]));
      scheduleInterstateGames([{ state: 'Texas', teams: big, schedule: [] }, ...others], 2026)
        .filter((g) => (all.get(g.homeTeamId)!.state === 'Texas') !== (all.get(g.awayTeamId)!.state === 'Texas'))
        .forEach((g) => {
          const [tx, other] = all.get(g.homeTeamId)!.state === 'Texas' ? [g.homeTeamId, g.awayTeamId] : [g.awayTeamId, g.homeTeamId];
          diff += all.get(tx)!.lightRating! - all.get(other)!.lightRating!;
          games++;
        });
    }
    expect(Math.abs(diff / games)).toBeLessThan(0.3);
  });

  it('pairs on the strengths it is given (next season is paired on the last opener)', () => {
    const a = [team('a1', 'Texas', 50), team('a2', 'Texas', 80)];
    const b = [team('b1', 'Ohio', 79), team('b2', 'Ohio', 51)];
    // Rated by the given strengths, a1 is really the strong one: it meets b1
    const strengths: Record<string, number> = { a1: 80, a2: 50, b1: 79, b2: 51 };
    const games = scheduleInterstateGames([{ state: 'Texas', teams: a, schedule: [] }, { state: 'Ohio', teams: b, schedule: [] }], 2026, undefined, (t) => strengths[t.id]);
    const week8 = games.filter((g) => g.week === 8);
    expect(week8.some((g) => [g.homeTeamId, g.awayTeamId].sort().join() === 'a1,b1')).toBe(true);
  });
});
