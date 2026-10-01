import { NarrativeDilemma, Team, DilemmaChoice, Player, Position } from '../types/game';
import { generateProceduralPlayer } from '../generators/rosterGenerator';
import { rebuildDepthChart } from './depthChart';
import { randomInt } from './math/variance';

// Design spec 12-13: weekly narrative dilemmas with Good / Compromise / Risky / Corrupt choices
const DILEMMA_CHANCE = 0.6; // not every week brings a crisis
export const DILEMMA_COOLDOWN_WEEKS = 5; // the same scenario cannot repeat within this many weeks
export const EXPOSURE_CHANCE: Record<DilemmaChoice['tier'], number> = { GOOD: 0, COMPROMISE: 0, RISKY: 0.15, CORRUPT: 0.3 };

type Impact = DilemmaChoice['impact'];
const impact = (board: number, booster: number, discipline: number, compliance: number, extra: Partial<Impact> = {}): Impact => ({
  schoolBoardTrustDelta: board,
  boosterApprovalDelta: booster,
  lockerRoomDisciplineDelta: discipline,
  complianceScoreDelta: compliance,
  ...extra
});

interface DilemmaTemplate {
  id: string;
  /** Returns the player the scenario is about (or true when none is needed), or null if it cannot occur. */
  appliesTo: (team: Team, week: number) => Player | true | null;
  build: (team: Team, week: number, player?: Player) => Omit<NarrativeDilemma, 'id' | 'weekTriggered' | 'templateId'>;
}

const pick = <T,>(items: T[]): T | undefined => items[randomInt(0, items.length - 1)];
const starters = (team: Team) => team.roster.filter((p) => p.depthChartTier === 1);
const isGameWeek = (week: number) => week >= 5 && week <= 18;

