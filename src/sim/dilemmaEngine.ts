import { NarrativeDilemma, Team, DilemmaChoice, Player } from '../types/game';
import { generateProceduralPlayer } from '../generators/rosterGenerator';
import { promoteToStarter, rebuildDepthChart } from './depthChart';
import { TEMPLATES, pick, starters } from './dilemmaTemplates';

// Design spec 12-13: weekly narrative dilemmas with Good / Compromise / Risky / Corrupt choices (library in dilemmaTemplates.ts)
const DILEMMA_CHANCE = 0.6; // not every week brings a crisis
export const DILEMMA_COOLDOWN_WEEKS = 21; // with 51 scenarios, none repeats within a season
export const EXPOSURE_CHANCE: Record<DilemmaChoice['tier'], number> = { GOOD: 0, COMPROMISE: 0, RISKY: 0.15, CORRUPT: 0.3 };

/**
 * Picks this week's dilemma (if any): about 60% of weeks, never repeating a scenario used earlier
 * in the season. The academic check (every third week) takes priority when a starter is failing.
 */
export function generateWeeklyDilemma(week: number, userTeam: Team, recentTemplateIds: string[] = []): NarrativeDilemma | null {
  const eligible = TEMPLATES
    .filter((t) => !recentTemplateIds.includes(t.id))
    .map((t) => ({ template: t, subject: t.appliesTo(userTeam, week) }))
    .filter((c) => c.subject !== null);

  const forced = eligible.find((c) => c.template.id === 'GRADE_CRISIS');
  if (!forced && Math.random() > DILEMMA_CHANCE) return null;

  const chosen = forced ?? pick(eligible);
  if (!chosen) return null;

  const player = chosen.subject === true ? undefined : (chosen.subject as Player);
  return {
    id: `dil_${chosen.template.id.toLowerCase()}_${week}`,
    templateId: chosen.template.id,
    weekTriggered: week,
    ...chosen.template.build(userTeam, week, player)
  };
}

const clampMeter = (value: number) => Math.min(100, Math.max(0, value));

/**
 * What a choice costs, in plain words: meter drops and player consequences. Shown under each answer so
 * the price of a decision is clear (the choice's hidden tier is never shown).
 */
export function dilemmaChoiceCosts(choice: DilemmaChoice, userTeam: Team): string[] {
  const { impact } = choice;
  const name = (id: string) => {
    const p = userTeam.roster.find((pl) => pl.id === id);
    return p ? `${p.position} #${p.lastName}(${p.overallRating})` : 'A player';
  };
  const costs: string[] = [];
  // Rating is the average of the four background meters
  const ratingChange = Math.round((impact.schoolBoardTrustDelta + impact.boosterApprovalDelta + impact.lockerRoomDisciplineDelta + impact.complianceScoreDelta) / 4);
  if (ratingChange < 0) costs.push(`−${-ratingChange} Rating`);
  if (impact.complianceScoreDelta <= -10) costs.push('could draw an investigation');
  if (impact.playerAvailabilityOverride && !impact.playerAvailabilityOverride.isEligible) costs.push(`${name(impact.playerAvailabilityOverride.playerId)} ruled ineligible`);
  if (impact.sidelinePlayer) {
    const w = impact.sidelinePlayer.weeks;
    costs.push(`${name(impact.sidelinePlayer.playerId)} out ${w} week${w === 1 ? '' : 's'}`);
  }
  if (impact.removePlayerId) costs.push(`${name(impact.removePlayerId)} leaves the program`);
  if (impact.injuryRisk) costs.push(`${Math.round(impact.injuryRisk.chance * 100)}% chance a starter is hurt for ${impact.injuryRisk.weeks} weeks`);
  return costs;
}

export function executeDilemmaDecision(userTeam: Team, choice: DilemmaChoice): void {
  const meters = userTeam.programMeters;
  meters.schoolBoardTrust = clampMeter(meters.schoolBoardTrust + choice.impact.schoolBoardTrustDelta);
  meters.boosterApproval = clampMeter(meters.boosterApproval + choice.impact.boosterApprovalDelta);
  meters.lockerRoomDiscipline = clampMeter(meters.lockerRoomDiscipline + choice.impact.lockerRoomDisciplineDelta);
  meters.complianceScore = clampMeter(meters.complianceScore + choice.impact.complianceScoreDelta);

  const { playerAvailabilityOverride, sidelinePlayer, promoteToStarterPlayerId, addTransfer, injuryRisk, removePlayerId, gpaChanges } = choice.impact;
  const findPlayer = (id: string) => userTeam.roster.find((p) => p.id === id);

  if (playerAvailabilityOverride) {
    const ply = findPlayer(playerAvailabilityOverride.playerId);
    if (ply) ply.academics.isEligible = playerAvailabilityOverride.isEligible;
  }

  // Study hall and tutoring raise grades; 2.0 is the "No Pass, No Play" line
  gpaChanges?.forEach(({ playerId, amount }) => {
    const ply = findPlayer(playerId);
    if (!ply) return;
    ply.academics.gpa = Math.min(4, Math.max(1.2, Number((ply.academics.gpa + amount).toFixed(2))));
    ply.academics.isEligible = ply.academics.gpa >= 2.0;
  });

  if (sidelinePlayer) {
    const ply = findPlayer(sidelinePlayer.playerId);
    if (ply) {
      ply.condition.injuryStatus = 'DINGED';
      ply.condition.injuryWeeksRemaining = Math.max(ply.condition.injuryWeeksRemaining, sidelinePlayer.weeks);
    }
  }

  if (promoteToStarterPlayerId) promoteToStarter(userTeam.roster, promoteToStarterPlayerId);

  if (addTransfer) {
    const classYear = Math.random() < 0.5 ? 'Junior' : 'Sophomore';
    // Roll until the transfer lands near the advertised rating (3-4 star rolls are common enough)
    let transfer = generateProceduralPlayer(addTransfer.position, classYear, 1);
    for (let tries = 0; tries < 200 && Math.abs(transfer.overallRating - addTransfer.overallRating) > 2; tries++) {
      transfer = generateProceduralPlayer(addTransfer.position, classYear, 1);
    }
    const [firstName, ...rest] = addTransfer.name.split(' ');
    transfer.firstName = firstName;
    transfer.lastName = rest.join(' ');
    userTeam.roster.push(transfer);
    rebuildDepthChart(userTeam.roster);
  }

  if (removePlayerId && userTeam.roster.some((p) => p.id === removePlayerId)) {
    userTeam.roster = userTeam.roster.filter((p) => p.id !== removePlayerId);
    rebuildDepthChart(userTeam.roster);
  }

  if (injuryRisk && Math.random() < injuryRisk.chance) {
    const victim = pick(starters(userTeam));
    if (victim) {
      victim.condition.injuryStatus = 'MODERATE';
      victim.condition.injuryWeeksRemaining = Math.max(victim.condition.injuryWeeksRemaining, injuryRisk.weeks);
    }
  }
}
