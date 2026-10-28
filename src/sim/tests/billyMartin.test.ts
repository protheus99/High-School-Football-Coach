import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { TEMPLATES } from '../dilemmaTemplates';
import { dilemmaChoiceEffects } from '../dilemmaEngine';
import {
  afterThreadChoice,
  buildThreadStep,
  HIDDEN_WORDS,
  maybeStartThread,
  reckoningFor,
  rollStepWeeks,
  STEP_WEEKS,
  THREAD_START_CHANCE,
  threadSeverity
} from '../billyMartin';
import { DilemmaRecord, DilemmaSeverity, MisconductThread } from '../../types/game';
import { programRating } from '../programMeters';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';
import { toEntry } from '../../services/leaderboard';
import { invalidReckonings } from '../careerScore';

afterEach(() => vi.restoreAllMocks());

const record = (tier: DilemmaRecord['tier'], templateId = 'SKIPPED_PRACTICE'): DilemmaRecord => ({ templateId, title: 'Star Skips Practice', year: 2026, week: 10, tier, choiceLabel: 'Let It Go' });
const thread = (severity: DilemmaSeverity, step: 1 | 2 | 3 = 1, over: Partial<MisconductThread> = {}): MisconductThread => ({
  id: `bm_test_${severity}_${step}`,
  templateId: 'SKIPPED_PRACTICE',
  title: 'Star Skips Practice',
  choiceLabel: 'Let It Go',
  severity,
  year: 2026,
  week: 10,
  step,
  weeksLeft: 1,
  ...over
});

describe('Severity: every dilemma has one', () => {
  it('gives every template a severity, as approved (17 major, 27 serious, 28 minor, and the 6 added by analogy)', () => {
    TEMPLATES.forEach((t) => expect({ id: t.id, ok: ['MINOR', 'SERIOUS', 'MAJOR'].includes(t.severity) }).toEqual({ id: t.id, ok: true }));
    const count = (s: DilemmaSeverity) => TEMPLATES.filter((t) => t.severity === s).length;
    expect([count('MAJOR'), count('SERIOUS'), count('MINOR')]).toEqual([17, 31, 30]);
    const severity = (id: string) => TEMPLATES.find((t) => t.id === id)!.severity;
    // The user's two changes
    expect(severity('ELIGIBILITY_PAPERWORK')).toBe('SERIOUS');
    expect(severity('PLAGIARISM')).toBe('MAJOR');
    expect(severity('SKIPPED_PRACTICE')).toBe('MINOR');
    expect(severity('BOOSTER_CASH_HANDSHAKE')).toBe('MAJOR');
  });
});

describe('How a call starts a thread', () => {
  it('risky calls 30% of the time, corrupt ones 60%, good and compromise calls never', () => {
    expect(THREAD_START_CHANCE).toEqual({ GOOD: 0, COMPROMISE: 0, RISKY: 0.3, CORRUPT: 0.6 });
    const random = vi.spyOn(Math, 'random');
    const starts = (tier: DilemmaRecord['tier'], roll: number) => {
      random.mockReturnValue(roll);
      return maybeStartThread(record(tier), 'MINOR') !== null;
    };
    expect([starts('RISKY', 0.29), starts('RISKY', 0.31)]).toEqual([true, false]);
    expect([starts('CORRUPT', 0.59), starts('CORRUPT', 0.61)]).toEqual([true, false]);
    expect([starts('GOOD', 0), starts('COMPROMISE', 0)]).toEqual([false, false]);
  });

  it('lands near the chances over many calls', () => {
    const rate = (tier: DilemmaRecord['tier']) => Array.from({ length: 4000 }, () => maybeStartThread(record(tier), 'SERIOUS')).filter(Boolean).length / 4000;
    expect(rate('RISKY')).toBeGreaterThan(0.26);
    expect(rate('RISKY')).toBeLessThan(0.34);
    expect(rate('CORRUPT')).toBeGreaterThan(0.56);
    expect(rate('CORRUPT')).toBeLessThan(0.64);
  });

  it('starts a corrupt call one level higher (a major one stays major), a risky one at its own level', () => {
    expect(['MINOR', 'SERIOUS', 'MAJOR'].map((s) => threadSeverity(s as DilemmaSeverity, 'CORRUPT'))).toEqual(['SERIOUS', 'MAJOR', 'MAJOR']);
    expect(['MINOR', 'SERIOUS', 'MAJOR'].map((s) => threadSeverity(s as DilemmaSeverity, 'RISKY'))).toEqual(['MINOR', 'SERIOUS', 'MAJOR']);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(maybeStartThread(record('CORRUPT'), 'MINOR')!.severity).toBe('SERIOUS');
  });

  it('waits 6-18 weeks (minor), 10-24 (serious) or 12-36 (major) before each step', () => {
    expect(STEP_WEEKS).toEqual({ MINOR: [6, 18], SERIOUS: [10, 24], MAJOR: [12, 36] });
    (['MINOR', 'SERIOUS', 'MAJOR'] as DilemmaSeverity[]).forEach((s) => {
      const rolls = Array.from({ length: 2000 }, () => rollStepWeeks(s));
      expect(Math.min(...rolls)).toBe(STEP_WEEKS[s][0]);
      expect(Math.max(...rolls)).toBe(STEP_WEEKS[s][1]);
    });
    // Between warnings too
    const next = afterThreadChoice(thread('MAJOR'), { id: 'x', label: '', description: '', tier: 'RISKY', impact: {} as never, thread: 'IGNORE' })!;
    expect(next.step).toBe(2);
    expect(next.weeksLeft).toBeGreaterThanOrEqual(12);
    expect(next.weeksLeft).toBeLessThanOrEqual(36);
  });
});

