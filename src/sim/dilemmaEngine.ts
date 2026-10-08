import { NarrativeDilemma, Team, DilemmaChoice, Player } from '../types/game';
import { generateProceduralPlayer } from '../generators/rosterGenerator';
import { promoteToStarter, rebuildDepthChart } from './depthChart';
import { TEMPLATES, pick, starters } from './dilemmaTemplates';
import { rulesForState } from './stateRules';

// Design spec 12-13: weekly narrative dilemmas with Good / Compromise / Risky / Corrupt choices (library in dilemmaTemplates.ts)
const DILEMMA_CHANCE = 0.6; // not every week brings a crisis
export const DILEMMA_COOLDOWN_WEEKS = 28; // with dozens of scenarios, none repeats within a season
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

/** A Rating change as stacked chevrons: 1-2 points one, 3-4 two, 5 or more three (negative for a loss). */
export type ChevronLevel = -3 | -2 | -1 | 0 | 1 | 2 | 3;
export function chevronLevel(points: number): ChevronLevel {
  const n = Math.abs(points);
  const level = n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
  return (Math.sign(points) * level) as ChevronLevel;
}

export interface ChoiceEffects {
  rating: number; // the combined Rating change, in whole points
  ratingLevel: ChevronLevel;
  coachPoints: number; // ₡ gained (+) or spent (-)
  gains: string[];
  losses: string[];
  investigationRisk: boolean;
}

/**
 * What a choice does, as the player sees it: the combined Rating change (the four background meters stay hidden),
 * Coach Points, and the visible gains and losses for players, with any investigation risk flagged. The choice's
 * tier is never shown.
 */
export function dilemmaChoiceEffects(choice: DilemmaChoice, userTeam: Team): ChoiceEffects {
  const { impact } = choice;
  const name = (id: string) => {
    const p = userTeam.roster.find((pl) => pl.id === id);
    return p ? `${p.position} ${p.lastName}` : 'A player';
  };
  // Rating is the average of the four background meters
  const rating = Math.round((impact.schoolBoardTrustDelta + impact.boosterApprovalDelta + impact.lockerRoomDisciplineDelta + impact.complianceScoreDelta) / 4);
  const gains: string[] = [];
  const losses: string[] = [];
  const availability = impact.playerAvailabilityOverride;
  if (availability) (availability.isEligible ? gains : losses).push(`${name(availability.playerId)} ${availability.isEligible ? 'stays eligible' : 'ruled ineligible'}`);
  if (impact.promoteToStarterPlayerId) gains.push(`${name(impact.promoteToStarterPlayerId)} starts`);
  if (impact.addTransfer) gains.push(`Transfer ${impact.addTransfer.position} (${impact.addTransfer.overallRating}) joins`);
  const grades = impact.gpaChanges ?? [];
  if (grades.length > 0) {
    const up = grades[0].amount > 0;
    const who = grades.length === 1 ? `${name(grades[0].playerId)} grades` : `Grades for ${grades.length} players`;
    (up ? gains : losses).push(`${who} ${up ? 'up' : 'down'}`);
  }
  if (impact.sidelinePlayer) {
    const w = impact.sidelinePlayer.weeks;
    losses.push(`${name(impact.sidelinePlayer.playerId)} out ${w} wk`);
  }
  if (impact.removePlayerId) losses.push(`${name(impact.removePlayerId)} leaves the program`);
  if (impact.injuryRisk) losses.push(`${Math.round(impact.injuryRisk.chance * 100)}% chance a starter is hurt ${impact.injuryRisk.weeks} wk`);
  const investigationRisk = impact.complianceScoreDelta <= -10;
  if (investigationRisk) losses.push('⚠ Investigation risk');
  return { rating, ratingLevel: chevronLevel(rating), coachPoints: impact.coachPointsDelta ?? 0, gains, losses, investigationRisk };
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
    ply.academics.isEligible = ply.academics.gpa >= rulesForState(userTeam.state).academics.minimumGpa;
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
