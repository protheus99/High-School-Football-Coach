import { describe, it, expect, vi } from 'vitest';
import type { GameSaveRecord } from '../../services/db';

const saved: GameSaveRecord[] = [];
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async (record: GameSaveRecord) => void saved.push(JSON.parse(JSON.stringify(record)))) }));
import { useGameStore } from '../../store/gameStore';
import { getUserMatchup } from '../userMatchup';
import { gamesSince, liveClockLabel, lockKey, PlayedGame } from '../gameLock';
import type { GameSimulationState } from '../../types/game';

const store = useGameStore;

/** A new career, moved on to its first week with a game to play; then a save of that moment. */
async function atFirstGame(): Promise<GameSaveRecord> {
  store.getState().newGame('MEDIUM', 'Texas');
  for (let i = 0; i < 30; i++) {
    const s = store.getState();
    if (s.activeDilemma) s.resolveDilemma(s.activeDilemma.choices[0]);
    const m = getUserMatchup(store.getState());
    if (m && !m.isPlayed) break;
    store.getState().advanceWeek();
  }
  const id = await store.getState().saveGame('before the game');
  return saved.find((r) => r.id === id)!;
}

const teamYards = () => {
  const s = store.getState();
  return s.leagueTeams.find((t) => t.id === s.userTeamId)!.roster.reduce((n, p) => n + p.stats.rushYards + p.stats.passYards + p.stats.tackles, 0);
};

describe('A game counts once it kicks off', () => {
  it('a simmed game is written down, and loading an older save puts the same final back', async () => {
    const before = await atFirstGame();
    const week = store.getState().currentWeek;
    const matchup = getUserMatchup(store.getState())!;
    store.getState().advanceWeek(); // the coach sims his game
    const final = Object.values(store.getState().playedGames).find((g) => g.status === 'FINAL' && g.week === week)!;
    expect(final).toBeDefined();
    expect(Object.keys(final.lines ?? {}).length).toBeGreaterThan(0);
    const yardsAfter = teamYards();

    store.getState().loadGame(JSON.parse(JSON.stringify(before)));
    const again = getUserMatchup(store.getState())!;
    expect(store.getState().currentWeek).toBe(week);
    expect(again.isPlayed).toBe(true);
    expect([again.homeScore, again.awayScore]).toEqual(matchup.home.id === final.homeId ? [final.homeScore, final.awayScore] : [final.awayScore, final.homeScore]);
    expect(teamYards()).toBe(yardsAfter); // the same stat lines, not a new game
    expect(store.getState().lockNotice).toMatchObject({ week, seen: false });
  }, 120000);

  it('a live game is written down at kickoff: after a load it can only be resumed, and its final stands', async () => {
    const before = await atFirstGame();
    const s = store.getState();
    const m = getUserMatchup(s)!;
    const kickoff = { homeTeam: m.home, awayTeam: m.away, homeScore: 7, awayScore: 3, currentQuarter: 2, clockSecondsRemaining: 300 } as GameSimulationState;
    s.markGameLive(kickoff, true);

    store.getState().loadGame(JSON.parse(JSON.stringify(before)));
    const opponentId = m.home.id === s.userTeamId ? m.away.id : m.home.id;
    const key = lockKey(store.getState().careerKey!, s.currentYear, s.currentWeek, opponentId);
    expect(store.getState().playedGames[key]?.status).toBe('LIVE');
    expect(getUserMatchup(store.getState())!.isPlayed).toBe(false); // not replayed: the Hub offers Resume

    store.getState().markGameFinal({ ...kickoff, homeScore: 21, awayScore: 14, playerGameStats: {} } as GameSimulationState);
    store.getState().loadGame(JSON.parse(JSON.stringify(before)));
    const again = getUserMatchup(store.getState())!;
    expect(again.isPlayed).toBe(true);
    expect([again.homeScore, again.awayScore]).toEqual([21, 14]);
  }, 120000);

  it('a new game is a new career: nothing carries over', async () => {
    await atFirstGame();
    expect(store.getState().playedGames).toEqual({});
    expect(getUserMatchup(store.getState())!.isPlayed).toBe(false);
  }, 120000);

  it('lists the games a save can no longer replay, and labels a game in progress', () => {
    const g = (year: number, week: number, careerKey = 'a') => ({ careerKey, year, week }) as PlayedGame;
    const games = [g(2026, 9), g(2026, 12), g(2027, 3), g(2026, 14, 'b')];
    expect(gamesSince(games, 'a', 2026, 12).map((x) => x.week)).toEqual([12, 3]);
    expect(gamesSince(games, 'a', 2027, 4)).toEqual([]);
    expect(liveClockLabel({ quarter: 3, clockSeconds: 522 })).toBe('3rd Qtr · 8:42');
    expect(liveClockLabel({ quarter: 'OT', clockSeconds: 0 })).toBe('Overtime');
  });
});
