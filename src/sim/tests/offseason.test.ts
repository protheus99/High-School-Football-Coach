import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { advanceTeamToNextSeason } from '../offseasonEngine';
import { DEPTH_TEMPLATE } from '../depthChart';
import { teamStarterRating } from '../macroSim';
import { Position, Team } from '../../types/game';

const positions = Object.keys(DEPTH_TEMPLATE) as Position[];

function expectFullDepthChart(team: Team) {
  for (const pos of positions) {
    const group = team.roster.filter((p) => p.position === pos);
    const starters = group.filter((p) => p.depthChartTier === 1);
    expect(group.length).toBeGreaterThanOrEqual(DEPTH_TEMPLATE[pos].roster);
    expect(starters).toHaveLength(DEPTH_TEMPLATE[pos].starters);
    const worstStarter = Math.min(...starters.map((p) => p.overallRating));
    group.filter((p) => p.depthChartTier !== 1).forEach((backup) => expect(backup.overallRating).toBeLessThanOrEqual(worstStarter));
  }
}

describe('Generated rosters', () => {
  it('start the best player at each position with a full depth chart', () => {
    generateDistrictTeams().forEach(expectFullDepthChart);
  });
});

describe('Off-season rollover', () => {
  it('graduates seniors, moves classes up, refills positions and resets stats', () => {
    const [team] = generateDistrictTeams();
    const seniors = team.roster.filter((p) => p.classYear === 'Senior').map((p) => p.id);
    const juniors = team.roster.filter((p) => p.classYear === 'Junior').map((p) => p.id);
    team.roster[0].stats.passYards = 2500;

    const { graduated, freshmen } = advanceTeamToNextSeason(team, ['QB', 'WR']);

    expect(graduated.map((p) => p.id).sort()).toEqual(seniors.sort());
    team.roster.forEach((p) => expect(seniors).not.toContain(p.id));
    juniors.forEach((id) => expect(team.roster.find((p) => p.id === id)?.classYear).toBe('Senior'));
    freshmen.forEach((p) => expect(p.classYear).toBe('Freshman'));
    expect(freshmen.filter((p) => p.position === 'QB').length).toBeGreaterThanOrEqual(1);
    team.roster.forEach((p) => expect(p.stats.passYards).toBe(0));
    expectFullDepthChart(team);
  });

  it('grows position skills along with overall rating', () => {
    const [team] = generateDistrictTeams();
    const qb = team.roster.find((p) => p.position === 'QB' && p.classYear !== 'Senior');
    if (!qb) return;
    const before = { ovr: qb.overallRating, acc: qb.attributes.passingAccuracy };
    advanceTeamToNextSeason(team);
    expect(qb.attributes.passingAccuracy - before.acc).toBe(qb.overallRating - before.ovr);
  });

  it('keeps program strength stable across a decade of graduations', () => {
    const teams = generateDistrictTeams();
    const average = () => teams.reduce((s, t) => s + teamStarterRating(t), 0) / teams.length;
    const yearly = [average()];
    for (let year = 0; year < 8; year++) {
      teams.forEach((t) => advanceTeamToNextSeason(t));
      teams.forEach(expectFullDepthChart);
      yearly.push(average());
    }
    yearly.forEach((avg) => expect(Math.abs(avg - yearly[0])).toBeLessThan(6));
  });
});
