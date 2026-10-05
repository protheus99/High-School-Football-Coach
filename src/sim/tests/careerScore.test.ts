import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SCENARIOS } from '../../data/scenarios';
import { PLAYABLE_STATES } from '../stateRules';
import { stateSchool } from '../league';
import { Career, careerPoints, scoreSeason, seasonPoints } from '../careerScore';
import type { PlayoffBracketState } from '../playoffEngine';
import type { Team } from '../../types/game';
import { localLeaderboard, loadLocalCareers, recordCareer } from '../../services/leaderboard';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

describe('Scenario programs', () => {
  it.each(SCENARIOS.map((s) => [s.title, s] as const))('%s offers two programs in every playable state, all in its world', (_, scenario) => {
    PLAYABLE_STATES.forEach((state) => {
      const programs = scenario.programs.filter((p) => p.state === state);
      expect(programs).toHaveLength(2);
      programs.forEach((p) => {
        expect(stateSchool(state, p.school), `${p.school} (${state})`).toBeDefined();
        expect(p.legacy.length).toBeGreaterThan(40);
      });
    });
  });

  it('every state has four different programs to choose from', () => {
    PLAYABLE_STATES.forEach((state) => {
      expect(new Set(SCENARIOS.flatMap((s) => s.programs).filter((p) => p.state === state).map((p) => p.school)).size).toBe(4);
    });
  });
});

describe('Season points', () => {
  it('scores wins 5, losses 1, playoff wins 8, a state title 10 and each college signee 1', () => {
    expect(seasonPoints({ wins: 10, losses: 0, playoffWins: 0, stateTitle: false, collegeSignees: 0 })).toBe(50);
    expect(seasonPoints({ wins: 9, losses: 1, playoffWins: 5, stateTitle: true, collegeSignees: 7 })).toBe(45 + 1 + 40 + 10 + 7);
    expect(seasonPoints({ wins: 2, losses: 8, playoffWins: 0, stateTitle: false, collegeSignees: 1 })).toBe(10 + 8 + 1);
  });

  const team = (id: string, seniorsSigned = 0): Team =>
    ({
      id,
      name: id,
      record: { wins: 8, losses: 2 },
      roster: [
        ...Array.from({ length: seniorsSigned }, () => ({ classYear: 'Senior', recruiting: { isNationalLetterOfIntentSigned: true } })),
        { classYear: 'Junior', recruiting: { isNationalLetterOfIntentSigned: true } }, // early commitments don't count until he graduates
        { classYear: 'Senior', recruiting: { isNationalLetterOfIntentSigned: false } }
      ]
    }) as unknown as Team;

  it('counts playoff games from the bracket (a bye is not a win) and the title', () => {
    const me = team('me', 3);
    const [a, b, c] = [team('a'), team('b'), team('c')];
    const node = (t1: Team, t2: Team, winner: Team, isBye = false) => ({ matchupId: `${t1.id}-${t2.id}`, round: 'AREA' as const, team1: t1, team2: t2, winnerTeamId: winner.id, isBye });
    const bracket = {
      isPlayoffsActive: false,
      roundNames: [],
      currentRoundIndex: 3,
      divisions: [{ name: 'State', rounds: [[node(me, me, me, true)], [node(me, a, me)], [node(b, me, me)], [node(me, c, me)]], championTeamId: 'me' }]
    } as unknown as PlayoffBracketState;
    const season = scoreSeason(me, bracket, 2026);
    expect(season).toMatchObject({ wins: 8, losses: 2, playoffWins: 3, stateTitle: true, collegeSignees: 3 });
    expect(season.points).toBe(40 + 2 + 24 + 10 + 3);
  });

  it('a playoff loss counts as a loss; no bracket means no playoff games', () => {
    const me = team('me');
    const a = team('a');
    const bracket = { divisions: [{ name: 'State', rounds: [[{ matchupId: 'x', round: 'AREA', team1: a, team2: me, winnerTeamId: 'a' }]], championTeamId: 'a' }] } as unknown as PlayoffBracketState;
    expect(scoreSeason(me, bracket, 2026)).toMatchObject({ wins: 8, losses: 3, playoffWins: 0, stateTitle: false });
    expect(scoreSeason(me, null, 2026)).toMatchObject({ losses: 2, playoffWins: 0, stateTitle: false });
  });
});

