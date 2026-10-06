import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { generateProceduralPlayer } from '../../generators/rosterGenerator';
import { DEFENSE_POSITIONS, OFFENSE_POSITIONS, depthChartName, depthGroup, moveInDepthChart, normalizeDepthChart, promoteToStarter, rebuildDepthChart, setDepthTier } from '../depthChart';
import { getPositionGroup } from '../matchEngine';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

function teamWithTackles(count: number) {
  const [team] = generateDistrictTeams();
  team.roster = team.roster.filter((p) => p.position !== 'OT');
  for (let i = 0; i < count; i++) team.roster.push(generateProceduralPlayer('OT', 'Junior', 1));
  rebuildDepthChart(team.roster);
  return team;
}

describe('Depth chart', () => {
  it('labels players as first initial, last name and rating', () => {
    const p = generateProceduralPlayer('QB', 'Senior');
    p.firstName = 'Jalen';
    p.lastName = 'Leconte';
    p.overallRating = 99;
    expect(depthChartName(p)).toBe('J, Leconte (99)');
  });

  it('orders by rating into 1st, 2nd and 3rd strings', () => {
    const team = teamWithTackles(6);
    const tackles = depthGroup(team.roster, 'OT');
    expect(tackles.map((p) => p.depthChartTier)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(tackles.map((p) => p.overallRating)).toEqual([...tackles.map((p) => p.overallRating)].sort((a, b) => b - a));
  });

  it('arrows swap a player with the one above or below him in the same slot', () => {
    const team = teamWithTackles(6);
    const [lt1, rt1, lt2, rt2, lt3] = depthGroup(team.roster, 'OT');
    // LT column is depth 0, 2, 4: moving the LT backup up swaps him with the LT starter only
    expect(moveInDepthChart(team.roster, lt2.id, -1)).toBe(true);
    expect(depthGroup(team.roster, 'OT').map((p) => p.id).slice(0, 5)).toEqual([lt2.id, rt1.id, lt1.id, rt2.id, lt3.id]);
    expect(lt2.depthChartTier).toBe(1);
    expect(lt1.depthChartTier).toBe(2);
    expect(rt1.depthChartTier).toBe(1);
  });

  it('cannot move past the top or bottom of a slot', () => {
    const team = teamWithTackles(4);
    const [lt1, , , rt2] = depthGroup(team.roster, 'OT');
    expect(moveInDepthChart(team.roster, lt1.id, -1)).toBe(false);
    expect(moveInDepthChart(team.roster, rt2.id, 1)).toBe(false);
  });

  it('promotions and tier changes keep the order consistent', () => {
    const team = teamWithTackles(6);
    const third = depthGroup(team.roster, 'OT')[5];
    promoteToStarter(team.roster, third.id);
    expect(third.depthChartTier).toBe(1);
    expect(depthGroup(team.roster, 'OT').filter((p) => p.depthChartTier === 1)).toHaveLength(2);
    setDepthTier(team.roster, third.id, 3);
    expect(third.depthChartTier).toBe(3);
    expect(depthGroup(team.roster, 'OT').map((p) => p.depthOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('the game engine plays whoever the coach puts first', () => {
    const [team] = generateDistrictTeams();
    const [starter, backup] = depthGroup(team.roster, 'QB');
    moveInDepthChart(team.roster, backup.id, -1);
    expect(getPositionGroup(team, 'QB')[0].id).toBe(backup.id);
    expect(getPositionGroup(team, 'QB')[1].id).toBe(starter.id);
  });

  it('moves through the store', () => {
    const store = useGameStore;
    store.getState().newGame('EASY');
    const { leagueTeams, userTeamId } = store.getState();
    const team = leagueTeams.find((t) => t.id === userTeamId)!;
    const [, backup] = depthGroup(team.roster, 'RB');
    store.getState().moveDepthChartPlayer(backup.id, -1);
    expect(depthGroup(team.roster, 'RB')[0].id).toBe(backup.id);
  });
});

describe('Starting lineup', () => {
  it('puts eleven starters on each side: three receivers on offense', () => {
    const [team] = generateDistrictTeams();
    const starters = team.roster.filter((p) => p.depthChartTier === 1);
    expect(starters.filter((p) => OFFENSE_POSITIONS.includes(p.position))).toHaveLength(11);
    expect(starters.filter((p) => DEFENSE_POSITIONS.includes(p.position))).toHaveLength(11);
    expect(depthGroup(team.roster, 'WR')).toHaveLength(9);
    expect(starters.filter((p) => p.position === 'WR')).toHaveLength(3);
  });

  it('gives an older save (two starting receivers) three starters, keeping the coach order', () => {
    const [team] = generateDistrictTeams();
    team.roster = team.roster.filter((p) => p.position !== 'WR');
    // The old shape: six receivers, two per string
    const old = Array.from({ length: 6 }, (_, i) => {
      const p = generateProceduralPlayer('WR', 'Junior', 1);
      p.depthOrder = i;
      p.depthChartTier = (Math.floor(i / 2) + 1) as 1 | 2 | 3;
      return p;
    });
    team.roster.push(...old);
    normalizeDepthChart(team.roster);
    expect(depthGroup(team.roster, 'WR').map((p) => p.id)).toEqual(old.map((p) => p.id));
    expect(old.map((p) => p.depthChartTier)).toEqual([1, 1, 1, 2, 2, 2]);
  });
});
