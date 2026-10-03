import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';
import { buildRecruitingContext } from '../feederCompetition';
import { contactGain } from '../feederEngine';
import { RELOCATION_CHANCE, resolveWidePool, wideJoinProbability } from '../widePool';
import { PLAYABLE_STATES } from '../stateRules';

describe('State and National prospect lists', () => {
  it('Texas gets State prospects from its other regions; one-region states only National ones', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Texas');
    const tx = store.getState().widePool;
    expect(tx.filter((p) => p.scope === 'STATE').length).toBeGreaterThan(20);
    expect(new Set(tx.filter((p) => p.scope === 'NATIONAL').map((p) => p.homeState))).toEqual(new Set(PLAYABLE_STATES.filter((s) => s !== 'Texas')));

    store.getState().newGame('MEDIUM', 'Georgia');
    const ga = store.getState().widePool;
    expect(ga.some((p) => p.scope === 'STATE')).toBe(false);
    expect(ga.filter((p) => p.scope === 'NATIONAL')).toHaveLength(15 * (PLAYABLE_STATES.length - 1));
    // Strong prospects, each worked by his zoned school
    ga.forEach((p) => {
      expect(['A+', 'A', 'B']).toContain(p.truePotential);
      expect(p.suitors[0].effort).toBeGreaterThanOrEqual(45);
    });
  });

  it('faraway contacts earn less interest; contacting one uses the wide list', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Texas');
    const national = store.getState().widePool.find((p) => p.scope === 'NATIONAL')!;
    const state = store.getState().widePool.find((p) => p.scope === 'STATE')!;
    const local = { ...national, scope: undefined };
    expect(contactGain(national, 'WINE_AND_DINE')).toBeLessThan(contactGain(state, 'WINE_AND_DINE'));
    expect(contactGain(state, 'WINE_AND_DINE')).toBeLessThan(contactGain(local, 'WINE_AND_DINE'));

    useGameStore.setState({ coachPoints: 500 });
    store.getState().contactFeederProspect(national.id, 'CALL');
    const after = store.getState().widePool.find((p) => p.id === national.id)!;
    expect(after.interestScore).toBe(national.interestScore + contactGain(national, 'CALL'));
    expect(store.getState().coachPoints).toBe(480);
    store.getState().removeFeederProspect(national.id);
    expect(store.getState().widePool.some((p) => p.id === national.id)).toBe(false);
  });

  it('a commitment brings a faraway prospect only when his family moves; otherwise his zoned school keeps him', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Texas');
    const { league, leagueTeams, userTeamId, widePool } = store.getState();
    const ctx = buildRecruitingContext(league!, leagueTeams, userTeamId);
    const committed = widePool.filter((p) => p.scope === 'NATIONAL').map((p) => ({ ...p, interestScore: 100, coachContacts: 3 }));
    expect(wideJoinProbability(committed[0], userTeamId)).toBeCloseTo(RELOCATION_CHANCE.NATIONAL);
    let joined = 0;
    for (let i = 0; i < 20; i++) joined += resolveWidePool(committed, ctx).joined.length;
    const rate = joined / (20 * committed.length);
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.55);
    // Uncontacted faraway kids stay home, and other states' light teams get no roster changes
    const untouched = resolveWidePool(widePool.filter((p) => p.scope === 'NATIONAL'), ctx);
    expect(untouched.joined).toHaveLength(0);
    expect(untouched.rivalSignings).toHaveLength(0);
    expect(untouched.outcomes).toHaveLength(0);
  });

  it('signing day signs the wide lists and opens new ones', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Georgia');
    const target = store.getState().widePool[0];
    useGameStore.setState({ widePool: store.getState().widePool.map((p) => (p.id === target.id ? { ...p, interestScore: 100, coachContacts: 4 } : p)), currentYear: store.getState().feederClassYear });
    store.getState().runFeederSigningDay();
    const outcome = store.getState().lastFeederResults!.find((o) => o.prospectId === target.id);
    expect(outcome).toBeDefined();
    expect(store.getState().widePool.some((p) => p.id === target.id)).toBe(false);
    expect(store.getState().widePool.length).toBeGreaterThan(0);
  });
});
