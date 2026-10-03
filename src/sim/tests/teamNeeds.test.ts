import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { generateFeederPool, runFeederEvent, LINE_POSITIONS } from '../feederEngine';
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

  it('targets programs at positions: Big Man Camp finds and warms linemen; the combine scouts', () => {
    const [team] = generateDistrictTeams();
    const pool = generateFeederPool(team).slice(0, 10);
    const camp = runFeederEvent(pool, 'BIG_MAN_CAMP', team);
    camp.discovered.forEach((p) => expect(LINE_POSITIONS).toContain(p.projectedPosition));
    pool.filter((p) => LINE_POSITIONS.includes(p.projectedPosition)).forEach((p) => {
      expect(camp.pool.find((q) => q.id === p.id)!.interestScore).toBeGreaterThanOrEqual(p.interestScore);
    });
    const combine = runFeederEvent(pool, 'COMBINE', team);
    const newlyScouted = combine.pool.filter((p) => p.revealedPotential !== 'UNKNOWN' && pool.find((q) => q.id === p.id)!.revealedPotential === 'UNKNOWN');
    expect(newlyScouted.length).toBe(Math.min(5, pool.filter((p) => p.revealedPotential === 'UNKNOWN').length));
  });
});
