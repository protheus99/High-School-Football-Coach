import { describe, expect, it } from 'vitest';
import { finalWhistleTune, soundsForPlay } from './playSounds';
import { noteFrequency, soundFx } from './soundEngine';
import type { GameSimulationState, PlayEvent, Team } from '../types/game';
import type { PlayAlertData, PlayAlertKind } from '../sim/playAlerts';

const us = { id: 'us' } as Team;
const them = { id: 'them' } as Team;
const state = (o: Partial<GameSimulationState> = {}) =>
  ({ homeTeam: us, awayTeam: them, homeScore: 14, awayScore: 10, currentQuarter: 2, clockSecondsRemaining: 400, isGameOver: false, ...o }) as GameSimulationState;
const play = (o: Partial<PlayEvent> = {}) => ({ playConcept: 'INSIDE_ZONE', ...o }) as PlayEvent;
const moment = (kind: PlayAlertKind, team: Team): PlayAlertData => ({ id: kind, kind, team });
const midGame = { quarter: 2 as const, seconds: 420 };

describe('live game sounds', () => {
  it('give each play one main sound, from the coach’s side', () => {
    const sounds = (alerts: PlayAlertData[], event = play(), decision = false) => soundsForPlay(event, alerts, 'us', midGame, state(), decision);
    expect(sounds([])).toEqual(['THUD']);
    expect(sounds([moment('FIRST_DOWN', us)])).toEqual(['THUD', 'FIRST_DOWN']);
    expect(sounds([moment('TOUCHDOWN', them)])).toEqual(['TOUCHDOWN']); // every touchdown gets the band
    expect(sounds([moment('TOUCHDOWN', us)], play(), true)).toEqual(['TOUCHDOWN']); // the try's call waits for the band
    expect(sounds([], play(), true)).toEqual(['ALERT']);
    expect(sounds([], play({ penalty: {} as PlayEvent['penalty'] }))).toEqual(['WHISTLE']);
    // Turnovers: the coach's team takes it, or loses it (and the crowd groans)
    expect(sounds([moment('INTERCEPTION', us)])).toEqual(['TAKEAWAY']);
    expect(sounds([moment('FUMBLE', them)])).toEqual(['GIVEAWAY', 'GROAN']);
    expect(sounds([moment('TURNOVER_ON_DOWNS', them)])).toEqual(['GIVEAWAY', 'GROAN']);
    // Kicks: a punt, a good field goal, a miss (the banner is the defense's: the coach's miss when it isn't his)
    expect(sounds([moment('PUNT', them)], play({ playConcept: 'PUNT' }))).toEqual(['KICK']);
    expect(sounds([moment('FIELD_GOAL', us)])).toEqual(['FIELD_GOAL_GOOD']);
    expect(sounds([moment('FG_MISSED', them)])).toEqual(['DOINK', 'GROAN']);
    expect(sounds([moment('FG_MISSED', us)])).toEqual(['DOINK']);
    expect(sounds([moment('FG_BLOCKED', them)])).toEqual(['KICK', 'GROAN']);
    expect(sounds([moment('SAFETY', us)])).toEqual(['WHISTLE']);
  });

  it('sound the quarter buzzer and the two-minute clock as a play crosses them', () => {
    const one = (before: { quarter: 1 | 2 | 3 | 4; seconds: number }, after: Partial<GameSimulationState>) => soundsForPlay(play(), [], 'us', before, state(after));
    expect(one({ quarter: 1, seconds: 10 }, { currentQuarter: 2, clockSecondsRemaining: 720 })).toEqual(['THUD', 'QUARTER_BUZZER']);
    expect(one({ quarter: 3, seconds: 5 }, { currentQuarter: 4, clockSecondsRemaining: 720 })).toEqual(['THUD', 'QUARTER_BUZZER']);
    expect(one({ quarter: 2, seconds: 5 }, { currentQuarter: 3, clockSecondsRemaining: 720 })).toEqual(['THUD']); // halftime has its own room
    // Close game: the clock starts ticking; a blowout doesn't
    expect(one({ quarter: 4, seconds: 130 }, { currentQuarter: 4, clockSecondsRemaining: 110 })).toEqual(['THUD', 'CLOCK_TICKS']);
    expect(one({ quarter: 4, seconds: 130 }, { currentQuarter: 4, clockSecondsRemaining: 110, homeScore: 35 })).toEqual(['THUD']);
    expect(one({ quarter: 4, seconds: 110 }, { currentQuarter: 4, clockSecondsRemaining: 90 })).toEqual(['THUD']); // once
  });

  it('play the victory tune after a win, the loss tune after a loss, nothing more after a tie', () => {
    expect(finalWhistleTune(state({ homeScore: 21, awayScore: 14 }), 'us')).toBe('VICTORY');
    expect(finalWhistleTune(state({ homeScore: 21, awayScore: 14 }), 'them')).toBe('DEFEAT');
    expect(finalWhistleTune(state({ homeScore: 14, awayScore: 14 }), 'us')).toBeNull();
  });

  it('know their notes, and stay quiet where the browser has no sound', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('C4')).toBeCloseTo(261.63, 1);
    expect(noteFrequency('G#3')).toBeCloseTo(207.65, 1);
    expect(() => noteFrequency('H2')).toThrow();
    expect(() => {
      soundFx.unlock();
      soundFx.playAll(['TOUCHDOWN', 'DOINK', 'GROAN', 'CLOCK_TICKS']);
      soundFx.playVictory();
      soundFx.playDefeat();
    }).not.toThrow();
  });
});
