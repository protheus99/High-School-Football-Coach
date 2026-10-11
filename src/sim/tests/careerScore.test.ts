import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SCENARIOS } from '../../data/scenarios';
import { PLAYABLE_STATES } from '../stateRules';
import { stateSchool } from '../league';
import { Career, careerPoints, prestigeMultiplier, scoreSeason, seasonPoints } from '../careerScore';
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

describe('Hall of Fame', () => {
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

  it('keeps careers on the device and ranks every program together by points', () => {
    recordCareer(career('ann', 'Odessa Permian', [40, 60]));
    recordCareer(career('bo', 'Odessa Permian', [90]));
    recordCareer(career('cy', 'Converse Judson', [200]));
    recordCareer(career('ann', 'Odessa Permian', [40, 60, 70])); // the same career, a season later
    expect(loadLocalCareers()).toHaveLength(3);
    expect(localLeaderboard(5).map((e) => [e.coachName, e.points])).toEqual([
      ['cy', 200],
      ['ann', 170],
      ['bo', 90]
    ]);
  });

  it('careers only compete with careers of the same length', () => {
    recordCareer(career('ann', 'Odessa Permian', [40, 60], 5));
    recordCareer(career('bo', 'Odessa Permian', [90, 90, 90], 3));
    expect(localLeaderboard(5).map((e) => e.coachName)).toEqual(['ann']);
    expect(localLeaderboard(3).map((e) => e.coachName)).toEqual(['bo']);
  });

  it('scales the score up for programs that started with less prestige', () => {
    expect(prestigeMultiplier(99)).toBe(1);
    expect(prestigeMultiplier(87)).toBeCloseTo(1.12);
    expect(prestigeMultiplier(58)).toBeCloseTo(1.41);
    expect(prestigeMultiplier(undefined)).toBe(1); // careers from before the bonus
    const low = { ...career('dee', 'Abilene Cooper', [100, 100]), startingPrestige: 58 };
    expect(careerPoints(low)).toBe(282);
    recordCareer(low);
    recordCareer({ ...career('ed', 'Allen', [130, 130]), startingPrestige: 97 });
    expect(localLeaderboard(5).map((e) => [e.coachName, e.points, e.startingPrestige])).toEqual([
      ['dee', 282, 58],
      ['ed', 265, 97]
    ]);
  });

  it('a national title is worth 15', () => {
    const s = { wins: 10, losses: 0, playoffWins: 4, stateTitle: true, nationalTitle: true, collegeSignees: 0 };
    expect(seasonPoints(s)).toBe(50 + 32 + 10 + 15);
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
    expect(career!.startingPrestige).toBeGreaterThanOrEqual(96);
    expect(careerPoints(career!)).toBe(Math.round(season.points * prestigeMultiplier(career!.startingPrestige)));
    expect(localLeaderboard(5)[0]).toMatchObject({ coachName: 'Tester', points: careerPoints(career!) });
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
    expect(store.getState().jobOffers).toHaveLength(3);
    expect(store.getState().jobOffers.every((o) => o.teamId !== store.getState().userTeamId)).toBe(true);
  }, 180_000);

  it('a contract ends with offers: a new job is a new Hall of Fame entry at the new school', () => {
    const store = useGameStore;
    store.getState().newScenarioGame('OPEN', 'Maryland', 'Quince Orchard', 'Tester', 3);
    const play = (until: () => boolean) => {
      for (let i = 0; i < 200 && !until() && !store.getState().firedFrom; i++) {
        if (store.getState().isBanquetActive) store.getState().finishBanquet();
        else store.getState().advanceWeek();
      }
    };
    play(() => store.getState().careerComplete);
    const first = store.getState().career!;
    const oldId = store.getState().userTeamId;
    const offer = store.getState().jobOffers[store.getState().jobOffers.length - 1];
    store.getState().acceptJob(offer.teamId, 5);
    let s = store.getState();
    expect(s.careerComplete).toBe(false);
    expect(s.currentYear).toBe(2029);
    expect(s.userTeamId).toBe(offer.teamId);
    expect(s.districtTeams.map((t) => t.id)).toContain(offer.teamId);
    expect(s.leagueTeams.find((t) => t.id === oldId)!.staff.headCoachName).not.toBe('Coach Tester');
    expect(s.leagueTeams.find((t) => t.id === offer.teamId)!.staff.headCoachName).toBe('Coach Tester');
    expect(s.careerHistory.map((c) => c.id)).toEqual([first.id]);
    expect(s.career).toMatchObject({ scenario: 'OPEN', startingSchool: offer.name, length: 5, startedYear: 2029, coachId: first.coachId, seasons: [] });
    expect(s.career!.startingPrestige).toBe(s.leagueTeams.find((t) => t.id === offer.teamId)!.prestige);
    expect(s.career!.token).not.toBe(first.token);

    // The next season is played and scored at the new school
    play(() => store.getState().isBanquetActive);
    s = store.getState();
    expect(s.career!.seasons).toHaveLength(1);
    expect(s.career!.seasons[0].school).toBe(offer.name);
    expect(localLeaderboard(3).some((e) => e.careerId === first.id)).toBe(true);
    expect(localLeaderboard(5).some((e) => e.careerId === s.career!.id)).toBe(true);
  }, 240_000);

  it('an extension keeps the school and starts a new entry', () => {
    const store = useGameStore;
    store.getState().newScenarioGame('POWERHOUSE', 'Maryland', 'Quince Orchard', 'Tester', 3);
    for (let i = 0; i < 200 && !store.getState().careerComplete && !store.getState().firedFrom; i++) {
      if (store.getState().isBanquetActive) store.getState().finishBanquet();
      else store.getState().advanceWeek();
    }
    const first = store.getState().career!;
    const teamId = store.getState().userTeamId;
    store.getState().extendContract(3);
    const s = store.getState();
    expect(s.userTeamId).toBe(teamId);
    expect(s.career).toMatchObject({ scenario: 'POWERHOUSE', startingSchool: 'Quince Orchard', length: 3, startedYear: 2029, seasons: [] });
    expect(s.career!.id).not.toBe(first.id);
    expect(s.careerHistory).toHaveLength(1);
    expect(s.currentYear).toBe(2029);
  }, 180_000);
});
