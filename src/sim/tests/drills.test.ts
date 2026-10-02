import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { ASSISTANT_DRILLS_PER_WEEK, assistantDrillTargets, executePositionDrill, runAssistantDrills, DRILL_FOR_POSITION } from '../drillEngine';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

describe('Assistant-run drills', () => {
  it('picks players by the coach’s focus, healthy players only', () => {
    const [team] = generateDistrictTeams();
    team.roster[0].condition.injuryStatus = 'MODERATE';
    const starters = assistantDrillTargets(team.roster, 'STARTERS');
    expect(starters).toHaveLength(ASSISTANT_DRILLS_PER_WEEK);
    starters.forEach((p) => expect(p.depthChartTier).toBe(1));
    assistantDrillTargets(team.roster, 'YOUNG_PLAYERS').forEach((p) => expect(['Freshman', 'Sophomore']).toContain(p.classYear));
    const weakest = assistantDrillTargets(team.roster, 'WEAK_SPOTS');
    const starterRatings = team.roster.filter((p) => p.depthChartTier === 1 && p.condition.injuryStatus === 'HEALTHY').map((p) => p.overallRating);
    expect(weakest[0].overallRating).toBe(Math.min(...starterRatings));
    (['BALANCED', 'STARTERS', 'YOUNG_PLAYERS', 'WEAK_SPOTS'] as const).forEach((focus) =>
      assistantDrillTargets(team.roster, focus).forEach((p) => expect(p.condition.injuryStatus).toBe('HEALTHY'))
    );
  });

  it('a drill never swings the overall rating by more than a point', () => {
    const [team] = generateDistrictTeams();
    team.roster.forEach((p) => {
      const before = p.overallRating;
      executePositionDrill(p, DRILL_FOR_POSITION[p.position]);
      expect(p.overallRating - before).toBeGreaterThanOrEqual(0);
      expect(p.overallRating - before).toBeLessThanOrEqual(1);
    });
  });

  it('reports one line per drilled player', () => {
    const [team] = generateDistrictTeams();
    expect(runAssistantDrills(team.roster, 'BALANCED')).toHaveLength(ASSISTANT_DRILLS_PER_WEEK);
  });

  it('runs every week through the store with the chosen focus', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM');
    store.getState().setDrillFocus('YOUNG_PLAYERS');
    store.getState().advanceWeek();
    expect(store.getState().lastDrillReport.length).toBe(ASSISTANT_DRILLS_PER_WEEK);
  }, 60000);
});
