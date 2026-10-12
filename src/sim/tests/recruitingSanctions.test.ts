import { describe, it, expect, vi } from 'vitest';
import { createProspect, signProspect } from '../feederEngine';
import { CLEAN_ETHICS, onProbation, removeImproperRecruits, restrictedOnProbation } from '../feederCompetition';
import { generateDistrictTeams } from '../../generators/rosterGenerator';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

describe('Improperly recruited players', () => {
  it('are flagged when the signing school made the illegal offer, for rivals and the coach alike', () => {
    const p = createProspect('MOVE_IN', { prestige: 80 });
    p.suitors = [
      { teamId: 'rival_a', teamName: 'A', effort: 70, inducement: true },
      { teamId: 'rival_b', teamName: 'B', effort: 60, inducement: false }
    ];
    expect(signProspect(p, 'rival_a').improperlyRecruited).toBe(true);
    expect(signProspect(p, 'rival_b').improperlyRecruited).toBeUndefined();
    expect(signProspect(p, 'me', 'me').improperlyRecruited).toBeUndefined();
    expect(signProspect({ ...p, userInducement: true }, 'me', 'me').improperlyRecruited).toBe(true);
  });

  it('are ruled ineligible when the program is caught, and the depth chart fills their spots', () => {
    const [team] = generateDistrictTeams();
    const tainted = team.roster.filter((p) => p.depthChartTier === 1).slice(0, 2);
    tainted.forEach((p) => (p.improperlyRecruited = true));
    const size = team.roster.length;
    expect(removeImproperRecruits(team)).toEqual(tainted);
    expect(team.roster).toHaveLength(size - 2);
    expect(team.roster.filter((p) => p.depthChartTier === 1).length).toBeGreaterThanOrEqual(22);
  });
});

describe('Recruiting probation', () => {
  it('covers the punished season and the next, and closes off stars, rivals’ players and the wide lists', () => {
    expect(onProbation(2027, 2026)).toBe(true);
    expect(onProbation(2027, 2027)).toBe(true);
    expect(onProbation(2027, 2028)).toBe(false);
    expect(onProbation(null, 2027)).toBe(false);
    expect(restrictedOnProbation(createProspect('STAR_RECRUIT', { prestige: 80 }))).toBe(true);
    expect(restrictedOnProbation(createProspect('OUT_OF_DISTRICT', { prestige: 80 }))).toBe(true);
    expect(restrictedOnProbation({ ...createProspect('MOVE_IN', { prestige: 80 }), scope: 'STATE' })).toBe(true);
    expect(restrictedOnProbation(createProspect('FEEDER_MIDDLE_SCHOOL', { prestige: 80 }))).toBe(false);
  });

  it('a caught rival loses its tainted players, goes on probation building locally, and cleans up', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Maryland');
    const { leagueTeams, userTeamId, currentYear } = store.getState();
    const rival = leagueTeams.find((t) => t.id !== userTeamId)!;
    rival.feederProfile!.violationHeat = 1500; // certain to be caught this week
    rival.feederProfile!.strategy = 'RECRUIT_STARS';
    const tainted = rival.roster.slice(0, 3);
    tainted.forEach((p) => (p.improperlyRecruited = true));
    store.getState().advanceWeek();
    expect(rival.roster.some((p) => tainted.includes(p))).toBe(false);
    expect(rival.feederProfile).toMatchObject({ bannedSeason: currentYear, probationUntil: currentYear + 1, strategy: 'BUILD_LOCAL' });
    expect(rival.feederProfile!.ethics).toBeGreaterThanOrEqual(CLEAN_ETHICS); // no more illegal offers
    expect(store.getState().newsArticles.some((a) => a.featuredTeamName === rival.name && a.content.includes('3 improperly recruited players are ruled ineligible'))).toBe(true);
  });
});
