import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { generateFeederPool, inUserPipeline, isEvaluated, runFeederEvent, LINE_POSITIONS } from '../feederEngine';
import { priorityNeeds, seniorsStillHere, teamNeeds } from '../teamNeeds';
import { DEPTH_TEMPLATE } from '../depthChart';

describe('Team needs', () => {
  it('counts graduating seniors as holes until signing day, then uses the roster as it stands', () => {
    const [team] = generateDistrictTeams();
    const qbs = team.roster.filter((p) => p.position === 'QB');
    qbs.forEach((p, i) => {
      p.classYear = i === 0 ? 'Senior' : 'Junior';
      p.depthChartTier = i === 0 ? 1 : 2;
    });
    const withSeniors = teamNeeds(team, [], true).find((n) => n.position === 'QB')!;
    expect(withSeniors.leaving).toBe(1);
    expect(withSeniors.leavingStarters).toBe(1);
    expect(withSeniors.returning).toBe(qbs.length - 1);
    expect(withSeniors.need).toBe(DEPTH_TEMPLATE.QB.roster - (qbs.length - 1));
    expect(withSeniors.starterHoles).toBe(1);
    expect(priorityNeeds(teamNeeds(team, [], true))[0].starterHoles).toBeGreaterThan(0);

    const afterGraduation = teamNeeds(team, [], false).find((n) => n.position === 'QB')!;
    expect(afterGraduation.leaving).toBe(0);
    expect(seniorsStillHere(2027, 2027, 2)).toBe(false); // pre season of a signing year
    expect(seniorsStillHere(2027, 2028, 10)).toBe(true);
  });

  it('targets programs at positions: The Trenches finds, warms and coaches up offensive linemen (up to +3); the combine scouts', () => {
    const [team] = generateDistrictTeams();
    const pool = generateFeederPool(team).slice(0, 10);
    const OL = ['OT', 'OG', 'C'];
    const camp = runFeederEvent(pool, 'THE_TRENCHES', team);
    camp.discovered.forEach((p) => expect(OL).toContain(p.projectedPosition));
    pool.filter((p) => OL.includes(p.projectedPosition) && inUserPipeline(p)).forEach((p) => {
      const after = camp.pool.find((q) => q.id === p.id)!;
      expect(after.interestScore).toBeGreaterThan(p.interestScore);
      expect(after.trueOverall).toBe(Math.min(99, p.trueOverall + 1));
    });
    let coached = camp.pool;
    for (let i = 0; i < 5; i++) coached = runFeederEvent(coached, 'THE_TRENCHES', team).pool;
    pool.filter((p) => OL.includes(p.projectedPosition) && inUserPipeline(p)).forEach((p) => {
      expect(coached.find((q) => q.id === p.id)!.trueOverall).toBe(Math.min(99, p.trueOverall + 3)); // capped at +3
    });
    expect(LINE_POSITIONS).toContain('OT');
    const combine = runFeederEvent(pool, 'COMBINE', team);
    // The combine evaluates up to five who aren't evaluated yet; everyone at 50+ interest already counts
    const newlyScouted = combine.pool.filter((p) => isEvaluated(p) && !isEvaluated(pool.find((q) => q.id === p.id)!));
    expect(newlyScouted.length).toBe(Math.min(5, pool.filter((p) => !isEvaluated(p) && inUserPipeline(p)).length));
    combine.pool.filter((p) => p.interestScore >= 50).forEach((p) => expect(p.revealedPotential).toBe(p.truePotential));
  });
});
