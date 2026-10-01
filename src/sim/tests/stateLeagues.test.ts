import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { importCustomDistrictJSON } from '../../utils/leagueImporter';
import { generateDistrictTeams, NEIGHBOR_DISTRICT_SCHOOLS } from '../../generators/rosterGenerator';
import { generateSeasonSchedule, LAST_REGULAR_SEASON_WEEK } from '../scheduleEngine';

const leaguesDir = join(__dirname, '../../../public/leagues');
const index: { state: string; districts: { name: string; file: string; schools: number }[] }[] = JSON.parse(
  readFileSync(join(leaguesDir, 'index.json'), 'utf-8')
);
const OFFENSES = ['TRIPLE_OPTION', 'AIR_RAID', 'POWER_I', 'SPREAD'];
const DEFENSES = ['FOUR_THREE', 'FOUR_FOUR', 'THREE_THREE_FIVE', 'DROP_EIGHT'];

describe('Real state district files', () => {
  it('cover all twelve researched states', () => {
    expect(index.map((s) => s.state)).toHaveLength(12);
  });

  it('every district imports into playable teams with a schedule that fits the season', () => {
    const neighbor = generateDistrictTeams('tx_6a_d25', NEIGHBOR_DISTRICT_SCHOOLS);
    for (const state of index) {
      for (const district of state.districts) {
        const res = importCustomDistrictJSON(readFileSync(join(leaguesDir, district.file), 'utf-8'));
        expect(res.success, `${district.file}: ${res.error}`).toBe(true);
        const teams = res.teams!;
        expect(teams.length).toBe(district.schools);
        expect(new Set(teams.map((t) => t.id)).size).toBe(teams.length);
        teams.forEach((t) => {
          expect(OFFENSES).toContain(t.schemeOffense);
          expect(DEFENSES).toContain(t.schemeDefense);
          expect(t.state).toBe(state.state);
        });
        const schedule = generateSeasonSchedule([[teams, neighbor]], 2026);
        expect(Math.max(...schedule.map((g) => g.week))).toBeLessThanOrEqual(LAST_REGULAR_SEASON_WEEK);
      }
    }
  });
});
