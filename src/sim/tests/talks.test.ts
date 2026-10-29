import { describe, it, expect } from 'vitest';
import { ATTACK_FAMILIES, NO_EFFECT, TALKS, TalkSituation, talkById, talkEffect } from '../talks';
import { MIDSEASON_WEEK, NO_RECENT_TALKS, halftimeSituation, pickTalks, rememberTalks, specialNights, talkCount, firstHalfLines } from '../talkPicker';
import { GameSimulationState, PlayEvent, ScheduledGame, Team } from '../../types/game';
import { HiredCoach } from '../coachingStaff';

const situation = (over: Partial<TalkSituation> = {}): TalkSituation => ({
  phase: 'HALF',
  home: true,
  margin: 0,
  pointsFor: 14,
  pointsAgainst: 14,
  runFor: 0,
  runAgainst: 0,
  turnovers: 0,
  takeaways: 1,
  flags: 1,
  carries: 10,
  yardsPerCarry: 4,
  redZoneStalls: 0,
  theirRedZoneStalls: 0,
  shortYardageFails: 0,
  bigKickPlay: false,
  weather: 'CLEAR',
  playoffRound: null,
  ourRank: null,
  theirRank: null,
  favored: 0,
  homecoming: false,
  seniorNight: false,
  rivalry: false,
  lowMorale: false,
  seasonOpener: false,
  lostLastWeek: false,
  bigWinLastWeek: false,
  winStreak: 0,
  lossStreak: 0,
  starterOut: false,
  theyAreChampions: false,
  ...over
});
const ids = (s: TalkSituation, seed = 'g1', recent = NO_RECENT_TALKS) => pickTalks(s, { seed, count: talkCount(s.phase, []), recent }).map((o) => o.talk.id);

describe('Speeches: the catalog', () => {
  it('has 18 pre-game and 31 halftime speeches, each with lines, a gain and a cost', () => {
    expect(TALKS.filter((t) => t.phase === 'PRE')).toHaveLength(18);
    expect(TALKS.filter((t) => t.phase === 'HALF')).toHaveLength(31);
    expect(new Set(TALKS.map((t) => t.id)).size).toBe(TALKS.length);
    for (const t of TALKS) {
      expect(t.lines.length).toBeGreaterThanOrEqual(2);
      expect(t.gains.length).toBeGreaterThan(0);
      expect(t.costs.length).toBeGreaterThan(0);
    }
  });

  it("keeps today's four halftime talks (games saved at halftime still play them)", () => {
    for (const id of ['FIRE_UP', 'OFFENSE', 'DEFENSE', 'BIG_PLAY']) expect(talkById(id)?.phase).toBe('HALF');
  });

  it('plays the pre-game speech in the first half and the halftime speech after it', () => {
    const state = { currentQuarter: 1, pregameTalks: { A: 'FAST_START' }, halftimeTalks: { A: 'DEFENSE' } } as unknown as GameSimulationState;
    expect(talkEffect(state, 'A')).toBe(talkById('FAST_START')!.effect);
    expect(talkEffect({ ...state, currentQuarter: 2 }, 'A')).toBe(talkById('FAST_START')!.effect);
    expect(talkEffect({ ...state, currentQuarter: 3 }, 'A')).toBe(talkById('DEFENSE')!.effect);
    expect(talkEffect({ ...state, currentQuarter: 'OT' }, 'A')).toBe(talkById('DEFENSE')!.effect);
    expect(talkEffect({ ...state, currentQuarter: 3 }, 'B')).toBe(NO_EFFECT);
  });
});