describe('The warnings', () => {
  const [team] = generateDistrictTeams();
  const star = team.roster.find((p) => p.depthChartTier === 1)!;

  it('tell the story with Billy Martin in it, never the words "strike", "thread" or the severity', () => {
    TEMPLATES.forEach((t) =>
      (['MINOR', 'SERIOUS', 'MAJOR'] as DilemmaSeverity[]).forEach((s) =>
        ([1, 2, 3] as const).forEach((step) =>
          [0, 1, 2].forEach((reckonings) => {
            const card = buildThreadStep(thread(s, step, { templateId: t.id, playerId: star.id }), team, reckonings, true);
            const text = [card.title, card.scenario, ...card.choices.flatMap((c) => [c.label, c.description])].join(' ');
            expect({ id: t.id, s, step, billy: card.scenario.includes('Billy Martin') }).toEqual({ id: t.id, s, step, billy: true });
            expect({ id: t.id, hidden: HIDDEN_WORDS.test(text), braces: /[{}]/.test(text) }).toEqual({ id: t.id, hidden: false, braces: false });
            if (step === 1) expect(card.scenario.endsWith('He wants to hear your side of it.')).toBe(true);
          })
        )
      )
    );
  });

  it('name the player while he is on the team, and "your former star" once he has left', () => {
    const here = buildThreadStep(thread('MINOR', 1, { playerId: star.id }), team, 0, true);
    expect(here.scenario).toContain(`${star.firstName} ${star.lastName}`);
    const gone = buildThreadStep(thread('MINOR', 1, { playerId: 'p_left_long_ago' }), team, 0, true);
    expect(gone.scenario).toContain('your former star');
  });

  it('offer two ways to make it right and one to let it ride, then the end', () => {
    (['MINOR', 'SERIOUS', 'MAJOR'] as DilemmaSeverity[]).forEach((s) => {
      [1, 2].forEach((step) => {
        const card = buildThreadStep(thread(s, step as 1 | 2), team, 0, true);
        expect(card.choices.map((c) => c.thread)).toEqual(['RESOLVE', 'RESOLVE', 'IGNORE']);
        // Letting it ride costs nothing now; making it right always costs something, and one way costs no Coach Points
        const fx = card.choices.map((c) => dilemmaChoiceEffects(c, team));
        expect(fx[2].rating).toBe(0);
        expect(fx.slice(0, 2).some((f) => f.coachPoints === 0)).toBe(true);
        expect(fx.slice(0, 2).every((f) => f.rating < 0 || f.coachPoints < 0)).toBe(true);
        expect(fx.every((f) => !f.investigationRisk)).toBe(true);
      });
      expect(buildThreadStep(thread(s, 3), team, 0, true).choices.map((c) => c.thread)).toEqual(['ACCEPT']);
    });
    // The second warning's bigger way out for serious and major calls: a game on the bench
    const sit = buildThreadStep(thread('SERIOUS', 2), team, 0, true).choices[1];
    expect(sit.label).toBe('Suspend Yourself for a Game');
    expect(dilemmaChoiceEffects(sit, team).losses).toContain('You miss 1 game');
    // The ends: minor Rating ⌄⌄, serious Rating ⌄⌄⌄ and a game, major a reckoning
    const end = (s: DilemmaSeverity) => dilemmaChoiceEffects(buildThreadStep(thread(s, 3), team, 0, true).choices[0], team);
    expect([end('MINOR').ratingLevel, end('MINOR').losses]).toEqual([-2, []]);
    expect([end('SERIOUS').ratingLevel, end('SERIOUS').losses]).toEqual([-3, ['You miss 1 game']]);
    expect(end('MAJOR').losses).toEqual(['Suspended: rest of the season']);
  });

  it('grow the reckoning with each one: the season, a year banned, then fired', () => {
    expect([reckoningFor(0, true), reckoningFor(0, false), reckoningFor(1, true), reckoningFor(2, true), reckoningFor(5, false)]).toEqual(['SEASON', 'NEXT_SEASON', 'BAN', 'FIRED', 'FIRED']);
    const losses = (n: number) => dilemmaChoiceEffects(buildThreadStep(thread('MAJOR', 3), team, n, true).choices[0], team).losses;
    expect(losses(1)).toEqual(['Banned: 1 year', '☠️ Invalid playthrough']);
    expect(losses(2)).toEqual(['Fired', '☠️ Invalid playthrough']);
  });
});

