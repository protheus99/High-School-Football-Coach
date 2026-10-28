import { describe, it, expect } from 'vitest';
import { MAX_TOP_GAMES, otherStateOf, topGameTagLabel, topGames } from '../topGames';
import { INTERSTATE, PrecomputedGame } from '../runAhead';
import { StateAndNationalPolls } from '../../types/game';

const game = (key: string, state: string, homeId: string, awayId: string, homeScore: number, awayScore: number, label?: string): PrecomputedGame => ({
  key: `${state}|${key}`,
  state,
  homeId,
  awayId,
  homeName: homeId,
  awayName: awayId,
  homeScore,
  awayScore,
  timeline: [],
  ...(label && { label })
});

// National top 25: Hoover #2 (AL), Mater Dei #4, Sierra Canyon #14, Mission Viejo #18; California top 10: Corona #3, De La Salle #6
const polls = {
  nationalTop25: [
    { teamId: 'hoover', rank: 2 },
    { teamId: 'materdei', rank: 4 },
    { teamId: 'sierracanyon', rank: 14 },
    { teamId: 'missionviejo', rank: 18 }
  ],
  stateRankings: {
    California: [
      { teamId: 'materdei', rank: 2 },
      { teamId: 'corona', rank: 3 },
      { teamId: 'delasalle', rank: 6 },
      { teamId: 'faraway', rank: 11 }
    ]
  }
} as unknown as StateAndNationalPolls;
const districtIds = new Set(['materdei', 'jserra', 'lutheran', 'margarita']);

describe('Around the state: the week’s top games', () => {
  const results = [
    game('nat', 'Alabama', 'hoover', 'thompson', 31, 24),
    game('quiet', 'California', 'nobody', 'someone', 21, 20),
    game('upset', 'California', 'sierracanyon', 'missionviejo', 21, 28),
    game('top10', 'California', 'corona', 'norco', 49, 13),
    game('lg1', 'California', 'materdei', 'jserra', 35, 10),
    game('lg2', 'California', 'lutheran', 'margarita', 17, 24),
    game('far', 'California', 'faraway', 'x', 14, 7),
    game('bigupset', 'Texas', 'smallschool', 'ranked4', 0, 0)
  ];

  it('orders league games, the state top 10, upsets, then the national top 5, each game once', () => {
    const picked = topGames({ results, userState: 'California', districtIds, polls });
    expect(picked.map((p) => [p.game.key.split('|')[1], p.tag])).toEqual([
      ['lg1', 'LEAGUE'],
      ['lg2', 'LEAGUE'],
      ['top10', 'STATE_TOP_10'],
      ['upset', 'UPSET'], // #18 beat #14
      ['nat', 'NATIONAL_TOP_5']
    ]);
  });

  it('counts only a ranked team that lost to a lower or unranked team as an upset', () => {
    const picked = topGames({
      results: [game('a', 'Ohio', 'unranked', 'missionviejo', 10, 7), game('b', 'Ohio', 'sierracanyon', 'missionviejo', 28, 21)],
      userState: 'California',
      districtIds,
      polls
    });
    expect(picked.map((p) => p.game.key)).toEqual(['Ohio|a']);
  });

  it('adds the coach’s division in the playoffs and stops at eight', () => {
    const playoffs = Array.from({ length: 12 }, (_, i) => game(`po_1_m${i}`, 'California', `h${i}`, `a${i}`, 21, 14, 'Section Semifinal'));
    const picked = topGames({ results: [...results, ...playoffs], userState: 'California', districtIds, polls, divisionKey: 'California|po_1_' });
    expect(picked).toHaveLength(MAX_TOP_GAMES);
    expect(picked.slice(5).every((p) => p.tag === 'DIVISION')).toBe(true);
  });

  it('labels tags and other states', () => {
    expect(['LEAGUE', 'STATE_TOP_10', 'UPSET', 'NATIONAL_TOP_5'].map((t) => topGameTagLabel(t as never, 'California'))).toEqual(['League', 'CA top 10', 'Upset', 'Nat. top 5']);
    const interstate = game('i', INTERSTATE, 'h', 'a', 1, 0, 'Alabama v California');
    expect(otherStateOf(interstate, 'home', 'California')).toBe('AL');
    expect(otherStateOf(interstate, 'away', 'California')).toBeNull();
    expect(otherStateOf(results[0], 'home', 'California')).toBe('AL');
  });
});
