import type { BoosterOffer, FeederProspect } from '../types/game';
import { FIRST_OFF_SEASON_WEEK } from './staffContracts';

// ---------------------------------------------------------------------------
// The coach's booster money and the state's slow investigation. Booster offers win prospects (free, once each per
// player) but leave evidence. Evidence feeds a hidden suspicion that grows a little every week and fades on its
// own; as it rises the program passes from Quiet to Whispers (hints), Questions (a first chance to self-report)
// and an Inquiry (a second chance; it runs up to three seasons and may find the offers any week). Evidence fades
// by a quarter every season end, so a one-time slip fades away while a habit catches up with the program.
// ---------------------------------------------------------------------------

export type { BoosterOffer };
export const BOOSTER_ORDER: BoosterOffer[] = ['GIFT', 'TRIP', 'PAYOFF'];
export const BOOSTER_OFFERS: Record<BoosterOffer, { label: string; interest: number; evidence: number; risk: string }> = {
  GIFT: { label: 'Special Gift', interest: 20, evidence: 5, risk: 'a little' },
  TRIP: { label: 'Luxe Trip', interest: 40, evidence: 10, risk: 'more' },
  PAYOFF: { label: 'Payoff', interest: 60, evidence: 20, risk: 'a lot of' }
};
/** Stars draw more attention: their offers leave half again as much evidence. */
export const STAR_EVIDENCE_FACTOR = 1.5;

export type ComplianceStage = 'QUIET' | 'WHISPERS' | 'QUESTIONS' | 'INQUIRY';
export const STAGE_ORDER: ComplianceStage[] = ['QUIET', 'WHISPERS', 'QUESTIONS', 'INQUIRY'];
export const STAGE_LABELS: Record<ComplianceStage, string> = { QUIET: 'Quiet', WHISPERS: 'Whispers', QUESTIONS: 'Questions', INQUIRY: 'Inquiry' };
/** The suspicion each stage starts at. */
export const STAGE_THRESHOLDS = { WHISPERS: 25, QUESTIONS: 50, INQUIRY: 75 } as const;

/** Each week suspicion grows by this share of the evidence, and fades by SUSPICION_FADE. */
export const SUSPICION_GROWTH = 0.02;
export const SUSPICION_FADE = 1;
/** Evidence left after each season end. */
export const EVIDENCE_DECAY = 0.75;
/** An inquiry's weekly chance of finding the offers, and how long it can run (three seasons of weeks). */
export const INQUIRY_FIND_CHANCE = 0.02;
export const INQUIRY_MAX_WEEKS = 3 * FIRST_OFF_SEASON_WEEK;
/** Weekly chance of a new hint once people are talking. */
const HINT_CHANCE = 0.2;

export const COMPLIANCE_TRAINING = { cost: 300, suspicion: 20 };
export const RECORDS_CLEANUP = { cost: 600, evidenceKept: 0.75 };

/** What self-reporting costs at each stage (the earlier, the cheaper). */
export const SELF_REPORT: Record<ComplianceStage, { fine: number; gamesOut: number; ineligible: boolean; probationSeasons: number }> = {
  QUIET: { fine: 150, gamesOut: 2, ineligible: false, probationSeasons: 0 },
  WHISPERS: { fine: 300, gamesOut: 3, ineligible: false, probationSeasons: 0 },
  QUESTIONS: { fine: 500, gamesOut: 3, ineligible: false, probationSeasons: 1 },
  INQUIRY: { fine: 800, gamesOut: 0, ineligible: true, probationSeasons: 1 }
};

/** Caught by the inquiry: the paid players are ruled ineligible, plus probation (and a playoff ban) by the evidence. */
export function foundPenalty(evidence: number): { probationSeasons: number; playoffBan: boolean } {
  if (evidence >= 80) return { probationSeasons: 2, playoffBan: true };
  if (evidence >= 40) return { probationSeasons: 2, playoffBan: false };
  return { probationSeasons: 1, playoffBan: false };
}

