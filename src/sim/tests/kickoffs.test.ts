import { afterEach, describe, it, expect, vi } from 'vitest';
import { simulateSnap } from '../matchEngine';
import { alertsForPlay } from '../playAlerts';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GameSimulationState, PlayEvent } from '../../types/game';

/** Every kickoff in a play's commentary: a touchback, a return, or a fumbled return. */
const kickoffs = (text: string) => text.match(/Kickoff by|returns the kickoff|FUMBLES the kickoff return/g)?.length ?? 0;

function gameAt(quarter: 1 | 2 | 3 | 4, clockSecondsRemaining: number, homeScore = 14, awayScore = 14): GameSimulationState {
  const [home, away] = generateDistrictTeams();
  return {
    gameId: 'kickoffs',
    homeTeam: home,
    awayTeam: away,
    homeScore,
    awayScore,
    weather: 'CLEAR',
    temperatureFahrenheit: 70,
    windSpeedMph: 0,
    teamMomentum: 0,
    currentQuarter: quarter,
    clockSecondsRemaining,
    possessionTeamId: home.id,
    openingPossessionTeamId: home.id, // so the away team receives the second-half kickoff
    down: 4,
    distance: 5,
    yardLine: 85, // a 32-yard field goal
    isMercyRuleActive: false,
    isGameOver: false,
    eventLog: []
  };
}

