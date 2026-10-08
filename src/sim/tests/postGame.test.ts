import { describe, it, expect, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GAME_BALL_EXPOSURE_CAP, awardGameBall, gameBallSkill } from '../postGame';
import { NO_COMMENT, PRESS_QUESTIONS, PressContext, buildPressContext, pickPressQuestion } from '../pressConference';
import { dilemmaChoiceEffects } from '../dilemmaEngine';
import { recruitScore } from '../collegeRecruitingEngine';
import { GameSimulationState, PlayEvent } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

describe('Player of the Game', () => {
  it('adds a point to a key skill and college exposure (three a season), never the overall rating', () => {
    const [team] = generateDistrictTeams();
    const player = team.roster.find((p) => p.position === 'RB')!;
    const skill = gameBallSkill(player);
    const before = { skill: player.attributes[skill], ovr: player.overallRating, score: recruitScore(player, false) };
    const first = awardGameBall(player, 2026);
    expect(first).toEqual({ skill, exposure: true });
    expect(player.attributes[skill]).toBe(Math.min(99, before.skill + 1));
    expect(player.overallRating).toBe(before.ovr);
    expect(recruitScore(player, false)).toBe(before.score + 1);
    for (let i = 1; i < GAME_BALL_EXPOSURE_CAP; i++) awardGameBall(player, 2026);
    expect(awardGameBall(player, 2026).exposure).toBe(false); // the fourth this season: skill and headline only
    expect(player.recruiting.exposure).toBe(GAME_BALL_EXPOSURE_CAP);
    expect(awardGameBall(player, 2027).exposure).toBe(true); // a new season
    expect(player.gameBalls).toBe(GAME_BALL_EXPOSURE_CAP + 2);
  });
});

const context = (over: Partial<PressContext> = {}): PressContext => {
  const [team] = generateDistrictTeams();
  const starters = team.roster.filter((p) => p.depthChartTier === 1);
  return {
    teamName: 'Westlake',
    opponentName: 'Lake Travis',
    won: true,
    margin: 3,
    score: '24-21',
    playoff: false,
    week: 12,
    fourthDown: { converted: true, spot: '4th and 2 at your own 38' },
    halftimeSwing: { kind: 'COMEBACK', halftime: '7-14' },
    blewTenPointLead: false,
    lossStreak: 0,
    backupQb: { backup: starters[1], starter: starters[0] },
    youngStarters: starters.slice(2, 4),
    finalGame: false,
    gameBall: starters[0],
    gameBallLine: '27 car, 183 yds, 2 TD',
    prospect: starters[0],
    changedPlanAtHalftime: true,
    ...over
  };
};

