import { describe, it, expect, vi } from 'vitest';
import {
  STARTING_COACH_POINTS,
  collegeActionCost,
  feederEventCost,
  formatCP,
  talentBlocker,
  weeklyCpIncome,
  winBonus
} from '../coachPoints';
import { useGameStore } from '../../store/gameStore';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));

describe('Coach Points', () => {
  it('earns a weekly allowance and win bonuses', () => {
    expect(weeklyCpIncome(1, [])).toBe(100);
    expect(weeklyCpIncome(9, [])).toBe(100); // game weeks earn the same
    expect(weeklyCpIncome(9, ['BIGGER_BUDGET'])).toBe(110);
    expect(winBonus(false, [])).toBe(10);
    expect(winBonus(true, ['BIGGER_BUDGET', 'DEEP_POCKETS'])).toBe(40);
    expect(formatCP(12000)).toBe('₡12,000');
  });

  it('applies talent effects to costs', () => {
    expect(feederEventCost(50, [])).toBe(50);
    expect(feederEventCost(50, ['RECRUITING_NETWORK'])).toBe(40);
    expect(collegeActionCost(20, ['RECRUITING_NETWORK', 'COLLEGE_CONNECTIONS'])).toBe(12);
  });

  it('gates second-tier talents behind the first and the price', () => {
    expect(talentBlocker('DEEP_POCKETS', [], 500)).toMatch(/Bigger Budget/);
    expect(talentBlocker('BIGGER_BUDGET', [], 1999)).toMatch(/₡2,000/);
    expect(talentBlocker('BIGGER_BUDGET', [], 2000)).toBeNull();
    expect(talentBlocker('BIGGER_BUDGET', ['BIGGER_BUDGET'], 2000)).not.toBeNull();
  });

  it('unlocks talents through the store, spending CP and paying meter bonuses', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    expect(store.getState().coachPoints).toBe(STARTING_COACH_POINTS);
    const { districtTeams, userTeamId } = store.getState();
    const meters = districtTeams.find((t) => t.id === userTeamId)!.programMeters;
    const trust = meters.schoolBoardTrust;

    expect(store.getState().unlockTalent('BOARD_ROOM_SHIELD')).toMatch(/₡2,000/); // a new coach can't afford one yet
    store.setState({ coachPoints: 2040 });
    expect(store.getState().unlockTalent('BOARD_ROOM_SHIELD')).toBeNull();
    expect(store.getState().coachPoints).toBe(40);
    expect(store.getState().coachTalents).toEqual(['BOARD_ROOM_SHIELD']);
    expect(meters.schoolBoardTrust).toBe(Math.min(100, trust + 15));
    expect(store.getState().unlockTalent('BOOSTER_BREAKFASTS')).toMatch(/₡4,000/); // only 40 left

    store.getState().unlockTalent('BIGGER_BUDGET'); // not enough: no change
    expect(store.getState().coachPoints).toBe(40);
    store.getState().advanceWeek();
    expect(store.getState().coachPoints).toBeGreaterThanOrEqual(40 + weeklyCpIncome(2, []));
  });
});
