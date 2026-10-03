import { describe, it, expect, vi } from 'vitest';
import { LAST_REGULAR_SEASON_WEEK, simulateRegularSeason } from '../scheduleEngine';
import { calculateDistrictStandings } from '../districtEngine';
import { buildCustomLeague, buildTexasLeague, leagueRegionTeams, LeagueStructure } from '../league';
import { advancePlayoffRound, buildPlayoffBracket, findUserNode, recordPlayoffResult } from '../playoffEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { Team } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

function playedWorld(build: () => { league: LeagueStructure; teams: Team[] }) {
  const { league, teams } = build();
  const regions = leagueRegionTeams(league, teams);
  simulateRegularSeason(regions, 2026);
  return { league, teams, regions: league.regions.map((r, i) => ({ name: r.name, districts: regions[i] })) };
}

describe('Texas 6A state playoffs (UIL Division 1 / Division 2)', () => {
  const { league, regions } = playedWorld(buildTexasLeague);
  const bracket = buildPlayoffBracket(regions, { splitDivisions: league.splitDivisions });
  const firstRoundTeams = (d: number) => bracket.divisions[d].rounds[0].flatMap((n) => [n.team1, n.team2]);

  it('qualifies the top four of all 32 districts: 64 teams in each division', () => {
    expect(bracket.divisions.map((d) => d.name)).toEqual(['Division 1', 'Division 2']);
    expect(bracket.roundNames).toEqual(['BI_DISTRICT', 'AREA', 'REGIONAL_SEMIFINAL', 'REGIONAL_FINAL', 'STATE_SEMIFINAL', 'STATE_FINAL']);
    for (const d of [0, 1]) {
      expect(bracket.divisions[d].rounds[0]).toHaveLength(32);
      expect(new Set(firstRoundTeams(d).map((t) => t.id)).size).toBe(64);
    }
    const all = new Set([...firstRoundTeams(0), ...firstRoundTeams(1)].map((t) => t.id));
    expect(all.size).toBe(128);
  });

  it('sends each district’s two largest qualifiers to Division 1 and the district champion hosts', () => {
    for (const region of regions) {
      for (const district of region.districts) {
        const top4 = calculateDistrictStandings(district).slice(0, 4).map((r) => r.teamId);
        const d1 = firstRoundTeams(0).filter((t) => top4.includes(t.id));
        const d2 = firstRoundTeams(1).filter((t) => top4.includes(t.id));
        expect(d1).toHaveLength(2);
        expect(d2).toHaveLength(2);
        expect(Math.min(...d1.map((t) => t.enrollment!))).toBeGreaterThanOrEqual(Math.max(...d2.map((t) => t.enrollment!)));
      }
    }
    // First-round hosts are district champions within their division
    bracket.divisions[0].rounds[0].forEach((node) => {
      const district = regions.flatMap((r) => r.districts).find((d) => d.some((t) => t.id === node.team1.id))!;
      const d1Seeds = calculateDistrictStandings(district).slice(0, 4).map((r) => r.teamId).filter((id) => firstRoundTeams(0).some((t) => t.id === id));
      expect(node.team1.id).toBe(d1Seeds[0]);
    });
  });

  it('plays six rounds, pairing adjacent winners, to a champion in each division', () => {
    let state = buildPlayoffBracket(regions, { splitDivisions: true });
    for (let round = 0; round < 6; round++) {
      const before = state.divisions.map((d) => d.rounds[round]);
      state = advancePlayoffRound(state);
      state.divisions.forEach((division, d) => {
        const winners = before[d].map((n) => n.winnerTeamId);
        expect(winners.every(Boolean)).toBe(true);
        if (round < 5) {
          expect(division.rounds[round + 1].flatMap((n) => [n.team1.id, n.team2.id])).toEqual(winners);
        }
      });
    }
    expect(state.isPlayoffsActive).toBe(false);
    state.divisions.forEach((d) => expect(d.championTeamId).toBe(d.rounds[5][0].winnerTeamId));
  });

  it('keeps region games inside their region until the state semifinals', () => {
    let state = buildPlayoffBracket(regions, { splitDivisions: true });
    for (let round = 0; round < 3; round++) state = advancePlayoffRound(state);
    state.divisions.forEach((d) => d.rounds[3].forEach((node) => expect(node.region).toBeDefined())); // regional finals
    state = advancePlayoffRound(state);
    state.divisions.forEach((d) => d.rounds[4].forEach((node) => expect(node.region).toBeUndefined())); // state semifinals
  });

  it("respects the user's live result", () => {
    let state = buildPlayoffBracket(regions, { splitDivisions: true });
    const userNode = state.divisions[1].rounds[0][5];
    const userId = userNode.team1.id;
    state = recordPlayoffResult(state, userId, { homeScore: 7, awayScore: 35 });
    state = advancePlayoffRound(state);
    expect(userNode.winnerTeamId).toBe(userNode.team2.id);
    expect(findUserNode(state, userId)).toBeUndefined();
  });
});

describe('Custom-world playoffs', () => {
  it('build a single 16-team bracket with four rounds', () => {
    const { league, regions } = playedWorld(() => buildCustomLeague(generateDistrictTeams('custom', undefined), 'Custom'));
    let state = buildPlayoffBracket(regions, { splitDivisions: league.splitDivisions });
    expect(state.divisions).toHaveLength(1);
    expect(state.roundNames).toEqual(['BI_DISTRICT', 'AREA', 'REGIONAL_FINAL', 'STATE_FINAL']);
    expect(new Set(state.divisions[0].rounds[0].flatMap((n) => [n.team1.id, n.team2.id])).size).toBe(16);
    for (let i = 0; i < 4; i++) state = advancePlayoffRound(state);
    expect(state.divisions[0].championTeamId).toBeTruthy();
  });
});

describe('Postseason through the store', () => {
  it('runs the Texas playoffs in weeks 18-23 and reaches the banquet in week 24', () => {
    useGameStore.getState().startNewSeason();
    while (!useGameStore.getState().isBanquetActive && useGameStore.getState().currentWeek < 40) {
      useGameStore.getState().advanceWeek();
    }
    const { playoffBracket, isBanquetActive, currentWeek } = useGameStore.getState();
    expect(isBanquetActive).toBe(true);
    expect(currentWeek).toBe(LAST_REGULAR_SEASON_WEEK + 6 + 1);
    expect(playoffBracket?.isPlayoffsActive).toBe(false);
    playoffBracket!.divisions.forEach((d) => expect(d.championTeamId).toBeTruthy());
  }, 120000);
});
