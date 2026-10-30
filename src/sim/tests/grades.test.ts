import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDistrictTeams } from '../../generators/rosterGenerator';
import { GRADE_FIXES, gpaTrend, gradeList, isReportCardWeek, startersAtRisk, weeksToReportCard } from '../grades';
import { evaluateAcademicReport } from '../playerEngine';
import { advanceBlocker, gradesNeedReview } from '../advanceGate';
import { TEXAS_RULES } from '../stateRules';
import { Player } from '../../types/game';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
import { useGameStore } from '../../store/gameStore';

afterEach(() => vi.restoreAllMocks());

describe('Grades: the fixes', () => {
  it('cost and give what was approved', () => {
    expect(GRADE_FIXES).toEqual({
      STUDY_HALL: { label: 'Study hall', cost: 20, gain: 0.15 },
      TUTOR: { label: 'Tutor', cost: 60, gain: 0.25 },
      TEACHER: { label: 'Teacher', cost: 10, gain: 0.1 }
    });
  });

  const setup = () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId } = useGameStore.getState();
    const team = () => useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    const player = team().roster.find((p) => p.depthChartTier === 1)!;
    Object.assign(player.academics, { gpa: 2.1, isEligible: true });
    useGameStore.setState({ coachPoints: 200 });
    const me = () => team().roster.find((p) => p.id === player.id)!;
    return { me, book: (fix: keyof typeof GRADE_FIXES) => useGameStore.getState().bookGradeFix(player.id, fix) };
  };
  const cp = () => useGameStore.getState().coachPoints;

  it('books one fix per player per report card, and refunds a fix cancelled before it', () => {
    const { me, book } = setup();
    book('TUTOR');
    expect(me().academics.gradeFix).toBe('TUTOR');
    expect(cp()).toBe(140);
    book('STUDY_HALL'); // one at a time
    expect(me().academics.gradeFix).toBe('TUTOR');
    expect(cp()).toBe(140);
    book('TUTOR'); // cancelled: the money comes back
    expect(me().academics.gradeFix).toBeUndefined();
    expect(cp()).toBe(200);
    useGameStore.setState({ coachPoints: 15 });
    book('STUDY_HALL'); // can't afford it
    expect(me().academics.gradeFix).toBeUndefined();
  });

  it("gives the teacher's help once a season per player (cancelling gives it back)", () => {
    const { me, book } = setup();
    const { currentYear } = useGameStore.getState();
    book('TEACHER');
    book('TEACHER');
    expect(me().academics.teacherYear).toBeUndefined();
    book('TEACHER');
    expect(me().academics.teacherYear).toBe(currentYear);
    // The report card uses it up
    useGameStore.setState({ currentWeek: 11 });
    useGameStore.getState().advanceWeek();
    expect(me().academics.gradeFix).toBeUndefined();
    book('TEACHER');
    expect(me().academics.gradeFix).toBeUndefined();
    book('STUDY_HALL');
    expect(me().academics.gradeFix).toBe('STUDY_HALL');
    // A new season, a new chance
    useGameStore.setState({ currentYear: currentYear + 1 });
    book('STUDY_HALL');
    book('TEACHER');
    expect(me().academics.gradeFix).toBe('TEACHER');
  });

  it('refunds a fix booked for a player who leaves the program before the report card', () => {
    const { me, book } = setup();
    const { userTeamId } = useGameStore.getState();
    book('TUTOR');
    expect(useGameStore.getState().bookedGradeFixes).toEqual({ [me().id]: 'TUTOR' });
    const gone = me().id;
    const team = useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    team.roster = team.roster.filter((p) => p.id !== gone); // he transfers out (or graduates)
    useGameStore.getState().settleGradeFixes();
    expect(cp()).toBe(200);
    expect(useGameStore.getState().bookedGradeFixes).toEqual({});
  });

  it('settles a fix used at a report card without a refund', () => {
    const { me, book } = setup();
    book('STUDY_HALL');
    useGameStore.setState({ currentWeek: 11 });
    useGameStore.getState().advanceWeek(); // week 12: report cards use it
    useGameStore.setState({ activeDilemma: null });
    const before = cp();
    useGameStore.getState().settleGradeFixes();
    expect(cp()).toBe(before);
    expect(useGameStore.getState().bookedGradeFixes).toEqual({});
    expect(me().academics.gradeFix).toBeUndefined();
  });

  it('adds its bonus at the next report card, and records the GPA trend', () => {
    const { me, book } = setup();
    me().attributes.footballIQ = 50;
    book('TUTOR');
    useGameStore.setState({ currentWeek: 11 });
    useGameStore.getState().advanceWeek(); // week 12: report cards
    const gpa = me().academics.gpa;
    expect(gpa).toBeGreaterThanOrEqual(2.1 + 0.25 - 0.4 - 0.001);
    expect(gpa).toBeLessThanOrEqual(2.1 + 0.25 + 0.4 + 0.001);
    expect(me().academics.gpaHistory).toEqual([2.1, gpa]);
    expect(me().academics.gradeFix).toBeUndefined();
  });

  it('applies the fix exactly once, with no luck in the roll', () => {
    const [team] = generateDistrictTeams();
    const p = team.roster[0];
    Object.assign(p.academics, { gpa: 2.0, isEligible: true });
    p.attributes.footballIQ = 50;
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // the roll's own change is 0
    evaluateAcademicReport(p, GRADE_FIXES.STUDY_HALL.gain, TEXAS_RULES);
    expect(p.academics.gpa).toBe(2.15);
  });
});

