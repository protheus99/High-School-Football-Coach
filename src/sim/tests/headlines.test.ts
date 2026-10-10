import { describe, it, expect, vi } from 'vitest';
import { NewsArticle, newsCategory, pickHeadlines, rankedName, rankingNews } from '../newsEngine';
import { RankedTeamEntry, StateAndNationalPolls, Team } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

const team = { id: 'me', name: 'Permian', record: { wins: 7, losses: 4 } } as Team;
const entry = (teamId: string, rank: number) => ({ teamId, rank }) as RankedTeamEntry;
/** Polls with the coach's team at these ranks (undefined: not ranked). */
const polls = (state?: number, national?: number): StateAndNationalPolls => ({
  week: 1,
  nationalTop25: national ? [entry('me', national)] : [],
  stateRankings: { Texas: state ? [entry('me', state)] : [] },
  bubbleTeams: []
});
const article = (id: string, featuredTeamName?: string): NewsArticle => ({ id, week: 5, outlet: 'TOWN_JOURNAL', headline: id, content: '', impactSentiment: 'NEUTRAL', featuredTeamName });

describe('Ranking stories', () => {
  const story = (before: StateAndNationalPolls, after: StateAndNationalPolls) => rankingNews(before, after, team, 'Texas', 6)?.headline;

  it('reports real changes only: entering or leaving, moving 3+ spots, reaching the top 10', () => {
    expect(story(polls(), polls(18))).toBe('Permian enters the Texas rankings at #18');
    expect(story(polls(18), polls())).toBe('Permian drops out of the Texas rankings');
    expect(story(polls(12), polls(9))).toBe('Permian cracks the Texas top 10 at #9');
    expect(story(polls(9), polls(5))).toBe('Permian climbs to #5 in the Texas rankings (▲4)');
    expect(story(polls(5), polls(9))).toBe('Permian falls to #9 in the Texas rankings (▼4)');
    // Small moves aren't news
    expect(story(polls(9), polls(7))).toBeUndefined();
    expect(story(polls(9), polls(9))).toBeUndefined();
  });

  it('covers the national Top 25 too, in one story', () => {
    expect(story(polls(6), polls(3, 22))).toBe('Permian climbs to #3 in the Texas rankings (▲3) and enters the national rankings at #22');
  });

  it('has nothing to compare on the first poll of a save', () => {
    expect(rankingNews(null, polls(3), team, 'Texas', 1)).toBeNull();
  });
});

describe('Headlines', () => {
  it('sorts stories by kind: the coach game, polls and program trouble first, the weekly spotlight last', () => {
    expect(newsCategory(article('news_rank_me_6'))).toBe('RANKINGS');
    expect(newsCategory(article('news_college_COMMIT_p1_2026_6_0'))).toBe('RECRUITING');
    expect(newsCategory(article('news_violation_x_2026_6'))).toBe('LEAGUE');
    const picked = pickHeadlines(
      [article('news_rec_6'), article('news_college_COMMIT_p2_2026_6_1', 'Odessa High'), article('news_college_COMMIT_p1_2026_6_0', 'Permian'), article('news_gm_6_x', 'Permian')],
      'Permian',
      3
    ).map((a) => a.id);
    expect(picked).toEqual(['news_gm_6_x', 'news_college_COMMIT_p1_2026_6_0', 'news_college_COMMIT_p2_2026_6_1']);
  });

  it('puts the national rank in front of a ranked team, and only a national rank', () => {
    const p = { ...polls(), nationalTop25: [entry('opp', 18)], stateRankings: { Texas: [entry('other', 7)] } };
    expect(rankedName({ id: 'opp', name: 'Midland Legacy' }, p)).toBe('#18 Midland Legacy');
    expect(rankedName({ id: 'other', name: 'Odessa High' }, p)).toBe('Odessa High');
  });
});

describe('The Hub during a season', () => {
  it('ranks every team in the state, keeps last week for movement, and leads the week with the coach result', () => {
    const store = useGameStore;
    store.getState().newGame('MEDIUM');
    const { userTeamId } = store.getState();
    const teams = store.getState().leagueTeams.length;
    expect(Object.keys(store.getState().polls!.teamRanks!)).toHaveLength(teams);
    // Through the season opener and the week after
    while (store.getState().currentWeek < 9) {
      const s = store.getState();
      if (s.activeDilemma) s.resolveDilemma(s.activeDilemma.choices[0]);
      else s.advanceWeek();
    }
    const { polls, newsArticles, newsMark } = store.getState();
    const mine = polls!.teamRanks![userTeamId];
    expect(mine.national).toBeGreaterThanOrEqual(mine.state);
    expect(polls!.previousTeamRanks![userTeamId]).toBeDefined();
    // This week's news (since the last advance) starts with the opener's result
    const fresh = newsArticles.slice(0, newsArticles.length - newsMark);
    expect(fresh.some((a) => a.id.startsWith('news_gm_'))).toBe(true);
    // Opening News marks everything read
    store.getState().markNewsSeen();
    expect(store.getState().newsSeen).toBe(newsArticles.length);
  }, 120000);
});
