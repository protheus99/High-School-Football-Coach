import { describe, it, expect, vi } from 'vitest';
vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';
import { gameKey, playoffKey, PrecomputedGame, scoreAt, scoreTimeline, scoringPlays } from '../runAhead';
import { FIRST_NON_DISTRICT_WEEK } from '../scheduleEngine';
import { findUserNode } from '../playoffEngine';

describe('Run-ahead', () => {
  it('breaks any football score into scoring plays that add up', () => {
    for (let score = 0; score <= 84; score++) {
      if (score === 1) continue; // no football score
      expect(scoringPlays(score).reduce((s, p) => s + p, 0)).toBe(score);
    }
    expect(scoringPlays(21)).toEqual([7, 7, 7]);
    expect(scoringPlays(24)).toEqual([7, 7, 7, 3]);
  });

  it('a timeline runs from 0-0 to the final score, never going backwards', () => {
    for (let i = 0; i < 50; i++) {
      const home = [0, 3, 14, 27, 35, 48][i % 6];
      const away = [7, 10, 13, 20, 31, 6][i % 6];
      const game: PrecomputedGame = { key: 'k', state: 'Texas', homeId: 'h', awayId: 'a', homeName: 'H', awayName: 'A', homeScore: home, awayScore: away, timeline: scoreTimeline(home, away) };
      expect(scoreAt(game, 1, 720, false)).toMatchObject({ home: 0, away: 0 });
      let last = { home: 0, away: 0 };
      for (const q of [1, 2, 3, 4] as const) {
        for (let clock = 720; clock >= 0; clock -= 60) {
          const s = scoreAt(game, q, clock, false);
          expect(s.home).toBeGreaterThanOrEqual(last.home);
          expect(s.away).toBeGreaterThanOrEqual(last.away);
          last = s;
        }
      }
      expect(last).toMatchObject({ home, away });
      expect(scoreAt(game, 2, 300, true)).toMatchObject({ home, away, status: 'Final' });
    }
  });

  it("simulates every other game this week ahead; Advance Week keeps those scores and credits stats once", () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Georgia');
    while (store.getState().currentWeek < FIRST_NON_DISTRICT_WEEK) store.getState().advanceWeek();
    const week = store.getState().currentWeek;
    const fl0 = store.getState().nationalLeagues.find((l) => l.state === 'Florida')!.teams[0];
    const qb = fl0.roster.find((p) => p.position === 'QB')!;
    const playedBefore = qb.stats.gamesPlayed;
    const ahead = store.getState().runAhead();
    expect(store.getState().runAhead()).toBe(ahead); // once per week
    const { seasonSchedule, userTeamId, nationalLeagues } = store.getState();
    const otherGames = seasonSchedule.filter((g) => g.week === week && g.homeTeamId !== userTeamId && g.awayTeamId !== userTeamId);
    otherGames.forEach((g) => expect(ahead.games[gameKey('Georgia', g.gameId)]).toBeDefined());
    const fl = nationalLeagues.find((l) => l.state === 'Florida')!;
    const flGames = fl.schedule.filter((g) => g.week === week);
    flGames.forEach((g) => expect(ahead.games[gameKey('Florida', g.gameId)]).toBeDefined());
    expect(Object.keys(ahead.games).some((k) => k.startsWith('Georgia|team_') || k.includes(userTeamId))).toBe(false);

    store.getState().advanceWeek();
    otherGames.forEach((g) => {
      const pre = ahead.games[gameKey('Georgia', g.gameId)];
      expect([g.homeScore, g.awayScore]).toEqual([pre.homeScore, pre.awayScore]);
    });
    flGames.forEach((g) => {
      const pre = ahead.games[gameKey('Florida', g.gameId)];
      expect([g.homeScore, g.awayScore]).toEqual([pre.homeScore, pre.awayScore]);
    });
    const qbGames = flGames.filter((g) => g.homeTeamId === fl.teams[0].id || g.awayTeamId === fl.teams[0].id).length;
    expect(qb.stats.gamesPlayed).toBe(playedBefore + qbGames); // the run-ahead game counted once
  }, 120000);

  it('playoff rounds keep their run-ahead results, in the coach’s bracket and every other state', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM', 'Texas');
    while (store.getState().currentWeek < 18) store.getState().advanceWeek();
    const ahead = store.getState().runAhead();
    const { playoffBracket, userTeamId } = store.getState();
    const mine = findUserNode(playoffBracket!, userTeamId)?.node;
    const sample = playoffBracket!.divisions[0].rounds[0].find((n) => !n.isBye && n !== mine)!;
    const pre = ahead.games[gameKey('Texas', playoffKey(0, sample.matchupId))];
    expect(pre.label).toBe('Bi-District');
    store.getState().advanceWeek();
    const node = store.getState().playoffBracket!.divisions[0].rounds[0].find((n) => n.matchupId === sample.matchupId)!;
    expect([node.team1Score, node.team2Score]).toEqual([pre.homeScore, pre.awayScore]);
    // Georgia's first round is next week (its open week is now): nothing to run ahead there yet
    expect(Object.keys(ahead.games).some((k) => k.startsWith('Georgia|po_'))).toBe(false);
    expect(Object.keys(ahead.games).filter((k) => k.startsWith('Texas|po_')).length).toBeGreaterThan(60); // both divisions
  }, 120000);
});