describe('Threads in the game', () => {
  const setup = () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId, currentYear } = useGameStore.getState();
    const career = { id: 'career_bm', coachName: 'Claude', scenario: 'OPEN', state: 'Texas', startingSchool: 'X', startingProgram: 'X', startedYear: currentYear, length: 3, seasons: [] } as const;
    useGameStore.setState({ currentWeek: 9, coachPoints: 5000, career: { ...career, seasons: [] }, careerComplete: false });
    const team = () => useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    return { team, currentYear };
  };
  /** Advances until the thread's next step is on the Hub (it's due next week). */
  const nextStep = () => {
    useGameStore.setState({ misconductThreads: useGameStore.getState().misconductThreads.map((t) => ({ ...t, weeksLeft: 1 })), activeDilemma: null });
    useGameStore.getState().advanceWeek();
    return useGameStore.getState().activeDilemma!;
  };
  const answer = (pick: 'RESOLVE' | 'IGNORE' | 'ACCEPT') => {
    const card = useGameStore.getState().activeDilemma!;
    useGameStore.getState().resolveDilemma(card.choices.find((c) => c.thread === pick)!);
  };

  it("start from a risky call, and wait their weeks before the first warning", () => {
    setup();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0); // the thread starts
    useGameStore.setState({ activeDilemma: { id: 'd', templateId: 'SKIPPED_PRACTICE', title: 'Star Skips Practice', scenario: '', weekTriggered: 9, choices: [] } });
    useGameStore.getState().resolveDilemma({ id: 'r', label: 'Let It Go', description: '', tier: 'RISKY', impact: { schoolBoardTrustDelta: 0, boosterApprovalDelta: 0, lockerRoomDisciplineDelta: 0, complianceScoreDelta: 0 } });
    const [started] = useGameStore.getState().misconductThreads;
    expect(started).toMatchObject({ templateId: 'SKIPPED_PRACTICE', severity: 'MINOR', step: 1, choiceLabel: 'Let It Go' });
    expect(started.weeksLeft).toBeGreaterThanOrEqual(6);
  });

  it('stop at a warning like a dilemma, and close when made right', () => {
    setup();
    useGameStore.setState({ misconductThreads: [thread('SERIOUS')] });
    const card = nextStep();
    expect(card.threadStep).toBe(1);
    expect(card.title).toBe('A Word After the Booster Lunch');
    answer('RESOLVE');
    expect(useGameStore.getState().misconductThreads).toEqual([]);
    expect(useGameStore.getState().activeDilemma).toBeNull();
    // A warning answered never starts a thread of its own
    expect(useGameStore.getState().dilemmaLog.at(-1)!.threadStep).toBe(1);
  });

  it('ignored to the end: a minor call costs Rating only', () => {
    const { team } = setup();
    useGameStore.setState({ misconductThreads: [thread('MINOR')] });
    nextStep();
    answer('IGNORE');
    expect(useGameStore.getState().misconductThreads[0].step).toBe(2);
    expect(nextStep().threadStep).toBe(2);
    expect(useGameStore.getState().newsArticles.some((a) => a.id.startsWith('news_exposed_bm_test'))).toBe(true); // the story goes public
    answer('IGNORE');
    expect(nextStep().threadStep).toBe(3);
    const before = programRating(team());
    answer('ACCEPT');
    expect(programRating(team())).toBeLessThan(before);
    expect(useGameStore.getState().misconductThreads).toEqual([]);
    expect(useGameStore.getState().coachBench.gamesLeft).toBe(0);
    expect(useGameStore.getState().coachReckonings).toBe(0);
  });

  it('ignored to the end: a serious call costs Rating and a game on the bench, served when the team plays', () => {
    setup();
    useGameStore.setState({ misconductThreads: [thread('SERIOUS', 3)] });
    nextStep();
    answer('ACCEPT');
    expect(useGameStore.getState().coachBench.gamesLeft).toBe(1);
    expect(useGameStore.getState().coachReckonings).toBe(0);
    // The next game is the coordinator's, then he's back
    useGameStore.setState({ activeDilemma: null });
    useGameStore.getState().advanceWeek();
    expect(useGameStore.getState().coachBench.gamesLeft).toBe(0);
  });

  it('ignored to the end: a major call is a reckoning; the 1st keeps the playthrough valid, the 2nd bans a year, the 3rd fires', () => {
    const { currentYear } = setup();
    useGameStore.setState({ misconductThreads: [thread('MAJOR', 3)] });
    expect(nextStep().title).toBe("The District's Findings");
    answer('ACCEPT');
    let s = useGameStore.getState();
    expect(s.coachReckonings).toBe(1);
    expect(s.coachBench.seasons).toEqual([currentYear]); // the rest of this season, playoffs included
    expect(s.career!.reckonings).toHaveLength(1);
    expect(invalidReckonings(s.career!)).toHaveLength(0);
    expect(toEntry(s.career!).reckonings).toBe(0); // still ranked: the Billy Martin chance

    useGameStore.setState({ misconductThreads: [thread('MAJOR', 3, { id: 'bm_second' })] });
    expect(nextStep().title).toBe('Banned for a Year');
    answer('ACCEPT');
    s = useGameStore.getState();
    expect(s.coachBench.seasons).toEqual([currentYear, currentYear + 1]);
    expect(toEntry(s.career!).reckonings).toBe(1); // invalid from here on
    expect(s.firedFrom).toBeNull();

    useGameStore.setState({ misconductThreads: [thread('MAJOR', 3, { id: 'bm_third' }), thread('MINOR', 1, { id: 'bm_open', weeksLeft: 30 })] });
    expect(nextStep().title).toBe('Fired');
    answer('ACCEPT');
    s = useGameStore.getState();
    expect(s.firedFrom).not.toBeNull();
    expect(s.firedForMisconduct).toBe(true);
    expect(s.misconductThreads).toEqual([]); // the career ends: open warnings go with it
  });

  it('suspends a first reckoning into next season when the season has no games left', () => {
    const { currentYear } = setup();
    useGameStore.setState({ currentWeek: 24, playoffBracket: null, misconductThreads: [thread('MAJOR', 3)] });
    useGameStore.setState({ activeDilemma: buildThreadStep(thread('MAJOR', 3), useGameStore.getState().districtTeams[0], 0, false) });
    answer('ACCEPT');
    expect(useGameStore.getState().coachBench.seasons).toEqual([currentYear + 1]);
  });

  it('keeps older saves’ reckonings as they were: each one invalid', () => {
    expect(invalidReckonings({ reckonings: [{ year: 2026, week: 9, title: 'Old' }] })).toHaveLength(1);
    expect(toEntry({ id: 'c', coachName: 'C', scenario: 'OPEN', state: 'Texas', startingSchool: 'X', startingProgram: 'X', startedYear: 2026, length: 3, seasons: [], reckonings: [{ year: 2026, week: 9, title: 'Old' }] }).reckonings).toBe(1);
  });
});
