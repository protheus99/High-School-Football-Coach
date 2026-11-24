import { describe, it } from 'vitest';
import { loadStateTeams, TEAM_STATES } from '../../data/teamData';
import { buildLightLeague, simulateLightWeek, LightLeague } from '../nationalWorld';
import { classRulesFor } from '../classRules';
import { STATE_FINAL_WEEK } from '../scheduleEngine';

// Timing for the national world: run with HSFC_MEASURE=1 npx vitest run src/sim/tests/measureNational.test.ts
// (skipped otherwise). One full season of light leagues, built, scheduled and played through the title games.

const run = async (states: string[]) => {
  for (const s of states) await loadStateTeams(s);
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const leagues: LightLeague[] = [];
  for (const s of states) {
    const data = await loadStateTeams(s);
    for (const c of data!.classes) if (classRulesFor(s, c.className)) leagues.push(buildLightLeague(s, 2026, undefined, c.className));
  }
  const built = performance.now();
  for (let week = 1; week <= STATE_FINAL_WEEK; week++) leagues.forEach((l) => simulateLightWeek(l, week));
  const done = performance.now();
  const teams = leagues.reduce((n, l) => n + l.teams.length, 0);
  const games = leagues.reduce((n, l) => n + l.schedule.length, 0);
  const finished = leagues.every((l) => l.bracket && !l.bracket.isPlayoffsActive);
  const json = JSON.stringify(leagues.map((l) => ({ t: l.teams, s: l.schedule }))).length;
  return { leagues: leagues.length, teams, games, buildMs: Math.round(built - t0), simMs: Math.round(done - built), totalMs: Math.round(done - t0), finished, heapMB: Math.round((process.memoryUsage().heapUsed - heap0) / 1e6), saveMB: +(json / 1e6).toFixed(1) };
};

describe.skipIf(!process.env.HSFC_MEASURE)('National world timing', () => {
  it('measures', async () => {
    for (const state of ['Kansas', 'Ohio', 'Texas', 'California']) console.log('STATE', state, JSON.stringify(await run([state])));
    console.log('COUNTRY', JSON.stringify(await run(TEAM_STATES)));
  }, 600_000);
});
