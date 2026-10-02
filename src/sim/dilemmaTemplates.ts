import { NarrativeDilemma, Team, DilemmaChoice, Player, Position } from '../types/game';
import { isAcademicallyAtRisk } from './playerEngine';
import { randomPlayerName } from '../generators/names';
import { randomInt } from './math/variance';

// ---------------------------------------------------------------------------
// The weekly dilemma library (design spec 12-13): 51 scenarios with Good / Compromise / Risky /
// Corrupt choices. Each template decides when it can occur (week, roster, program meters) and
// which player it involves.
// ---------------------------------------------------------------------------

type Impact = DilemmaChoice['impact'];
const impact = (board: number, booster: number, discipline: number, compliance: number, extra: Partial<Impact> = {}): Impact => ({
  schoolBoardTrustDelta: board,
  boosterApprovalDelta: booster,
  lockerRoomDisciplineDelta: discipline,
  complianceScoreDelta: compliance,
  ...extra
});

export interface DilemmaTemplate {
  id: string;
  /** Returns the player the scenario is about (or true when none is needed), or null if it cannot occur. */
  appliesTo: (team: Team, week: number) => Player | true | null;
  build: (team: Team, week: number, player?: Player) => Omit<NarrativeDilemma, 'id' | 'weekTriggered' | 'templateId'>;
}

export const pick = <T,>(items: T[]): T | undefined => items[randomInt(0, items.length - 1)];
export const starters = (team: Team) => team.roster.filter((p) => p.depthChartTier === 1);
const backups = (team: Team) => team.roster.filter((p) => p.depthChartTier !== 1);
const isGameWeek = (week: number) => week >= 5 && week <= 18;
const isPreseason = (week: number) => week <= 4;
const isRegularSeason = (week: number) => week >= 5 && week <= 14;
const isPlayoffs = (week: number) => week >= 15;
const inWeeks = (week: number, from: number, to: number) => week >= from && week <= to;
const when = (condition: boolean): true | null => (condition ? true : null);
/** The scenario needs a player: no matching player means it cannot occur. */
const whenPlayer = (condition: boolean, player: Player | undefined): Player | null => (condition ? player ?? null : null);
const pickStarter = (team: Team, positions?: Position[]) => pick(starters(team).filter((p) => !positions || positions.includes(p.position)));
const bestStarter = (team: Team) => [...starters(team)].sort((a, b) => b.overallRating - a.overallRating)[0];
const SKILL: Position[] = ['QB', 'RB', 'WR', 'TE', 'CB', 'S', 'LB'];
/** How a player is named in a dilemma: position, #last name and rating, e.g. OT #Kincaid(75). */
const name = (p: Player) => `${p.position} #${tag(p)}`;
const tag = (p: Player) => `${p.lastName}(${p.overallRating})`;

