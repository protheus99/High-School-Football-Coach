import { describe, it, expect } from 'vitest';
import { loadStateTeams } from '../../data/teamData';
import { buildClassWorld, LEGACY_TOP_CLASS, teamClassLabel } from '../classLeague';
import { buildStateWorld } from '../league';
import { generateNationalAndStatePolls } from '../nationalRankingEngine';
import { generatePlayerRankingsAndLeaderboards } from '../playerRankingEngine';

describe('Class labels on the rankings', () => {
  it("names the original states' top classes by their real class", () => {
    expect(teamClassLabel({ state: 'Georgia' })).toBe('7A');
    expect(teamClassLabel({ state: 'Ohio' })).toBe('D1');
    expect(teamClassLabel({ state: 'New Jersey' })).toBe('Group 5');
    expect(teamClassLabel({ state: 'California' })).toBe('Open Division');
    expect(teamClassLabel({})).toBe('6A'); // Texas, the state a team with none is in
    Object.keys(LEGACY_TOP_CLASS).forEach((state) => expect(buildStateWorld(state, undefined, true).teams[0].classification).toBe(LEGACY_TOP_CLASS[state]));
  });

  it('shows a class built from the team data as its own class', async () => {
    const data = (await loadStateTeams('Kansas'))!;
    const world = buildClassWorld(data, '3A', undefined, { light: true });
    world.teams.forEach((t) => expect(t.classification).toBe('3A'));
    const polls = generateNationalAndStatePolls(world.teams, null, 1, [], 'Kansas');
    expect(polls.stateRankings.Kansas.length).toBeGreaterThan(0);
    polls.stateRankings.Kansas.forEach((e) => expect(e.classification).toBe('3A'));
    const leaders = generatePlayerRankingsAndLeaderboards(world.teams, 1);
    expect(leaders.nationalOverallTop100.length).toBeGreaterThan(0);
    leaders.nationalOverallTop100.forEach((e) => expect(e.classification).toBe('3A'));
  });

  it("reads an old save's teams by their league, not the '6A' they stored", () => {
    const georgia = buildStateWorld('Georgia', undefined, true).teams;
    georgia.forEach((t) => (t.classification = '6A')); // every team in a save from before the expansion
    const polls = generateNationalAndStatePolls(georgia, null, 1, [], 'Georgia');
    polls.stateRankings.Georgia.forEach((e) => expect(e.classification).toBe('7A'));
  });
});
