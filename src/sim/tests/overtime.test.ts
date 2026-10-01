import { describe, it, expect } from 'vitest';
import { simulateSnap } from '../matchEngine';
import { simulateMacroMatch } from '../macroSim';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState } from '../../types/game';

/** A game tied 21-21 with one second left: the next snap ends regulation. */
function tiedAtEndOfRegulation(): GameSimulationState {
  const [home, away] = generateDistrictTeams();
  return {
    gameId: 'ot_test',
    homeTeam: home,
    awayTeam: away,
    homeScore: 21,
    awayScore: 21,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 5,
    teamMomentum: 0,
    currentQuarter: 4,
    clockSecondsRemaining: 1,
    possessionTeamId: home.id,
    down: 1,
    distance: 10,
    yardLine: 30,
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
}

/** The final regulation snap occasionally scores (long TD, pick-six, safety); those games never reach overtime. */
const reachedOvertime = (state: GameSimulationState) => state.eventLog.some((e) => e.textCommentary.includes('END OF REGULATION'));

function playOut(state: GameSimulationState): GameSimulationState {
  for (let snaps = 0; !state.isGameOver; snaps++) {
    if (snaps > 2000) throw new Error('Overtime never ended');
    simulateSnap(state);
  }
  return state;
}

describe('Kansas Plan overtime', () => {
  it('always produces a winner when regulation ends tied', () => {
    let overtimeGames = 0;
    for (let i = 0; i < 300; i++) {
      const state = playOut(tiedAtEndOfRegulation());
      if (!reachedOvertime(state)) continue;
      overtimeGames++;
      expect(state.currentQuarter).toBe('OT');
      expect(state.homeScore).not.toBe(state.awayScore);
    }
    expect(overtimeGames).toBeGreaterThan(250);
  });

  it('has no kickoffs or turnover returns, and every possession starts at the 10', () => {
    for (let i = 0; i < 300; i++) {
      const state = playOut(tiedAtEndOfRegulation());
      if (!reachedOvertime(state)) continue;
      const otEvents = state.eventLog.filter((e) => e.quarter === 'OT');
      const regulationEnd = state.eventLog.find((e) => e.textCommentary.includes('END OF REGULATION'));

      expect(regulationEnd?.yardLine).toBe(90);
      for (const e of otEvents) {
        expect(e.textCommentary).not.toMatch(/kickoff/i);
        expect(e.textCommentary).not.toMatch(/DEFENSIVE TOUCHDOWN/);
        expect(e.clockTimeRemainingSeconds).toBe(0);
        if (e.textCommentary.includes('takes its overtime possession') || e.textCommentary.includes('OVERTIME ')) {
          if (!state.isGameOver || e !== otEvents[otEvents.length - 1]) expect(e.yardLine).toBe(90);
        }
      }
    }
  });

  it('never leaves an AI vs. AI macro-sim game tied', () => {
    for (let i = 0; i < 2000; i++) {
      const [home, away] = generateDistrictTeams();
      const box = simulateMacroMatch(`ot_macro_${i}`, 5, home, away);
      expect(box.homeScore).not.toBe(box.awayScore);
      if (box.overtimePeriods) expect(box.overtimePeriods).toBeGreaterThan(0);
    }
  });
});
