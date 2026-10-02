import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { gameDayLineup, simulateMacroMatch, teamStarterRating } from '../macroSim';

describe('Simulated games respect injuries and eligibility', () => {
  it('replaces unavailable starters with the next available player at the position', () => {
    const [team] = generateDistrictTeams();
    const before = teamStarterRating(team);
    const starters = team.roster.filter((p) => p.depthChartTier === 1).sort((a, b) => b.overallRating - a.overallRating);
    const [hurt, failing] = starters;
    hurt.condition.injuryStatus = 'MODERATE';
    failing.academics.isEligible = false;

    const lineup = gameDayLineup(team);
    expect(lineup).not.toContain(hurt);
    expect(lineup).not.toContain(failing);
    const sub = lineup.find((p) => p && p.depthChartTier !== 1 && (p.position === hurt.position || p.secondaryPosition === hurt.position));
    expect(sub).toBeDefined();
    expect(new Set(lineup.filter(Boolean).map((p) => p!.id)).size).toBe(lineup.filter(Boolean).length); // nobody plays two slots
    expect(teamStarterRating(team)).toBeLessThan(before);
  });

  it('does not credit unavailable starters with a game played', () => {
    const [home, away] = generateDistrictTeams();
    const out = home.roster.find((p) => p.depthChartTier === 1)!;
    out.academics.isEligible = false;
    const played = out.stats.gamesPlayed;
    simulateMacroMatch('g1', 6, home, away);
    expect(out.stats.gamesPlayed).toBe(played);
  });
});
