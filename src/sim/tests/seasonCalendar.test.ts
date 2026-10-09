import { describe, it, expect, vi } from 'vitest';
import { getSeasonPhase, SEASON_PHASE_LABELS } from '../scheduleEngine';
import { seasonLength } from '../league';
import { useGameStore } from '../../store/gameStore';
import { TEMPLATES } from '../dilemmaTemplates';
import { generateDistrictTeams } from '../../generators/rosterGenerator';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));

describe('Season calendar', () => {
  it('labels every week of a 6-round playoff season: 4 pre season, 3 camp, games, post season, 4 off season', () => {
    const labels = Array.from({ length: 28 }, (_, i) => SEASON_PHASE_LABELS[getSeasonPhase(i + 1)]);
    const count = (label: string) => labels.filter((l) => l === label).length;
    expect(labels.slice(0, 4).every((l) => l === 'Pre Season')).toBe(true);
    expect(labels.slice(4, 7).every((l) => l === 'Training Camp')).toBe(true);
    expect(count('Regular Season Non District')).toBe(3);
    expect(count('Regular Season District')).toBe(7);
    expect(count('Playoffs')).toBe(6);
    expect(labels[23]).toBe('Post Season');
    expect(labels.slice(24).every((l) => l === 'Off Season')).toBe(true);
  });

  it('goes banquet (post season) -> off-season week -> next year', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    const { league, currentYear } = store.getState();
    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    expect(getSeasonPhase(store.getState().currentWeek)).toBe('POST_SEASON');

    store.getState().finishBanquet();
    expect(store.getState().isBanquetActive).toBe(false);
    expect(getSeasonPhase(store.getState().currentWeek)).toBe('OFF_SEASON');
    // Four off-season weeks (no second banquet), then the new year
    while (store.getState().currentWeek < seasonLength(league!)) {
      store.getState().advanceWeek();
      expect(store.getState().isBanquetActive).toBe(false);
      expect(getSeasonPhase(store.getState().currentWeek)).toBe('OFF_SEASON');
    }

    store.getState().advanceWeek();
    expect(store.getState().currentYear).toBe(currentYear + 1);
    expect(store.getState().currentWeek).toBe(1);
  });

  it('publishes new team and schedule arrays every week so standings and the scoreboard refresh', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    while (store.getState().currentWeek < 6) store.getState().advanceWeek();
    const teams = store.getState().leagueTeams;
    const schedule = store.getState().seasonSchedule;
    store.getState().advanceWeek(); // week 6 games are played
    expect(store.getState().leagueTeams).not.toBe(teams);
    expect(store.getState().seasonSchedule).not.toBe(schedule);
    // Week 14 -> 15 starts the playoffs through an early return: still refreshed
    while (store.getState().currentWeek < 14) store.getState().advanceWeek();
    const before = store.getState().leagueTeams;
    store.getState().advanceWeek();
    expect(store.getState().leagueTeams).not.toBe(before);
  });

  it('trains every week with the chosen intensity: camp counts double, the post season not at all', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    while (store.getState().currentWeek < 5) store.getState().advanceWeek();
    store.getState().setPracticeIntensity('FULL');
    store.getState().advanceWeek(); // camp week 1
    const camp = store.getState().lastTrainingReport!;
    expect(camp).toMatchObject({ week: 5, intensity: 'FULL', multiplier: 2 });
    expect(camp.skillPoints).toBeGreaterThan(0);
    store.getState().setPracticeIntensity('WEEK_OFF');
    store.getState().advanceWeek(); // camp week 2: rest, no gains
    expect(store.getState().lastTrainingReport).toMatchObject({ week: 6, intensity: 'WEEK_OFF', skillPoints: 0, injured: [] });
    while (store.getState().currentWeek < 9) store.getState().advanceWeek();
    expect(store.getState().lastTrainingReport).toMatchObject({ week: 8, multiplier: 1 });
  });

  it('holds feeder signing day at the end of pre season week 2 from the second season on', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    const firstYear = store.getState().currentYear;
    expect(store.getState().feederClassYear).toBe(firstYear + 1);
    store.getState().transitionToNextYear(); // year 2, week 1: seniors graduated, no newcomers yet
    const team = () => store.getState().leagueTeams.find((t) => t.id === store.getState().userTeamId)!;
    const before = team().roster.length;
    expect(team().roster.some((p) => p.classYear === 'Freshman')).toBe(false);
    store.getState().advanceWeek(); // week 1 -> 2
    expect(store.getState().lastFeederResults).toBeNull();
    store.getState().advanceWeek(); // signing day
    expect(store.getState().lastFeederResults).not.toBeNull();
    expect(team().roster.length).toBeGreaterThan(before);
    expect(team().roster.some((p) => p.classYear === 'Freshman')).toBe(true);
    expect(store.getState().feederClassYear).toBe(firstYear + 2);
  }, 60000);

  it('keeps dilemmas in their season phase: midterms only on in-season report-card weeks, playoffs only in the playoffs', () => {
    const [team] = generateDistrictTeams();
    team.roster.forEach((p) => (p.academics.gpa = 2.0)); // every starter is struggling
    const grades = TEMPLATES.find((t) => t.id === 'GRADE_CRISIS')!;
    const gradeWeeks = Array.from({ length: 28 }, (_, i) => i + 1).filter((w) => grades.appliesTo(team, w) !== null);
    expect(gradeWeeks).toEqual([9, 12, 15, 18, 21]);
    const tickets = TEMPLATES.find((t) => t.id === 'PLAYOFF_TICKET_SCALPING')!;
    expect(Array.from({ length: 28 }, (_, i) => i + 1).filter((w) => tickets.appliesTo(team, w) !== null)).toEqual([18, 19, 20, 21, 22, 23]);
    const heat = TEMPLATES.find((t) => t.id === 'HEAT_ADVISORY')!;
    expect(Array.from({ length: 28 }, (_, i) => i + 1).filter((w) => heat.appliesTo(team, w) !== null)).toEqual([5, 6, 7, 8]);
  });

  it('every state plays its title game in week 23: a five-round state has an open week 18', async () => {
    const { getUserMatchup } = await import('../userMatchup');
    for (const [state, firstWeek] of [['Texas', 18], ['Georgia', 19]] as const) {
      const store = useGameStore;
      store.getState().newGame('MEDIUM', state);
      while (store.getState().currentWeek < 18) store.getState().advanceWeek();
      const bracket = store.getState().playoffBracket!;
      expect(bracket.firstWeek).toBe(firstWeek);
      if (firstWeek === 19) {
        expect(getUserMatchup(store.getState())).toBeUndefined(); // no game in the open week
        store.getState().advanceWeek();
        expect(store.getState().playoffBracket!.currentRoundIndex).toBe(0); // the open week plays no round
      }
      while (!store.getState().isBanquetActive) store.getState().advanceWeek();
      expect(store.getState().currentWeek).toBe(24);
      expect(seasonLength(store.getState().league!)).toBe(28);
    }
  }, 120000);
});