export const TEMPLATES: DilemmaTemplate[] = [
  // -------------------------------------------------------------------------
  // Academics & eligibility
  // -------------------------------------------------------------------------
  {
    id: 'GRADE_CRISIS',
    appliesTo: (team, week) => (week % 3 === 0 ? starters(team).find((p) => p.academics.gpa < 2.3) ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Midterm Grade Crisis',
      scenario: `Star ${player!.position} #${tag(player!)} is failing Algebra right before Friday's matchup. The math teacher asks if you want to intervene.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_good', label: 'Enforce "No Pass, No Play" (Bench Him)', description: 'Uphold school integrity. He sits until his grades recover.', tier: 'GOOD',
          impact: impact(10, -15, 12, 10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: false } }) },
        { id: 'opt_compromise', label: 'Assign Emergency Study Hall', description: 'Daily tutoring after school should pull his grade up. He misses practice this week and the booster club grumbles about the precedent.', tier: 'COMPROMISE',
          impact: impact(0, -5, 0, 0, { gpaChanges: [{ playerId: player!.id, amount: 0.5 }], sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_risky', label: 'Ask the Counselor to Delay the Grade Report', description: 'Buys a week of eligibility, but paperwork leaves a trail.', tier: 'RISKY',
          impact: impact(-8, 5, -5, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_corrupt', label: 'Direct the Teacher to Supply "Extra Credit"', description: 'Falsify passing grades to guarantee his presence on Friday.', tier: 'CORRUPT',
          impact: impact(-18, 12, -15, -25, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) }
      ]
    })
  },
  {
    id: 'TEAM_GRADES',
    // Between report cards, when several players are close to the "No Pass, No Play" line
    appliesTo: (team, week) => when(week % 3 === 1 && week > 1 && team.roster.filter(isAcademicallyAtRisk).length >= 3),
    build: (team) => {
      const atRisk = team.roster.filter(isAcademicallyAtRisk).sort((a, b) => b.overallRating - a.overallRating);
      const shown = atRisk.slice(0, 3).map(name).join(', ');
      const boost = (amount: number) => atRisk.map((p) => ({ playerId: p.id, amount }));
      return {
        title: 'Grades Slipping Across the Roster',
        scenario: `The academic coordinator flagged ${atRisk.length} players close to failing before the next report card, including ${shown}. Anyone under 2.0 sits.`,
        choices: [
          { id: 'opt_study_hall', label: 'Mandatory Team Study Hall', description: 'Every flagged player studies before practice. Grades come up; practices run short all week.', tier: 'GOOD',
            impact: impact(6, -4, 4, 2, { gpaChanges: boost(0.4) }) },
          { id: 'opt_tutors', label: 'Have Boosters Pay for Private Tutors', description: 'Fast results. Booster-funded academic help for athletes is a gray area with the state association.', tier: 'RISKY',
            impact: impact(-4, 6, 0, -12, { gpaChanges: boost(0.5) }) },
          { id: 'opt_their_job', label: 'Grades Are Their Responsibility', description: 'No change to practice. Whoever fails the next report card sits.', tier: 'COMPROMISE',
            impact: impact(0, 0, -3, 0) }
        ]
      };
    }
  },
  {
    id: 'PLAGIARISM',
    appliesTo: (team, week) => whenPlayer(isRegularSeason(week), pickStarter(team, SKILL)),
    build: (_team, _week, player) => ({
      title: 'Plagiarized Term Paper',
      scenario: `The English department caught ${name(player!)} turning in a term paper copied from the internet. The teacher wants a zero, which would make him ineligible.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_support', label: 'Support the Teacher Fully', description: 'Academic honesty comes first. He sits until he is eligible again.', tier: 'GOOD',
          impact: impact(10, -8, 8, 6, { playerAvailabilityOverride: { playerId: player!.id, isEligible: false } }) },
        { id: 'opt_redo', label: 'Ask for a Rewrite Under Supervision', description: 'He redoes the paper for partial credit and stays eligible.', tier: 'COMPROMISE',
          impact: impact(0, 2, -2, 0) },
        { id: 'opt_lean', label: 'Lean on the Principal to Drop It', description: 'The teacher backs down. The faculty lounge notices.', tier: 'RISKY',
          impact: impact(-12, 6, -8, -10) }
      ]
    })
  },
  {
    id: 'TRUANCY',
    appliesTo: (team, week) => whenPlayer(week >= 3, pick(team.roster.filter((p) => p.academics.gpa < 2.6))),
    build: (_team, _week, player) => ({
      title: 'Skipping First Period',
      scenario: `The attendance office says ${name(player!)} has skipped first period nine times this six weeks. One more and state law flags him for truancy.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_bench', label: 'Bench Him Until Attendance Improves', description: 'Practice privileges depend on showing up to class.', tier: 'GOOD',
          impact: impact(8, -3, 8, 4, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_wakeup', label: 'Assign an Assistant to Drive Him to School', description: 'A coach picks him up every morning. It works, and it eats staff time.', tier: 'COMPROMISE',
          impact: impact(4, 0, 2, 0) },
        { id: 'opt_excuse', label: 'Have the Trainer Write "Medical" Excuses', description: 'The absences disappear from the record.', tier: 'CORRUPT',
          impact: impact(-12, 2, -8, -20) }
      ]
    })
  },
  {
    id: 'SAT_CONFLICT',
    appliesTo: (team, week) => whenPlayer(isRegularSeason(week), pick(team.roster.filter((p) => p.classYear === 'Junior' && p.depthChartTier === 1))),
    build: (_team, _week, player) => ({
      title: 'SAT Date Clashes With a Road Game',
      scenario: `${name(player!)} is registered for the SAT on Saturday morning, but Friday's game is a four-hour bus ride away and the team returns at 3 AM.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_drive', label: 'Have His Parents Drive Him Home After the Game', description: 'He plays, sleeps a few hours, and takes the test.', tier: 'GOOD',
          impact: impact(6, 2, 0, 0) },
        { id: 'opt_skip_test', label: 'Tell Him to Reschedule the Test', description: 'Football first. His family is not thrilled.', tier: 'COMPROMISE',
          impact: impact(-4, 2, 0, 0) },
        { id: 'opt_sit', label: 'Keep Him Home From the Game', description: 'Academics win. The offense loses a starter for a night.', tier: 'GOOD',
          impact: impact(8, -4, 2, 2, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) }
      ]
    })
  },
  {
    id: 'ELIGIBILITY_PAPERWORK',
    appliesTo: (team, week) => whenPlayer(isPreseason(week), pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Missing Physical Paperwork',
      scenario: `${name(player!)}'s pre-participation physical form never made it to the athletic office. Without it he cannot practice, and the deadline is today.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_hold', label: 'Hold Him Out Until the Form Arrives', description: 'Rules are rules. He misses a week of camp.', tier: 'GOOD',
          impact: impact(5, -2, 4, 5, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_clinic', label: 'Pay for an Urgent-Care Physical Yourself', description: 'He is cleared tonight. Generous, and fully legitimate.', tier: 'COMPROMISE',
          impact: impact(3, 2, 2, 0) },
        { id: 'opt_backdate', label: 'Backdate an Old Form', description: 'Nobody checks dates... usually.', tier: 'CORRUPT',
          impact: impact(-8, 2, -4, -18) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Boosters & money
  // -------------------------------------------------------------------------
  {
    id: 'BOOSTER_HEADSETS',
    appliesTo: (team) => team.roster.find((p) => p.parent.archetype === 'DEMANDING_BOOSTER' && p.depthChartTier !== 1) ?? null,
    build: (_team, _week, player) => ({
      title: 'Booster Headset Funding Threat',
      scenario: `An influential booster is furious that his son (#${tag(player!)}) is on the bench and threatens to revoke funding for new digital sideline headsets.`,
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
    id: 'BOOSTER_PLAYCALLING',
    appliesTo: (team, week) => when(isRegularSeason(week) && team.programMeters.boosterApproval >= 60),
    build: () => ({
      title: 'Booster President Wants a Say in Play-Calling',
      scenario: 'After a sluggish first half last week, the booster club president texted you a list of plays he expects to see on Friday. He funds the weight room.',
      choices: [
        { id: 'opt_boundary', label: 'Politely Set a Boundary', description: 'You thank him for his support and keep the call sheet yours.', tier: 'GOOD',
          impact: impact(4, -10, 6, 0) },
        { id: 'opt_one_play', label: 'Run One of His Plays as a Gesture', description: 'Harmless, if your players figure out where it came from.', tier: 'COMPROMISE',
          impact: impact(0, 6, -4, 0) },
        { id: 'opt_headset', label: 'Give Him a Headset on the Sideline', description: 'He is thrilled. Your coordinators are humiliated.', tier: 'RISKY',
          impact: impact(-8, 15, -15, -3) }
      ]
    })
  },
  {
    id: 'ENERGY_DRINK_SPONSOR',
    appliesTo: (_team, week) => when(week >= 2 && week <= 10),
    build: () => ({
      title: 'Energy Drink Sponsorship',
      scenario: 'An energy-drink company offers $25,000 a season to put its logo on the scoreboard and hand out free cans to players at practice.',
      choices: [
        { id: 'opt_decline', label: 'Decline: Not Around Teenagers', description: 'The school nurse cheers. The equipment budget does not.', tier: 'GOOD',
          impact: impact(6, -8, 2, 3) },
        { id: 'opt_scoreboard', label: 'Scoreboard Logo Only, No Product for Players', description: 'Take the money, keep the cans out of the locker room.', tier: 'COMPROMISE',
          impact: impact(0, 8, 0, 0) },
        { id: 'opt_full', label: 'Take the Full Deal', description: 'Maximum money. Parents start emailing the board.', tier: 'RISKY',
          impact: impact(-10, 15, -3, -6) }
      ]
    })
  },
  {
    id: 'SUPPLEMENT_SPONSOR',
    appliesTo: (_team, week) => when(isPreseason(week) || inWeeks(week, 5, 9)),
    build: () => ({
      title: 'Supplement Shop Partnership',
      scenario: 'A local supplement store wants to sponsor your strength program and supply "pre-workout" powders. Some of the ingredients are on the state association watch list.',
      choices: [
        { id: 'opt_no', label: 'Turn It Down Entirely', description: 'Your strength coach writes a real nutrition plan instead.', tier: 'GOOD',
          impact: impact(6, -6, 3, 6) },
        { id: 'opt_protein', label: 'Accept Only Protein and Water Bottles', description: 'A clean, limited version of the deal.', tier: 'COMPROMISE',
          impact: impact(1, 5, 0, 0) },
        { id: 'opt_all', label: 'Accept Everything They Offer', description: 'Players look bigger by October. Testing would be another story.', tier: 'CORRUPT',
          impact: impact(-10, 10, -5, -22, { injuryRisk: { chance: 0.2, weeks: 2 } }) }
      ]
    })
  },
  {
    id: 'BOOSTER_CASH_HANDSHAKE',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), bestStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Cash Handshakes After the Game',
      scenario: `A booster was seen slipping $100 bills to ${name(player!)} and other starters after the last win. A parent recorded it on her phone.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_self_report', label: 'Self-Report to the State Association', description: 'Painful, but you control the story.', tier: 'GOOD',
          impact: impact(8, -15, 6, 10) },
        { id: 'opt_return', label: 'Make the Players Return the Money Quietly', description: 'Handled internally. The video still exists.', tier: 'RISKY',
          impact: impact(-2, -4, 2, -6) },
        { id: 'opt_ignore', label: 'Pretend You Never Heard About It', description: 'The booster keeps "rewarding" big games.', tier: 'CORRUPT',
          impact: impact(-10, 10, -10, -22) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Player conduct
  // -------------------------------------------------------------------------
  {
    id: 'TRASH_TALK',
    appliesTo: (team, week) => (week >= 8 && week <= 14 ? starters(team).filter((p) => p.overallRating >= 70).sort((a, b) => b.overallRating - a.overallRating)[0] ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Trash Talk Before a Rivalry Game',
      scenario: `Your best player, ${player!.position} #${tag(player!)}, posted a video mocking this week's opponent. It already has 40,000 views and the rival coach has called the AD.`,
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
  },
  {
    id: 'PARTY_PHOTOS',
    appliesTo: (team, week) => whenPlayer(week >= 3, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Photos From a Weekend Party',
      scenario: `Photos of ${name(player!)} holding a beer at a weekend party are circulating on social media. Your team rules say alcohol means a one-game suspension.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_enforce', label: 'Enforce the One-Game Suspension', description: 'Same rule for everyone.', tier: 'GOOD',
          impact: impact(8, -5, 12, 4, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_conditioning', label: 'Extra Conditioning Instead', description: 'He runs stadiums at dawn all week but plays Friday.', tier: 'COMPROMISE',
          impact: impact(-2, 2, 0, 0) },
        { id: 'opt_fake', label: 'Claim the Photo Is Old', description: 'You know it is not.', tier: 'RISKY',
          impact: impact(-8, 4, -12, -4) }
      ]
    })
  },
  {
    id: 'HALLWAY_FIGHT',
    appliesTo: (team, week) => whenPlayer(week >= 2, pickStarter(team, ['DE', 'DT', 'LB', 'OT', 'OG', 'RB'])),
    build: (_team, _week, player) => ({
      title: 'Fight in the Hallway',
      scenario: `${name(player!)} got into a shoving match between classes that ended with a punch. The assistant principal is deciding on discipline and asked for your input.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_full', label: 'Recommend the Full Two-Game Suspension', description: 'Football is a privilege.', tier: 'GOOD',
          impact: impact(10, -6, 12, 4, { sidelinePlayer: { playerId: player!.id, weeks: 2 } }) },
        { id: 'opt_one', label: 'Ask for One Game Plus Counseling', description: 'Accountability with a path back.', tier: 'COMPROMISE',
          impact: impact(4, -2, 6, 0, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_shield', label: 'Ask the AP to Wait Until After the Season', description: 'He plays. The other student\'s parents call a lawyer.', tier: 'RISKY',
          impact: impact(-12, 6, -10, -6) }
      ]
    })
  },
  {
    id: 'HAZING_REPORT',
    appliesTo: (team, week) => whenPlayer(week <= 8, pick(team.roster.filter((p) => p.classYear === 'Senior' && p.depthChartTier === 1))),
    build: (_team, _week, player) => ({
      title: 'Hazing Allegation',
      scenario: `A freshman's parents report that seniors led by ${name(player!)} forced underclassmen through a humiliating "initiation" in the locker room.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_investigate', label: 'Report It and Suspend the Ringleaders', description: 'Zero tolerance. The seniors are furious.', tier: 'GOOD',
          impact: impact(12, -8, 10, 8, { sidelinePlayer: { playerId: player!.id, weeks: 2 } }) },
        { id: 'opt_team_meeting', label: 'Handle It With a Team Meeting', description: 'Tradition ends today, but no formal report.', tier: 'RISKY',
          impact: impact(-4, 0, 4, -8) },
        { id: 'opt_bury', label: 'Talk the Parents Out of Reporting', description: 'Promise their son more playing time to keep it quiet.', tier: 'CORRUPT',
          impact: impact(-15, 3, -12, -22) }
      ]
    })
  },
  {
    id: 'MASCOT_PRANK',
    appliesTo: (team, week) => whenPlayer(inWeeks(week, 8, 14), pick(team.roster.filter((p) => p.classYear === 'Senior'))),
    build: (_team, _week, player) => ({
      title: 'Rival Mascot Prank',
      scenario: `Rival school security footage shows ${name(player!)} and two teammates spray-painting their mascot statue. Damage is estimated at $3,000.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_restitution', label: 'Suspend Them and Pay Restitution', description: 'They scrub the statue themselves on Saturday.', tier: 'GOOD',
          impact: impact(8, -4, 10, 4, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_pay', label: 'Have the Boosters Cover the Bill', description: 'Problem solved without missed games. Lesson not learned.', tier: 'RISKY',
          impact: impact(-6, -4, -8, -3) },
        { id: 'opt_deny', label: 'Insist the Footage Is Inconclusive', description: 'The rival AD is not fooled.', tier: 'RISKY',
          impact: impact(-10, 6, -10, -8) }
      ]
    })
  },
  {
    id: 'SHOPLIFTING_ARREST',
    appliesTo: (team, week) => whenPlayer(week >= 3, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Arrested for Shoplifting',
      scenario: `${name(player!)} was cited for shoplifting at the mall on Saturday. It is a misdemeanor and the store may drop charges if he pays restitution.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_suspend', label: 'Suspend Him Two Games and Require Community Service', description: 'Consequences, then a second chance.', tier: 'GOOD',
          impact: impact(8, -4, 10, 4, { sidelinePlayer: { playerId: player!.id, weeks: 2 } }) },
        { id: 'opt_mentor', label: 'Pair Him With a Mentor, No Suspension', description: 'You bet on his character.', tier: 'COMPROMISE',
          impact: impact(-2, 2, -3, 0) },
        { id: 'opt_booster_lawyer', label: 'Get a Booster\'s Lawyer to Make It Go Away', description: 'An improper benefit, and a favor you will owe.', tier: 'CORRUPT',
          impact: impact(-10, 8, -8, -18) }
      ]
    })
  },
  {
    id: 'SKIPPED_PRACTICE',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), bestStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Star Skips Practice',
      scenario: `Your best player, ${name(player!)}, skipped Tuesday and Wednesday practice without explanation. He showed up Thursday acting like nothing happened.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_bench', label: 'Bench Him for the Game', description: 'No practice, no play: for everyone.', tier: 'GOOD',
          impact: impact(4, -8, 14, 0, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_first_quarter', label: 'Sit Him for the First Quarter', description: 'A visible message without losing the game.', tier: 'COMPROMISE',
          impact: impact(1, -2, 5, 0) },
        { id: 'opt_nothing', label: 'Let It Go: He\'s Too Important', description: 'The rest of the team sees the double standard.', tier: 'RISKY',
          impact: impact(-3, 4, -15, 0) }
      ]
    })
  },
  {
    id: 'RECRUITING_TAMPERING',
    appliesTo: (team, week) => whenPlayer(week >= 2, pick(team.roster.filter((p) => p.classYear === 'Senior' && p.depthChartTier === 1))),
    build: (_team, _week, player) => ({
      title: 'Players Recruiting Middle Schoolers',
      scenario: `${name(player!)} has been messaging 8th graders zoned to rival schools, promising them "the coaches will take care of you." State rules forbid athletic recruiting.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_stop_report', label: 'Shut It Down and Notify Compliance', description: 'Transparent, and it costs you some momentum with prospects.', tier: 'GOOD',
          impact: impact(6, -6, 6, 8) },
        { id: 'opt_stop_quiet', label: 'Tell Him to Stop, Quietly', description: 'It ends, but the messages are out there.', tier: 'RISKY',
          impact: impact(0, 0, 2, -6) },
        { id: 'opt_encourage', label: 'Encourage It: "Just Don\'t Put It in Writing"', description: 'Talent may follow. So may investigators.', tier: 'CORRUPT',
          impact: impact(-8, 10, -6, -22) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Health & safety
  // -------------------------------------------------------------------------
  {
    id: 'CONCUSSION_PROTOCOL',
    appliesTo: (team, week) => (isGameWeek(week) ? pick(starters(team).filter((p) => p.position !== 'K' && p.position !== 'P')) ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Concussion Protocol',
      scenario: `${player!.position} #${tag(player!)} took a helmet-to-helmet hit in practice and is showing mild symptoms. The athletic trainer wants him held out.`,
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
    id: 'PAINKILLERS',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), pickStarter(team, ['RB', 'LB', 'DE', 'DT', 'OT', 'OG', 'C'])),
    build: (_team, _week, player) => ({
      title: 'Painkillers in the Locker Room',
      scenario: `The trainer found prescription painkillers in ${name(player!)}'s locker. They are his older brother's. He says his shoulder has hurt for weeks.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_medical', label: 'Notify His Parents and Get an MRI', description: 'He is likely out a few weeks. It could save his shoulder.', tier: 'GOOD',
          impact: impact(8, -2, 4, 6, { sidelinePlayer: { playerId: player!.id, weeks: 2 } }) },
        { id: 'opt_rest', label: 'Confiscate the Pills, Limit His Practice Reps', description: 'He plays on Friday, carefully.', tier: 'COMPROMISE',
          impact: impact(0, 0, 0, -3) },
        { id: 'opt_look_away', label: 'Return the Pills and Say Nothing', description: 'A teenager self-medicating through an injury on your watch.', tier: 'CORRUPT',
          impact: impact(-15, 2, -8, -22, { injuryRisk: { chance: 0.4, weeks: 4 } }) }
      ]
    })
  },
  {
    id: 'STEROID_RUMOR',
    appliesTo: (team, week) => whenPlayer(week >= 4, pick(team.roster.filter((p) => p.attributes.strength >= 75 && p.depthChartTier === 1))),
    build: (_team, _week, player) => ({
      title: 'Steroid Rumors',
      scenario: `${name(player!)} added 25 pounds of muscle over the summer. Opposing coaches are whispering, and he has been moody and quick to fight.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_test', label: 'Request a State Association Drug Test', description: 'The truth, whatever it costs you.', tier: 'GOOD',
          impact: impact(8, -4, 6, 8) },
        { id: 'opt_talk', label: 'Sit Down With Him and His Parents', description: 'A private conversation, no formal test.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, -2) },
        { id: 'opt_dont_ask', label: 'Don\'t Ask, Don\'t Tell', description: 'He keeps dominating. The whispers get louder.', tier: 'RISKY',
          impact: impact(-8, 4, -6, -12) }
      ]
    })
  },
  {
    id: 'HIDDEN_INJURY',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), pickStarter(team, SKILL)),
    build: (_team, _week, player) => ({
      title: 'Playing Through a Hidden Injury',
      scenario: `A teammate tells you ${name(player!)} has been hiding a sprained ankle so he won't lose his spot. He is limping in drills.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_sit', label: 'Sit Him and Promise His Job Is Safe', description: 'He heals, and trusts you more.', tier: 'GOOD',
          impact: impact(4, -2, 8, 2, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_tape', label: 'Tape It and Limit His Snaps', description: 'He plays hurt, but less.', tier: 'COMPROMISE',
          impact: impact(0, 0, 0, 0, { injuryRisk: { chance: 0.2, weeks: 2 } }) },
        { id: 'opt_full_go', label: 'Full Go: He Says He\'s Fine', description: 'A worse injury is a real possibility.', tier: 'RISKY',
          impact: impact(-4, 2, -3, -4, { injuryRisk: { chance: 0.45, weeks: 3 } }) }
      ]
    })
  },
  {
    id: 'LIGHTNING_DELAY',
    appliesTo: (_team, week) => when(isGameWeek(week)),
    build: () => ({
      title: 'Lightning on Game Night',
      scenario: 'Lightning is striking six miles away with your team up four in the third quarter. Rules require a 30-minute delay. The officials look to the coaches.',
      choices: [
        { id: 'opt_clear', label: 'Clear the Field and Wait It Out', description: 'Everyone shelters. Momentum may not survive the delay.', tier: 'GOOD',
          impact: impact(6, -2, 2, 5) },
        { id: 'opt_officials', label: 'Defer Entirely to the Officials', description: 'Not your call, not your liability.', tier: 'COMPROMISE',
          impact: impact(0, 0, 0, 0) },
        { id: 'opt_play_on', label: 'Lobby to Keep Playing', description: '"It\'s miles away." The crowd stays in the metal bleachers.', tier: 'RISKY',
          impact: impact(-12, 4, 0, -10, { injuryRisk: { chance: 0.1, weeks: 1 } }) }
      ]
    })
  },
  {
    id: 'MENTAL_HEALTH',
    appliesTo: (team, week) => whenPlayer(week >= 3, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Player Struggling With Anxiety',
      scenario: `${name(player!)} broke down in your office, saying the pressure of college recruiting and school has him unable to sleep. He asked you not to tell anyone.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_counselor', label: 'Connect Him With the School Counselor and Give Him a Week Off', description: 'His health over this week\'s game.', tier: 'GOOD',
          impact: impact(8, -2, 8, 2, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_check_in', label: 'Lighten His Load and Check In Daily', description: 'He keeps playing with extra support.', tier: 'COMPROMISE',
          impact: impact(3, 0, 4, 0) },
        { id: 'opt_tough', label: 'Tell Him to Toughen Up', description: 'Old-school advice that may backfire badly.', tier: 'RISKY',
          impact: impact(-8, 2, -10, -2) }
      ]
    })
  },
  {
    id: 'UNSAFE_FIELD',
    appliesTo: (_team, week) => when(week >= 3 && week <= 12),
    build: () => ({
      title: 'Worn-Out Practice Field',
      scenario: 'Your practice field has holes and exposed sprinkler heads after a dry summer. Two players rolled ankles last week. Repairs take two weeks.',
      choices: [
        { id: 'opt_close', label: 'Close It and Bus to the Middle School Field', description: 'Lost practice time, safer footing.', tier: 'GOOD',
          impact: impact(6, -2, 2, 4) },
        { id: 'opt_cones', label: 'Cone Off the Worst Areas', description: 'Cramped, mostly safe.', tier: 'COMPROMISE',
          impact: impact(0, 0, 0, 0, { injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_keep', label: 'Keep Practicing as Usual', description: 'No time to waste in a playoff race.', tier: 'RISKY',
          impact: impact(-6, 0, 2, -4, { injuryRisk: { chance: 0.35, weeks: 2 } }) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Gamesmanship
  // -------------------------------------------------------------------------
  {
    id: 'STOLEN_SIGNALS',
    appliesTo: (_team, week) => when(isGameWeek(week)),
    build: () => ({
      title: "Opponent's Signal Sheet",
      scenario: "A student manager found this week's opponent's wristband play sheet left behind at a 7-on-7 tournament and brought it to you.",
      choices: [
        { id: 'opt_return', label: 'Return It Unopened', description: 'Their coach calls to thank you personally.', tier: 'GOOD',
          impact: impact(6, -2, 6, 4) },
        { id: 'opt_glance', label: 'Glance at It, Then Return It', description: 'You can\'t un-see what you saw.', tier: 'RISKY',
          impact: impact(-2, 3, -3, -6) },
        { id: 'opt_install', label: 'Install a Game Plan Around It', description: 'A huge edge, if nobody talks.', tier: 'CORRUPT',
          impact: impact(-8, 8, -6, -18) }
      ]
    })
  },
  {
    id: 'FILM_EXCHANGE',
    appliesTo: (_team, week) => when(isGameWeek(week)),
    build: () => ({
      title: 'Game Film Exchange',
      scenario: 'District rules require exchanging your last two game films with this week\'s opponent. Your staff suggests sending an older, "less useful" game instead.',
      choices: [
        { id: 'opt_honest', label: 'Send the Correct Films', description: 'Play by the rules.', tier: 'GOOD',
          impact: impact(3, 0, 3, 4) },
        { id: 'opt_late', label: 'Send Them a Day Late', description: 'Technically compliant, mildly annoying.', tier: 'COMPROMISE',
          impact: impact(0, 2, 0, -2) },
        { id: 'opt_wrong', label: 'Send the Wrong Game "by Accident"', description: 'They will probably file a complaint.', tier: 'RISKY',
          impact: impact(-5, 4, -2, -10) }
      ]
    })
  },
  {
    id: 'PRACTICE_DRONE',
    appliesTo: (_team, week) => when(inWeeks(week, 6, 18)),
    build: () => ({
      title: 'Drone Over Practice',
      scenario: 'A drone hovered over your closed practice all week. A parent traced it to a booster of this week\'s opponent. Another booster offers to fly one over theirs.',
      choices: [
        { id: 'opt_report', label: 'Report It to the District and Change Your Signals', description: 'Take the high road and adjust.', tier: 'GOOD',
          impact: impact(5, -2, 4, 5) },
        { id: 'opt_tarps', label: 'Move Practice Indoors and Say Nothing', description: 'Protect your plan quietly.', tier: 'COMPROMISE',
          impact: impact(0, 0, 2, 0) },
        { id: 'opt_retaliate', label: 'Accept the Booster\'s Offer to Spy Back', description: 'An eye for an eye.', tier: 'CORRUPT',
          impact: impact(-8, 8, -4, -18) }
      ]
    })
  },
  {
    id: 'RUNNING_UP_SCORE',
    appliesTo: (team, week) => when(isRegularSeason(week) && team.prestige >= 75),
    build: () => ({
      title: 'Running Up the Score',
      scenario: 'You are up 49-0 at halftime against a winless team. Pollsters reward margin, and boosters want to "send a message." The other coach asks for a running clock.',
      choices: [
        { id: 'opt_mercy', label: 'Agree to the Running Clock and Play Backups', description: 'Sportsmanship, and valuable reps for young players.', tier: 'GOOD',
          impact: impact(6, -6, 4, 2) },
        { id: 'opt_backups', label: 'Play Backups but Keep the Normal Clock', description: 'A respectable middle ground.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0) },
        { id: 'opt_pour_it_on', label: 'Keep the Starters In and Keep Throwing', description: 'The final score makes headlines, for the wrong reasons.', tier: 'RISKY',
          impact: impact(-10, 10, -4, -3, { injuryRisk: { chance: 0.15, weeks: 2 } }) }
      ]
    })
  },
  {
    id: 'REF_CONNECTION',
    appliesTo: (_team, week) => when(isGameWeek(week)),
    build: () => ({
      title: 'Friendly Referee Assignment',
      scenario: "The referee assigned to Friday's game is your defensive coordinator's brother-in-law. Nobody at the officials' association has noticed.",
      choices: [
        { id: 'opt_disclose', label: 'Disclose It and Request a Different Crew', description: 'Avoid even the appearance of bias.', tier: 'GOOD',
          impact: impact(6, -2, 2, 6) },
        { id: 'opt_silent', label: 'Say Nothing: He\'s a Professional', description: 'Probably fine. Probably.', tier: 'RISKY',
          impact: impact(-2, 2, 0, -6) },
        { id: 'opt_dinner', label: 'Have Your DC Take Him to Dinner Thursday', description: 'Just family catching up...', tier: 'CORRUPT',
          impact: impact(-10, 6, -4, -20) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Coaching staff
  // -------------------------------------------------------------------------
  {
    id: 'ASSISTANT_CONTACT',
    appliesTo: (_team, week) => when(week >= 2 && week <= 12),
    build: () => ({
      title: 'Assistant Coach Contacting Prospects',
      scenario: 'Your linebackers coach has been showing up at a rival district\'s middle school games and talking to players\' parents about "opportunities" at your school.',
      choices: [
        { id: 'opt_stop', label: 'Order Him to Stop and Self-Report', description: 'Clean slate, frustrated assistant.', tier: 'GOOD',
          impact: impact(5, -4, 4, 8) },
        { id: 'opt_warn', label: 'Warn Him Privately', description: 'It stops, unless someone already noticed.', tier: 'RISKY',
          impact: impact(0, 0, 0, -6) },
        { id: 'opt_keep_going', label: 'Tell Him to Keep at It, Discreetly', description: 'More talent may enroll. Undue influence is a violation.', tier: 'CORRUPT',
          impact: impact(-6, 8, -4, -20) }
      ]
    })
  },
  {
    id: 'COORDINATOR_POACHED',
    appliesTo: (team, week) => when(week >= 3 && team.prestige >= 65),
    build: (team) => ({
      title: 'Rival Tries to Poach Your Coordinator',
      scenario: `A district rival offered ${team.staff.offensiveCoordinator.name} a head-coaching job starting next season. He asks whether he should finish the year here.`,
      choices: [
        { id: 'opt_bless', label: 'Give Him Your Blessing and Let Him Finish the Season', description: 'Loyalty earns loyalty.', tier: 'GOOD',
          impact: impact(5, 0, 4, 0) },
        { id: 'opt_raise', label: 'Ask Boosters to Fund a Counteroffer', description: 'He stays, and the boosters expect influence.', tier: 'COMPROMISE',
          impact: impact(0, -6, 2, 0) },
        { id: 'opt_bad_mouth', label: 'Quietly Badmouth Him to the Rival AD', description: 'Petty, and it could get back to him.', tier: 'RISKY',
          impact: impact(-6, 2, -8, 0) }
      ]
    })
  },
  {
    id: 'ASSISTANT_DUI',
    appliesTo: (_team, week) => when(week >= 2),
    build: () => ({
      title: 'Assistant Coach Arrested for DUI',
      scenario: 'Your special teams coordinator was arrested for DUI on Saturday night. He coaches the kickers and drives the equipment truck to away games.',
      choices: [
        { id: 'opt_leave', label: 'Place Him on Leave Pending the Case', description: 'Follow district policy and take on his duties yourself.', tier: 'GOOD',
          impact: impact(8, -2, 4, 4) },
        { id: 'opt_no_driving', label: 'Keep Him On, but Off the Equipment Truck', description: 'A second chance with limits.', tier: 'COMPROMISE',
          impact: impact(-2, 0, 0, 0) },
        { id: 'opt_hide', label: 'Keep It From the Administration', description: 'He is a good coach. The news always gets out.', tier: 'RISKY',
          impact: impact(-12, 0, -4, -8) }
      ]
    })
  },
  {
    id: 'STAFF_STIPEND',
    appliesTo: (team, week) => when(week >= 2 && team.programMeters.boosterApproval >= 50),
    build: () => ({
      title: 'Under-the-Table Staff Bonuses',
      scenario: 'The booster club offers to pay your assistants cash bonuses for every win, outside the district payroll. Your staff could use the money.',
      choices: [
        { id: 'opt_decline', label: 'Decline: Run It Through Payroll or Not at All', description: 'Clean, and your assistants are disappointed.', tier: 'GOOD',
          impact: impact(5, -8, -2, 6) },
        { id: 'opt_district', label: 'Propose an Official Stipend Increase to the Board', description: 'Smaller, slower, legitimate.', tier: 'COMPROMISE',
          impact: impact(2, 2, 2, 0) },
        { id: 'opt_accept', label: 'Accept the Cash Bonuses', description: 'Motivated staff, unreported income.', tier: 'CORRUPT',
          impact: impact(-8, 10, 4, -20) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Community, media & families
  // -------------------------------------------------------------------------
  {
    id: 'RESIDENCY_TRANSFER',
    appliesTo: (_team, week) => (week >= 2 && week <= 7 ? true : null),
    build: () => {
      const positions: Position[] = ['QB', 'RB', 'WR', 'LB', 'CB', 'DE'];
      const position = pick(positions)!;
      const overallRating = randomInt(74, 86);
      const generatedName = randomPlayerName();
      const transferName = `${generatedName.firstName} ${generatedName.lastName}`;
      const transfer = { position, overallRating, name: transferName };
      return {
        title: 'Out-of-District Transfer',
        scenario: `${position} ${transferName}(${overallRating}) wants to transfer in. His family's address is two miles outside the attendance boundary.`,
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
      scenario: `#${tag(player!)}'s mother has emailed the principal three times this week demanding to know why her son isn't starting at ${player!.position}.`,
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
    id: 'REPORTER_LEAK',
    appliesTo: (team, week) => when(isGameWeek(week) && team.programMeters.lockerRoomDiscipline < 85),
    build: () => ({
      title: 'Locker Room Leak to the Press',
      scenario: 'The local paper quoted an "anonymous player" saying the coaching staff has "lost the locker room." Reporters are waiting outside the field house.',
      choices: [
        { id: 'opt_own_it', label: 'Own It at a Press Availability', description: 'Admit the team has work to do and move on.', tier: 'GOOD',
          impact: impact(4, 2, 6, 0) },
        { id: 'opt_no_comment', label: 'No Comment; Address the Team Privately', description: 'Contain it internally.', tier: 'COMPROMISE',
          impact: impact(0, 0, 3, 0) },
        { id: 'opt_hunt', label: 'Hunt Down the Leaker and Cut Him', description: 'Fear keeps future leaks quiet. It also poisons trust.', tier: 'RISKY',
          impact: impact(-6, 2, -10, 0) }
      ]
    })
  },
  {
    id: 'CHARITY_GAME',
    appliesTo: (_team, week) => when(isPreseason(week) || inWeeks(week, 5, 10)),
    build: () => ({
      title: 'Pediatric Cancer Awareness Night',
      scenario: 'A local family whose son is battling leukemia asks if the team will wear gold socks and visit the children\'s hospital the morning of a game.',
      choices: [
        { id: 'opt_all_in', label: 'Go All In: Visit and Wear Gold', description: 'A morning your players will never forget.', tier: 'GOOD',
          impact: impact(10, 6, 8, 0) },
        { id: 'opt_socks', label: 'Wear the Socks, Skip the Visit', description: 'Supportive without disrupting game-day routine.', tier: 'COMPROMISE',
          impact: impact(4, 2, 0, 0) },
        { id: 'opt_decline', label: 'Decline: Game Day Is Sacred', description: 'Routine preserved. The town hears about it.', tier: 'RISKY',
          impact: impact(-8, -6, 2, 0) }
      ]
    })
  },
  {
    id: 'YOUTH_CAMP_FEES',
    appliesTo: (_team, week) => when(isPreseason(week)),
    build: () => ({
      title: 'Youth Camp Profits',
      scenario: 'Your summer youth camp cleared $18,000. The athletic director wants it in the general athletics fund. Boosters want it spent only on football.',
      choices: [
        { id: 'opt_district', label: 'Deposit It With the District as Required', description: 'Transparent accounting.', tier: 'GOOD',
          impact: impact(6, -6, 0, 6) },
        { id: 'opt_split', label: 'Propose a Split With Girls\' Athletics', description: 'Everyone gets something.', tier: 'COMPROMISE',
          impact: impact(6, -2, 0, 2) },
        { id: 'opt_side_account', label: 'Keep It in a Separate Booster Account', description: 'Football keeps every dollar. Auditors may disagree.', tier: 'CORRUPT',
          impact: impact(-8, 10, 0, -18) }
      ]
    })
  },
  {
    id: 'STAR_TRANSFER_REQUEST',
    appliesTo: (team, week) => whenPlayer(week >= 2 && week <= 8, pick(team.roster.filter((p) => p.overallRating >= 72 && p.classYear !== 'Senior'))),
    build: (_team, _week, player) => ({
      title: 'Star Wants to Transfer to a Rival',
      scenario: `${name(player!)}'s father says his son is transferring to a district rival unless he is promised the starting job and a featured role. Rival boosters may be involved.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_let_go', label: 'Wish Him Well and Report the Contact', description: 'Nobody is bigger than the program.', tier: 'GOOD',
          impact: impact(6, -8, 8, 6, { removePlayerId: player!.id }) },
        { id: 'opt_compete', label: 'Promise Only a Fair Chance to Compete', description: 'He may stay. He may not.', tier: 'COMPROMISE',
          impact: impact(2, 0, 4, 0, Math.random() < 0.5 ? { removePlayerId: player!.id } : {}) },
        { id: 'opt_cave', label: 'Promise Him the Starting Job', description: 'He stays. Earned spots mean less in your locker room.', tier: 'RISKY',
          impact: impact(-2, 6, -12, 0, { promoteToStarterPlayerId: player!.id }) }
      ]
    })
  },
  {
    id: 'COLLEGE_COACH_VISIT',
    appliesTo: (team, week) => whenPlayer(isRegularSeason(week), pick(team.roster.filter((p) => p.recruiting.starRating >= 4))),
    build: (_team, _week, player) => ({
      title: 'College Coach Wants Practice Access',
      scenario: `A Power 4 assistant wants to watch practice and meet ${name(player!)} in your office, but it is an NCAA dead period, when in-person contact isn't allowed.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_follow_rules', label: 'Tell Him to Come Back After the Dead Period', description: 'You protect your player\'s eligibility.', tier: 'GOOD',
          impact: impact(4, -2, 2, 4) },
        { id: 'opt_film', label: 'Send Film and Set Up a Phone Call Instead', description: 'Within the rules, and still helpful.', tier: 'COMPROMISE',
          impact: impact(2, 2, 0, 0) },
        { id: 'opt_backdoor', label: 'Let Him "Bump Into" the Player in the Parking Lot', description: 'Good for the relationship, risky for everyone.', tier: 'RISKY',
          impact: impact(-4, 4, -2, -10) }
      ]
    })
  },
  {
    id: 'FAMILY_HARDSHIP',
    appliesTo: (team, week) => whenPlayer(week >= 2, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Working Nights to Support His Family',
      scenario: `${name(player!)} has been falling asleep in film sessions. You learn he works night shifts at a warehouse to help his mother pay rent.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_resources', label: 'Connect the Family With School Social Services', description: 'Legitimate help, through the right channels.', tier: 'GOOD',
          impact: impact(8, 0, 6, 2) },
        { id: 'opt_flex', label: 'Excuse Him From Morning Lifts', description: 'A reasonable accommodation the team understands.', tier: 'COMPROMISE',
          impact: impact(2, 0, -2, 0) },
        { id: 'opt_booster_job', label: 'Get Him a No-Show Job With a Booster', description: 'He gets paid to do nothing. An improper benefit.', tier: 'CORRUPT',
          impact: impact(-8, 6, 2, -20) }
      ]
    })
  },
  {
    id: 'PLAYOFF_TICKET_SCALPING',
    appliesTo: (_team, week) => when(isPlayoffs(week)),
    build: () => ({
      title: 'Playoff Ticket Allocation',
      scenario: "Your playoff game sold out in an hour. Boosters want a block of 300 seats held back for donors; students and families are already complaining they can't get in.",
      choices: [
        { id: 'opt_students', label: 'Prioritize Students and Players\' Families', description: 'The community remembers who the game is for.', tier: 'GOOD',
          impact: impact(8, -8, 4, 0) },
        { id: 'opt_split', label: 'Hold 100 Seats for Donors', description: 'A compromise nobody loves.', tier: 'COMPROMISE',
          impact: impact(0, 4, 0, 0) },
        { id: 'opt_resell', label: 'Let Boosters Resell Their Block at a Markup', description: 'Profitable, and against district policy.', tier: 'CORRUPT',
          impact: impact(-10, 10, -2, -15) }
      ]
    })
  },
  {
    id: 'PLAYOFF_PRACTICE_HOURS',
    appliesTo: (_team, week) => when(isPlayoffs(week)),
    build: () => ({
      title: 'Exceeding Practice Hour Limits',
      scenario: 'The state limits practice hours per week. Your staff wants to add a secret Sunday session before the next playoff round, "film and light walkthrough only."',
      choices: [
        { id: 'opt_rules', label: 'Stay Within the Limit', description: 'Your players are rested; your opponent may outwork you.', tier: 'GOOD',
          impact: impact(4, -2, 4, 4) },
        { id: 'opt_film_only', label: 'Optional Film Session, No Field Work', description: 'A gray area most programs use.', tier: 'COMPROMISE',
          impact: impact(0, 2, 2, -2) },
        { id: 'opt_full', label: 'Hold a Full-Pads Sunday Practice', description: 'An extra edge, a clear violation, and tired legs.', tier: 'CORRUPT',
          impact: impact(-6, 6, -4, -18, { injuryRisk: { chance: 0.25, weeks: 2 } }) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Roster battles
  // -------------------------------------------------------------------------
  {
    id: 'QB_CONTROVERSY',
    appliesTo: (team, week) =>
      whenPlayer(
        week >= 3 && week <= 12,
        backups(team)
          .filter((p) => p.position === 'QB' && p.classYear !== 'Senior')
          .sort((a, b) => b.overallRating - a.overallRating)[0]
      ),
    build: (team, _week, player) => {
      const starter = starters(team).find((p) => p.position === 'QB');
      return {
        title: 'Quarterback Controversy',
        scenario: `Fans are calling for backup QB #${tag(player!)}, a ${player!.classYear.toLowerCase()}, to replace ${starter ? `senior leader #${tag(starter)}` : 'the starter'}. The locker room is split.`,
        involvedPlayerId: player!.id,
        choices: [
          { id: 'opt_open', label: 'Open Competition in Practice This Week', description: 'The better quarterback earns it. You make the call on the depth chart.', tier: 'GOOD',
            impact: impact(3, 0, 6, 0) },
          { id: 'opt_series', label: 'Give the Backup a Series Each Half', description: 'A look at the future without a full switch.', tier: 'COMPROMISE',
            impact: impact(0, 3, -2, 0) },
          { id: 'opt_switch', label: 'Name the Backup the Starter Now', description: 'The fans get their wish. The senior\'s friends are angry.', tier: 'RISKY',
            impact: impact(0, 6, -10, 0, { promoteToStarterPlayerId: player!.id }) }
        ]
      };
    }
  },
  {
    id: 'FRESHMAN_PHENOM',
    appliesTo: (team, week) => whenPlayer(week <= 8, pick(team.roster.filter((p) => p.classYear === 'Freshman' && p.overallRating >= 65 && p.depthChartTier !== 1))),
    build: (_team, _week, player) => ({
      title: 'Freshman Phenom',
      scenario: `Freshman ${name(player!)} has been the best player in practice for two weeks. Moving him up to varsity full-time would bump a senior who has waited three years.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_earned', label: 'Promote Him: Starters Are Earned', description: 'The best player plays, whatever his age.', tier: 'GOOD',
          impact: impact(2, 2, 2, 0, { promoteToStarterPlayerId: player!.id }) },
        { id: 'opt_rotate', label: 'Rotate Him in Behind the Senior', description: 'He develops without upending the locker room.', tier: 'COMPROMISE',
          impact: impact(0, 0, 4, 0) },
        { id: 'opt_jv', label: 'Keep Him on JV to "Pay His Dues"', description: 'Seniority wins. His parents start looking at other schools.', tier: 'RISKY',
          impact: impact(-2, -4, 2, 0, Math.random() < 0.25 ? { removePlayerId: player!.id } : {}) }
      ]
    })
  },
  {
    id: 'SENIOR_NIGHT_WALKON',
    appliesTo: (team, week) =>
      whenPlayer(
        inWeeks(week, 12, 14),
        team.roster.filter((p) => p.classYear === 'Senior' && p.depthChartTier !== 1).sort((a, b) => a.overallRating - b.overallRating)[0]
      ),
    build: (_team, _week, player) => ({
      title: 'Senior Night for a Walk-On',
      scenario: `${name(player!)} has never played a varsity snap in four years but never missed a practice. Teammates want him to start on Senior Night in a must-win district game.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_start', label: 'Start Him for the First Series', description: 'A night he and his family will never forget.', tier: 'GOOD',
          impact: impact(6, 2, 10, 0) },
        { id: 'opt_late', label: 'Get Him In If the Game Is Decided', description: 'Maybe. If the scoreboard cooperates.', tier: 'COMPROMISE',
          impact: impact(1, 0, 2, 0) },
        { id: 'opt_no', label: 'Decline: Too Much Is at Stake', description: 'Practical, and the team notices.', tier: 'RISKY',
          impact: impact(-2, 0, -8, 0) }
      ]
    })
  },
  {
    id: 'TEAM_CAPTAIN_VOTE',
    appliesTo: (team, week) => whenPlayer(isPreseason(week), bestStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Captain Vote Goes Sideways',
      scenario: `The team voted for captains. Your best player, ${name(player!)}, lost to a backup lineman everyone loves. ${player!.lastName}'s family is upset and blaming the staff.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_respect', label: 'Respect the Vote', description: 'Leadership is earned in the locker room.', tier: 'GOOD',
          impact: impact(2, -4, 8, 0) },
        { id: 'opt_add', label: 'Add Him as a Fourth Captain', description: 'Everyone is a winner. Nobody believes it.', tier: 'COMPROMISE',
          impact: impact(0, 3, -3, 0) },
        { id: 'opt_overrule', label: 'Overrule the Vote and Name Him Captain', description: 'The players learn their voices don\'t matter.', tier: 'RISKY',
          impact: impact(-2, 5, -12, 0) }
      ]
    })
  }
];
