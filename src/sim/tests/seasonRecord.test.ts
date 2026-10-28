import { describe, it, expect } from 'vitest';
import { fullRecord, playoffRecord, playoffRecords, recordText } from '../seasonRecord';
import { gameResultNews, rankingNews } from '../newsEngine';
import type { BracketNode, PlayoffBracketState } from '../playoffEngine';
import { StateAndNationalPolls, Team } from '../../types/game';

const team = (id: string, wins: number, losses: number) =>
  ({ id, name: id, record: { wins, losses, districtWins: 7, districtLosses: 0, pointsFor: 0, pointsAgainst: 0 } }) as unknown as Team;
const bosco = team('bosco', 10, 0);
const dls = team('dls', 9, 1);
const servite = team('servite', 6, 4);

const game = (id: string, a: Team, b: Team, winner?: Team, isBye = false): BracketNode =>
  ({ matchupId: id, team1: a, team2: b, ...(winner && { winnerTeamId: winner.id }), ...(isBye && { isBye }) }) as unknown as BracketNode;

// Bosco: a bye, then three wins and the title; DLS: a win and the final loss; Servite: out in round one
const bracket = {
  isPlayoffsActive: true,
  roundNames: [],
  currentRoundIndex: 3,
  divisions: [
    {
      name: 'Open Division',
      championTeamId: 'bosco',
      rounds: [
        [game('r1a', bosco, bosco, bosco, true), game('r1b', dls, servite, dls)],
        [game('r2', bosco, team('x', 8, 2), bosco)],
        [game('r3', bosco, team('y', 9, 1), bosco)],
        [game('final', bosco, dls, bosco), game('later', dls, servite)] // a game not yet played counts for no one
      ]
    }
  ]
} as unknown as PlayoffBracketState;

describe('Full season record', () => {
  it('adds playoff games played on the field (not byes, not games still to play)', () => {
    expect(playoffRecord('bosco', bracket)).toEqual({ wins: 3, losses: 0, champion: true });
    expect(playoffRecord('dls', bracket)).toEqual({ wins: 1, losses: 1, champion: false });
    expect(fullRecord(bosco, bracket)).toEqual({ wins: 13, losses: 0 });
    expect(recordText(dls, bracket)).toBe('10-2');
    expect(recordText(servite, bracket)).toBe('6-5');
  });

  it('is the regular season alone before the playoffs, and the same from the per-team map', () => {
    expect(recordText(bosco, null)).toBe('10-0');
    const map = playoffRecords([bracket, null]);
    for (const t of [bosco, dls, servite]) expect(recordText(t, map)).toBe(recordText(t, bracket));
    expect(recordText(team('nobody', 4, 6), map)).toBe('4-6');
  });

  it('puts the full record in the headlines', () => {
    const polls = { nationalTop25: [], stateRankings: {} } as unknown as StateAndNationalPolls;
    const story = gameResultNews(21, bosco, dls, 45, 24, polls, recordText(bosco, bracket), 'State Championship');
    expect(story.content).toBe('State Championship: bosco won 45-24 and is now 13-0.');
    const rank = (r: number) => ({ nationalTop25: [{ teamId: 'bosco', rank: r }], stateRankings: { California: [{ teamId: 'bosco', rank: r }] } }) as unknown as StateAndNationalPolls;
    expect(rankingNews(rank(9), rank(1), bosco, 'California', 21, recordText(bosco, bracket))?.content).toMatch(/^bosco \(13-0\) /);
  });
});
