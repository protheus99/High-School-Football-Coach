import { describe, it, expect, vi, afterEach } from 'vitest';
import { restrictedOnProbation } from '../feederCompetition';

vi.mock('../../services/db', () => ({ persistSaveGame: vi.fn(async () => undefined) }));
// A switch for the investigation: tests can make this week's inquiry find the offers
const force = vi.hoisted(() => ({ found: false }));
vi.mock('../compliance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../compliance')>();
  return {
    ...actual,
    advanceComplianceWeek: (state: import('../compliance').ComplianceState, random?: () => number) =>
      force.found ? { state, events: ['FOUND'] } : actual.advanceComplianceWeek(state, random)
  };
});
import { useGameStore } from '../../store/gameStore';
import { initialCompliance } from '../compliance';

const store = useGameStore;
afterEach(() => {
  force.found = false;
  vi.restoreAllMocks();
});

/** A fresh game and a prospect boosters could pay. */
function setup() {
  store.getState().newGame('MEDIUM', 'Maryland');
  const prospect = store.getState().scoutingPool.find((p) => p.source !== 'TRYOUT' && p.source !== 'STAR_RECRUIT' && p.interestScore <= 30)!;
  const me = store.getState().leagueTeams.find((t) => t.id === store.getState().userTeamId)!;
  return { prospect, me };
}

