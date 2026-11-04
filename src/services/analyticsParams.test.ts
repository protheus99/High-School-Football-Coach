import { describe, expect, it } from 'vitest';
import { gpaBand, interestBand, labelId, liveTally, moment, pointsBand, rankBand, ratingBand, scoreBand, secondString, talkFamily, talkParams } from './analyticsParams';
import { createProspect } from '../sim/feederEngine';
import { generateDistrictTeams } from '../generators/rosterGenerator';
import { TALKS } from '../sim/talks';

describe('Game event parameters', () => {
  it('put ratings, interest, GPAs, Coach Points and scores in a few bands', () => {
    expect([42, 50, 59.6, 64, 79, 80, 99].map(ratingBand)).toEqual(['<50', '50s', '60s', '60s', '70s', '80+', '80+']);
    expect([10, 30, 55, 90].map(interestBand)).toEqual(['cold', 'lukewarm', 'warm', 'hot']);
    expect([1.2, 1.8, 2.0, 2.4, 3.1].map(gpaBand)).toEqual(['<1.5', '1.5-1.9', '2.0-2.4', '2.0-2.4', '2.5+']);
    expect([0, 120, 200, 900].map(pointsBand)).toEqual(['<50', '50-149', '150-299', '300+']);
    expect([-14, -3, 0, 7, 21].map(scoreBand)).toEqual(['down_9+', 'down_1-8', 'tied', 'up_1-8', 'up_9+']);
  });

  it('say where the career is, including the phase', () => {
    expect(moment({ currentYear: 2027, currentWeek: 1 })).toEqual({ season: 2, week: 1, phase: 'SPRING_EVALUATION' });
  });

  it('turn button labels and settings into short ids', () => {
    expect(labelId('📚 Review grades')).toBe('review_grades');
    expect(labelId('Programs ›')).toBe('programs');
    expect([28, 42, null, undefined].map(secondString)).toEqual(['28', '42', 'never', 'never']);
  });

  it("rank a prospect within his own list only", () => {
    const team = generateDistrictTeams()[0];
    const pool = Array.from({ length: 30 }, (_, i) => ({ ...createProspect('FEEDER_MIDDLE_SCHOOL', team), id: `p${i}`, trueOverall: 40 + i, truePotential: 'C' as const }));
    expect(rankBand(pool[29], pool)).toBe('top10');
    expect(rankBand(pool[10], pool)).toBe('11-25');
    expect(rankBand(pool[0], pool)).toBe('26+');
    // A State-list prospect isn't ranked against the district
    const wide = { ...pool[0], id: 'w', scope: 'STATE' as const };
    expect(rankBand(wide, [...pool, wide])).toBe('top10');
  });

  it("describe a speech: its family, which pick it was and how well it fit", () => {
    const [a, b] = TALKS.filter((t) => t.phase === 'PRE');
    const offered = [
      { talk: a, line: 0, score: 3.1 },
      { talk: b, line: 0, score: 1.1 }
    ];
    expect(talkParams(offered[1], offered)).toEqual({ talk: b.id, family: b.family, risky: !!b.risky, pick: 2, offered: 2, fit: 'general' });
    expect(talkParams(offered[0], offered)).toMatchObject({ pick: 1, fit: 'built_for' });
    expect(talkFamily(a.id)).toBe(a.family);
  });

  it('count a live game: plays called, and the furthest the coach simmed ahead', () => {
    liveTally.reset();
    liveTally.plays += 3;
    liveTally.defCalls += 1;
    liveTally.simmed('half');
    liveTally.simmed('quarter');
    expect(liveTally.params()).toEqual({ coach_plays: 3, coach_def_calls: 1, sim_ahead: 'half' });
    liveTally.reset();
    expect(liveTally.params().sim_ahead).toBe('none');
  });
});
