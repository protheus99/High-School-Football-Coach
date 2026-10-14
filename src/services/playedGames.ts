import Dexie, { Table } from 'dexie';
import type { GameSimulationState } from '../types/game';
import type { PlayedGame } from '../sim/gameLock';

// ---------------------------------------------------------------------------
// Where the coach's played games are written down (sim/gameLock.ts): its own small database in this browser, apart
// from the save slots, so loading or deleting a save doesn't touch it. A game in progress also keeps its full state
// here, written as it's played (at most about once a second), so it can resume where it left off.
// ---------------------------------------------------------------------------

interface LiveRow {
  key: string;
  state: GameSimulationState;
}

class PlayedGamesDatabase extends Dexie {
  public games!: Table<PlayedGame, string>;
  public live!: Table<LiveRow, string>;

  public constructor() {
    super('FootballCoachPlayedGames');
    this.version(1).stores({ games: 'key, careerKey', live: 'key' });
  }
}

let database: PlayedGamesDatabase | null | undefined;
/** The database, or null where the browser has none (private modes, tests): the game then plays as before. */
function playedDb(): PlayedGamesDatabase | null {
  if (database !== undefined) return database;
  try {
    database = typeof indexedDB === 'undefined' ? null : new PlayedGamesDatabase();
  } catch {
    database = null;
  }
  return database;
}

const quietly = async <T,>(work: (db: PlayedGamesDatabase) => Promise<T>, fallback: T): Promise<T> => {
  const db = playedDb();
  if (!db) return fallback;
  try {
    return await work(db);
  } catch {
    return fallback;
  }
};

/** Every played game of a career. */
export const loadPlayedGames = (careerKey: string) => quietly((db) => db.games.where('careerKey').equals(careerKey).toArray(), [] as PlayedGame[]);

/** Every played game on this device (the save list's notes). */
export const loadAllPlayedGames = () => quietly((db) => db.games.toArray(), [] as PlayedGame[]);

/** A game's final: the live state isn't needed any more. */
export const storeFinal = (game: PlayedGame) => {
  pending.delete(game.key);
  return quietly(async (db) => {
    await db.transaction('rw', db.games, db.live, async () => {
      await db.games.put(game);
      await db.live.delete(game.key);
    });
  }, undefined);
};

/** Where a game in progress stands. */
export const loadLiveState = (key: string) => quietly(async (db) => (await db.live.get(key))?.state ?? null, null as GameSimulationState | null);

// A live game is written as it's played: the newest state wins, one write at a time, at most about once a second
const pending = new Map<string, { game: PlayedGame; state: GameSimulationState }>();
let writing = false;
let lastWrite = 0;
const WRITE_GAP_MS = 1000;

async function flush(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending.size > 0) {
      const wait = lastWrite + WRITE_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const batch = [...pending.values()];
      pending.clear();
      lastWrite = Date.now();
      await quietly(async (db) => {
        await db.transaction('rw', db.games, db.live, async () => {
          for (const { game, state } of batch) {
            // A final already written (the game ended) is never turned back into a live game
            if ((await db.games.get(game.key))?.status === 'FINAL') continue;
            await db.games.put(game);
            await db.live.put({ key: game.key, state });
          }
        });
      }, undefined);
    }
  } finally {
    writing = false;
  }
}

/** Records a game in progress (at kickoff right away, then as it's played). */
export function storeLive(game: PlayedGame, state: GameSimulationState, now = false): Promise<void> {
  pending.set(game.key, { game, state: JSON.parse(JSON.stringify(state)) as GameSimulationState });
  if (now) lastWrite = 0;
  return flush();
}
