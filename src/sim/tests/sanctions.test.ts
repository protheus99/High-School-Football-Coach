import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { applyGameResult, forfeitMostRecentDistrictWin } from '../scheduleEngine';
import { ScheduledGame } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

describe('Forfeits', () => {
  it('turns the most recent district win into a 1-0 loss for both records', () => {
    const [team, oppA, oppB] = generateDistrictTeams();
    const schedule: ScheduledGame[] = [
      { gameId: 'g8', week: 8, homeTeamId: team.id, awayTeamId: oppA.id, isDistrictGame: true, homeScore: 21, awayScore: 14 },
      { gameId: 'g9', week: 9, homeTeamId: oppB.id, awayTeamId: team.id, isDistrictGame: true, homeScore: 10, awayScore: 35 }
    ];
    applyGameResult(team, oppA, 21, 14, true);
    applyGameResult(oppB, team, 10, 35, true);

    const forfeited = forfeitMostRecentDistrictWin(schedule, [team, oppA, oppB], team.id);

    expect(forfeited?.week).toBe(9);
    expect(team.record.districtWins).toBe(1);
    expect(team.record.districtLosses).toBe(1);
    expect(oppB.record.districtWins).toBe(1);
    expect(oppB.record.districtLosses).toBe(0);
    expect(team.record.districtPointDifferential).toBe(7 - 1); // +7 kept, +17 replaced by -1
    expect(oppB.record.headToHeadHistory[team.id].won).toBe(true);
  });
});

describe('State association sanctions', () => {
  it('escalate weekly while compliance stays below 40, ending in a postseason ban', () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId } = useGameStore.getState();
    const team = () => useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;

    while (useGameStore.getState().currentWeek < 14) {
      team().programMeters.complianceScore = 10; // keep the program in violation
      useGameStore.getState().advanceWeek();
    }
    expect(useGameStore.getState().sanctionLevel).toBe(3);
    expect(useGameStore.getState().newsArticles.some((a) => a.headline.startsWith('Postseason Ban'))).toBe(true);

    useGameStore.getState().advanceWeek(); // week 14 -> postseason
    const bracket = useGameStore.getState().playoffBracket!;
    const bracketIds = bracket.bracket.biDistrict.flatMap((n) => [n.team1.id, n.team2.id]);
    expect(bracketIds).not.toContain(userTeamId);
    expect(new Set(bracketIds).size).toBe(16);
  });

  it('do not escalate while compliance is healthy', () => {
    useGameStore.getState().startNewSeason();
    for (let i = 0; i < 10; i++) useGameStore.getState().advanceWeek();
    expect(useGameStore.getState().sanctionLevel).toBe(0);
  });
});
