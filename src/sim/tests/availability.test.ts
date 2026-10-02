import { describe, it, expect } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { gameDayLineup, rollGameInjuries, simulateMacroMatch, teamStarterRating } from '../macroSim';
import { processWeeklyInjuryHealing } from '../playerEngine';
import { useGameStore } from '../../store/gameStore';
import { vi } from 'vitest';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));

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

describe('Game injuries and league-wide report cards', () => {
  it('injures about one player per team per game, and a one-game injury costs exactly one game', () => {
    const teams = generateDistrictTeams();
    let hurt = 0;
    const games = 200;
    for (let i = 0; i < games; i++) {
      const team = teams[i % teams.length];
      team.roster.forEach((p) => {
        p.condition.injuryStatus = 'HEALTHY';
        p.condition.injuryWeeksRemaining = 0;
      });
      hurt += rollGameInjuries(team, 6).length;
    }
    expect(hurt / games).toBeGreaterThan(0.5);
    expect(hurt / games).toBeLessThan(2);

    const [team] = teams;
    const p = team.roster[0];
    Object.assign(p.condition, { injuryStatus: 'DINGED', injuryWeeksRemaining: 1, injuredInWeek: 6 });
    processWeeklyInjuryHealing(p, 6); // same week as the game: still out for next week's game
    expect(p.condition.injuryStatus).toBe('DINGED');
    processWeeklyInjuryHealing(p, 7);
    expect(p.condition.injuryStatus).toBe('HEALTHY');
  });

  it('AI programs pick up injuries and report cards over a season', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    while (store.getState().currentWeek < 12) store.getState().advanceWeek();
    const ai = store.getState().leagueTeams.filter((t) => t.id !== store.getState().userTeamId);
    const injured = ai.flatMap((t) => t.roster).filter((p) => p.condition.injuryStatus !== 'HEALTHY').length;
    const ineligible = ai.flatMap((t) => t.roster).filter((p) => !p.academics.isEligible).length;
    expect(injured).toBeGreaterThan(0);
    expect(ineligible).toBeGreaterThan(0);
  }, 60000);
});