/** The final review when a contract ends: its chance of finding what evidence is left. */
export const finalReviewChance = (evidence: number) => (evidence <= 0 ? 0 : Math.min(0.9, evidence / 100));

export interface BoosterRecord {
  prospectId: string;
  name: string;
  position: string;
  offers: BoosterOffer[];
  season: number; // the season of the first offer
}

export interface ComplianceHint {
  year: number;
  week: number;
  text: string;
}

/** The final review's outcome, shown as the contract ends. */
export interface FinalReview {
  school: string;
  found: boolean;
  vacatedWins: number;
  scoreBefore: number;
  scoreAfter: number;
}

export interface ComplianceState {
  evidence: number; // hidden: how bad it is
  suspicion: number; // hidden: how close anyone is to noticing
  stage: ComplianceStage;
  inquiryWeeks: number; // weeks the open inquiry has run
  asked: { questions: boolean; inquiry: boolean }; // the self-report pop-ups shown in this cycle
  pendingDecision: 'QUESTIONS' | 'INQUIRY' | null; // a self-report pop-up waiting for an answer
  decisionDeferred: boolean; // "Decide later": the pop-up waits on the Hub and in Team › Compliance
  offers: BoosterRecord[]; // who the boosters paid, this contract
  offerSeasons: number[]; // seasons with booster offers (their wins are vacated if the final review finds them)
  trainingSeason: number | null; // the season compliance training was last held
  cleanupSeason: number | null; // the season the records were last cleaned up
  hints: ComplianceHint[]; // what people are saying, newest first
  finalReview: FinalReview | null; // the last contract's review, until the coach has seen it
}

export const initialCompliance = (): ComplianceState => ({
  evidence: 0,
  suspicion: 0,
  stage: 'QUIET',
  inquiryWeeks: 0,
  asked: { questions: false, inquiry: false },
  pendingDecision: null,
  decisionDeferred: false,
  offers: [],
  offerSeasons: [],
  trainingSeason: null,
  cleanupSeason: null,
  hints: [],
  finalReview: null
});

/** Booster offers still count against the program (made and not self-reported). */
export const activeBoosterOffers = (p: Pick<FeederProspect, 'boosterOffers' | 'boosterReported'>) => !p.boosterReported && (p.boosterOffers?.length ?? 0) > 0;

/** Evidence one booster offer leaves. */
export const offerEvidence = (offer: BoosterOffer, star: boolean) => BOOSTER_OFFERS[offer].evidence * (star ? STAR_EVIDENCE_FACTOR : 1);

/** The stage a level of suspicion reaches (an open inquiry stays open until it closes). */
export function stageFor(suspicion: number): ComplianceStage {
  if (suspicion >= STAGE_THRESHOLDS.INQUIRY) return 'INQUIRY';
  if (suspicion >= STAGE_THRESHOLDS.QUESTIONS) return 'QUESTIONS';
  if (suspicion >= STAGE_THRESHOLDS.WHISPERS) return 'WHISPERS';
  return 'QUIET';
}

export type ComplianceEvent = 'WHISPERS' | 'QUESTIONS' | 'INQUIRY' | 'INQUIRY_CLOSED' | 'FOUND' | 'HINT';

/**
 * One week: suspicion grows with the evidence and fades a little, the stage follows it, and an open inquiry may
 * find the offers. Returns the new state and what happened (for the news and the pop-ups).
 */
