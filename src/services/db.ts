import Dexie, { Table } from 'dexie';
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
  // Added with the season schedule; older saves may not have them
  currentYear?: number;
  neighborDistrictTeams?: Team[];
  seasonSchedule?: ScheduledGame[];
  dilemmaLog?: DilemmaRecord[];
}

export class GameDatabase extends Dexie {
  public saves!: Table<GameSaveRecord, string>;

  public constructor() {
    super('HSFootballHeadCoachDB');
    this.version(1).stores({
      saves: 'id, timestamp, currentWeek, userTeamId'
    });
  }
}

export const db = new GameDatabase();

/**
 * Saves current game state to local IndexedDB.
 */
export async function persistSaveGame(record: GameSaveRecord): Promise<void> {
  await db.saves.put(record);
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
