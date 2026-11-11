// PLAYTEST: timeouts on the match page: three a half, the clock back to the last whistle, and the staffs' rules
import { describe, it, expect, afterEach } from 'vitest';
import { callTimeout, simulateSnap, staffTimeout, timeoutStaff } from '../matchEngine';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState, PlayEvent } from '../../types/game';

const [home, away] = generateDistrictTeams();

function game(overrides: Partial<GameSimulationState> = {}): GameSimulationState {
  return {
    gameId: 'timeout_test', homeTeam: home, awayTeam: away, homeScore: 0, awayScore: 0, weather: 'CLEAR',
    temperatureFahrenheit: 70, windSpeedMph: 5, teamMomentum: 0, currentQuarter: 1, clockSecondsRemaining: 720,
    possessionTeamId: home.id, down: 1, distance: 10, yardLine: 30, isMercyRuleActive: false, isGameOver: false,
    eventLog: [], gameDayForm: { [home.id]: 0, [away.id]: 0 },
    ...overrides
  };
}
/** A finished snap that left the clock running for 25 seconds after the play */
const runningPlay = (s: GameSimulationState): PlayEvent => {
  const e = { playId: 'p1', quarter: s.currentQuarter, clockTimeRemainingSeconds: s.clockSecondsRemaining, clockRunoff: 25 } as PlayEvent;
  s.eventLog.push(e);
  return e;
};

afterEach(() => {
  timeoutStaff.teams = [];
});

describe('timeouts', () => {
  it('starts each team with three, and a timeout gives back the time after the whistle', () => {
    const s = game({ timeoutsLeft: { [home.id]: 3, [away.id]: 3 }, clockSecondsRemaining: 400 });
    const e = runningPlay(s);
    const t = callTimeout(s, home.id, 'coach');
    expect(t).toEqual({ teamId: home.id, left: 2, saved: 25, by: 'coach' });
    expect(s.clockSecondsRemaining).toBe(425);
    expect(e.clockTimeRemainingSeconds).toBe(425);
    expect(s.timeoutsLeft![home.id]).toBe(2);
    // one between snaps
    expect(callTimeout(s, away.id, 'coach')).toBeNull();
  });

  it('gives nothing back when the clock had stopped, and none are left after three', () => {
    const s = game({ timeoutsLeft: { [home.id]: 1, [away.id]: 3 } });
    s.eventLog.push({ playId: 'inc', quarter: 1, clockTimeRemainingSeconds: 700, clockRunoff: 0 } as PlayEvent);
    expect(callTimeout(s, home.id, 'coach')?.saved).toBe(0);
    s.eventLog.push({ playId: 'next', quarter: 1, clockTimeRemainingSeconds: 680, clockRunoff: 20 } as PlayEvent);
    expect(callTimeout(s, home.id, 'coach')).toBeNull();
  });

  it('records on each snap the time a timeout could give back (none on an incompletion or a score)', () => {
    let ran = 0;
    for (let i = 0; i < 200; i++) {
      const { event } = simulateSnap(game());
      if (event.isScore || event.isTurnover || event.penalty || /incomplete/i.test(event.textCommentary)) expect(event.clockRunoff).toBe(0);
      else if (event.clockRunoff) ran++;
    }
    expect(ran).toBeGreaterThan(50);
  });

  it('resets to three each for the second half', () => {
    const s = game({ currentQuarter: 2, clockSecondsRemaining: 3, timeoutsLeft: { [home.id]: 0, [away.id]: 1 } });
    simulateSnap(s, 'INSIDE_RUN');
    if (s.currentQuarter === 3) expect(s.timeoutsLeft).toEqual({ [home.id]: 3, [away.id]: 3 });
  });

  it("staff rules: the two-minute drill, getting the ball back, never when leading late", () => {
    // trailing with the ball, 1:30 left in the half
    let s = game({ currentQuarter: 2, clockSecondsRemaining: 90, homeScore: 7, awayScore: 10, timeoutsLeft: { [home.id]: 3, [away.id]: 3 } });
    timeoutStaff.teams = [home.id, away.id];
    runningPlay(s);
    expect(staffTimeout(s)?.teamId).toBe(home.id);
    // on defense, down 7 with 2:40 left in the game: the defense stops the clock
    s = game({ currentQuarter: 4, clockSecondsRemaining: 160, homeScore: 14, awayScore: 21, possessionTeamId: away.id, timeoutsLeft: { [home.id]: 2, [away.id]: 3 } });
    timeoutStaff.teams = [home.id, away.id];
    runningPlay(s);
    expect(staffTimeout(s)?.teamId).toBe(home.id);
    // leading late: no one calls one (the trailing side has the ball but more than 2:00 is left)
    s = game({ currentQuarter: 4, clockSecondsRemaining: 160, homeScore: 21, awayScore: 14, possessionTeamId: away.id, timeoutsLeft: { [home.id]: 3, [away.id]: 3 } });
    timeoutStaff.teams = [home.id, away.id];
    runningPlay(s);
    expect(staffTimeout(s)).toBeNull();
    // a team not on the staff list (the coach's own while he watches) never has one called for it
    s = game({ currentQuarter: 2, clockSecondsRemaining: 90, homeScore: 0, awayScore: 3, timeoutsLeft: { [home.id]: 3, [away.id]: 3 } });
    timeoutStaff.teams = [away.id];
    runningPlay(s);
    expect(staffTimeout(s)).toBeNull();
  });

  it('keeps its last timeout for a last field goal until 0:30', () => {
    const s = game({ currentQuarter: 2, clockSecondsRemaining: 80, homeScore: 0, awayScore: 3, timeoutsLeft: { [home.id]: 1, [away.id]: 3 } });
    timeoutStaff.teams = [home.id];
    runningPlay(s);
    expect(staffTimeout(s)).toBeNull();
    s.clockSecondsRemaining = 25;
    s.eventLog[0].timeout = undefined;
    expect(staffTimeout(s)?.teamId).toBe(home.id);
  });
});