export function advanceComplianceWeek(state: ComplianceState, random: () => number = Math.random): { state: ComplianceState; events: ComplianceEvent[] } {
  const events: ComplianceEvent[] = [];
  const suspicion = Math.max(0, state.suspicion + state.evidence * SUSPICION_GROWTH - SUSPICION_FADE);
  let next: ComplianceState = { ...state, suspicion };

  if (state.stage === 'INQUIRY') {
    const inquiryWeeks = state.inquiryWeeks + 1;
    if (random() < INQUIRY_FIND_CHANCE) return { state: { ...next, inquiryWeeks }, events: ['FOUND'] };
    // An inquiry closes when the talk dies down, or after three seasons without findings
    if (suspicion < STAGE_THRESHOLDS.QUESTIONS || inquiryWeeks >= INQUIRY_MAX_WEEKS) {
      const settled = Math.min(suspicion, STAGE_THRESHOLDS.QUESTIONS - 10);
      next = { ...next, suspicion: settled, stage: stageFor(settled), inquiryWeeks: 0, asked: { ...next.asked, inquiry: false } };
      if (next.pendingDecision === 'INQUIRY') next = { ...next, pendingDecision: null, decisionDeferred: false };
      return { state: next, events: ['INQUIRY_CLOSED'] };
    }
    return { state: { ...next, inquiryWeeks }, events: random() < HINT_CHANCE ? ['HINT'] : [] };
  }

  const stage = stageFor(suspicion);
  const rank = (s: ComplianceStage) => STAGE_ORDER.indexOf(s);
  next = { ...next, stage };
  if (rank(stage) > rank(state.stage)) {
    if (stage === 'INQUIRY') {
      events.push('INQUIRY');
      next = { ...next, inquiryWeeks: 0, asked: { questions: true, inquiry: true }, pendingDecision: 'INQUIRY', decisionDeferred: false };
    } else if (stage === 'QUESTIONS' && !state.asked.questions) {
      events.push('QUESTIONS');
      next = { ...next, asked: { ...next.asked, questions: true }, pendingDecision: 'QUESTIONS', decisionDeferred: false };
    } else if (stage === 'WHISPERS') {
      events.push('WHISPERS');
    }
  }
  // Back to quiet: the next round of talk asks again
  if (stage === 'QUIET' && state.stage !== 'QUIET') next = { ...next, asked: { questions: false, inquiry: false } };
  // A Questions pop-up nobody answered fades with the talk
  if (next.pendingDecision === 'QUESTIONS' && STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf('QUESTIONS')) next = { ...next, pendingDecision: null, decisionDeferred: false };
  if (events.length === 0 && stage !== 'QUIET' && random() < HINT_CHANCE) events.push('HINT');
  return { state: next, events };
}

/** Season end: evidence fades by a quarter. */
export const complianceSeasonEnd = (state: ComplianceState): ComplianceState => ({ ...state, evidence: state.evidence * EVIDENCE_DECAY });

/** A clean slate after a self-report or a finding (who was paid stays in the record for the season's story). */
export const clearedCompliance = (state: ComplianceState): ComplianceState => ({
  ...state,
  evidence: 0,
  suspicion: 0,
  stage: 'QUIET',
  inquiryWeeks: 0,
  asked: { questions: false, inquiry: false },
  pendingDecision: null,
  decisionDeferred: false,
  offerSeasons: []
});

const HINTS: Record<Exclude<ComplianceStage, 'QUIET'>, string[]> = {
  WHISPERS: [
    'A rival coach: "Funny how their recruits all drive new trucks."',
    'Booster club dinner photos are making the rounds online.',
    'Parents at a youth camp are asking how {team} closes on recruits so fast.',
    'A message board thread asks who is paying for {team} recruits’ weekend trips.'
  ],
  QUESTIONS: [
    'The state association asked {team} for its recruiting records.',
    'Your assistant: "Coach, the state called about our recruiting again."',
    'A reporter is asking {team} boosters about recruiting trips.'
  ],
  INQUIRY: [
    'Investigators interviewed two {team} boosters.',
    'State Sports Central: the inquiry into {team} recruiting drags on.',
    'Investigators requested {team} travel receipts.'
  ]
};

/** A hint for the current stage. */
export function complianceHint(stage: ComplianceStage, team: string, random: () => number = Math.random): string {
  if (stage === 'QUIET') return 'No talk about your program.';
  const pool = HINTS[stage];
  return pool[Math.floor(random() * pool.length)].replace('{team}', team);
}