describe('Press conference', () => {
  it('gives every answer a visible gain and loss, and skipping only a penalty', () => {
    const [team] = generateDistrictTeams();
    for (const c of [context(), context({ won: false, margin: 3, lossStreak: 4, blewTenPointLead: true, finalGame: true })]) {
      PRESS_QUESTIONS.filter((q) => q.when(c)).forEach((q) => {
        expect(q.answers(c)).toHaveLength(3);
        q.answers(c).forEach((a) => {
          const fx = dilemmaChoiceEffects(a, team);
          const gain = fx.rating > 0 || fx.coachPoints > 0 || fx.fridayEdge > 0 || fx.gains.length > 0;
          const loss = fx.rating < 0 || fx.coachPoints < 0 || fx.fridayEdge < 0 || fx.losses.length > 0;
          expect({ answer: `${q.id}/${a.id}`, gain, loss }).toEqual({ answer: `${q.id}/${a.id}`, gain: true, loss: true });
        });
      });
    }
    const skip = dilemmaChoiceEffects(NO_COMMENT, team);
    expect(skip.rating).toBeLessThan(0);
    expect(skip.coachPoints).toBeLessThan(0);
    expect(skip.gains).toEqual([]);
  });

  it('rotates: a topic waits 4 weeks, comes up twice a season at most, and never repeats its last wording', () => {
    const c = context({ fourthDown: undefined, halftimeSwing: undefined, backupQb: undefined, prospect: undefined, youngStarters: [], margin: 20, gameBall: undefined });
    // Only WIN_MEANS fits this win
    const first = pickPressQuestion(c, [], 2026, () => 0)!;
    expect(first.id).toBe('WIN_MEANS');
    const again = pickPressQuestion({ ...c, week: 13 }, [{ questionId: 'WIN_MEANS', year: 2026, week: 12, phrasing: first.phrasing }], 2026);
    expect(again).toBeNull(); // on cooldown
    const later = pickPressQuestion({ ...c, week: 16 }, [{ questionId: 'WIN_MEANS', year: 2026, week: 12, phrasing: first.phrasing }], 2026, () => 0)!;
    expect(later.id).toBe('WIN_MEANS');
    expect(later.phrasing).not.toBe(first.phrasing);
    const capped = [
      { questionId: 'WIN_MEANS', year: 2026, week: 8 },
      { questionId: 'WIN_MEANS', year: 2026, week: 12 }
    ];
    expect(pickPressQuestion({ ...c, week: 17 }, capped, 2026)).toBeNull(); // twice already this season
    expect(pickPressQuestion({ ...c, week: 9 }, capped, 2027)).not.toBeNull(); // a new season
  });

  it('favors specific stories and the topics asked least in the career', () => {
    const c = context();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const q = pickPressQuestion(c, [], 2026)!;
      counts[q.id] = (counts[q.id] ?? 0) + 1;
    }
    expect(counts.FOURTH_DOWN).toBeGreaterThan(counts.WIN_MEANS ?? 0);
    // A topic asked many times before steps back
    const worn = Array.from({ length: 6 }, (_, i) => ({ questionId: 'FOURTH_DOWN', year: 2020 + i, week: 9 }));
    let fourth = 0;
    for (let i = 0; i < 400; i++) if (pickPressQuestion(c, worn, 2026)!.id === 'FOURTH_DOWN') fourth++;
    expect(fourth).toBeLessThan(counts.FOURTH_DOWN);
  });

  it('reads the game: your 4th-down attempt, a halftime comeback and the losing streak', () => {
    const [home, away] = generateDistrictTeams();
    const ev = (over: Partial<PlayEvent>): PlayEvent =>
      ({ playId: 'p', quarter: 2, clockTimeRemainingSeconds: 300, down: 1, distance: 10, yardLine: 40, possessionTeamId: home.id, playConcept: 'INSIDE_RUN', yardsGained: 3, isTurnover: false, isScore: false, textCommentary: '', isLeverageMoment: false, ...over }) as PlayEvent;
    const game = {
      gameId: 'y2026_w12_h_a',
      homeTeam: home,
      awayTeam: away,
      homeScore: 21,
      awayScore: 17,
      overtime: undefined,
      eventLog: [
        ev({ snapQuarter: 2, snapTeamId: away.id, homeScoreAfter: 0, awayScoreAfter: 14 }),
        ev({ snapQuarter: 3, snapTeamId: home.id, snapDown: 4, snapDistance: 2, snapYardLine: 38, down: 1, homeScoreAfter: 7, awayScoreAfter: 14 }),
        ev({ snapQuarter: 4, snapTeamId: home.id, homeScoreAfter: 21, awayScoreAfter: 17 })
      ]
    } as unknown as GameSimulationState;
    const schedule = [5, 6, 7].map((w) => ({ gameId: `g${w}`, week: w, homeTeamId: home.id, awayTeamId: 'x', isDistrictGame: false, homeScore: 0, awayScore: 7 }));
    const c = buildPressContext({ game, team: home, userTeamId: home.id, schedule, week: 12, bracket: null, changedPlanAtHalftime: false });
    expect(c.fourthDown).toEqual({ converted: true, spot: '4th and 2 at your own 38' });
    expect(c.halftimeSwing).toEqual({ kind: 'COMEBACK', halftime: '0-14' });
    expect(c.won).toBe(true);
    expect(c.lossStreak).toBe(0); // this win ends the three-game streak
    const lost = buildPressContext({ game: { ...game, homeScore: 10, awayScore: 17 }, team: home, userTeamId: home.id, schedule, week: 12, bracket: null, changedPlanAtHalftime: false });
    expect(lost.lossStreak).toBe(4);
  });

  it('holds a press answer’s Friday edge until this week’s game is in the books', () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId } = useGameStore.getState();
    const team = () => useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    const firstGame = Math.min(...useGameStore.getState().seasonSchedule.filter((g) => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId).map((g) => g.week));
    useGameStore.setState({ currentWeek: firstGame, coachPoints: 100 });
    const question = pickPressQuestion(context({ fourthDown: undefined, halftimeSwing: undefined, backupQb: undefined, prospect: undefined, youngStarters: [], margin: 20, gameBall: undefined, week: firstGame }), [], 2026, () => 0)!;
    const bold = question.answers.find((a) => (a.impact.fridayEdgeDelta ?? 0) > 0)!;
    useGameStore.getState().answerPress(question, bold);
    expect(team().fridayEdge ?? 0).toBe(0);
    expect(team().pendingFridayEdge).toBe(1);
    useGameStore.getState().advanceWeek();
    expect(team().fridayEdge).toBe(1); // ready for next week's game
    expect(useGameStore.getState().pressLog.at(-1)).toMatchObject({ questionId: question.id, phrasing: question.phrasing });
    useGameStore.getState().answerPress(question, NO_COMMENT);
    expect(useGameStore.getState().coachPoints).toBeLessThan(100 + 200); // skipping costs ₡ (never below zero)
  });
});
