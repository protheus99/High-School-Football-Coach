import { NarrativeDilemma, Team, DilemmaChoice, Player } from '../types/game';
import { generateProceduralPlayer } from '../generators/rosterGenerator';
import { promoteToStarter, rebuildDepthChart } from './depthChart';
import { TEMPLATES, pick, starters } from './dilemmaTemplates';

// Design spec 12-13: weekly narrative dilemmas with Good / Compromise / Risky / Corrupt choices (library in dilemmaTemplates.ts)
const DILEMMA_CHANCE = 0.6; // not every week brings a crisis
export const DILEMMA_COOLDOWN_WEEKS = 21; // with 50 scenarios, none repeats within a season
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

export function executeDilemmaDecision(userTeam: Team, choice: DilemmaChoice): void {
  const meters = userTeam.programMeters;
  meters.schoolBoardTrust = clampMeter(meters.schoolBoardTrust + choice.impact.schoolBoardTrustDelta);
  meters.boosterApproval = clampMeter(meters.boosterApproval + choice.impact.boosterApprovalDelta);
  meters.lockerRoomDiscipline = clampMeter(meters.lockerRoomDiscipline + choice.impact.lockerRoomDisciplineDelta);
  meters.complianceScore = clampMeter(meters.complianceScore + choice.impact.complianceScoreDelta);

  const { playerAvailabilityOverride, sidelinePlayer, promoteToStarterPlayerId, addTransfer, injuryRisk, removePlayerId } = choice.impact;
  const findPlayer = (id: string) => userTeam.roster.find((p) => p.id === id);

  if (playerAvailabilityOverride) {
    const ply = findPlayer(playerAvailabilityOverride.playerId);
    if (ply) ply.academics.isEligible = playerAvailabilityOverride.isEligible;
  }

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