describe('Speeches: what each screen offers', () => {
  it('offers 3 before kickoff and 4 at halftime (5 with a Halftime Adjuster), each a different kind of plan', () => {
    const pre = pickTalks(situation({ phase: 'PRE' }), { seed: 'g', count: talkCount('PRE', []) });
    const half = pickTalks(situation(), { seed: 'g', count: talkCount('HALF', []) });
    expect(pre).toHaveLength(3);
    expect(half).toHaveLength(4);
    const adjuster = [{ role: 'OFFENSIVE_COORDINATOR', name: 'X', rating: 80, effectIds: ['oc_halftime'] }] as HiredCoach[];
    expect(talkCount('HALF', adjuster)).toBe(5);
    expect(pickTalks(situation(), { seed: 'g', count: 5 })).toHaveLength(5);
    for (const offer of [pre, half]) {
      expect(new Set(offer.map((o) => o.talk.family)).size).toBe(offer.length);
      expect(offer.some((o) => ATTACK_FAMILIES.includes(o.talk.family))).toBe(true);
      expect(offer.some((o) => !ATTACK_FAMILIES.includes(o.talk.family))).toBe(true);
      // The assistant's pick (the first) fits best
      expect(offer.every((o) => o.score <= offer[0].score)).toBe(true);
    }
  });

  it('fits the score: the gamble down 21, protecting the lead up 28', () => {
    const down = ids(situation({ margin: -21, pointsFor: 7, pointsAgainst: 28, runAgainst: 21 }));
    expect(down[0]).toBe('ALL_IN');
    expect(down.some((id) => id === 'HURRY_UP' || id === 'ONE_AT_A_TIME')).toBe(true); // a way back on offense
    expect(down).not.toContain('CLOCK');
    const up = ids(situation({ margin: 28, pointsFor: 35, pointsAgainst: 7 }));
    expect(up).toContain('CLOCK');
    expect(up).toContain('CLASS');
    for (const id of ['ALL_IN', 'HURRY_UP', 'BIG_PLAY', 'ONE_AT_A_TIME']) expect(up).not.toContain(id);
  });

  it('reads the stakes: the state final, a rivalry, a comeback, a sloppy half', () => {
    expect(ids(situation({ playoffRound: 'STATE_FINAL' }))[0]).toBe('BIG_STAGE');
    expect(ids(situation({ rivalry: true }))[0]).toBe('RIVALRY');
    expect(ids(situation({ margin: -7, runFor: 14, pointsFor: 14, pointsAgainst: 21 }))).toContain('KEEP_COMING');
    expect(ids(situation({ flags: 6 }))).toContain('CLEAN_IT_UP');
    expect(ids(situation({ turnovers: 2 }))).toContain('PROTECT_BALL');
    expect(ids(situation({ margin: 10, playoffRound: 'REGIONAL_FINAL', pointsFor: 24 }))).toContain('LOCKDOWN');
  });

  it('reads the week before kickoff: rivals, a starter out, the opener, the champs', () => {
    const pre = (over: Partial<TalkSituation>) => ids(situation({ phase: 'PRE', ...over }));
    expect(pre({ rivalry: true, seniorNight: true })[0]).toBe('RIVAL_WEEK');
    expect(pre({ starterOut: true })).toContain('NEXT_MAN_UP');
    expect(pre({ seasonOpener: true })).toContain('OPENER');
    expect(pre({ theyAreChampions: true })[0]).toBe('DETHRONE');
    expect(pre({ playoffRound: 'STATE_FINAL' })[0]).toBe('STATE_FINAL');
    expect(pre({ theirRank: 2, favored: -0.3 })).toContain('UNDERDOG');
  });

  it('shows the same speeches and lines for the same game, and never the same offer two games running', () => {
    const s = situation();
    expect(pickTalks(s, { seed: 'game-7', count: 4 })).toEqual(pickTalks(s, { seed: 'game-7', count: 4 }));
    for (let g = 0; g < 30; g++) {
      const first = pickTalks(s, { seed: `a${g}`, count: 4 });
      const recent = rememberTalks(NO_RECENT_TALKS, 'HALF', first, first[0]);
      const next = pickTalks(s, { seed: `b${g}`, count: 4, recent });
      expect(next.map((o) => o.talk.id).sort()).not.toEqual(first.map((o) => o.talk.id).sort());
      // A speech that comes back uses its next line
      const again = next.find((o) => o.talk.id === first[0].talk.id);
      if (again) expect(again.line).toBe((first[0].line + 1) % again.talk.lines.length);
    }
  });
});

