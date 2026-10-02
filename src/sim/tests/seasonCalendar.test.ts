import { describe, it, expect, vi } from 'vitest';
import { getSeasonPhase, SEASON_PHASE_LABELS } from '../scheduleEngine';
import { playoffRoundCount, seasonLength } from '../league';
import { useGameStore } from '../../store/gameStore';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));

describe('Season calendar', () => {
  it('labels every week of a 6-round playoff season, ending with post season and an off-season week', () => {
    const labels = Array.from({ length: 22 }, (_, i) => SEASON_PHASE_LABELS[getSeasonPhase(i + 1, 6)]);
    expect(labels[0]).toBe('Pre Season');
    expect(labels[3]).toBe('Training Camp');
    expect(labels[4]).toBe('Regular Season Non District');
    expect(labels[13]).toBe('Regular Season District');
    expect(labels[19]).toBe('Playoffs');
    expect(labels[20]).toBe('Post Season');
    expect(labels[21]).toBe('Off Season');
  });

  it('goes banquet (post season) -> off-season week -> next year', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    const { league, currentYear } = store.getState();
    const rounds = playoffRoundCount(league!);
    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    expect(getSeasonPhase(store.getState().currentWeek, rounds)).toBe('POST_SEASON');

    store.getState().finishBanquet();
    expect(store.getState().isBanquetActive).toBe(false);
    expect(store.getState().currentWeek).toBe(seasonLength(league!));
    expect(getSeasonPhase(store.getState().currentWeek, rounds)).toBe('OFF_SEASON');

    store.getState().advanceWeek();
    expect(store.getState().currentYear).toBe(currentYear + 1);
    expect(store.getState().currentWeek).toBe(1);
  });
});
