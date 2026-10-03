import { describe, it, expect, vi } from 'vitest';
import { getSeasonPhase, SEASON_PHASE_LABELS } from '../scheduleEngine';
import { playoffRoundCount, seasonLength } from '../league';
import { useGameStore } from '../../store/gameStore';
import { dilemmaCalendarWeek } from '../dilemmaEngine';
import { ASSISTANT_DRILLS_PER_WEEK } from '../drillEngine';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));

describe('Season calendar', () => {
  it('labels every week of a 6-round playoff season: 4 pre season, 3 camp, games, post season, 4 off season', () => {
    const labels = Array.from({ length: 28 }, (_, i) => SEASON_PHASE_LABELS[getSeasonPhase(i + 1, 6)]);
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
    const rounds = playoffRoundCount(league!);
    while (!store.getState().isBanquetActive) store.getState().advanceWeek();
    expect(getSeasonPhase(store.getState().currentWeek, rounds)).toBe('POST_SEASON');

    store.getState().finishBanquet();
    expect(store.getState().isBanquetActive).toBe(false);
    expect(getSeasonPhase(store.getState().currentWeek, rounds)).toBe('OFF_SEASON');
    // Four off-season weeks (no second banquet), then the new year
    while (store.getState().currentWeek < seasonLength(league!)) {
      store.getState().advanceWeek();
      expect(store.getState().isBanquetActive).toBe(false);
      expect(getSeasonPhase(store.getState().currentWeek, rounds)).toBe('OFF_SEASON');
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

  it('runs training camp: two-a-days double the drill reps, three-a-days triple them', () => {
    const store = useGameStore;
    store.getState().startNewSeason();
    while (store.getState().currentWeek < 5) store.getState().advanceWeek();
    store.getState().setCampSchedule('TWO_A_DAY');
    store.getState().advanceWeek(); // camp week 1
    expect(store.getState().lastDrillReport.filter((l) => !l.startsWith('Three-a-days')).length).toBe(ASSISTANT_DRILLS_PER_WEEK * 2);
    store.getState().setCampSchedule('THREE_A_DAY');
    store.getState().advanceWeek(); // camp week 2
    expect(store.getState().lastDrillReport.filter((l) => !l.startsWith('Three-a-days')).length).toBe(ASSISTANT_DRILLS_PER_WEEK * 3);
    store.getState().advanceWeek(); // camp week 3 (depth chart week)
    store.getState().advanceWeek(); // first game week: normal reps
    expect(store.getState().lastDrillReport.length).toBe(ASSISTANT_DRILLS_PER_WEEK);
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

  it('maps real weeks onto the dilemma library calendar', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 17, 18].map(dilemmaCalendarWeek)).toEqual([1, 1, 2, 2, 3, 4, 4, 5, 14, 15]);
  });
});