describe('Speeches: special nights', () => {
  const game = (week: number, home: boolean): ScheduledGame => ({ gameId: `w${week}`, week, homeTeamId: home ? 'US' : `T${week}`, awayTeamId: home ? `T${week}` : 'US', isDistrictGame: week >= 11 });
  const schedule = [game(8, true), game(9, false), game(10, true), game(11, true), game(12, false), game(13, true), game(14, false), game(15, true), game(16, false), game(17, false)];

  it('Homecoming is the last home game before midseason; Senior Night the last home game of the regular season', () => {
    expect(MIDSEASON_WEEK).toBe(12);
    expect(specialNights(schedule, 'US', 'w11')).toEqual({ homecoming: true, seniorNight: false });
    expect(specialNights(schedule, 'US', 'w15')).toEqual({ homecoming: false, seniorNight: true });
    expect(specialNights(schedule, 'US', 'w13')).toEqual({ homecoming: false, seniorNight: false });
  });

  it('a team with one home game before midseason and none after gives it Senior Night, not both', () => {
    const one = [game(8, false), game(9, true), game(13, false)];
    expect(specialNights(one, 'US', 'w9')).toEqual({ homecoming: false, seniorNight: true });
  });
});

describe('Speeches: reading the first half', () => {
  const team = (id: string) => ({ id, name: id }) as Team;
  const play = (over: Partial<PlayEvent>): PlayEvent =>
    ({ playId: 'p', quarter: 2, clockTimeRemainingSeconds: 0, down: 1, distance: 10, yardLine: 25, possessionTeamId: 'A', snapTeamId: 'A', playConcept: 'INSIDE_RUN', yardsGained: 4, isTurnover: false, isScore: false, textCommentary: '', isLeverageMoment: false, homeScoreAfter: 0, awayScoreAfter: 0, ...over }) as PlayEvent;

  it('counts the run to end the half, giveaways and flags', () => {
    const eventLog = [
      play({ snapTeamId: 'B', possessionTeamId: 'B', isScore: true, scoreType: 'TOUCHDOWN', homeScoreAfter: 0, awayScoreAfter: 7 }),
      play({ snapTeamId: 'A', isTurnover: true, turnoverType: 'INTERCEPTION', possessionTeamId: 'B', playConcept: 'SHORT_PASS', awayScoreAfter: 7 }),
      play({ snapTeamId: 'A', isTurnover: true, turnoverType: 'FUMBLE', possessionTeamId: 'B', awayScoreAfter: 7 }),
      play({ penalty: { teamId: 'A' } as PlayEvent['penalty'], awayScoreAfter: 7 }),
      play({ isScore: true, scoreType: 'TOUCHDOWN', homeScoreAfter: 7, awayScoreAfter: 7 }),
      play({ isScore: true, scoreType: 'TOUCHDOWN', homeScoreAfter: 14, awayScoreAfter: 7 })
    ];
    const state = { gameId: 'g', homeTeam: team('A'), awayTeam: team('B'), homeScore: 14, awayScore: 7, weather: 'CLEAR', eventLog } as unknown as GameSimulationState;
    const s = halftimeSituation(situation(), state, 'A');
    expect(s.margin).toBe(7);
    expect(s.runFor).toBe(14);
    expect(s.runAgainst).toBe(0);
    expect(s.turnovers).toBe(2);
    expect(s.flags).toBe(1);
    expect(firstHalfLines(s, undefined)[0]).toBe('📊 Up 7');
    expect(firstHalfLines(s, undefined)).toContain('📈 You scored the last 14');
  });
});
