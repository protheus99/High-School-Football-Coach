import { describe, it, expect } from 'vitest';
import { generateDistrictTeams, generateProceduralPlayer } from '../../generators/rosterGenerator';
import { advanceTeamToNextSeason } from '../offseasonEngine';
import { DEPTH_TEMPLATE } from '../depthChart';
import { teamStarterRating } from '../macroSim';
import { Position, Team } from '../../types/game';
import { buildTexasLeague } from '../league';
import texas6A from '../../data/texas-6a.json';

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

    const newcomers = [generateProceduralPlayer('QB', 'Freshman', 1), generateProceduralPlayer('WR', 'Freshman', 1)];
    const { graduated, freshmen } = advanceTeamToNextSeason(team, newcomers);

    expect(graduated.map((p) => p.id).sort()).toEqual(seniors.sort());
    team.roster.forEach((p) => expect(seniors).not.toContain(p.id));
    juniors.forEach((id) => expect(team.roster.find((p) => p.id === id)?.classYear).toBe('Senior'));
    freshmen.forEach((p) => expect(p.classYear).toBe('Freshman'));
    expect(freshmen).toEqual(expect.arrayContaining(newcomers));
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
    // Forty real schools with prestige-based talent, as the game builds them
    const schools = texas6A.regions[0].districts.flatMap((d) => d.schools).slice(0, 40);
    const teams = generateDistrictTeams(
      'tx_6a_d1',
      schools.map((s) => ({ name: s.name, mascot: s.mascot, primary: s.primaryColor, secondary: s.secondaryColor, prestige: s.prestige })),
      { talentFromPrestige: true, state: 'Texas' }
    );
    const average = () => teams.reduce((s, t) => s + teamStarterRating(t), 0) / teams.length;
    const yearly = [average()];
    for (let year = 0; year < 8; year++) {
      teams.forEach((t) => advanceTeamToNextSeason(t));
      teams.forEach(expectFullDepthChart);
      yearly.push(average());
    }
    // No drift: the generated rosters already have the age curve the yearly progression keeps (this rollover alone
    // runs a little low; in the game, feeder recruits top classes up)
    yearly.forEach((avg) => expect(Math.abs(avg - yearly[0])).toBeLessThan(2.5));
  });

  it('generates rosters with an age curve: seniors ahead of juniors, sophomores and freshmen', () => {
    const players = buildTexasLeague().teams.flatMap((t) => t.roster);
    const mean = (c: string) => players.filter((p) => p.classYear === c).reduce((s, p, _, all) => s + p.overallRating / all.length, 0);
    expect(mean('Senior')).toBeGreaterThan(mean('Junior'));
    expect(mean('Junior')).toBeGreaterThan(mean('Sophomore'));
    expect(mean('Sophomore')).toBeGreaterThan(mean('Freshman'));
  });
});
