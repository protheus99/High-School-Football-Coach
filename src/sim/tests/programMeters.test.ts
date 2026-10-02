import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { simulateMacroMatch } from '../macroSim';
import { boardCpModifier, boardReview, pickSuspension, suspensionChance } from '../programMeters';
import { weeklyCpIncome } from '../coachPoints';
import { useGameStore } from '../../store/gameStore';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));

describe('Discipline', () => {
  it('undisciplined teams turn the ball over more in simulated games', () => {
    const [a, b] = generateDistrictTeams();
    const turnovers = (discipline: number) => {
      a.programMeters.lockerRoomDiscipline = discipline;
      b.programMeters.lockerRoomDiscipline = discipline;
      let total = 0;
      for (let i = 0; i < 1500; i++) total += simulateMacroMatch(`g${i}`, 6, a, b).teamTotals.homeTurnovers;
      return total / 1500;
    };
    expect(turnovers(20)).toBeGreaterThan(turnovers(90) + 0.3);
  });

  it('suspends starters only below 50', () => {
    expect(suspensionChance(60)).toBe(0);
    expect(suspensionChance(20)).toBeGreaterThan(0.4);
    const [team] = generateDistrictTeams();
    team.programMeters.lockerRoomDiscipline = 80;
    for (let i = 0; i < 200; i++) expect(pickSuspension(team)).toBeUndefined();
  });
});

describe('Board Trust', () => {
  it('raises or cuts the weekly Coach Points', () => {
    expect(boardCpModifier(85)).toBe(10);
    expect(boardCpModifier(30)).toBe(-10);
    expect(weeklyCpIncome(6, [], 85)).toBe(50);
    expect(weeklyCpIncome(6, [], 30)).toBe(30);
  });

  it('puts the coach on the hot seat, then fires him after a second bad season', () => {
    expect(boardReview(50, true)).toBe('SECURE');
    expect(boardReview(30, false)).toBe('HOT_SEAT');
    expect(boardReview(30, true)).toBe('FIRED');

    const store = useGameStore;
    store.getState().startNewSeason();
    const team = () => store.getState().leagueTeams.find((t) => t.id === store.getState().userTeamId)!;
    team().programMeters.schoolBoardTrust = 20;
    store.getState().transitionToNextYear();
    expect(store.getState().onHotSeat).toBe(true);
    expect(store.getState().firedFrom).toBeNull();
    expect(store.getState().newsArticles[0].headline).toMatch(/Hot Seat/);

    team().programMeters.schoolBoardTrust = 20;
    const year = store.getState().currentYear;
    store.getState().transitionToNextYear();
    expect(store.getState().firedFrom).toBe(team().name);
    expect(store.getState().currentYear).toBe(year); // no new season
  }, 60000);
});
