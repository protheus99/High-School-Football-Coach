import { describe, it, expect, vi } from 'vitest';
import { coachPrice, contractTerms, formatPrice, needsSettling, settleKind, staffWindowOpen } from '../staffContracts';
import { generateCandidates, HiredCoach } from '../coachingStaff';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

const coach = (rating: number, role: HiredCoach['role'] = 'QUARTERBACKS'): HiredCoach => ({ role, name: `Coach ${rating}`, rating, effectIds: [] });

describe('Staff contracts', () => {
  it('prices B and up in ducats and C+ and down in Coach Points, per season', () => {
    expect(formatPrice(coachPrice(97))).toBe('₾20');
    expect(formatPrice(coachPrice(72))).toBe('₾1');
    expect(formatPrice(coachPrice(68))).toBe('₡200');
    expect(formatPrice(coachPrice(50))).toBe('₡50');
  });

  it('opens the staff in the off-season and pre-season, and locks it at the season opener', () => {
    [1, 4, 7, 25, 28].forEach((w) => expect(staffWindowOpen(w)).toBe(true));
    [8, 12, 20, 24].forEach((w) => expect(staffWindowOpen(w)).toBe(false));
  });

  it('a contract signed in the off-season starts next season', () => {
    expect(contractTerms(3, 2026, 2)).toEqual({ contractEndSeason: 2027, paidThroughSeason: 2026 });
    expect(contractTerms(26, 2026, 1)).toEqual({ contractEndSeason: 2027, paidThroughSeason: 2027 });
    const c = { ...coach(65), ...contractTerms(3, 2026, 2) };
    expect(needsSettling(c, 12, 2026)).toBe(false); // only in the off-season
    expect(needsSettling(c, 25, 2026)).toBe(true);
    expect(settleKind(c, 2026)).toBe('PAYMENT');
  });

  it('always offers two Coach Point candidates', () => {
    const list = generateCandidates('QUARTERBACKS', () => 'X Y');
    expect(list).toHaveLength(4);
    expect(list.filter((c) => coachPrice(c.rating).currency === 'CP')).toHaveLength(2);
  });
});

describe('Staff through the store', () => {
  it('hires in the window, pays a season at a time, and lets unsigned coaches go', () => {
    const store = useGameStore;
    store.getState().newScenarioGame('OPEN', 'Maryland', 'Quince Orchard', 'Tester', 5);
    const cp = store.getState().coachPoints;
    expect(store.getState().hireCoach(coach(97), 1)).toMatch(/ducats/); // not on sale yet
    expect(store.getState().hireCoach(coach(65, 'QUARTERBACKS'), 1)).toBeNull(); // C: 150 a season
    expect(store.getState().hireCoach(coach(57, 'RUNNING_BACKS'), 2)).toBeNull(); // D+: 100 a season
    expect(store.getState().coachPoints).toBe(cp - 150 - 100);
    expect(store.getState().coachingStaff.find((c) => c.role === 'RUNNING_BACKS')).toMatchObject({ contractEndSeason: 2027, paidThroughSeason: 2026 });

    // Locked once the season starts
    while (store.getState().currentWeek < 8) {
      const s = store.getState();
      if (s.activeDilemma) s.resolveDilemma(s.activeDilemma.choices[0]);
      else s.advanceWeek();
    }
    expect(store.getState().hireCoach(coach(60, 'WIDE_RECEIVERS'), 1)).toMatch(/locked/);
    store.getState().releaseCoach('QUARTERBACKS');
    expect(store.getState().coachingStaff).toHaveLength(2);

    // The off-season: the two-season coach is paid automatically; the one-season contract is up
    for (let i = 0; i < 60 && store.getState().currentWeek < 25; i++) {
      const s = store.getState();
      if (s.activeDilemma) s.resolveDilemma(s.activeDilemma.choices[0]);
      else if (s.isBanquetActive) s.finishBanquet();
      else s.advanceWeek();
    }
    const s = store.getState();
    expect(s.currentWeek).toBe(25);
    expect(s.coachingStaff.find((c) => c.role === 'RUNNING_BACKS')!.paidThroughSeason).toBe(2027);
    const due = s.coachingStaff.filter((c) => needsSettling(c, s.currentWeek, s.currentYear));
    expect(due.map((c) => c.role)).toEqual(['QUARTERBACKS']);
    expect(settleKind(due[0], 2026)).toBe('RENEWAL');

    // Nobody signs him: he leaves when the year turns
    while (store.getState().currentYear === 2026) store.getState().advanceWeek();
    expect(store.getState().coachingStaff.map((c) => c.role)).toEqual(['RUNNING_BACKS']);
    expect(store.getState().newsArticles.some((a) => a.id === 'news_staff_leave_2026')).toBe(true);
  }, 180_000);

  it('renews at the same price', () => {
    const store = useGameStore;
    store.getState().newScenarioGame('OPEN', 'Maryland', 'Quince Orchard', 'Tester', 5);
    store.getState().hireCoach(coach(65), 1);
    store.getState().hireCoach(coach(68, 'RUNNING_BACKS'), 1);
    store.setState({ currentWeek: 25, coachPoints: 1000 });
    expect(store.getState().settleStaff(['QUARTERBACKS'], [])).toBeNull();
    expect(store.getState().coachPoints).toBe(850);
    expect(store.getState().coachingStaff.find((c) => c.role === 'QUARTERBACKS')).toMatchObject({ contractEndSeason: 2027, paidThroughSeason: 2027 });
    store.setState({ coachPoints: 10 });
    expect(store.getState().settleStaff(['RUNNING_BACKS'], [])).toMatch(/Needs/); // can't afford the C+ coach's 200
    expect(store.getState().settleStaff([], ['RUNNING_BACKS'])).toBeNull(); // let go instead
    expect(store.getState().coachingStaff.map((c) => c.role)).toEqual(['QUARTERBACKS']);
  });
});
