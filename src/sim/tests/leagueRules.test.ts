import { describe, it, expect } from 'vitest';
import { loadStateTeams } from '../../data/teamData';
import { rulesForLeague } from '../leagueRules';
import { leagueRoundNames } from '../playoffEngine';
import { buildLightLeague, simulateLightWeek } from '../nationalWorld';
import { LAST_REGULAR_SEASON_WEEK } from '../scheduleEngine';

/** A class played through its regular season, so its playoff field is set. */
async function seededClass(state: string, className: string) {
  await loadStateTeams(state);
  const light = buildLightLeague(state, 2026, undefined, className);
  for (let week = 1; week <= LAST_REGULAR_SEASON_WEEK; week++) simulateLightWeek(light, week);
  return light;
}

describe("A class league's playoff round names", () => {
  it('uses the class’s own rounds before its field is set, the same ones its playoffs then carry', async () => {
    const kansas = await seededClass('Kansas', '3A');
    const labels = rulesForLeague(kansas.league).playoffs.roundLabels;
    const before = leagueRoundNames(kansas.league).map((r) => labels[r]);
    expect(before).toEqual(['Round of 32', 'Regional', 'Sectional', 'Substate', 'State Championship']); // not Texas's Bi-District, Area...
    expect(kansas.bracket!.roundLabels).toEqual(before);
  }, 60000);

  it('matches the playoffs for every class whose field fills its expected rounds', async () => {
    const classes: [string, string][] = [
      ...['6A', '5A', '4A', '3A', '2A', '1A'].map((c): [string, string] => ['Kansas', c]),
      ...['5A', '4A', '3A', '2A', '1A', 'DII-AAA', 'DII-AA', 'DII-A'].map((c): [string, string] => ['Tennessee', c])
    ];
    let compared = 0;
    for (const [state, className] of classes) {
      const light = await seededClass(state, className);
      const rounds = leagueRoundNames(light.league);
      if (light.bracket!.roundNames.length !== rounds.length) continue; // a field smaller or larger than its listed rounds
      const labels = rulesForLeague(light.league).playoffs.roundLabels;
      expect(rounds.map((r) => labels[r]), `${state} ${className}`).toEqual(light.bracket!.roundLabels);
      compared++;
    }
    expect(compared).toBeGreaterThanOrEqual(8);
  }, 120000);

  it("leaves the original top classes' round names alone", () => {
    expect(rulesForLeague({ state: 'Texas' }).playoffs.roundLabels.BI_DISTRICT).toBe('Bi-District');
    expect(rulesForLeague(null).playoffs.roundLabels.AREA).toBe('Area');
  });
});
