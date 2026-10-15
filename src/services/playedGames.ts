import Dexie, { Table } from 'dexie';
import type { GameSimulationState } from '../types/game';
import { mergePlayedGames, PlayedGame } from '../sim/gameLock';
import { accountState, playedGamesOn, refreshAccount } from './account';

// ---------------------------------------------------------------------------
// Where the coach's played games are written down (sim/gameLock.ts): its own small database in this browser, apart
// from the save slots, so loading or deleting a save doesn't touch it. A game in progress also keeps its full state
// here, written as it's played (at most about once a second), so it can resume where it left off. Signed in, the
// games also go to the account (without the in-progress game's full state), so a save loaded on another device
// can't replay one either.
// ---------------------------------------------------------------------------

const API = '/api/auth/played-games';
// Games waiting to reach the account (kept until the server takes them)
const toCloud = new Map<string, PlayedGame>();
const lastLiveUpload = new Map<string, number>();
const LIVE_UPLOAD_GAP_MS = 30_000; // a game in progress goes up at kickoff, then at most every 30 seconds
let uploading = false;

async function uploadPending(): Promise<void> {
  if (uploading || toCloud.size === 0 || !playedGamesOn()) return;
  uploading = true;
  try {
    while (toCloud.size > 0) {
      const batch = [...toCloud.values()].slice(0, 50);
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ games: batch }) });
      if (!res.ok) break; // they stay queued for the next try
      batch.forEach((g) => {
        if (toCloud.get(g.key) === g) toCloud.delete(g.key);
      });
    }
  } catch {
    // offline: they stay queued
  } finally {
    uploading = false;
  }
}

/** Sends a game to the account (finals always; a game in progress at kickoff, then now and then). */
function queueCloud(game: PlayedGame, now = false): void {
  if (game.status === 'LIVE' && !now && Date.now() - (lastLiveUpload.get(game.key) ?? 0) < LIVE_UPLOAD_GAP_MS) return;
  if (game.status === 'LIVE') lastLiveUpload.set(game.key, Date.now());
  const queued = toCloud.get(game.key);
  if (queued?.status === 'FINAL' && game.status === 'LIVE') return;
  toCloud.set(game.key, game);
  void uploadPending();
}

/** The account's games for a career (none signed out, offline, or before the server keeps them). */
async function cloudGames(careerKey: string): Promise<PlayedGame[]> {
  if (!accountState().ready) await refreshAccount();
  if (!playedGamesOn()) return [];
  try {
    const res = await fetch(`${API}?career=${encodeURIComponent(careerKey)}`, { credentials: 'same-origin', cache: 'no-store' });
    return res.ok ? ((await res.json()) as { games: PlayedGame[] }).games : [];
  } catch {
    return [];
  }
}

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

/** Every played game of a career: this device's and the account's, merged (and each side brought up to date). */
export async function loadPlayedGames(careerKey: string): Promise<PlayedGame[]> {
  const local = await quietly((db) => db.games.where('careerKey').equals(careerKey).toArray(), [] as PlayedGame[]);
  const cloud = await cloudGames(careerKey);
  if (!playedGamesOn()) return local;
  const merged = mergePlayedGames(local, cloud);
  const cloudByKey = new Map(cloud.map((g) => [g.key, g]));
  const localByKey = new Map(local.map((g) => [g.key, g]));
  // This device learns what the account knew; the account learns what only this device knew
  await quietly(async (db) => void (await db.games.bulkPut(merged.filter((g) => localByKey.get(g.key) !== g))), undefined);
  merged.filter((g) => cloudByKey.get(g.key) !== g && (cloudByKey.get(g.key)?.status !== 'FINAL')).forEach((g) => queueCloud(g, true));
  return merged;
}

/** Every played game on this device (the save list's notes). */
export const loadAllPlayedGames = () => quietly((db) => db.games.toArray(), [] as PlayedGame[]);

/** A game's final: the live state isn't needed any more. */
export const storeFinal = (game: PlayedGame) => {
  pending.delete(game.key);
  queueCloud(game);
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
  queueCloud(game, now);
  pending.set(game.key, { game, state: JSON.parse(JSON.stringify(state)) as GameSimulationState });
  if (now) lastWrite = 0;
  return flush();
}
