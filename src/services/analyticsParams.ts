import { FeederProspect, Player } from '../types/game';
import { currentCommitment, interestLabel, prospectRankScore } from '../sim/feederEngine';
import { getSeasonPhase } from '../sim/scheduleEngine';
import { gameStakes, SeasonView, TalkOption } from '../sim/talkPicker';
import { TALKS } from '../sim/talks';

// ---------------------------------------------------------------------------
// The parameters game events share (docs/ANALYTICS.md): where the career is, and bands and categories instead of raw
// values, so Google Analytics reports stay readable (few distinct values) and nothing points at a person. Never names
// or ids: a prospect is his position, source, rating band and interest.
// ---------------------------------------------------------------------------

/** Where the career is: its season (1 = the first), the week and the season's phase. */
export const moment = (s: { currentYear: number; currentWeek: number }) => ({ season: s.currentYear - 2025, week: s.currentWeek, phase: getSeasonPhase(s.currentWeek) });

/** A rating in tens: "<50", "50s", "60s", "70s", "80+". */
export function ratingBand(rating: number): string {
  const r = Math.round(rating);
  return r < 50 ? '<50' : r >= 80 ? '80+' : `${Math.floor(r / 10) * 10}s`;
}

/** Interest in the game's own words: cold, lukewarm, warm, hot. */
export const interestBand = (interest: number) => interestLabel(interest).toLowerCase();

/** A GPA against the 2.0 line: "<1.5", "1.5-1.9", "2.0-2.4", "2.5+". */
export const gpaBand = (gpa: number) => (gpa < 1.5 ? '<1.5' : gpa < 2 ? '1.5-1.9' : gpa < 2.5 ? '2.0-2.4' : '2.5+');

/** Coach Points on hand: "<50", "50-149", "150-299", "300+". */
export const pointsBand = (cp: number) => (cp < 50 ? '<50' : cp < 150 ? '50-149' : cp < 300 ? '150-299' : '300+');

/** A score difference from the coach's side: "down_9+", "down_1-8", "tied", "up_1-8", "up_9+". */
export const scoreBand = (diff: number) => (diff === 0 ? 'tied' : `${diff > 0 ? 'up' : 'down'}_${Math.abs(diff) >= 9 ? '9+' : '1-8'}`);

/** A button's label as a short id: "📚 Review grades" is "review_grades". */
export const labelId = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

/** Where a prospect is committed right now, from the coach's side: us, a rival, or nobody yet. */
export function commitStatus(p: FeederProspect, userTeamId: string): 'us' | 'rival' | 'none' {
  const c = currentCommitment(p, userTeamId);
  return !c ? 'none' : c.teamId === userTeamId ? 'us' : 'rival';
}

/** His place in the public prospect ranking of his own list (the district, the State list or the National list). */
export function rankBand(p: FeederProspect, list: FeederProspect[]): string {
  const score = prospectRankScore(p);
  const rank = 1 + list.filter((q) => (q.scope ?? 'DISTRICT') === (p.scope ?? 'DISTRICT') && prospectRankScore(q) > score).length;
  return rank <= 10 ? 'top10' : rank <= 25 ? '11-25' : '26+';
}

/**
 * A prospect before a recruiting action: what he is (his true rating and potential, and whether the coach has
 * scouted them), where he ranks, and how close he is to the program.
 */
export function prospectParams(p: FeederProspect, list: FeederProspect[], userTeamId: string) {
  return {
    position: p.projectedPosition,
    source: p.source,
    pool: p.scope ?? 'DISTRICT',
    rating_band: ratingBand(p.trueOverall),
    potential: p.truePotential,
    rank_band: rankBand(p, list),
    scouted: p.revealedPotential !== 'UNKNOWN',
    contacts: p.coachContacts,
    interest_band: interestBand(p.interestScore),
    interest_before: Math.round(p.interestScore),
    commit_before: commitStatus(p, userTeamId)
  };
}

/** The same prospect after the action. */
export const prospectAfter = (p: FeederProspect | undefined, userTeamId: string) =>
  p ? { interest_after: Math.round(p.interestScore), commit_after: commitStatus(p, userTeamId) } : {};

/** A player on the coach's roster. */
export const playerParams = (p: Player) => ({ position: p.position, rating_band: ratingBand(p.overallRating), starter: p.depthChartTier === 1 });

/** This week's game as events see it: rivalry, home and the playoff round (none when there is no game). */
export function gameContext(s: SeasonView) {
  const stakes = gameStakes(s);
  if (!stakes) return {};
  return { rivalry: stakes.rivalry, home: stakes.home, playoff: stakes.playoffRound !== null, playoff_round: stakes.playoffRound ?? undefined };
}

/** A speech's family (MOMENTUM, DEFENSE...) by its id. */
export const talkFamily = (id: string) => TALKS.find((t) => t.id === id)?.family ?? 'unknown';

/** The second-string setting: the lead that sends in the bench (28, 35, 42), or never. */
export const secondString = (lead: number | null | undefined) => (lead === null || lead === undefined ? 'never' : String(lead));

/** A speech the coach gave: which one, its family, which of the offered speeches it was, and how well it fit. */
export function talkParams(given: TalkOption, offered: TalkOption[]) {
  const pick = offered.findIndex((o) => o.talk.id === given.talk.id);
  return {
    talk: given.talk.id,
    family: given.talk.family,
    risky: !!given.talk.risky,
    pick: pick < 0 ? undefined : pick + 1,
    offered: offered.length,
    fit: given.score >= 2 ? 'built_for' : 'general'
  };
}

/** How the coach ran a live game: the plays he called himself and the furthest he simmed ahead. */
const SIM_AHEAD = ['none', 'quarter', 'half', 'end'] as const;
export type SimAhead = (typeof SIM_AHEAD)[number];
export const liveTally = {
  plays: 0,
  defCalls: 0,
  simAhead: 'none' as SimAhead,
  reset() {
    this.plays = 0;
    this.defCalls = 0;
    this.simAhead = 'none';
  },
  simmed(to: Exclude<SimAhead, 'none'>) {
    if (SIM_AHEAD.indexOf(to) > SIM_AHEAD.indexOf(this.simAhead)) this.simAhead = to;
  },
  params() {
    return { coach_plays: this.plays, coach_def_calls: this.defCalls, sim_ahead: this.simAhead };
  }
};