/** The home team just scored a touchdown as time ran out: the next snap is the untimed try. */
function tryAtZero(quarter: 2 | 4, homeScore: number, awayScore: number): GameSimulationState {
  const state = gameAt(quarter, 0, homeScore, awayScore);
  Object.assign(state, { down: 1, distance: 3, yardLine: 97 });
  state.eventLog.push({ playId: 'td', quarter, clockTimeRemainingSeconds: 0, down: 1, distance: 3, yardLine: 97, possessionTeamId: state.homeTeam.id, playConcept: 'DEEP_PASS', yardsGained: 40, isTurnover: false, isScore: true, scoreType: 'TOUCHDOWN', textCommentary: 'TOUCHDOWN', isLeverageMoment: false } as PlayEvent);
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe('No kickoff once time runs out at the end of a half', () => {
  it('a field goal as the 2nd quarter expires: the only kickoff is the second-half one', () => {
    let made = 0;
    for (let i = 0; i < 60; i++) {
      const state = gameAt(2, 10);
      const { event } = simulateSnap(state, 'FIELD_GOAL');
      if (event.scoreType === 'FIELD_GOAL') made++;
      expect(event.textCommentary).toContain('HALFTIME.');
      expect(kickoffs(event.textCommentary), event.textCommentary).toBe(1);
      expect(event.textCommentary.indexOf('HALFTIME.')).toBeLessThan(event.textCommentary.search(/Kickoff by|kickoff/));
      expect(state.currentQuarter).toBe(3);
      expect(state.clockSecondsRemaining).toBe(720);
    }
    expect(made).toBeGreaterThan(0);
  });

  it('a field goal as the 4th quarter expires ends the game (or starts overtime) without a kickoff', () => {
    for (const awayScore of [14, 17]) {
      for (let i = 0; i < 40; i++) {
        const state = gameAt(4, 10, 14, awayScore);
        const { event } = simulateSnap(state, 'FIELD_GOAL');
        expect(kickoffs(event.textCommentary), event.textCommentary).toBe(0);
        expect(state.isGameOver || state.currentQuarter === 'OT').toBe(true);
        // A made kick to tie goes to overtime from the 10, not to a kickoff return spot
        if (state.currentQuarter === 'OT') expect(state.yardLine).toBe(90);
      }
    }
  });

  it('the try after a touchdown at 0:00 ends the half: no kickoff before halftime or the final horn', () => {
    for (let i = 0; i < 40; i++) {
      const half = tryAtZero(2, 20, 14);
      const { event } = simulateSnap(half, i % 2 ? 'TWO_POINT_TRY' : 'PAT_KICK');
      expect(event.isTry).toBe(true);
      expect(kickoffs(event.textCommentary), event.textCommentary).toBe(1);
      expect(event.textCommentary).toContain('HALFTIME.');
      expect(half.currentQuarter).toBe(3);

      // 20-21: a good PAT ties it and goes to overtime, a miss ends it
      const end = tryAtZero(4, 20, 21);
      const last = simulateSnap(end, i % 2 ? 'TWO_POINT_TRY' : 'PAT_KICK').event;
      expect(kickoffs(last.textCommentary), last.textCommentary).toBe(0);
      expect(end.isGameOver || end.currentQuarter === 'OT').toBe(true);
    }
  });

  it('a field goal as the 1st quarter expires still kicks off (the game carries on into the 2nd)', () => {
    let made = 0;
    for (let i = 0; i < 60; i++) {
      const state = gameAt(1, 10);
      const { event } = simulateSnap(state, 'FIELD_GOAL');
      expect(state.currentQuarter).toBe(2);
      if (event.scoreType !== 'FIELD_GOAL') continue;
      made++;
      expect(kickoffs(event.textCommentary), event.textCommentary).toBe(1);
      expect(state.possessionTeamId === state.awayTeam.id || /FUMBLES the kickoff/.test(event.textCommentary)).toBe(true);
    }
    expect(made).toBeGreaterThan(0);
  });
});

describe('A fumbled second-half kickoff', () => {
  /** Every roll comes up 0.01: the try is blocked, and the short kickoff (no leg on the kicker) is fumbled. */
  function fumbledHalftimeKickoff() {
    const state = tryAtZero(2, 20, 14);
    state.homeTeam.roster.forEach((p) => (p.attributes.kickingPower = 0));
    const before = { possessionTeamId: state.possessionTeamId, homeScore: state.homeScore, awayScore: state.awayScore, down: state.down, distance: state.distance };
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const { event } = simulateSnap(state, 'PAT_KICK');
    vi.restoreAllMocks();
    return { state, before, event };
  }

  it('is a turnover on the play, recovered by the kicking team', () => {
    const { state, before, event } = fumbledHalftimeKickoff();
    // The returner's name can have a suffix ("#Moore Jr."), and a school name can hold regex characters
    const school = state.homeTeam.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(event.textCommentary).toMatch(new RegExp(`HALFTIME\\. #.+? FUMBLES the kickoff return! ${school} recovers!`));
    expect(event.isTurnover).toBe(true);
    expect(event.turnoverType).toBe('KICKOFF_FUMBLE');
    expect(state.possessionTeamId).toBe(state.homeTeam.id);
    expect(alertsForPlay(event, before, state).map((a) => `${a.kind} ${a.team.id}`)).toEqual([`FUMBLE ${state.homeTeam.id}`]);
  });

  it("doesn't replace a turnover the last snap of the half already had, and the snap keeps its own banner", () => {
    const [home, away] = generateDistrictTeams();
    home.name = 'Westlake';
    away.name = 'Lake Travis';
    const state = { ...gameAt(3, 720), homeTeam: home, awayTeam: away, possessionTeamId: away.id } as GameSimulationState;
    const before = { possessionTeamId: home.id, homeScore: 14, awayScore: 14, down: 4, distance: 8 };
    const punt: PlayEvent = {
      playId: 'p1', quarter: 3, clockTimeRemainingSeconds: 720, down: 1, distance: 10, yardLine: 30, possessionTeamId: home.id,
      playConcept: 'PUNT', yardsGained: 0, isTurnover: true, turnoverType: 'KICKOFF_FUMBLE', isScore: false, isLeverageMoment: false,
      textCommentary: 'P #Lewis punts 41 yds to the opponent 30 yd line. HALFTIME. #Pruett FUMBLES the kickoff return! Westlake recovers!'
    };
    // A clean punt hands it to Lake Travis, then Westlake recovers the kickoff
    expect(alertsForPlay(punt, before, state).map((a) => `${a.kind} ${a.team.name}`)).toEqual(['PUNT Lake Travis', 'FUMBLE Westlake']);
    // A first down on the last snap still moves the chains for the offense
    const run = { ...punt, playConcept: 'INSIDE_RUN', yardsGained: 12, textCommentary: 'RB #Ruiz rushes for 12 yds. Tackled by LB #Ochoa. FIRST DOWN! HALFTIME. #Pruett FUMBLES the kickoff return! Westlake recovers!' } as PlayEvent;
    expect(alertsForPlay(run, before, state).map((a) => `${a.kind} ${a.team.name}`)).toEqual(['FIRST_DOWN Westlake', 'FUMBLE Westlake']);
  });

  it('is counted in a full game, and an interception on the last snap keeps its type', () => {
    let fumbles = 0;
    for (let g = 0; g < 400 && fumbles < 3; g++) {
      const state = gameAt(1, 720, 0, 0);
      Object.assign(state, { down: 1, distance: 10, yardLine: 25, openingPossessionTeamId: undefined, weather: 'HEAVY_RAIN' });
      for (let snap = 0; snap < 500 && !state.isGameOver; snap++) {
        const { event } = simulateSnap(state);
        if (!/HALFTIME\. #.+? FUMBLES the kickoff return/.test(event.textCommentary)) continue;
        fumbles++;
        expect(event.isTurnover).toBe(true);
        if (/INTERCEPTED|FUMBLE! |MUFFED|Turnover on downs|Field Goal attempt is NO GOOD|BLOCKED/.test(event.textCommentary)) {
          expect(event.turnoverType).not.toBe('KICKOFF_FUMBLE');
        } else {
          expect(event.turnoverType).toBe('KICKOFF_FUMBLE');
        }
      }
    }
    expect(fumbles).toBeGreaterThan(0);
  }, 60000);
});
