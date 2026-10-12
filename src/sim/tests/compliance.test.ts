import { describe, it, expect } from 'vitest';
import {
  advanceComplianceWeek,
  complianceSeasonEnd,
  ComplianceState,
  finalReviewChance,
  foundPenalty,
  initialCompliance,
  INQUIRY_MAX_WEEKS,
  offerEvidence,
  SELF_REPORT,
  stageFor
} from '../compliance';
import { boostProspect, createProspect, signProspect } from '../feederEngine';
import { scoreSeason, seasonPoints, vacateSeason } from '../careerScore';
import { FIRST_OFF_SEASON_WEEK } from '../staffContracts';

const WEEKS = FIRST_OFF_SEASON_WEEK; // a season's weeks
const noLuck = () => 0.5; // no hints, no findings

/** Runs seasons of weeks, adding the season's evidence at its start; returns the first week each stage was reached. */
function run(seasonEvidence: number, seasons: number, start: ComplianceState = initialCompliance(), keepPaying = true) {
  let state = start;
  const reached: Record<string, number> = {};
  for (let s = 0; s < seasons; s++) {
    if (s === 0 || keepPaying) state = { ...state, evidence: state.evidence + seasonEvidence };
    for (let w = 0; w < WEEKS; w++) {
      state = advanceComplianceWeek(state, noLuck).state;
      reached[state.stage] ??= s * WEEKS + w + 1;
    }
    state = complianceSeasonEnd(state);
  }
  return { state, reached };
}

describe('Booster evidence and suspicion', () => {
  it('builds slowly: four payoffs a season reach an inquiry in about three seasons, not one', () => {
    const { reached } = run(4 * offerEvidence('PAYOFF', false), 4);
    expect(reached.WHISPERS).toBeGreaterThan(WEEKS / 2);
    expect(reached.QUESTIONS).toBeGreaterThan(WEEKS);
    expect(reached.INQUIRY).toBeGreaterThan(2 * WEEKS);
    expect(reached.INQUIRY).toBeLessThanOrEqual(4 * WEEKS);
  });

  it('a single payoff fades away without anyone noticing', () => {
    const { state, reached } = run(offerEvidence('PAYOFF', false), 3, initialCompliance(), false);
    expect(reached.WHISPERS).toBeUndefined();
    expect(state.stage).toBe('QUIET');
    expect(state.evidence).toBeLessThan(offerEvidence('PAYOFF', false));
  });

  it('carries over: evidence fades by a quarter each season end', () => {
    const after = complianceSeasonEnd(complianceSeasonEnd({ ...initialCompliance(), evidence: 80 }));
    expect(after.evidence).toBeCloseTo(45);
  });

  it('stars leave half again as much evidence', () => {
    expect(offerEvidence('GIFT', false)).toBe(5);
    expect(offerEvidence('TRIP', false)).toBe(10);
    expect(offerEvidence('PAYOFF', true)).toBe(30);
  });

  it('asks once at Questions and again when an inquiry opens', () => {
    const questions = advanceComplianceWeek({ ...initialCompliance(), stage: 'WHISPERS', suspicion: 49.5, evidence: 100 }, noLuck);
    expect(questions.events).toContain('QUESTIONS');
    expect(questions.state).toMatchObject({ stage: 'QUESTIONS', pendingDecision: 'QUESTIONS', asked: { questions: true } });
    const inquiry = advanceComplianceWeek({ ...questions.state, suspicion: 74.5, decisionDeferred: true }, noLuck);
    expect(inquiry.events).toContain('INQUIRY');
    expect(inquiry.state).toMatchObject({ stage: 'INQUIRY', pendingDecision: 'INQUIRY', decisionDeferred: false });
  });

  it('an inquiry may find the offers any week, or closes after three seasons without findings', () => {
    const open: ComplianceState = { ...initialCompliance(), stage: 'INQUIRY', suspicion: 90, evidence: 200, pendingDecision: 'INQUIRY' };
    expect(advanceComplianceWeek(open, () => 0).events).toEqual(['FOUND']);
    let state = open;
    let weeks = 0;
    while (state.stage === 'INQUIRY') {
      state = advanceComplianceWeek(state, noLuck).state;
      weeks++;
    }
    expect(weeks).toBe(INQUIRY_MAX_WEEKS);
    expect(state.pendingDecision).toBeNull();
    expect(state.suspicion).toBeLessThan(50);
  });

  it('stages follow suspicion', () => {
    expect([0, 24, 25, 50, 75].map(stageFor)).toEqual(['QUIET', 'QUIET', 'WHISPERS', 'QUESTIONS', 'INQUIRY']);
  });
});

describe('Penalties', () => {
  it('self-reporting costs more the later it comes', () => {
    expect([SELF_REPORT.QUIET.fine, SELF_REPORT.WHISPERS.fine, SELF_REPORT.QUESTIONS.fine, SELF_REPORT.INQUIRY.fine]).toEqual([150, 300, 500, 800]);
    expect(SELF_REPORT.QUESTIONS).toMatchObject({ gamesOut: 3, probationSeasons: 1, ineligible: false });
    expect(SELF_REPORT.INQUIRY).toMatchObject({ ineligible: true, probationSeasons: 1 });
  });

  it('a finding brings probation by the evidence, and a playoff ban only at 80+', () => {
    expect(foundPenalty(20)).toEqual({ probationSeasons: 1, playoffBan: false });
    expect(foundPenalty(50)).toEqual({ probationSeasons: 2, playoffBan: false });
    expect(foundPenalty(90)).toEqual({ probationSeasons: 2, playoffBan: true });
  });

  it('the final review finds more the more evidence is left', () => {
    expect(finalReviewChance(0)).toBe(0);
    expect(finalReviewChance(30)).toBeCloseTo(0.3);
    expect(finalReviewChance(500)).toBe(0.9);
  });

  it('a vacated season keeps its losses and signees but loses its wins and titles', () => {
    const season = { year: 2027, school: 'X', wins: 9, losses: 2, playoffWins: 3, stateTitle: true, nationalTitle: true, collegeSignees: 4, points: 0 };
    season.points = seasonPoints(season);
    const vacated = vacateSeason(season);
    expect(vacated).toMatchObject({ wins: 0, playoffWins: 0, stateTitle: false, losses: 2, collegeSignees: 4, points: 2 + 4 });
    expect(vacated.vacated).toEqual({ wins: 9, playoffWins: 3, stateTitle: true, nationalTitle: true });
    expect(vacateSeason(vacated)).toBe(vacated);
    expect(typeof scoreSeason).toBe('function');
  });
});

describe('Booster offers on prospects', () => {
  it('add their interest once each, and the prospect signs flagged until it is reported', () => {
    const p = createProspect('MOVE_IN', { prestige: 80 });
    p.interestScore = 20;
    const gift = boostProspect(p, 'GIFT');
    expect(gift.interestScore).toBe(40);
    expect(boostProspect(gift, 'GIFT')).toBe(gift);
    const all = boostProspect(boostProspect(gift, 'TRIP'), 'PAYOFF');
    expect(all.interestScore).toBe(100);
    expect(all.boosterOffers).toEqual(['GIFT', 'TRIP', 'PAYOFF']);
    expect(signProspect(all, 'me', 'me').improperlyRecruited).toBe(true);
    expect(signProspect({ ...all, boosterReported: true }, 'me', 'me').improperlyRecruited).toBeUndefined();
  });
});
