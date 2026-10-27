import { describe, expect, it } from 'vitest';
import { advanceBlocker } from '../advanceGate';
import { lockKey, PlayedGame } from '../gameLock';
import type { ScheduledGame, Team } from '../../types/game';

const team = (id: string) => ({ id, name: id, mascot: 'Eagles', state: 'TX' }) as unknown as Team;
const game = (scored: boolean): ScheduledGame => ({
  gameId: 'g1',
  week: 3,
  homeTeamId: 'us',
  awayTeamId: 'them',
  isDistrictGame: true,
  ...(scored ? { homeScore: 21, awayScore: 14 } : {})
});
const state = (over: Partial<Parameters<typeof advanceBlocker>[0]> = {}) => ({
  currentWeek: 3,
  currentYear: 2026,
  seasonSchedule: [game(false)],
  leagueTeams: [team('us'), team('them')],
  userTeamId: 'us',
  playoffBracket: null,
  activeDilemma: null,
  careerKey: 'ck_test',
  playedGames: {} as Record<string, PlayedGame>,
  ...over
});

describe('advanceBlocker: what stops the week from moving on', () => {
  it('a decision waiting comes first', () => {
    expect(advanceBlocker(state({ activeDilemma: { id: 'd' } }))).toBe('DECISION');
  });

  it("this week's game not played yet", () => {
    expect(advanceBlocker(state())).toBe('GAME');
  });

  it('a game that kicked off must be finished', () => {
    const key = lockKey('ck_test', 2026, 3, 'them');
    const live = { key, status: 'LIVE' } as PlayedGame;
    expect(advanceBlocker(state({ playedGames: { [key]: live } }))).toBe('LIVE');
  });

  it('nothing once the game is played', () => {
    expect(advanceBlocker(state({ seasonSchedule: [game(true)] }))).toBeNull();
  });

  it('nothing on an open week', () => {
    expect(advanceBlocker(state({ seasonSchedule: [] }))).toBeNull();
  });
});
