// Team › Compliance in words and colors (kept out of the component file so fast refresh works).
import { formatCP } from '../sim/coachPoints';
import { ComplianceStage, SELF_REPORT } from '../sim/compliance';
import { FIRST_OFF_SEASON_WEEK } from '../sim/staffContracts';

export const STAGE_COLORS: Record<ComplianceStage, string> = { QUIET: '#16A34A', WHISPERS: '#CA8A04', QUESTIONS: '#EA580C', INQUIRY: '#DC2626' };

/** Where things stand at a stage, in a sentence. */
export function stageDescription(stage: ComplianceStage, inquiryWeeks: number): string {
  if (stage === 'WHISPERS') return 'People are starting to talk. Nothing official yet.';
  if (stage === 'QUESTIONS') return 'The state association asked for your recruiting records.';
  if (stage === 'INQUIRY') return `A formal inquiry is open (season ${Math.floor(inquiryWeeks / FIRST_OFF_SEASON_WEEK) + 1} of up to 3). It may find something any week.`;
  return 'Nobody is asking questions about your recruiting.';
}

/** What self-reporting costs at a stage, in a sentence. */
export function selfReportSummary(stage: ComplianceStage): string {
  const t = SELF_REPORT[stage];
  const players = t.ineligible ? 'the paid players are ruled ineligible' : `the paid players sit ${t.gamesOut} games`;
  return `Fine ${formatCP(t.fine)}, ${players}${t.probationSeasons ? `, ${t.probationSeasons} season of probation` : ', no probation'}. No playoff ban.`;
}