describe('Grades: the trend and the list', () => {
  const [team] = generateDistrictTeams();
  const reset = () => team.roster.forEach((p) => Object.assign(p.academics, { gpa: 3, isEligible: true, gpaHistory: undefined }));

  it('shows the last three report cards, starting from the GPA an older save had', () => {
    const p = team.roster[0];
    reset();
    expect(gpaTrend(p)).toEqual([3]);
    p.academics.gpaHistory = [2.31, 2.12, 1.92];
    p.academics.gpa = 1.92;
    expect(gpaTrend(p)).toEqual([2.31, 2.12, 1.92]);
    p.academics.gpa = 2.07; // a dilemma moved it since
    expect(gpaTrend(p)).toEqual([2.12, 1.92, 2.07]);
  });

  it('lists the ineligible first, then those at risk, starters first', () => {
    reset();
    const [starter, backup] = [team.roster.find((p) => p.depthChartTier === 1)!, team.roster.find((p) => p.depthChartTier !== 1)!];
    const other = team.roster.find((p) => p.depthChartTier === 1 && p !== starter)!;
    Object.assign(backup.academics, { gpa: 1.9, isEligible: false });
    Object.assign(starter.academics, { gpa: 2.2 });
    Object.assign(other.academics, { gpa: 2.25 });
    const backupAtRisk = team.roster.find((p) => p.depthChartTier !== 1 && p !== backup)!;
    Object.assign(backupAtRisk.academics, { gpa: 2.1 });
    const list = gradeList(team, TEXAS_RULES).map((p: Player) => p.id);
    expect(list[0]).toBe(backup.id);
    expect(list.indexOf(backupAtRisk.id)).toBe(3);
    expect(list).toHaveLength(4);
    expect(startersAtRisk(team, TEXAS_RULES).map((p) => p.id).sort()).toEqual([starter.id, other.id].sort());
  });

  it('counts the weeks to the next report card (every third week from week 9), into next season at the end', () => {
    expect([8, 9, 10, 11].map((w) => weeksToReportCard(w, 28))).toEqual([4, 3, 2, 1]);
    expect([3, 6, 9, 12, 18, 24].map(isReportCardWeek)).toEqual([false, false, false, true, true, true]);
    // The last report card of a 28-week season is week 27: after it, the next is week 9 next season
    expect(weeksToReportCard(27, 28)).toBe(1 + 12);
    expect(weeksToReportCard(28, 28)).toBe(12);
    expect(weeksToReportCard(2, 28)).toBe(10);
  });

  it('keeps a booked fix on the list after a dilemma lifts the player above the line, so it can be cancelled', () => {
    reset();
    const p = team.roster.find((x) => x.depthChartTier === 1)!;
    Object.assign(p.academics, { gpa: 2.6, gradeFix: 'TUTOR' });
    expect(gradeList(team, TEXAS_RULES).map((x) => x.id)).toEqual([p.id]);
    expect(startersAtRisk(team, TEXAS_RULES)).toEqual([]); // not on the Hub's card: he's safe
    const risky = team.roster.find((x) => x.depthChartTier === 1 && x !== p)!;
    risky.academics.gpa = 2.2;
    expect(gradeList(team, TEXAS_RULES).map((x) => x.id)).toEqual([risky.id, p.id]); // at risk first
    delete p.academics.gradeFix;
  });
});

describe('Grades: Advance waits for the review', () => {
  it('blocks the week before a report card while a starter could be ineligible, until Team › Grades is opened', () => {
    useGameStore.getState().startNewSeason();
    const { userTeamId } = useGameStore.getState();
    const team = useGameStore.getState().districtTeams.find((t) => t.id === userTeamId)!;
    team.roster.forEach((p) => Object.assign(p.academics, { gpa: 3, isEligible: true }));
    useGameStore.setState({ currentWeek: 11, activeDilemma: null });
    expect(gradesNeedReview(useGameStore.getState())).toBe(false);
    team.roster.find((p) => p.depthChartTier === 1)!.academics.gpa = 2.2;
    expect(advanceBlocker(useGameStore.getState())).toBe('GRADES');
    // Only the week before a report card (week 12's): weeks 12 and 13 don't ask
    useGameStore.setState({ currentWeek: 12 });
    expect(gradesNeedReview(useGameStore.getState())).toBe(false);
    useGameStore.setState({ currentWeek: 13 });
    expect(gradesNeedReview(useGameStore.getState())).toBe(false);
    useGameStore.setState({ currentWeek: 11 });
    // A decision comes first
    useGameStore.setState({ activeDilemma: { id: 'd', title: 'T', scenario: '', weekTriggered: 11, choices: [] } });
    expect(advanceBlocker(useGameStore.getState())).toBe('DECISION');
    useGameStore.setState({ activeDilemma: null });
    useGameStore.getState().markGradesReviewed();
    expect(advanceBlocker(useGameStore.getState())).not.toBe('GRADES');
    // The next report card's week before asks again (week 18's)
    useGameStore.setState({ currentWeek: 14 });
    expect(gradesNeedReview(useGameStore.getState())).toBe(false);
    useGameStore.setState({ currentWeek: 17 });
    expect(gradesNeedReview(useGameStore.getState())).toBe(true);
    // Not in the off-season
    useGameStore.setState({ currentWeek: 2 });
    expect(gradesNeedReview(useGameStore.getState())).toBe(false);
  });
});
