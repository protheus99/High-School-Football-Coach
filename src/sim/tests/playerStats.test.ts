import { describe, it, expect } from 'vitest';
import { simulateSnap } from '../matchEngine';
import { simulateMacroMatch } from '../macroSim';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { addPlayerStats, createEmptyPlayerStats } from '../playerStats';
import { useGameStore } from '../../store/gameStore';
import { DefensiveCall, GameSimulationState, PlayConcept, PlayerStats, Team } from '../../types/game';

function newGame(home: Team, away: Team): GameSimulationState {
  return {
    gameId: 'stats_test',
    homeTeam: home,
    awayTeam: away,
    homeScore: 0,
    awayScore: 0,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: 1,
    clockSecondsRemaining: 720,
    possessionTeamId: away.id,
    down: 1,
    distance: 10,
    yardLine: 25,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
}

function teamTotals(team: Team, lines: Record<string, PlayerStats>): PlayerStats {
  const total = createEmptyPlayerStats();
  team.roster.forEach((p) => lines[p.id] && addPlayerStats(total, lines[p.id]));
  return total;
}

describe('Per-player game stats', () => {
  it('credits every pass, catch and interception consistently', () => {
    for (let i = 0; i < 100; i++) {
      const [home, away] = generateDistrictTeams();
      const state = newGame(home, away);
      while (!state.isGameOver) simulateSnap(state);

      for (const [team, opponent] of [[home, away], [away, home]]) {
        const t = teamTotals(team, state.playerGameStats ?? {});
        const o = teamTotals(opponent, state.playerGameStats ?? {});
        expect(t.passYards).toBe(t.receivingYards);
        expect(t.passCompletions).toBe(t.receptions);
        expect(t.passTDs).toBe(t.receivingTDs);
        expect(t.interceptionsThrown).toBe(o.interceptionsCaught);
        expect(t.passCompletions).toBeLessThanOrEqual(t.passAttempts);
      }
    }
  });

  it('spreads the ball around instead of crediting one receiver and one runner', () => {
    const [home, away] = generateDistrictTeams();
    const state = { ...newGame(home, away), offensiveGamePlan: { [home.id]: 'SPREAD' as const } }; // a passing offense
    while (!state.isGameOver) simulateSnap(state);
    const lines = state.playerGameStats ?? {};
    const receivers = home.roster.filter((p) => (lines[p.id]?.receptions ?? 0) > 0);
    const tacklers = away.roster.filter((p) => (lines[p.id]?.tackles ?? 0) > 0);
    expect(receivers.length).toBeGreaterThan(1);
    expect(tacklers.length).toBeGreaterThan(2);
  });
});

describe('Defensive play calls', () => {
  // One fixed matchup so the calls are compared against the same personnel
  const [offense, defense] = generateDistrictTeams();
  const averageGain = (concept: PlayConcept, call: DefensiveCall) => {
    let total = 0;
    const trials = 3000;
    for (let i = 0; i < trials; i++) {
      const state = { ...newGame(offense, defense), possessionTeamId: offense.id, yardLine: 30 };
      total += simulateSnap(state, concept, call).event.yardsGained;
    }
    return total / trials;
  };

  it('Run Blitz stops runs better than Pass Coverage does', () => {
    expect(averageGain('INSIDE_RUN', 'RUN_BLITZ')).toBeLessThan(averageGain('INSIDE_RUN', 'PASS_COVERAGE'));
  });

  it('Pass Coverage stops deep passes better than Run Blitz does', () => {
    expect(averageGain('DEEP_PASS', 'PASS_COVERAGE')).toBeLessThan(averageGain('DEEP_PASS', 'RUN_BLITZ'));
  });

  it('uses the pre-game defensive plan when no call is chosen', () => {
    const state = { ...newGame(offense, defense), possessionTeamId: offense.id, defensiveGamePlan: { [defense.id]: 'RUN_BLITZ' as DefensiveCall } };
    expect(simulateSnap(state, 'INSIDE_RUN').event.defensiveCall).toBe('RUN_BLITZ');
  });
});

describe('AI vs. AI macro-sim player stats', () => {
  it('distributes team yardage to individual players', () => {
    const [home, away] = generateDistrictTeams();
    const box = simulateMacroMatch('macro_stats', 5, home, away);
    const sum = (team: Team, key: keyof PlayerStats) => team.roster.reduce((s, p) => s + p.stats[key], 0);
    expect(sum(home, 'passYards')).toBe(box.teamTotals.homePassYards);
    expect(sum(home, 'receivingYards')).toBe(box.teamTotals.homePassYards);
    expect(sum(away, 'rushYards')).toBe(box.teamTotals.awayRushYards);
    expect(sum(home, 'tackles')).toBeGreaterThan(0);
  });
});

describe('Recording a finished live game', () => {
  it('updates team records and adds game stats to season totals', () => {
    const [home, away] = generateDistrictTeams();
    useGameStore.setState({
      districtTeams: [home, away],
      leagueTeams: [home, away],
      userTeamId: home.id,
      playoffBracket: null,
      currentWeek: 8,
      seasonSchedule: [{ gameId: 'g8', week: 8, homeTeamId: home.id, awayTeamId: away.id, isDistrictGame: true }]
    });

    const qb = home.roster.find((p) => p.position === 'QB' && p.depthChartTier === 1)!;
    const before = qb.stats.passYards;
    const finalState: GameSimulationState = {
      ...newGame(structuredClone(home), structuredClone(away)),
      homeScore: 28,
      awayScore: 14,
      isGameOver: true,
      playerGameStats: { [qb.id]: { ...createEmptyPlayerStats(), passAttempts: 20, passCompletions: 12, passYards: 180 } }
    };

    useGameStore.getState().recordUserGame(finalState);
    const teams = useGameStore.getState().districtTeams;
    const storedHome = teams.find((t) => t.id === home.id)!;
    const storedAway = teams.find((t) => t.id === away.id)!;
    const storedQb = storedHome.roster.find((p) => p.id === qb.id)!;

    expect(storedHome.record.wins).toBe(1);
    expect(storedAway.record.losses).toBe(1);
    expect(storedHome.record.pointsFor).toBe(28);
    expect(storedQb.stats.passYards).toBe(before + 180);
    expect(storedQb.stats.gamesPlayed).toBe(1);
    expect(storedHome.record.districtWins).toBe(1);
    expect(useGameStore.getState().seasonSchedule[0].homeScore).toBe(28);
  });
});
