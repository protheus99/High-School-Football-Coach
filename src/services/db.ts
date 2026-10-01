import Dexie, { Table } from 'dexie';
import type { Difficulty, LeagueStructure } from '../sim/league';
import type { PlayoffBracketState } from '../sim/playoffEngine';
import { Team, NarrativeDilemma, FeederProspect, CompactBoxScore, ScheduledGame, DilemmaRecord } from '../types/game';

export interface GameSaveRecord {
  id: string; // 'current_save' or custom profile ID
  saveName: string;
  timestamp: number;
  currentWeek: number;
  userTeamId: string;
  coachingAP: number;
  practiceIntensity: 'WALKTHROUGH' | 'STANDARD' | 'CONTACT';
  districtTeams: Team[];
  activeDilemma: NarrativeDilemma | null;
  scoutingPool: FeederProspect[];
  history: CompactBoxScore[];
  // Added with the season schedule / league world; older saves may not have them
  currentYear?: number;
  neighborDistrictTeams?: Team[]; // pre-league saves only
  league?: LeagueStructure;
  leagueTeams?: Team[];
  playoffBracket?: PlayoffBracketState | null;
  sanctionLevel?: 0 | 1 | 2 | 3;
  statewideRecruits?: FeederProspect[];
  userViolationHeat?: number;
  pendingUserBan?: boolean;
  seasonSchedule?: ScheduledGame[];
  dilemmaLog?: DilemmaRecord[];
  difficulty?: Difficulty;
}

/** Lightweight listing for the load screen (full saves are ~10 MB each). */
export interface SaveSummary {
  id: string;
  saveName: string;
  timestamp: number;
  teamName: string;
  wins: number;
  losses: number;
  currentWeek: number;
  currentYear: number;
  difficulty?: Difficulty;
  isAutosave: boolean;
}

export const AUTOSAVE_ID = 'current_save';

export function summarizeSave(record: GameSaveRecord): SaveSummary {
  const team = (record.leagueTeams ?? record.districtTeams).find((t) => t.id === record.userTeamId);
  return {
    id: record.id,
    saveName: record.saveName,
    timestamp: record.timestamp,
    teamName: team?.name ?? 'Unknown team',
    wins: team?.record.wins ?? 0,
    losses: team?.record.losses ?? 0,
    currentWeek: record.currentWeek,
    currentYear: record.currentYear ?? 2026,
    ...(record.difficulty && { difficulty: record.difficulty }),
    isAutosave: record.id === AUTOSAVE_ID
  };
}

export class GameDatabase extends Dexie {
  public saves!: Table<GameSaveRecord, string>;
  public summaries!: Table<SaveSummary, string>;

  public constructor() {
    super('HSFootballHeadCoachDB');
    this.version(1).stores({
      saves: 'id, timestamp, currentWeek, userTeamId'
    });
    // v2: save slots get a summary row so the load screen doesn't read every full save
    this.version(2)
      .stores({
        saves: 'id, timestamp, currentWeek, userTeamId',
        summaries: 'id, timestamp'
      })
      .upgrade(async (tx) => {
        const saves = await tx.table<GameSaveRecord, string>('saves').toArray();
        await tx.table<SaveSummary, string>('summaries').bulkPut(saves.map(summarizeSave));
      });
  }
}

export const db = new GameDatabase();

/**
 * Saves current game state to local IndexedDB.
 */
export async function persistSaveGame(record: GameSaveRecord): Promise<void> {
  await db.transaction('rw', db.saves, db.summaries, async () => {
    await db.saves.put(record);
    await db.summaries.put(summarizeSave(record));
  });
}

/** All save slots, newest first. */
export async function listSaveSummaries(): Promise<SaveSummary[]> {
  return db.summaries.orderBy('timestamp').reverse().toArray();
}

export async function deleteSaveGame(id: string): Promise<void> {
  await db.transaction('rw', db.saves, db.summaries, async () => {
    await db.saves.delete(id);
    await db.summaries.delete(id);
  });
}

/**
 * Loads a save game record by ID.
 */
export async function loadSaveGame(id = 'current_save'): Promise<GameSaveRecord | undefined> {
  return await db.saves.get(id);
}

/**
 * Checks if a saved game exists in the browser.
 */
export async function hasSavedGame(id = 'current_save'): Promise<boolean> {
  const count = await db.saves.where('id').equals(id).count();
  return count > 0;
}
