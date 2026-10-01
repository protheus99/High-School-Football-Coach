import { describe, it, expect, vi } from 'vitest';
import { DIFFICULTY_PRESTIGE, pickSchoolForDifficulty, Difficulty } from '../league';
import texas6A from '../../data/texas-6a.json';
import type { GameSaveRecord } from '../../services/db';

const saved: GameSaveRecord[] = [];
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (record: GameSaveRecord) => void saved.push(record)) }));
import { useGameStore } from '../../store/gameStore';

const prestigeOf = new Map(texas6A.regions.flatMap((r) => r.districts.flatMap((d) => d.schools)).map((s) => [s.name, s.prestige]));

describe('New game difficulty', () => {
  it.each<Difficulty>(['EASY', 'MEDIUM', 'HARD'])('%s picks schools only in its prestige range, at random', (difficulty) => {
    const { min, max } = DIFFICULTY_PRESTIGE[difficulty];
    const picks = new Set(Array.from({ length: 40 }, () => pickSchoolForDifficulty(difficulty)));
    picks.forEach((name) => {
      expect(prestigeOf.get(name)!).toBeGreaterThanOrEqual(min);
      expect(prestigeOf.get(name)!).toBeLessThanOrEqual(max);
    });
    expect(picks.size).toBeGreaterThan(1);
  });

  it('starts a fresh season coaching the picked school', () => {
    const store = useGameStore;
    const school = store.getState().newGame('HARD');
    const { leagueTeams, userTeamId, difficulty, currentWeek, currentYear } = store.getState();
    expect(leagueTeams.find((t) => t.id === userTeamId)!.name).toBe(school);
    expect(difficulty).toBe('HARD');
    expect(currentWeek).toBe(1);
    expect(currentYear).toBe(2026);
  });
});

describe('Save slots', () => {
  it('saves to a new slot and loads it back into the same game', async () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM');
    store.getState().advanceWeek();
    store.getState().advanceWeek();
    const id = await store.getState().saveGame('Before the rivalry game');
    const record = saved.find((r) => r.id === id)!;
    expect(record.saveName).toBe('Before the rivalry game');
    expect(record.difficulty).toBe('MEDIUM');
    const { userTeamId, currentWeek } = store.getState();

    store.getState().newGame('EASY');
    expect(store.getState().userTeamId === userTeamId && store.getState().difficulty === 'MEDIUM').toBe(false);

    store.getState().loadGame(record);
    expect(store.getState().userTeamId).toBe(userTeamId);
    expect(store.getState().currentWeek).toBe(currentWeek);
    expect(store.getState().difficulty).toBe('MEDIUM');
    expect(store.getState().districtTeams.some((t) => t.id === userTeamId)).toBe(true);
  }, 60000);
});