describe('Booster offers in the game', () => {
  it('are free, add their interest now, leave evidence and are recorded', () => {
    const { prospect } = setup();
    const cp = store.getState().coachPoints;
    store.getState().makeBoosterOffer(prospect.id, 'PAYOFF');
    store.getState().makeBoosterOffer(prospect.id, 'PAYOFF'); // once only
    const after = store.getState().scoutingPool.find((p) => p.id === prospect.id)!;
    expect(store.getState().coachPoints).toBe(cp);
    expect(after.interestScore).toBe(Math.min(100, prospect.interestScore + 60));
    expect(after.boosterOffers).toEqual(['PAYOFF']);
    const { compliance, currentYear } = store.getState();
    expect(compliance.evidence).toBe(20);
    expect(compliance.offers[0]).toMatchObject({ prospectId: prospect.id, offers: ['PAYOFF'], season: currentYear });
    expect(compliance.offerSeasons).toEqual([currentYear]);

    // Tryout walk-ons aren't recruited with booster money
    const tryout = store.getState().scoutingPool.find((p) => p.source === 'TRYOUT');
    if (tryout) {
      store.getState().makeBoosterOffer(tryout.id, 'GIFT');
      expect(store.getState().scoutingPool.find((p) => p.id === tryout.id)!.boosterOffers).toBeUndefined();
    }
  });

  it('clean-up purchases cost CP and work once a season', () => {
    setup();
    store.setState({ coachPoints: 2000, compliance: { ...initialCompliance(), evidence: 100, suspicion: 60, stage: 'QUESTIONS' } });
    store.getState().holdComplianceTraining();
    store.getState().holdComplianceTraining();
    expect(store.getState().compliance.suspicion).toBe(40);
    store.getState().cleanUpRecords();
    store.getState().cleanUpRecords();
    expect(store.getState().compliance.evidence).toBe(75);
    expect(store.getState().coachPoints).toBe(2000 - 300 - 600);
  });

  it('self-reporting at Questions: a fine that can go below zero, suspensions, probation, a clean slate', () => {
    const { prospect, me } = setup();
    store.getState().makeBoosterOffer(prospect.id, 'GIFT');
    const paid = me.roster.slice(0, 2);
    paid.forEach((p) => (p.improperlyRecruited = true));
    const { currentYear } = store.getState();
    store.setState({ coachPoints: 100, compliance: { ...store.getState().compliance, stage: 'QUESTIONS', suspicion: 55, pendingDecision: 'QUESTIONS' } });
    store.getState().selfReport();
    const s = store.getState();
    expect(s.coachPoints).toBe(-400);
    expect(paid.every((p) => p.condition.isSuspended && p.condition.injuryWeeksRemaining === 3 && !p.improperlyRecruited)).toBe(true);
    expect(me.roster).toEqual(expect.arrayContaining(paid));
    expect(s.userProbationUntil).toBe(currentYear);
    expect(s.compliance).toMatchObject({ evidence: 0, suspicion: 0, stage: 'QUIET', pendingDecision: null });
    expect(s.scoutingPool.find((p) => p.id === prospect.id)!.boosterReported).toBe(true);
    expect(s.newsArticles[0].headline).toContain('Self-Reports');
  });

  it('self-reporting during an inquiry rules the paid players ineligible', () => {
    const { me } = setup();
    const paid = me.roster.slice(0, 2);
    paid.forEach((p) => (p.improperlyRecruited = true));
    store.setState({ compliance: { ...initialCompliance(), stage: 'INQUIRY', suspicion: 80, evidence: 60 } });
    const cp = store.getState().coachPoints;
    store.getState().selfReport();
    expect(me.roster.some((p) => paid.includes(p))).toBe(false);
    expect(store.getState().coachPoints).toBe(cp - 800);
  });

  it('a finding rules the paid players ineligible, puts the program on probation and, at 80+ evidence, bans it', () => {
    const { me } = setup();
    const { currentYear } = store.getState();
    const tainted = me.roster.slice(0, 2);
    tainted.forEach((p) => (p.improperlyRecruited = true));
    store.setState({ compliance: { ...initialCompliance(), stage: 'INQUIRY', suspicion: 90, evidence: 120 } });
    force.found = true;
    store.getState().advanceWeek();
    force.found = false;
    const s = store.getState();
    expect(me.roster.some((p) => tainted.includes(p))).toBe(false);
    expect(s.userProbationUntil).toBe(currentYear + 1);
    expect(s.sanctionLevel).toBe(3);
    expect(s.compliance.evidence).toBe(0);
    expect(s.newsArticles.some((a) => a.headline.startsWith('Inquiry Finds'))).toBe(true);

    // On probation, out-of-area prospects are off limits (contacts and booster offers alike)
    store.setState({ coachPoints: 1000 });
    const wide = store.getState().widePool[0];
    store.getState().contactFeederProspect(wide.id, 'TEXT');
    store.getState().makeBoosterOffer(wide.id, 'GIFT');
    expect(store.getState().widePool[0].interestScore).toBe(wide.interestScore);
    expect(store.getState().coachPoints).toBe(1000);
    const local = store.getState().scoutingPool.find((p) => !restrictedOnProbation(p))!;
    store.getState().contactFeederProspect(local.id, 'TEXT');
    expect(store.getState().coachPoints).toBeLessThan(1000);
  });

  it('the final review at contract end vacates the wins of the seasons with offers', () => {
    store.getState().newScenarioGame('RECLAIM', 'Texas', 'Odessa Permian', 'Tester', 3);
    const career = store.getState().career!;
    const season = (year: number) => ({ year, school: 'Odessa Permian', wins: 8, losses: 2, playoffWins: 1, stateTitle: false, collegeSignees: 2, points: 8 * 5 + 2 + 8 + 2 });
    store.setState({
      career: { ...career, seasons: [season(2026), season(2027), season(2028)] },
      compliance: { ...initialCompliance(), evidence: 500, offerSeasons: [2027] }
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    store.getState().transitionToNextYear();
    vi.restoreAllMocks();
    const s = store.getState();
    expect(s.careerComplete).toBe(true);
    expect(s.compliance.finalReview).toMatchObject({ found: true, vacatedWins: 9, school: 'Odessa Permian' });
    expect(s.compliance.finalReview!.scoreAfter).toBeLessThan(s.compliance.finalReview!.scoreBefore);
    expect(s.career!.seasons[1]).toMatchObject({ wins: 0, playoffWins: 0, vacated: { wins: 8, playoffWins: 1 } });
    expect(s.career!.seasons[0].wins).toBe(8);
    store.getState().dismissFinalReview();
    expect(store.getState().compliance.finalReview).toBeNull();
  });
});