describe('Leaderboard', () => {
  beforeEach(() => localStorage.clear());

  const career = (id: string, school: string, points: number[], length: Career['length'] = 5): Career => ({
    id,
    coachName: id,
    scenario: 'RECLAIM',
    state: 'Texas',
    startingSchool: school,
    startingProgram: school,
    startedYear: 2026,
    length,
    seasons: points.map((p, i) => ({ year: 2026 + i, school, wins: 0, losses: 0, playoffWins: 0, stateTitle: false, collegeSignees: 0, points: p }))
  });

  it('keeps careers on the device and ranks each starting program by points', () => {
    recordCareer(career('ann', 'Odessa Permian', [40, 60]));
    recordCareer(career('bo', 'Odessa Permian', [90]));
    recordCareer(career('cy', 'Converse Judson', [200]));
    recordCareer(career('ann', 'Odessa Permian', [40, 60, 70])); // the same career, a season later
    expect(loadLocalCareers()).toHaveLength(3);
    expect(localLeaderboard('Odessa Permian', 'Texas').map((e) => [e.coachName, e.points])).toEqual([
      ['ann', 170],
      ['bo', 90]
    ]);
    expect(localLeaderboard().map((e) => e.coachName)).toEqual(['cy', 'ann', 'bo']);
  });

  it('careers only compete with careers of the same length', () => {
    recordCareer(career('ann', 'Odessa Permian', [40, 60], 5));
    recordCareer(career('bo', 'Odessa Permian', [90, 90, 90], 3));
    expect(localLeaderboard('Odessa Permian', 'Texas', 5).map((e) => e.coachName)).toEqual(['ann']);
    expect(localLeaderboard('Odessa Permian', 'Texas', 3).map((e) => e.coachName)).toEqual(['bo']);
  });
});

describe('Scenario careers', () => {
  it('Reclaiming the Crown starts a fallen giant at prestige 72 at most; Powerhouses at 96 or more', () => {
    const store = useGameStore;
    store.getState().newScenarioGame('RECLAIM', 'Texas', 'Odessa Permian', ' Coach Gaines ', 10);
    let s = store.getState();
    let me = s.leagueTeams.find((t) => t.id === s.userTeamId)!;
    expect(me.name).toBe('Odessa Permian');
    expect(me.prestige).toBeLessThanOrEqual(72);
    expect(s.difficulty).toBe('HARD');
    expect(s.career).toMatchObject({ coachName: 'Coach Gaines', scenario: 'RECLAIM', state: 'Texas', startingSchool: 'Odessa Permian', length: 10, seasons: [] });

    store.getState().newScenarioGame('POWERHOUSE', 'Maryland', 'Dr. Henry A. Wise', '', 3);
    s = store.getState();
    me = s.leagueTeams.find((t) => t.id === s.userTeamId)!;
    expect(me.name).toBe('Dr. Henry A. Wise');
    expect(me.prestige).toBeGreaterThanOrEqual(96);
    expect(s.career).toMatchObject({ coachName: 'Coach', startingProgram: 'Wise' });
  });

  it('a classic game has no career', () => {
    useGameStore.getState().newGame('MEDIUM', 'Maryland');
    expect(useGameStore.getState().career).toBeNull();
  });

  it('scores the full year at the banquet', () => {
    localStorage.clear();
    const store = useGameStore;
    store.getState().newScenarioGame('POWERHOUSE', 'Maryland', 'Quince Orchard', 'Tester', 5);
    for (let i = 0; i < 40 && !store.getState().isBanquetActive; i++) store.getState().advanceWeek();
    const { career, userTeamId, leagueTeams, playoffBracket } = store.getState();
    expect(store.getState().isBanquetActive).toBe(true);
    const me = leagueTeams.find((t) => t.id === userTeamId)!;
    expect(career!.seasons).toHaveLength(1);
    const season = career!.seasons[0];
    expect(season).toMatchObject({ year: 2026, school: 'Quince Orchard', wins: me.record.wins, stateTitle: !!playoffBracket?.divisions.some((d) => d.championTeamId === me.id) });
    expect(season.points).toBe(seasonPoints(season));
    expect(careerPoints(career!)).toBe(season.points);
    expect(localLeaderboard('Quince Orchard', 'Maryland')[0]).toMatchObject({ coachName: 'Tester', points: season.points });
  }, 120_000);

  it('a 3-year career ends after its third season', () => {
    const store = useGameStore;
    store.getState().newScenarioGame('POWERHOUSE', 'Maryland', 'Quince Orchard', 'Tester', 3);
    for (let i = 0; i < 200 && !store.getState().careerComplete && !store.getState().firedFrom; i++) {
      if (store.getState().isBanquetActive) store.getState().finishBanquet();
      else store.getState().advanceWeek();
    }
    const { career, careerComplete, currentYear } = store.getState();
    expect(careerComplete).toBe(true);
    expect(career!.seasons.map((s) => s.year)).toEqual([2026, 2027, 2028]);
    expect(currentYear).toBe(2028); // no fourth season starts
  }, 180_000);
});
