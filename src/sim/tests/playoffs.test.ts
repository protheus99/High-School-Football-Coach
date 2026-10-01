import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams, NEIGHBOR_DISTRICT_SCHOOLS, PLAYOFF_REGION_DISTRICT_SCHOOLS } from '../../generators/rosterGenerator';
import { simulateRegularSeason } from '../scheduleEngine';
import { calculateDistrictStandings } from '../districtEngine';
import { advancePlayoffRound, buildInitialPlayoffBracket, getRoundNodes, recordPlayoffResult } from '../playoffEngine';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

function fourDistricts() {
  const districts = [undefined, NEIGHBOR_DISTRICT_SCHOOLS, ...PLAYOFF_REGION_DISTRICT_SCHOOLS].map((schools, i) =>
    schools ? generateDistrictTeams(`tx_6a_d${25 + i}`, schools) : generateDistrictTeams()
  );
  simulateRegularSeason(districts[0], districts[1], 2026);
  simulateRegularSeason(districts[2], districts[3], 2026);
  return districts;
}

describe('16-team state playoff bracket', () => {
  it('seeds 16 different teams, 1 vs 4 and 2 vs 3 across paired districts', () => {
    const districts = fourDistricts();
    const bracket = buildInitialPlayoffBracket(districts);
    const nodes = bracket.bracket.biDistrict;
    const ids = nodes.flatMap((n) => [n.team1.id, n.team2.id]);

    expect(nodes).toHaveLength(8);
    expect(new Set(ids).size).toBe(16);

    const seedsA = calculateDistrictStandings(districts[0]).map((r) => r.teamId);
    const seedsB = calculateDistrictStandings(districts[1]).map((r) => r.teamId);
    expect(nodes[0].team1.id).toBe(seedsA[0]);
    expect(nodes[0].team2.id).toBe(seedsB[3]);
    expect(nodes[1].team1.id).toBe(seedsB[1]);
    expect(nodes[1].team2.id).toBe(seedsA[2]);
  });

  it('advances winners round by round and crowns one champion', () => {
    let bracket = buildInitialPlayoffBracket(fourDistricts());
    const expectedSizes = [8, 4, 2, 1];

    for (const size of expectedSizes) {
      const nodes = getRoundNodes(bracket);
      expect(nodes).toHaveLength(size);
      const roundBefore = bracket.currentRound;
      bracket = advancePlayoffRound(bracket);
      const winners = nodes.map((n) => n.winnerTeamId);
      expect(winners.every(Boolean)).toBe(true);

      if (size > 1) {
        const next = getRoundNodes(bracket).flatMap((n) => [n.team1.id, n.team2.id]);
        expect(next).toEqual(winners);
        expect(bracket.currentRound).not.toBe(roundBefore);
      }
    }

    expect(bracket.isPlayoffsActive).toBe(false);
    expect(bracket.stateChampionTeamId).toBe(bracket.bracket.stateFinal[0].winnerTeamId);
    expect(bracket.championshipVenue).toBeTruthy();
  });

  it("respects the user's live result", () => {
    let bracket = buildInitialPlayoffBracket(fourDistricts());
    const userNode = bracket.bracket.biDistrict[3];
    const userId = userNode.team1.id;

    bracket = recordPlayoffResult(bracket, userId, { homeScore: 7, awayScore: 35 }); // user (home) loses
    bracket = advancePlayoffRound(bracket, userId);

    expect(userNode.winnerTeamId).toBe(userNode.team2.id);
    expect(getRoundNodes(bracket).some((n) => n.team1.id === userId || n.team2.id === userId)).toBe(false);
  });

  it('requires four districts', () => {
    expect(() => buildInitialPlayoffBracket([generateDistrictTeams()])).toThrow();
  });
});

describe('Postseason through the store', () => {
  it('finishes the tournament and reaches the banquet whether or not the user plays', () => {
    useGameStore.getState().startNewSeason();
    while (useGameStore.getState().currentWeek < 19) {
      useGameStore.getState().advanceWeek();
    }

    const { playoffBracket, isBanquetActive } = useGameStore.getState();
    expect(playoffBracket?.isPlayoffsActive).toBe(false);
    expect(playoffBracket?.stateChampionTeamId).toBeTruthy();
    expect(isBanquetActive).toBe(true);
  });
});
