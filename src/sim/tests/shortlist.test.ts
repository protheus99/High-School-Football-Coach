import { describe, it, expect, vi } from 'vitest';
import type { GameSaveRecord } from '../../services/db';

const saved: GameSaveRecord[] = [];
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (record: GameSaveRecord) => void saved.push(JSON.parse(JSON.stringify(record)))) }));
import { useGameStore } from '../../store/gameStore';

const store = useGameStore;

describe('Recruiting list (My List)', () => {
  it('adds and takes off prospects, keeps the list in the save, and a dropped prospect leaves it', async () => {
    store.getState().newGame('MEDIUM', 'Texas');
    const [a, b] = store.getState().scoutingPool;
    store.getState().toggleShortlist(a.id);
    store.getState().toggleShortlist(b.id);
    store.getState().toggleShortlist(a.id); // tapped again: off the list
    expect(store.getState().shortlist).toEqual([b.id]);

    const id = await store.getState().saveGame('with a list');
    store.getState().newGame('MEDIUM', 'Texas');
    expect(store.getState().shortlist).toEqual([]); // a new game starts with an empty list
    store.getState().loadGame(saved.find((r) => r.id === id)!);
    expect(store.getState().shortlist).toEqual([b.id]);

    store.getState().removeFeederProspect(b.id);
    expect(store.getState().shortlist).toEqual([]);
  }, 60000);
});