const TEMPLATES: DilemmaTemplate[] = [
  {
    id: 'GRADE_CRISIS',
    appliesTo: (team, week) => (week % 3 === 0 ? starters(team).find((p) => p.academics.gpa < 2.3) ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Midterm Grade Crisis',
      scenario: `Star ${player!.position} #${player!.lastName} is failing Algebra right before Friday's matchup. The math teacher asks if you want to intervene.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_good', label: 'Enforce "No Pass, No Play" (Bench Him)', description: 'Uphold school integrity. He sits until his grades recover.', tier: 'GOOD',
          impact: impact(10, -15, 12, 10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: false } }) },
        { id: 'opt_compromise', label: 'Assign Emergency Study Hall', description: 'Mandate weekend tutoring; he plays but the booster club grumbles about the precedent.', tier: 'COMPROMISE',
          impact: impact(0, -5, 0, 0) },
        { id: 'opt_risky', label: 'Ask the Counselor to Delay the Grade Report', description: 'Buys a week of eligibility, but paperwork leaves a trail.', tier: 'RISKY',
          impact: impact(-8, 5, -5, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_corrupt', label: 'Direct the Teacher to Supply "Extra Credit"', description: 'Falsify passing grades to guarantee his presence on Friday.', tier: 'CORRUPT',
          impact: impact(-18, 12, -15, -25, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) }
      ]
    })
  },
  {
    id: 'BOOSTER_HEADSETS',
    appliesTo: (team) => team.roster.find((p) => p.parent.archetype === 'DEMANDING_BOOSTER' && p.depthChartTier !== 1) ?? null,
    build: (_team, _week, player) => ({
      title: 'Booster Headset Funding Threat',
      scenario: `An influential booster is furious that his son (#${player!.lastName}) is on the bench and threatens to revoke funding for new digital sideline headsets.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_refuse', label: 'Refuse: "Play the Best Athletes"', description: 'Preserve locker room meritocracy. The donor pulls $15,000 in equipment.', tier: 'GOOD',
          impact: impact(5, -25, 15, 5) },
        { id: 'opt_script', label: 'Script 2 Possessions for His Son', description: 'Guaranteed first-quarter snaps to appease the family.', tier: 'COMPROMISE',
          impact: impact(-5, 10, -8, 0) },
        { id: 'opt_start', label: 'Promote His Son to the Starting Unit', description: 'Secure the funding at the expense of locker room morale.', tier: 'RISKY',
          impact: impact(-15, 25, -25, -10, { promoteToStarterPlayerId: player!.id }) }
      ]
    })
  },
  {
    id: 'FILM_ROOM_GIFT',
    appliesTo: () => true,
    build: () => ({
      title: "Booster's Film Room Offer",
      scenario: 'A car-dealership booster offers to build a new film room and buy GPS tracking vests, as long as it stays "between friends" and off the school books.',
      choices: [
        { id: 'opt_report', label: 'Decline and Report It to the Athletic Director', description: 'By the book. The booster feels insulted.', tier: 'GOOD',
          impact: impact(5, -15, 0, 8) },
        { id: 'opt_foundation', label: 'Route It Through the School Foundation', description: 'Slower and public, but fully compliant.', tier: 'COMPROMISE',
          impact: impact(3, 5, 0, 0) },
        { id: 'opt_anonymous', label: 'Accept It as an "Anonymous Donation"', description: 'Nobody asks questions... yet.', tier: 'RISKY',
          impact: impact(-3, 15, 3, -12) },
        { id: 'opt_cash', label: 'Take the Cash and Gear Directly', description: 'Maximum upgrade now, maximum exposure later.', tier: 'CORRUPT',
          impact: impact(-8, 25, -5, -25) }
      ]
    })
  },
  {
    id: 'RESIDENCY_TRANSFER',
    appliesTo: (_team, week) => (week >= 2 && week <= 7 ? true : null),
    build: () => {
      const positions: Position[] = ['QB', 'RB', 'WR', 'LB', 'CB', 'DE'];
      const position = pick(positions)!;
      const overallRating = randomInt(74, 86);
      const name = `${pick(['Jaylen', 'Marcus', 'Trey', 'Isaiah', 'Caden', 'Darius'])} ${pick(['Brooks', 'Hayes', 'Reed', 'Coleman', 'Ellis', 'Foster'])}`;
      const transfer = { position, overallRating, name };
      return {
        title: 'Out-of-District Transfer',
        scenario: `${name}, a ${overallRating}-rated ${position}, wants to transfer in. His family's address is two miles outside the attendance boundary.`,
        choices: [
          { id: 'opt_refer', label: 'Refer the Family to the District Office', description: 'Follow transfer rules. He likely ends up at a rival.', tier: 'GOOD',
            impact: impact(5, -10, 3, 5) },
          { id: 'opt_move', label: 'Require a Lease and Utility Bills', description: 'The family moves in-district. Some players resent the newcomer.', tier: 'COMPROMISE',
            impact: impact(0, 5, -6, 0, { addTransfer: transfer }) },
          { id: 'opt_relative', label: "Accept a Relative's Address", description: 'Technically filed, ethically shaky.', tier: 'RISKY',
            impact: impact(-5, 10, -4, -12, { addTransfer: transfer }) },
          { id: 'opt_apartment', label: 'Let a Booster Pay for an Apartment', description: 'A recruiting violation that buys an instant starter.', tier: 'CORRUPT',
            impact: impact(-10, 15, -8, -25, { addTransfer: transfer }) }
        ]
      };
    }
  },
  {
    id: 'HELICOPTER_PARENT',
    appliesTo: (team) => team.roster.find((p) => p.parent.archetype === 'HELICOPTER' && p.depthChartTier !== 1) ?? null,
    build: (_team, _week, player) => ({
      title: 'Helicopter Parent Conference',
      scenario: `#${player!.lastName}'s mother has emailed the principal three times this week demanding to know why her son isn't starting at ${player!.position}.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_firm', label: 'Stand Firm and Back Your Staff', description: 'She takes it to the principal; your locker room respects the call.', tier: 'GOOD',
          impact: impact(-8, 0, 8, 0) },
        { id: 'opt_snaps', label: 'Promise a Set Number of Snaps', description: 'Placates the family; teammates notice the special treatment.', tier: 'COMPROMISE',
          impact: impact(3, 3, -6, 0) },
        { id: 'opt_promote', label: 'Give Him the Starting Job', description: 'The complaints stop. The player he replaces is furious.', tier: 'RISKY',
          impact: impact(5, 5, -15, 0, { promoteToStarterPlayerId: player!.id }) }
      ]
    })
  },
  {
    id: 'CONCUSSION_PROTOCOL',
    appliesTo: (team, week) => (isGameWeek(week) ? pick(starters(team).filter((p) => p.position !== 'K' && p.position !== 'P')) ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Concussion Protocol',
      scenario: `${player!.position} #${player!.lastName} took a helmet-to-helmet hit in practice and is showing mild symptoms. The athletic trainer wants him held out.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_protocol', label: 'Follow Protocol: Sit Him Two Weeks', description: 'Player safety first.', tier: 'GOOD',
          impact: impact(5, -3, 3, 5, { sidelinePlayer: { playerId: player!.id, weeks: 2 } }) },
        { id: 'opt_reeval', label: 'Hold Him Out This Week, Re-evaluate', description: 'A middle path with the trainer\'s blessing.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_play', label: 'Let Him Play if He Says He Feels Fine', description: 'He wants to play. Liability if anything happens.', tier: 'RISKY',
          impact: impact(-5, 3, 0, -10) },
        { id: 'opt_pressure', label: 'Pressure the Trainer to Clear Him', description: 'Overrule medical staff to keep your starter.', tier: 'CORRUPT',
          impact: impact(-12, 5, -5, -20) }
      ]
    })
  },
  {
    id: 'HEAT_ADVISORY',
    appliesTo: (_team, week) => (week >= 3 && week <= 6 ? true : null),
    build: () => ({
      title: 'Heat Advisory at Two-a-Days',
      scenario: "The heat index is 109°F this afternoon. Your full-pads session is scheduled for 3 PM and the state association's heat guidelines are clear.",
      choices: [
        { id: 'opt_move', label: 'Move Practice to the Evening Indoors', description: 'Lose some conditioning work; nobody gets hurt.', tier: 'GOOD',
          impact: impact(5, -2, 0, 5) },
        { id: 'opt_breaks', label: 'Helmets Only With Mandatory Water Breaks', description: 'Shortened, compliant practice.', tier: 'COMPROMISE',
          impact: impact(0, 0, 2, 0) },
        { id: 'opt_push', label: 'Full Pads: "Champions Are Made in August"', description: 'Old-school toughness, real risk of heat illness.', tier: 'RISKY',
          impact: impact(-8, 3, 5, -10, { injuryRisk: { chance: 0.35, weeks: 2 } }) }
      ]
    })
  },
  {
    id: 'TRASH_TALK',
    appliesTo: (team, week) => (week >= 8 && week <= 14 ? starters(team).filter((p) => p.overallRating >= 70).sort((a, b) => b.overallRating - a.overallRating)[0] ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Trash Talk Before a Rivalry Game',
      scenario: `Your best player, ${player!.position} #${player!.lastName}, posted a video mocking this week's opponent. It already has 40,000 views and the rival coach has called the AD.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_suspend', label: 'Suspend Him for the First Half', description: 'Sends a message about sportsmanship.', tier: 'GOOD',
          impact: impact(6, -5, 10, 3) },
        { id: 'opt_apologize', label: 'Make Him Delete It and Apologize', description: 'Handled quietly.', tier: 'COMPROMISE',
          impact: impact(2, 0, 3, 0) },
        { id: 'opt_ignore', label: 'Let It Ride: "Bulletin Board Material Works Both Ways"', description: 'The student section loves it. The administration does not.', tier: 'RISKY',
          impact: impact(-6, 6, -8, -3) }
      ]
    })
  }
];

/**
 * Picks this week's dilemma (if any): about 60% of weeks, never repeating a scenario used in
 * the last few weeks. The academic check (every third week) takes priority when a starter is failing.
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

  const { playerAvailabilityOverride, sidelinePlayer, promoteToStarterPlayerId, addTransfer, injuryRisk } = choice.impact;
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

  if (promoteToStarterPlayerId) {
    const ply = findPlayer(promoteToStarterPlayerId);
    if (ply) {
      // Swap with the weakest starter at his position
      const demoted = userTeam.roster
        .filter((p) => p.position === ply.position && p.depthChartTier === 1)
        .sort((a, b) => a.overallRating - b.overallRating)[0];
      if (demoted) demoted.depthChartTier = 2;
      ply.depthChartTier = 1;
    }
  }

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

  if (injuryRisk && Math.random() < injuryRisk.chance) {
    const victim = pick(starters(userTeam));
    if (victim) {
      victim.condition.injuryStatus = 'MODERATE';
      victim.condition.injuryWeeksRemaining = Math.max(victim.condition.injuryWeeksRemaining, injuryRisk.weeks);
    }
  }
}
