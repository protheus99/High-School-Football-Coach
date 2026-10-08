import { rulesForState } from './stateRules';
import { NarrativeDilemma, Team, DilemmaChoice, Player, Position } from '../types/game';
import { isAcademicallyAtRisk } from './playerEngine';
import { FIRST_DISTRICT_WEEK, FIRST_NON_DISTRICT_WEEK, FIRST_TRAINING_CAMP_WEEK, LAST_REGULAR_SEASON_WEEK, LAST_TRAINING_CAMP_WEEK } from './scheduleEngine';
import { randomPlayerName } from '../generators/names';
import { randomInt } from './math/variance';

// ---------------------------------------------------------------------------
// The weekly dilemma library (design spec 12-13): 49 scenarios with Good / Compromise / Risky /
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
// Real weeks of the season calendar (see scheduleEngine): pre season 1-4, training camp 5-7, regular
// season 8-17, playoffs from 18 (Texas 6A: 18-23), then the banquet and the off season
const isPreseasonOrCamp = (week: number) => week <= LAST_TRAINING_CAMP_WEEK;
const isCamp = (week: number) => week >= FIRST_TRAINING_CAMP_WEEK && week <= LAST_TRAINING_CAMP_WEEK;
const isRegularSeason = (week: number) => week >= FIRST_NON_DISTRICT_WEEK && week <= LAST_REGULAR_SEASON_WEEK;
const isDistrictPlay = (week: number) => week >= FIRST_DISTRICT_WEEK && week <= LAST_REGULAR_SEASON_WEEK;
const isPlayoffs = (week: number) => week > LAST_REGULAR_SEASON_WEEK && week <= LAST_REGULAR_SEASON_WEEK + 6;
const isGameWeek = (week: number) => isRegularSeason(week) || isPlayoffs(week);
/** Report cards come out every third week during the season (midterms). */
const isReportCardWeek = (week: number) => isGameWeek(week) && week % 3 === 0;
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
    appliesTo: (team, week) => (isReportCardWeek(week) ? starters(team).find((p) => p.academics.gpa < 2.3) ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Midterm Grade Crisis',
      scenario: `Star ${player!.position} #${tag(player!)} is failing Algebra right before Friday's matchup. The math teacher asks if you want to intervene.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_good', label: 'Enforce "No Pass, No Play" (Bench Him)', description: 'Uphold school integrity. He sits until his grades recover.', tier: 'GOOD',
          impact: impact(10, -15, 12, 10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: false } }) },
        { id: 'opt_compromise', label: 'Assign Emergency Study Hall', description: 'Paid tutoring after school should pull his grade up. He misses practice this week.', tier: 'COMPROMISE',
          impact: impact(0, -5, 0, 0, { gpaChanges: [{ playerId: player!.id, amount: 0.5 }], sidelinePlayer: { playerId: player!.id, weeks: 1 }, coachPointsDelta: -15 }) },
        { id: 'opt_risky', label: 'Ask the Counselor to Delay the Grade Report', description: 'Buys a week of eligibility, but paperwork leaves a trail.', tier: 'RISKY',
          impact: impact(-8, 5, -5, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_corrupt', label: 'Direct the Teacher to Supply "Extra Credit"', description: 'Falsified grades guarantee he plays Friday. A grateful booster sends a check.', tier: 'CORRUPT',
          impact: impact(-18, 12, -15, -25, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 40 }) }
      ]
    })
  },
  {
    id: 'TEAM_GRADES',
    // Between report cards, when several players are close to the "No Pass, No Play" line
    appliesTo: (team, week) => when(isGameWeek(week) && week % 3 === 1 && team.roster.filter((p) => isAcademicallyAtRisk(p, rulesForState(team.state))).length >= 3),
    build: (team) => {
      const atRisk = team.roster.filter((p) => isAcademicallyAtRisk(p, rulesForState(team.state))).sort((a, b) => b.overallRating - a.overallRating);
      const shown = atRisk.slice(0, 3).map(name).join(', ');
      const boost = (amount: number) => atRisk.map((p) => ({ playerId: p.id, amount }));
      return {
        title: 'Grades Slipping Across the Roster',
        scenario: `The academic coordinator flagged ${atRisk.length} players close to failing before the next report card, including ${shown}. Anyone under 2.0 sits.`,
        choices: [
          { id: 'opt_study_hall', label: 'Mandatory Team Study Hall', description: 'Every flagged player studies before practice. Grades come up; practices run short all week.', tier: 'GOOD',
            impact: impact(6, -4, 4, 2, { gpaChanges: boost(0.4), fridayEdgeDelta: -1 }) },
          { id: 'opt_peer', label: 'Pair Each With an Honor-Roll Teammate', description: 'Free help from teammates. Grades rise a little; the tutors lose film time.', tier: 'COMPROMISE',
            impact: impact(0, 0, -4, 0, { gpaChanges: boost(0.2) }) },
          { id: 'opt_tutors', label: 'Have Boosters Pay for Private Tutors', description: 'Fast results. Booster-funded academic help for athletes is a gray area with the state association.', tier: 'RISKY',
            impact: impact(-4, 6, 0, -12, { gpaChanges: boost(0.5) }) },
          { id: 'opt_round_up', label: "Ask Teachers to Round Up Athletes' Grades", description: 'Every flagged player is safe by Friday. Teachers talk.', tier: 'CORRUPT',
            impact: impact(-14, 8, -6, -22, { gpaChanges: boost(0.7) }) }
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
        { id: 'opt_redo', label: 'Ask for a Supervised Rewrite', description: 'Partial credit. He sits one game while he finishes the new paper.', tier: 'COMPROMISE',
          impact: impact(3, 2, -2, 0, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_lean', label: 'Lean on the Principal to Drop It', description: 'The teacher backs down and he plays. The faculty lounge notices.', tier: 'RISKY',
          impact: impact(-12, 6, -8, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_ghost', label: 'Have a Booster\'s Tutor "Help" With a New Paper', description: 'The new paper is perfect. Too perfect. The booster is thrilled to help again.', tier: 'CORRUPT',
          impact: impact(-16, 10, -10, -22, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 30 }) }
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
          impact: impact(4, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_warning', label: 'Give Him a Final Warning', description: 'He plays Friday. One more skip and the state steps in.', tier: 'RISKY',
          impact: impact(-4, 2, -6, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_excuse', label: 'Have the Trainer Write "Medical" Excuses', description: 'The absences disappear from the record, and so does the truancy flag.', tier: 'CORRUPT',
          impact: impact(-12, 2, -8, -20, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, gpaChanges: [{ playerId: player!.id, amount: 0.2 }] }) }
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
        { id: 'opt_sit', label: 'Keep Him Home From the Game', description: 'Academics win. The offense loses a starter for a night.', tier: 'GOOD',
          impact: impact(8, -4, 2, 2, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_drive', label: 'Pay for His Parents to Drive Him Home After the Game', description: 'He plays, sleeps a few hours, and takes the test. You cover gas and a motel.', tier: 'COMPROMISE',
          impact: impact(6, 2, 0, 0, { coachPointsDelta: -15 }) },
        { id: 'opt_skip_test', label: 'Tell Him to Reschedule the Test', description: 'Football first. His family is not thrilled.', tier: 'RISKY',
          impact: impact(-6, 4, 0, -2, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_charter', label: 'Have a Booster Fly Him Home on a Private Plane', description: 'He plays and makes the test. An improper benefit, and the booster loves the attention.', tier: 'CORRUPT',
          impact: impact(-8, 10, -2, -18, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'ELIGIBILITY_PAPERWORK',
    appliesTo: (team, week) => whenPlayer(isPreseasonOrCamp(week), pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Missing Physical Paperwork',
      scenario: `${name(player!)}'s pre-participation physical form never made it to the athletic office. Without it he cannot practice, and the deadline is today.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_hold', label: 'Hold Him Out Until the Form Arrives', description: 'Rules are rules. He misses a week of camp.', tier: 'GOOD',
          impact: impact(5, -2, 4, 5, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_clinic', label: 'Pay for an Urgent-Care Physical Yourself', description: 'He is cleared tonight. Generous, and fully legitimate.', tier: 'COMPROMISE',
          impact: impact(3, 2, 2, 0, { coachPointsDelta: -20 }) },
        { id: 'opt_team_doctor', label: 'Have the Team Doctor Sign Without an Exam', description: 'He practices today. A signature without an exam is a liability.', tier: 'RISKY',
          impact: impact(-5, 2, 0, -12, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_backdate', label: 'Backdate an Old Form', description: 'Nobody checks dates... usually. No clinic bill either.', tier: 'CORRUPT',
          impact: impact(-8, 2, -4, -18, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 15 }) }
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
        { id: 'opt_refuse', label: 'Refuse: "Play the Best Athletes"', description: 'Preserve locker room meritocracy. The donor pulls the headsets and you replace them.', tier: 'GOOD',
          impact: impact(8, -20, 15, 5, { coachPointsDelta: -25 }) },
        { id: 'opt_script', label: 'Script 2 Possessions for His Son', description: 'Guaranteed first-quarter snaps to appease the family. Part of the funding stays.', tier: 'COMPROMISE',
          impact: impact(-5, 10, -8, 0, { coachPointsDelta: 15 }) },
        { id: 'opt_start', label: 'Promote His Son to the Starting Unit', description: 'Secure the funding at the expense of locker room morale.', tier: 'RISKY',
          impact: impact(-15, 25, -25, -10, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 30 }) },
        { id: 'opt_bigger_gift', label: 'Start Him in Exchange for a Bigger Donation', description: 'Playing time for money. The booster doubles the gift.', tier: 'CORRUPT',
          impact: impact(-18, 30, -25, -20, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 60 }) }
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
        { id: 'opt_report', label: 'Decline and Report It to the Athletic Director', description: 'By the book. You upgrade the film room from your own budget.', tier: 'GOOD',
          impact: impact(8, -12, 2, 8, { coachPointsDelta: -20 }) },
        { id: 'opt_foundation', label: 'Route It Through the School Foundation', description: 'Public and fully compliant. The paperwork and matching funds cost you.', tier: 'COMPROMISE',
          impact: impact(3, 5, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_anonymous', label: 'Accept It as an "Anonymous Donation"', description: 'The gear arrives. Nobody asks questions... yet.', tier: 'RISKY',
          impact: impact(-6, 12, 0, -12, { coachPointsDelta: 35 }) },
        { id: 'opt_cash', label: 'Take the Cash and Gear Directly', description: 'Maximum upgrade now, maximum exposure later.', tier: 'CORRUPT',
          impact: impact(-8, 25, -5, -25, { coachPointsDelta: 70 }) }
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
        { id: 'opt_boundary', label: 'Politely Set a Boundary', description: 'You keep the call sheet yours. He trims the weight room budget.', tier: 'GOOD',
          impact: impact(6, -8, 6, 0, { coachPointsDelta: -15 }) },
        { id: 'opt_one_play', label: 'Run One of His Plays as a Gesture', description: 'The weight room money keeps coming. Your players figure out where the play came from.', tier: 'COMPROMISE',
          impact: impact(-2, 6, -8, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_headset', label: 'Give Him a Headset on the Sideline', description: 'He is thrilled and generous. Your coordinators are humiliated.', tier: 'RISKY',
          impact: impact(-8, 15, -15, -3, { coachPointsDelta: 30 }) },
        { id: 'opt_new_weight_room', label: 'Let Him Call Plays for a New Weight Room', description: 'A quid pro quo the district forbids. The weight room will be spectacular.', tier: 'CORRUPT',
          impact: impact(-12, 25, -20, -12, { coachPointsDelta: 60 }) }
      ]
    })
  },
  {
    id: 'ENERGY_DRINK_SPONSOR',
    appliesTo: (_team, week) => when(week >= 2 && week <= 13),
    build: () => ({
      title: 'Energy Drink Sponsorship',
      scenario: 'An energy-drink company offers $25,000 a season to put its logo on the scoreboard and hand out free cans to players at practice.',
      choices: [
        { id: 'opt_decline', label: 'Decline: Not Around Teenagers', description: 'The school nurse cheers. You stretch the equipment budget yourself.', tier: 'GOOD',
          impact: impact(6, -8, 2, 3, { coachPointsDelta: -10 }) },
        { id: 'opt_scoreboard', label: 'Scoreboard Logo Only, No Product for Players', description: 'Take some of the money, keep the cans out of the locker room. Parents grumble.', tier: 'COMPROMISE',
          impact: impact(-8, 8, -4, 0, { coachPointsDelta: 25 }) },
        { id: 'opt_full', label: 'Take the Full Deal', description: "Maximum money. Parents email the board, and caffeine and heat don't mix.", tier: 'RISKY',
          impact: impact(-10, 15, -3, -6, { coachPointsDelta: 45, injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_ads', label: 'Take the Deal and Put Players in the Ads', description: 'Your stars in a commercial. The state association calls it an improper benefit.', tier: 'CORRUPT',
          impact: impact(-14, 20, -6, -18, { coachPointsDelta: 70 }) }
      ]
    })
  },
  {
    id: 'SUPPLEMENT_SPONSOR',
    appliesTo: (_team, week) => when(week <= 12),
    build: () => ({
      title: 'Supplement Shop Partnership',
      scenario: 'A local supplement store wants to sponsor your strength program and supply "pre-workout" powders. Some of the ingredients are on the state association watch list.',
      choices: [
        { id: 'opt_no', label: 'Turn It Down Entirely', description: 'Your strength coach writes a real nutrition plan, paid from your budget.', tier: 'GOOD',
          impact: impact(6, -6, 3, 6, { coachPointsDelta: -15 }) },
        { id: 'opt_protein', label: 'Accept Only Protein and Water Bottles', description: 'A clean, limited version of the deal. Parents still question it.', tier: 'COMPROMISE',
          impact: impact(-4, 4, -4, 0, { coachPointsDelta: 15 }) },
        { id: 'opt_seniors', label: 'Accept the Powders for Seniors Only', description: "Adults can decide for themselves, you reason. The watch list doesn't care.", tier: 'RISKY',
          impact: impact(-8, 8, -4, -12, { coachPointsDelta: 30, injuryRisk: { chance: 0.1, weeks: 2 } }) },
        { id: 'opt_all', label: 'Accept Everything They Offer', description: 'Players look bigger by October. Testing would be another story.', tier: 'CORRUPT',
          impact: impact(-10, 10, -5, -22, { coachPointsDelta: 50, injuryRisk: { chance: 0.2, weeks: 2 } }) }
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
        { id: 'opt_self_report', label: 'Self-Report to the State Association', description: 'Painful, but you control the story. He sits a game while it is reviewed.', tier: 'GOOD',
          impact: impact(8, -15, 6, 10, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_ban', label: 'Ban the Booster From the Sideline', description: 'The cash stops. So do his donations.', tier: 'COMPROMISE',
          impact: impact(4, -10, 6, 2, { coachPointsDelta: -20 }) },
        { id: 'opt_return', label: 'Make the Players Return the Money Quietly', description: 'Handled internally and nobody sits. The video still exists.', tier: 'RISKY',
          impact: impact(-2, -4, 2, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_ignore', label: 'Pretend You Never Heard About It', description: 'The booster keeps "rewarding" big games, and the program.', tier: 'CORRUPT',
          impact: impact(-10, 10, -10, -22, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 40 }) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Player conduct
  // -------------------------------------------------------------------------
  {
    id: 'TRASH_TALK',
    appliesTo: (team, week) => (isDistrictPlay(week) ? starters(team).filter((p) => p.overallRating >= 70).sort((a, b) => b.overallRating - a.overallRating)[0] ?? null : null),
    build: (_team, _week, player) => ({
      title: 'Trash Talk Before a Rivalry Game',
      scenario: `Your best player, ${player!.position} #${tag(player!)}, posted a video mocking this week's opponent. It already has 40,000 views and the rival coach has called the AD.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_suspend', label: 'Bench Him for the Game', description: 'Sends a message about sportsmanship.', tier: 'GOOD',
          impact: impact(6, -5, 10, 3, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_apologize', label: 'Make Him Delete It and Apologize', description: "He plays Friday. Some say an apology isn't enough.", tier: 'COMPROMISE',
          impact: impact(1, -2, -2, 0, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_ignore', label: 'Let It Ride: "Bulletin Board Material Works Both Ways"', description: 'The student section loves it and tickets sell. The administration does not.', tier: 'RISKY',
          impact: impact(-6, 6, -8, -3, { coachPointsDelta: 20 }) },
        { id: 'opt_hype_video', label: 'Post a Team Video Mocking Them Back', description: 'Merch sales spike. The state association opens a sportsmanship review.', tier: 'CORRUPT',
          impact: impact(-12, 10, -10, -12, { coachPointsDelta: 40 }) }
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
          impact: impact(-4, 2, -2, 0, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_fake', label: 'Claim the Photo Is Old', description: 'You know it is not.', tier: 'RISKY',
          impact: impact(-8, 4, -12, -4, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_takedown', label: "Have a Booster's Lawyer Get the Photos Taken Down", description: 'The photos vanish and he plays. The booster adds a donation for your trouble.', tier: 'CORRUPT',
          impact: impact(-12, 8, -12, -18, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 25 }) }
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
        { id: 'opt_shield', label: 'Ask the AP to Wait Until After the Season', description: "He plays. The other student's parents call a lawyer.", tier: 'RISKY',
          impact: impact(-12, 6, -10, -6, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_settle', label: 'Have a Booster Pay the Other Family to Drop It', description: 'The complaint disappears and he plays. Buying silence is a violation waiting to surface.', tier: 'CORRUPT',
          impact: impact(-16, 10, -12, -22, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 15 }) }
      ]
    })
  },
  {
    id: 'HAZING_REPORT',
    appliesTo: (team, week) => whenPlayer(week <= FIRST_NON_DISTRICT_WEEK + 3, pick(team.roster.filter((p) => p.classYear === 'Senior' && p.depthChartTier === 1))),
    build: (_team, _week, player) => ({
      title: 'Hazing Allegation',
      scenario: `A freshman's parents report that seniors led by ${name(player!)} forced underclassmen through a humiliating "initiation" in the locker room.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_investigate', label: 'Report It and Suspend the Ringleaders', description: 'Zero tolerance. The seniors are furious.', tier: 'GOOD',
          impact: impact(12, -8, 10, 8, { sidelinePlayer: { playerId: player!.id, weeks: 2 } }) },
        { id: 'opt_service', label: 'Report It and Assign Team-Wide Community Service', description: 'Everyone shares the lesson. You pay for the buses and supplies.', tier: 'COMPROMISE',
          impact: impact(8, -4, 4, 4, { coachPointsDelta: -15 }) },
        { id: 'opt_team_meeting', label: 'Handle It With a Team Meeting', description: 'Tradition ends today, but no formal report. The ringleader plays.', tier: 'RISKY',
          impact: impact(-4, 0, 4, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_bury', label: 'Talk the Parents Out of Reporting', description: "Promise their son more playing time to keep it quiet. The seniors' families are grateful.", tier: 'CORRUPT',
          impact: impact(-15, 3, -12, -22, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'MASCOT_PRANK',
    appliesTo: (team, week) => whenPlayer(isDistrictPlay(week), pick(team.roster.filter((p) => p.classYear === 'Senior'))),
    build: (_team, _week, player) => ({
      title: 'Rival Mascot Prank',
      scenario: `Rival school security footage shows ${name(player!)} and two teammates spray-painting their mascot statue. Damage is estimated at $3,000.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_restitution', label: 'Suspend Them and Pay Restitution', description: 'They scrub the statue themselves on Saturday.', tier: 'GOOD',
          impact: impact(8, -4, 10, 4, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_pay_yourself', label: 'Pay the Restitution Yourself, No Suspension', description: 'He plays. Your budget takes the hit.', tier: 'COMPROMISE',
          impact: impact(4, 0, -2, 0, { coachPointsDelta: -30 }) },
        { id: 'opt_pay', label: 'Have the Boosters Cover the Bill', description: 'Problem solved without missed games. Lesson not learned.', tier: 'RISKY',
          impact: impact(-6, 4, -8, -3, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_deny', label: 'Insist the Footage Is Inconclusive', description: 'The rival AD is not fooled, but your seniors play and your boosters cheer.', tier: 'CORRUPT',
          impact: impact(-12, 6, -10, -12, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 15 }) }
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
          impact: impact(-2, 2, -3, 0, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_team_account', label: 'Pay the Restitution From the Team Account', description: "Charges dropped, he plays. Team money for a player's legal trouble is an improper benefit.", tier: 'RISKY',
          impact: impact(-6, 2, -4, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: -20 }) },
        { id: 'opt_booster_lawyer', label: "Get a Booster's Lawyer to Make It Go Away", description: 'An improper benefit, and a favor you will owe. The booster pads the budget too.', tier: 'CORRUPT',
          impact: impact(-10, 8, -8, -18, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 20 }) }
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
        { id: 'opt_first_quarter', label: 'Punishment Runs and Sit the First Quarter', description: 'A visible message without losing the game. The extra running leaves him gassed.', tier: 'COMPROMISE',
          impact: impact(1, -2, 5, 0, { injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_nothing', label: "Let It Go: He's Too Important", description: 'He plays. The rest of the team sees the double standard.', tier: 'RISKY',
          impact: impact(-3, 4, -15, 0, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_cover', label: 'Cover for Him: Tell the AD It Was a Scheduling Mix-Up', description: "He plays, the boosters stay happy, and you've lied to your boss.", tier: 'CORRUPT',
          impact: impact(-8, 6, -18, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 15 }) }
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
        { id: 'opt_stop_report', label: 'Shut It Down and Notify Compliance', description: 'Transparent, and it costs you momentum with prospects.', tier: 'GOOD',
          impact: impact(6, -6, 6, 8, { coachPointsDelta: -15 }) },
        { id: 'opt_call_coaches', label: 'Stop It and Call the Rival Coaches Yourself', description: 'You apologize directly. The prospects cool on your program.', tier: 'COMPROMISE',
          impact: impact(4, -2, 2, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_stop_quiet', label: 'Tell Him to Stop, Quietly', description: 'It ends, and the prospects stay interested. The messages are out there.', tier: 'RISKY',
          impact: impact(0, 0, 2, -10, { coachPointsDelta: 15 }) },
        { id: 'opt_encourage', label: 'Encourage It: "Just Don\'t Put It in Writing"', description: 'Talent may follow. So may investigators.', tier: 'CORRUPT',
          impact: impact(-8, 10, -6, -22, { coachPointsDelta: 45 }) }
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
        { id: 'opt_reeval', label: 'Hold Him Out This Week, Re-evaluate', description: "A middle path with the trainer's blessing.", tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_play', label: 'Let Him Play if He Says He Feels Fine', description: 'He wants to play. Liability if anything happens.', tier: 'RISKY',
          impact: impact(-5, 3, 0, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.25, weeks: 3 } }) },
        { id: 'opt_pressure', label: 'Pressure the Trainer to Clear Him', description: 'Overrule medical staff to keep your starter.', tier: 'CORRUPT',
          impact: impact(-12, 5, -5, -20, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.3, weeks: 4 } }) }
      ]
    })
  },
  {
    id: 'HEAT_ADVISORY',
    appliesTo: (_team, week) => (isCamp(week) || week === FIRST_NON_DISTRICT_WEEK ? true : null),
    build: () => ({
      title: 'Heat Advisory at Two-a-Days',
      scenario: "The heat index is 109°F this afternoon. Your full-pads session is scheduled for 3 PM and the state association's heat guidelines are clear.",
      choices: [
        { id: 'opt_move', label: 'Move Practice to the Evening Indoors', description: 'Nobody gets hurt. You lose the conditioning work.', tier: 'GOOD',
          impact: impact(5, -2, 0, 5, { fridayEdgeDelta: -1 }) },
        { id: 'opt_breaks', label: 'Helmets Only With Mandatory Water Breaks', description: 'Shortened, compliant practice. Heat still takes a toll.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_push', label: 'Full Pads: "Champions Are Made in August"', description: 'Old-school toughness: your team is in better shape than anyone. Real risk of heat illness.', tier: 'RISKY',
          impact: impact(-8, 3, 5, -10, { fridayEdgeDelta: 1, injuryRisk: { chance: 0.35, weeks: 2 } }) },
        { id: 'opt_log', label: 'Full Pads, Logged as a Walkthrough', description: 'You falsify the heat log and get the full session in. The boosters host a dinner for the "tough" team.', tier: 'CORRUPT',
          impact: impact(-14, 6, 4, -20, { fridayEdgeDelta: 1, coachPointsDelta: 25, injuryRisk: { chance: 0.35, weeks: 2 } }) }
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
          impact: impact(0, 0, 0, -3, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_otc', label: 'Let Him Play Through It on Over-the-Counter Meds', description: 'He plays every snap. The shoulder gets worse.', tier: 'RISKY',
          impact: impact(-4, 2, -2, -4, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.25, weeks: 3 } }) },
        { id: 'opt_look_away', label: 'Return the Pills and Say Nothing', description: 'A teenager self-medicating through an injury on your watch.', tier: 'CORRUPT',
          impact: impact(-15, 2, -8, -22, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.4, weeks: 4 } }) }
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
        { id: 'opt_test', label: 'Request a State Association Drug Test', description: 'The truth, whatever it costs you. He sits until the results come back.', tier: 'GOOD',
          impact: impact(8, -4, 6, 8, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_talk', label: 'Sit Down With Him, His Parents and a Nutritionist', description: 'A private conversation, no formal test. You pay for the consult.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, -2, { coachPointsDelta: -10 }) },
        { id: 'opt_dont_ask', label: "Don't Ask, Don't Tell", description: 'He keeps dominating. The whispers get louder.', tier: 'RISKY',
          impact: impact(-8, 4, -6, -12, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_clean_test', label: "Get a Booster's Doctor to Produce a Clean Test", description: 'The rumors die and he keeps dominating. If the doctor ever talks, everything dies.', tier: 'CORRUPT',
          impact: impact(-14, 8, -8, -24, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 20 }) }
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
          impact: impact(0, 0, 0, 0, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.2, weeks: 2 } }) },
        { id: 'opt_full_go', label: "Full Go: He Says He's Fine", description: 'A worse injury is a real possibility.', tier: 'RISKY',
          impact: impact(-4, 2, -3, -4, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.45, weeks: 3 } }) },
        { id: 'opt_hide_scan', label: 'Keep the Injury Off the Report and Away From His Parents', description: 'He plays the big games. If the scan surfaces, so does everything else.', tier: 'CORRUPT',
          impact: impact(-14, 4, -8, -20, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.55, weeks: 4 } }) }
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
        { id: 'opt_counselor', label: 'Connect Him With the School Counselor and Give Him a Week Off', description: "His health over this week's game.", tier: 'GOOD',
          impact: impact(8, -2, 8, 2, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_check_in', label: 'Lighten His Load and Check In Daily', description: 'He keeps playing with extra support. It takes real staff time.', tier: 'COMPROMISE',
          impact: impact(3, 0, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_tough', label: 'Tell Him to Toughen Up', description: 'He plays. Old-school advice that may backfire badly.', tier: 'RISKY',
          impact: impact(-8, 2, -10, -2, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_hide', label: 'Keep It From His Parents and Keep Him Starting', description: "His recruiting stays on track and so does your season. The school's duty-to-report policy says otherwise.", tier: 'CORRUPT',
          impact: impact(-12, 4, -12, -10, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, coachPointsDelta: 15 }) }
      ]
    })
  },
  {
    id: 'UNSAFE_FIELD',
    appliesTo: (_team, week) => when(week >= FIRST_TRAINING_CAMP_WEEK && week <= 15),
    build: () => ({
      title: 'Worn-Out Practice Field',
      scenario: 'Your practice field has holes and exposed sprinkler heads after a dry summer. Two players rolled ankles last week. Repairs take two weeks.',
      choices: [
        { id: 'opt_close', label: 'Close It and Bus to the Middle School Field', description: 'Lost practice time, safer footing. Buses cost money.', tier: 'GOOD',
          impact: impact(6, -2, 2, 4, { coachPointsDelta: -20 }) },
        { id: 'opt_cones', label: 'Cone Off the Worst Areas', description: 'Cramped, mostly safe.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_keep', label: 'Keep Practicing as Usual', description: 'No time or bus money to waste in a playoff race.', tier: 'RISKY',
          impact: impact(-6, 0, 2, -4, { coachPointsDelta: 10, injuryRisk: { chance: 0.35, weeks: 2 } }) },
        { id: 'opt_passed', label: 'Patch It and Tell Parents It Passed Inspection', description: 'No buses, no complaints, and the repair budget becomes your budget. Until someone checks.', tier: 'CORRUPT',
          impact: impact(-12, 4, 2, -18, { coachPointsDelta: 20, injuryRisk: { chance: 0.3, weeks: 2 } }) }
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
        { id: 'opt_return', label: 'Return It Unopened', description: 'Their coach calls to thank you personally. Your staff re-scouts the old way.', tier: 'GOOD',
          impact: impact(6, -2, 6, 4, { coachPointsDelta: -10 }) },
        { id: 'opt_glance', label: 'Glance at It, Then Return It', description: "You can't un-see what you saw.", tier: 'COMPROMISE',
          impact: impact(-2, 3, -3, -6, { fridayEdgeDelta: 1 }) },
        { id: 'opt_copy', label: 'Copy the Key Calls, Then Return It', description: 'Nobody knows you kept a copy. Probably.', tier: 'RISKY',
          impact: impact(-6, 6, -4, -12, { fridayEdgeDelta: 1, coachPointsDelta: 10 }) },
        { id: 'opt_install', label: 'Install a Game Plan Around It', description: 'A huge edge, if nobody talks. The boosters love a winner.', tier: 'CORRUPT',
          impact: impact(-8, 8, -6, -18, { fridayEdgeDelta: 2, coachPointsDelta: 20 }) }
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
        { id: 'opt_honest', label: 'Send the Correct Films', description: 'Play by the rules, and show them your tendencies.', tier: 'GOOD',
          impact: impact(3, 0, 3, 4, { fridayEdgeDelta: -1 }) },
        { id: 'opt_late', label: 'Send Them a Day Late', description: 'Technically compliant, mildly annoying. They lose a day of prep.', tier: 'COMPROMISE',
          impact: impact(-2, 2, -2, -2, { fridayEdgeDelta: 1 }) },
        { id: 'opt_wrong', label: 'Send the Wrong Game "by Accident"', description: 'They prepare for the wrong team. They will probably file a complaint.', tier: 'RISKY',
          impact: impact(-5, 4, -2, -10, { fridayEdgeDelta: 1 }) },
        { id: 'opt_doctored', label: 'Send Doctored Film With Fake Signals', description: "Their whole week of prep is wasted. Film doesn't lie, but yours does.", tier: 'CORRUPT',
          impact: impact(-10, 6, -4, -20, { fridayEdgeDelta: 2 }) }
      ]
    })
  },
  {
    id: 'PRACTICE_DRONE',
    appliesTo: (_team, week) => when(isCamp(week) || isGameWeek(week)),
    build: () => ({
      title: 'Drone Over Practice',
      scenario: 'A drone hovered over your closed practice all week. A parent traced it to a booster of this week\'s opponent. Another booster offers to fly one over theirs.',
      choices: [
        { id: 'opt_report', label: 'Report It to the District and Change Your Signals', description: 'Take the high road and spend the week reinstalling your signals.', tier: 'GOOD',
          impact: impact(5, -2, 4, 5, { fridayEdgeDelta: -1 }) },
        { id: 'opt_tarps', label: 'Move Practice Indoors and Say Nothing', description: 'Protect your plan quietly. The gym rental adds up.', tier: 'COMPROMISE',
          impact: impact(0, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_jam', label: 'Have a Booster Jam the Drone', description: 'Their drone drops into the parking lot and your plan stays secret. Signal jamming is illegal.', tier: 'RISKY',
          impact: impact(-6, 6, 0, -10, { fridayEdgeDelta: 1 }) },
        { id: 'opt_retaliate', label: "Accept the Booster's Offer to Spy Back", description: 'An eye for an eye, and their whole game plan.', tier: 'CORRUPT',
          impact: impact(-8, 8, -4, -18, { fridayEdgeDelta: 2 }) }
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
        { id: 'opt_disclose', label: 'Disclose It and Request a Different Crew', description: 'Avoid even the appearance of bias. The late crew change costs a fee.', tier: 'GOOD',
          impact: impact(6, -2, 2, 6, { coachPointsDelta: -10 }) },
        { id: 'opt_crew_chief', label: 'Mention It to the Crew Chief Off the Record', description: 'He promises to keep an eye on it. You owe the association a favor.', tier: 'COMPROMISE',
          impact: impact(3, 0, 0, -1, { coachPointsDelta: -10 }) },
        { id: 'opt_silent', label: "Say Nothing: He's a Professional", description: 'Probably fine. Probably. Close calls may go your way.', tier: 'RISKY',
          impact: impact(-2, 2, 0, -10, { fridayEdgeDelta: 1 }) },
        { id: 'opt_dinner', label: 'Have Your DC Take Him to Dinner Thursday', description: 'Just family catching up... and the close calls will go your way.', tier: 'CORRUPT',
          impact: impact(-10, 6, -4, -20, { fridayEdgeDelta: 2 }) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Coaching staff
  // -------------------------------------------------------------------------
  {
    id: 'ASSISTANT_CONTACT',
    appliesTo: (_team, week) => when(week >= 2 && week <= 15),
    build: () => ({
      title: 'Assistant Coach Contacting Prospects',
      scenario: 'Your linebackers coach has been showing up at a rival district\'s middle school games and talking to players\' parents about "opportunities" at your school.',
      choices: [
        { id: 'opt_stop', label: 'Order Him to Stop and Self-Report', description: 'Clean slate, frustrated assistant, cooler prospects.', tier: 'GOOD',
          impact: impact(5, -4, 4, 8, { coachPointsDelta: -15 }) },
        { id: 'opt_jv', label: 'Reassign Him to Coach the JV', description: 'He stops without a report. You lose his recruiting legwork.', tier: 'COMPROMISE',
          impact: impact(3, -2, 2, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_warn', label: 'Warn Him Privately', description: 'It stops, and the families he met stay interested. Unless someone already noticed.', tier: 'RISKY',
          impact: impact(0, 0, 0, -10, { coachPointsDelta: 15 }) },
        { id: 'opt_keep_going', label: 'Tell Him to Keep at It, Discreetly', description: 'More talent may enroll. Undue influence is a violation.', tier: 'CORRUPT',
          impact: impact(-6, 8, -4, -20, { coachPointsDelta: 45 }) }
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
        { id: 'opt_bless', label: 'Give Him Your Blessing and Let Him Finish the Season', description: 'Loyalty earns loyalty. You start a quiet search for his replacement.', tier: 'GOOD',
          impact: impact(5, 0, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_raise', label: 'Fund a Counteroffer From Your Budget', description: 'He stays. The money has to come from somewhere.', tier: 'COMPROMISE',
          impact: impact(2, -4, 4, 0, { coachPointsDelta: -25 }) },
        { id: 'opt_bad_mouth', label: 'Quietly Badmouth Him to the Rival AD', description: 'The offer cools and you skip the search. Petty, and it could get back to him.', tier: 'RISKY',
          impact: impact(-6, 2, -8, 0, { coachPointsDelta: 15 }) },
        { id: 'opt_booster_pay', label: 'Have a Booster Pay Him Under the Table to Stay', description: 'He stays, and the booster funds your staff budget too. Unreported pay is a violation.', tier: 'CORRUPT',
          impact: impact(-8, 10, -2, -18, { coachPointsDelta: 25 }) }
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
        { id: 'opt_leave', label: 'Place Him on Leave Pending the Case', description: 'Follow district policy. You pay a substitute and take on his duties.', tier: 'GOOD',
          impact: impact(8, -2, 4, 4, { coachPointsDelta: -20 }) },
        { id: 'opt_no_driving', label: 'Keep Him On, but Off the Equipment Truck', description: 'A second chance with limits, and no substitute to pay.', tier: 'COMPROMISE',
          impact: impact(-4, 0, 0, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_hide', label: 'Keep It From the Administration', description: 'He is a good coach and stays on budget. The news always gets out.', tier: 'RISKY',
          impact: impact(-12, 0, -4, -10, { coachPointsDelta: 15 }) },
        { id: 'opt_keep_driving', label: 'Keep It Quiet and Let Him Keep Driving the Truck', description: 'Nothing changes and nothing costs extra. Until something happens on the highway.', tier: 'CORRUPT',
          impact: impact(-16, 0, -6, -18, { coachPointsDelta: 25 }) }
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
        { id: 'opt_decline', label: 'Decline: Run It Through Payroll or Not at All', description: "Clean. You chip in from your budget so your assistants aren't empty-handed.", tier: 'GOOD',
          impact: impact(6, -6, 0, 6, { coachPointsDelta: -15 }) },
        { id: 'opt_district', label: 'Propose an Official Stipend Increase to the Board', description: 'Smaller, slower, legitimate. Part of it comes from your budget.', tier: 'COMPROMISE',
          impact: impact(2, 2, 2, 0, { coachPointsDelta: -20 }) },
        { id: 'opt_gift_cards', label: 'Accept Gift Cards Instead of Cash', description: 'Not "cash," you tell yourself. The state association disagrees.', tier: 'RISKY',
          impact: impact(-4, 6, 2, -10, { coachPointsDelta: 20 }) },
        { id: 'opt_accept', label: 'Accept the Cash Bonuses', description: 'Motivated staff, unreported income, and boosters who feel invested.', tier: 'CORRUPT',
          impact: impact(-8, 10, 4, -20, { coachPointsDelta: 50 }) }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // Community, media & families
  // -------------------------------------------------------------------------
  {
    id: 'RESIDENCY_TRANSFER',
    appliesTo: (_team, week) => (week >= 2 && week <= FIRST_NON_DISTRICT_WEEK + 2 ? true : null),
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
          { id: 'opt_refer', label: 'Refer the Family to the District Office', description: 'Follow transfer rules. He likely ends up at a rival, and the paperwork takes your time.', tier: 'GOOD',
            impact: impact(5, -10, 3, 5, { coachPointsDelta: -10 }) },
          { id: 'opt_move', label: 'Require a Lease and Utility Bills', description: 'The family moves in-district. Some players resent the newcomer.', tier: 'COMPROMISE',
            impact: impact(-2, 5, -7, 0, { addTransfer: transfer }) },
          { id: 'opt_relative', label: "Accept a Relative's Address", description: 'Technically filed, ethically shaky.', tier: 'RISKY',
            impact: impact(-5, 10, -4, -12, { addTransfer: transfer }) },
          { id: 'opt_apartment', label: 'Let a Booster Pay for an Apartment', description: 'A recruiting violation that buys an instant starter, and a booster who keeps giving.', tier: 'CORRUPT',
            impact: impact(-10, 15, -8, -25, { addTransfer: transfer, coachPointsDelta: 30 }) }
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
        { id: 'opt_firm', label: 'Stand Firm and Back Your Staff', description: 'Your locker room respects the call. The principal meetings eat your week.', tier: 'GOOD',
          impact: impact(-4, 0, 8, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_snaps', label: 'Promise a Set Number of Snaps', description: "The family's restaurant starts feeding the team. Teammates notice the special treatment.", tier: 'COMPROMISE',
          impact: impact(0, 4, -8, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_promote', label: 'Give Him the Starting Job', description: 'The complaints stop. The player he replaces is furious.', tier: 'RISKY',
          impact: impact(5, 5, -15, 0, { promoteToStarterPlayerId: player!.id }) },
        { id: 'opt_meals_deal', label: 'Start Him in Exchange for Free Team Meals All Season', description: 'Playing time for perks. The team eats well; the locker room knows why.', tier: 'CORRUPT',
          impact: impact(-8, 10, -15, -12, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 40 }) }
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
        { id: 'opt_own_it', label: 'Own It at a Press Availability', description: 'Admit the team has work to do. You pay for a team retreat to rebuild trust.', tier: 'GOOD',
          impact: impact(4, 2, 6, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_no_comment', label: 'No Comment; Address the Team Privately', description: 'Contain it internally. You cancel a booster event to deal with it.', tier: 'COMPROMISE',
          impact: impact(0, 0, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_hunt', label: 'Hunt Down the Leaker and Cut Him', description: 'Fear keeps future leaks quiet, and the boosters applaud. It also poisons trust.', tier: 'RISKY',
          impact: impact(-6, 2, -10, 0, { coachPointsDelta: 15 }) },
        { id: 'opt_deflect', label: 'Feed the Reporter Dirt on a Rival Instead', description: "The story changes overnight. The boosters love it; the rival's lawyers won't.", tier: 'CORRUPT',
          impact: impact(-10, 8, -4, -12, { coachPointsDelta: 25 }) }
      ]
    })
  },
  {
    id: 'CHARITY_GAME',
    appliesTo: (_team, week) => when(isRegularSeason(week) && week <= FIRST_DISTRICT_WEEK + 2),
    build: () => ({
      title: 'Pediatric Cancer Awareness Night',
      scenario: 'A local family whose son is battling leukemia asks if the team will wear gold socks and visit the children\'s hospital the morning of a game.',
      choices: [
        { id: 'opt_all_in', label: 'Go All In: Visit and Wear Gold', description: 'A morning your players will never forget. Game-day routine takes a hit.', tier: 'GOOD',
          impact: impact(10, 6, 8, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_socks', label: 'Wear the Socks, Skip the Visit', description: 'Supportive without disrupting game-day routine. The socks are on you.', tier: 'COMPROMISE',
          impact: impact(4, 2, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_decline', label: 'Decline: Game Day Is Sacred', description: 'Routine preserved and the team stays locked in. The town hears about it.', tier: 'RISKY',
          impact: impact(-8, -6, 2, 0, { fridayEdgeDelta: 1 }) },
        { id: 'opt_merch', label: 'Sell Gold-Sock Merch and Keep the Proceeds for Football', description: 'The fundraiser is a hit. The money was supposed to go to the family.', tier: 'CORRUPT',
          impact: impact(-12, 8, 0, -14, { coachPointsDelta: 40 }) }
      ]
    })
  },
  {
    id: 'YOUTH_CAMP_FEES',
    appliesTo: (_team, week) => when(isPreseasonOrCamp(week)),
    build: () => ({
      title: 'Youth Camp Profits',
      scenario: 'Your summer youth camp cleared $18,000. The athletic director wants it in the general athletics fund. Boosters want it spent only on football.',
      choices: [
        { id: 'opt_district', label: 'Deposit It With the District as Required', description: "Transparent accounting. You cover the camp's leftover bills yourself.", tier: 'GOOD',
          impact: impact(6, -6, 0, 6, { coachPointsDelta: -10 }) },
        { id: 'opt_split', label: "Propose a Split With Girls' Athletics", description: 'Football gets its share. Boosters grumble about sharing.', tier: 'COMPROMISE',
          impact: impact(0, -4, 0, 0, { coachPointsDelta: 20 }) },
        { id: 'opt_spend', label: 'Spend It on Football Gear Before Anyone Asks', description: "New gear by Friday. The receipts don't match the rules.", tier: 'RISKY',
          impact: impact(-4, 6, 0, -10, { coachPointsDelta: 35 }) },
        { id: 'opt_side_account', label: 'Keep It in a Separate Booster Account', description: 'Football keeps every dollar. Auditors may disagree.', tier: 'CORRUPT',
          impact: impact(-8, 10, 0, -18, { coachPointsDelta: 60 }) }
      ]
    })
  },
  {
    id: 'STAR_TRANSFER_REQUEST',
    appliesTo: (team, week) => whenPlayer(week >= 2 && week <= FIRST_NON_DISTRICT_WEEK + 3, pick(team.roster.filter((p) => p.overallRating >= 72 && p.classYear !== 'Senior'))),
    build: (_team, _week, player) => ({
      title: 'Star Wants to Transfer to a Rival',
      scenario: `${name(player!)}'s father says his son is transferring to a district rival unless he is promised the starting job and a featured role. Rival boosters may be involved.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_let_go', label: 'Wish Him Well and Report the Contact', description: 'Nobody is bigger than the program.', tier: 'GOOD',
          impact: impact(6, -8, 8, 6, { removePlayerId: player!.id }) },
        { id: 'opt_leader', label: 'Offer a Leadership Role, Not a Promise', description: "He stays to compete. His father's demands keep coming.", tier: 'COMPROMISE',
          impact: impact(2, 0, 4, 0, { coachPointsDelta: -15 }) },
        { id: 'opt_cave', label: 'Promise Him the Starting Job', description: 'He stays. Earned spots mean less in your locker room.', tier: 'RISKY',
          impact: impact(-2, 6, -12, 0, { promoteToStarterPlayerId: player!.id }) },
        { id: 'opt_match', label: "Promise the Job and Have a Booster Match the Rival's Offer", description: "He stays, starts, and the booster keeps the money flowing. A recruiting war you can't report.", tier: 'CORRUPT',
          impact: impact(-10, 12, -14, -18, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 30 }) }
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
        { id: 'opt_follow_rules', label: 'Tell Him to Come Back After the Dead Period', description: "You protect your player's eligibility. His recruiting slows down.", tier: 'GOOD',
          impact: impact(4, -2, 2, 4, { coachPointsDelta: -10 }) },
        { id: 'opt_film', label: 'Send Film and Set Up a Phone Call Instead', description: 'Within the rules, and still helpful. Cutting the film takes your staff a night.', tier: 'COMPROMISE',
          impact: impact(2, 2, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_backdoor', label: 'Let Him "Bump Into" the Player in the Parking Lot', description: 'Good for the relationship, risky for everyone.', tier: 'RISKY',
          impact: impact(-4, 4, -2, -10, { coachPointsDelta: 20 }) },
        { id: 'opt_press_box', label: 'Let Him Watch Practice From the Press Box', description: 'The college owes you one. The NCAA would see it differently.', tier: 'CORRUPT',
          impact: impact(-8, 6, -2, -18, { coachPointsDelta: 40 }) }
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
        { id: 'opt_resources', label: 'Connect the Family With School Social Services', description: 'Legitimate help, through the right channels. You drive them to the appointments.', tier: 'GOOD',
          impact: impact(8, 0, 6, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_flex', label: 'Excuse Him From Morning Lifts', description: 'A reasonable accommodation. Skipping strength work raises his injury risk.', tier: 'COMPROMISE',
          impact: impact(4, 0, -2, 0, { injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_host', label: "Have a Teammate's Family Take Him In on Game Nights", description: 'He sleeps and his grades recover. Free housing from a team family is a gray area.', tier: 'RISKY',
          impact: impact(-2, 2, 2, -10, { gpaChanges: [{ playerId: player!.id, amount: 0.3 }] }) },
        { id: 'opt_booster_job', label: 'Get Him a No-Show Job With a Booster', description: 'He gets paid to do nothing and the booster pads the program too. An improper benefit.', tier: 'CORRUPT',
          impact: impact(-8, 6, 2, -20, { gpaChanges: [{ playerId: player!.id, amount: 0.3 }], coachPointsDelta: 20 }) }
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
        { id: 'opt_students', label: "Prioritize Students and Players' Families", description: 'The community remembers who the game is for. Donors remember too.', tier: 'GOOD',
          impact: impact(8, -8, 4, 0, { coachPointsDelta: -15 }) },
        { id: 'opt_split', label: 'Hold 100 Seats for Donors', description: 'A compromise nobody loves.', tier: 'COMPROMISE',
          impact: impact(-6, 4, -2, 0, { coachPointsDelta: 15 }) },
        { id: 'opt_donors', label: 'Give Donors All 300 Seats', description: 'The donors are delighted. Students watch from the fence.', tier: 'RISKY',
          impact: impact(-8, 8, -2, -4, { coachPointsDelta: 30 }) },
        { id: 'opt_resell', label: 'Let Boosters Resell Their Block at a Markup', description: 'Profitable, and against district policy.', tier: 'CORRUPT',
          impact: impact(-10, 10, -2, -15, { coachPointsDelta: 55 }) }
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
        { id: 'opt_rules', label: 'Stay Within the Limit', description: 'Your players stay fresh. Your opponent may outwork you.', tier: 'GOOD',
          impact: impact(4, -2, 4, 4, { fridayEdgeDelta: -1 }) },
        { id: 'opt_film_only', label: 'Optional Film Session, No Field Work', description: 'A gray area most programs use. One more film session helps.', tier: 'COMPROMISE',
          impact: impact(-4, 2, 0, -2, { fridayEdgeDelta: 1 }) },
        { id: 'opt_walkthrough', label: 'Hold a Secret Walkthrough in Shorts', description: 'An extra install day nobody records.', tier: 'RISKY',
          impact: impact(-4, 4, 0, -12, { fridayEdgeDelta: 1 }) },
        { id: 'opt_full', label: 'Hold a Full-Pads Sunday Practice', description: 'An extra edge, a clear violation, and tired legs.', tier: 'CORRUPT',
          impact: impact(-6, 6, -4, -18, { fridayEdgeDelta: 2, injuryRisk: { chance: 0.25, weeks: 2 } }) }
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
        week >= FIRST_TRAINING_CAMP_WEEK && week <= 15,
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
          { id: 'opt_open', label: 'Open Competition in Practice This Week', description: 'The better quarterback earns it. Splitting reps costs your starters practice time.', tier: 'GOOD',
            impact: impact(3, 0, 6, 0, { fridayEdgeDelta: -1 }) },
          { id: 'opt_series', label: 'Give the Backup a Series Each Half', description: 'The fans are happy and buy tickets. The senior feels the clock ticking.', tier: 'COMPROMISE',
            impact: impact(-2, 4, -6, 0, { coachPointsDelta: 10 }) },
          { id: 'opt_switch', label: 'Name the Backup the Starter Now', description: "The fans get their wish. The senior's friends are angry.", tier: 'RISKY',
            impact: impact(0, 6, -10, 0, { promoteToStarterPlayerId: player!.id }) },
          { id: 'opt_donation', label: "Start the Backup After His Father's Donation", description: 'The donation is generous. The timing is impossible to miss.', tier: 'CORRUPT',
            impact: impact(-10, 14, -12, -14, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 40 }) }
        ]
      };
    }
  },
  {
    id: 'FRESHMAN_PHENOM',
    appliesTo: (team, week) => whenPlayer(week > 2 && week <= FIRST_NON_DISTRICT_WEEK + 3, pick(team.roster.filter((p) => p.classYear === 'Freshman' && p.overallRating >= 65 && p.depthChartTier !== 1))),
    build: (_team, _week, player) => ({
      title: 'Freshman Phenom',
      scenario: `Freshman ${name(player!)} has been the best player in practice for two weeks. Moving him up to varsity full-time would bump a senior who has waited three years.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_earned', label: 'Promote Him: Starters Are Earned', description: "The best player plays, whatever his age. The senior's parents drop their booster dues.", tier: 'GOOD',
          impact: impact(2, 2, 2, 0, { promoteToStarterPlayerId: player!.id, coachPointsDelta: -10 }) },
        { id: 'opt_rotate', label: 'Rotate Him in Behind the Senior', description: 'He develops without upending the locker room. Splitting reps takes planning.', tier: 'COMPROMISE',
          impact: impact(0, 0, 4, 0, { coachPointsDelta: -5 }) },
        { id: 'opt_jv', label: 'Keep Him on JV to "Pay His Dues"', description: "Seniority wins and the senior's family stays generous. The freshman's parents start looking around.", tier: 'RISKY',
          impact: impact(-2, -4, 2, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_perks', label: 'Promote Him and Give His Family Booster Perks to Stay', description: "He starts and stays, and his family's friends join the booster club. Perks for a recruit are a violation.", tier: 'CORRUPT',
          impact: impact(-8, 10, -6, -16, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 30 }) }
      ]
    })
  },
  {
    id: 'SENIOR_NIGHT_WALKON',
    appliesTo: (team, week) =>
      whenPlayer(
        inWeeks(week, LAST_REGULAR_SEASON_WEEK - 2, LAST_REGULAR_SEASON_WEEK),
        team.roster.filter((p) => p.classYear === 'Senior' && p.depthChartTier !== 1).sort((a, b) => a.overallRating - b.overallRating)[0]
      ),
    build: (_team, _week, player) => ({
      title: 'Senior Night for a Walk-On',
      scenario: `${name(player!)} has never played a varsity snap in four years but never missed a practice. Teammates want him to start on Senior Night in a must-win district game.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_start', label: 'Start Him for the First Series', description: 'A night he and his family will never forget. Your first series in a must-win game is weaker.', tier: 'GOOD',
          impact: impact(6, 2, 10, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_late', label: 'Get Him In If the Game Is Decided', description: 'Maybe. If the scoreboard cooperates. You promise his family a highlight video.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { coachPointsDelta: -5 }) },
        { id: 'opt_no', label: 'Decline: Too Much Is at Stake', description: 'Practical, and the boosters want the win. The team notices.', tier: 'RISKY',
          impact: impact(-2, 0, -8, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_bait', label: 'Promise His Family a Start, Then Quietly Change the Plan', description: 'Their booster pledge arrives first. He finds out from the depth chart.', tier: 'CORRUPT',
          impact: impact(-8, 6, -14, 0, { coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'TEAM_CAPTAIN_VOTE',
    appliesTo: (team, week) => whenPlayer(isPreseasonOrCamp(week), bestStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Captain Vote Goes Sideways',
      scenario: `The team voted for captains. Your best player, ${name(player!)}, lost to a backup lineman everyone loves. ${player!.lastName}'s family is upset and blaming the staff.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_respect', label: 'Respect the Vote', description: 'Leadership is earned in the locker room. His family pulls a pledge.', tier: 'GOOD',
          impact: impact(2, -4, 8, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_add', label: 'Add Him as a Fourth Captain', description: 'His family is pleased. Nobody believes it.', tier: 'COMPROMISE',
          impact: impact(-2, 4, -6, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_overrule', label: 'Overrule the Vote and Name Him Captain', description: "His family is delighted. The players learn their voices don't matter.", tier: 'RISKY',
          impact: impact(-2, 5, -12, 0, { coachPointsDelta: 20 }) },
        { id: 'opt_donation', label: "Name Him Captain After His Family's Donation", description: 'A captaincy for a check. The vote, and the donation, are public record.', tier: 'CORRUPT',
          impact: impact(-8, 12, -14, -10, { coachPointsDelta: 45 }) }
      ]
    })
  },
  // -------------------------------------------------------------------------
  // New in v1.1: the town, families, and the program (potential-dilemmas.txt)
  // -------------------------------------------------------------------------
  {
    id: 'WATER_CRISIS',
    appliesTo: (_team, week) => when(isRegularSeason(week)),
    build: () => ({
      title: 'Boil-Water Notice on Game Day',
      scenario: `A boil-water notice hits town on game day. The stadium concession stand is the only place nearby with bottled water, and the town expects the game to go on.`,
      choices: [
        { id: 'opt_delay', label: 'Delay Kickoff Until Safe Water Arrives', description: 'Everyone stays safe. Your players sit in the locker room for two extra hours.', tier: 'GOOD',
          impact: impact(8, -2, 2, 4, { fridayEdgeDelta: -1 }) },
        { id: 'opt_sealed', label: 'Close Concessions and Bring Sealed Water for Both Teams', description: 'The game goes on. The school spends its emergency supply and loses a night of concession money.', tier: 'COMPROMISE',
          impact: impact(4, -2, 0, 2, { coachPointsDelta: -15 }) },
        { id: 'opt_families', label: 'Ask Families to Bring Their Own Water', description: 'No delay and no cost. Some students arrive without enough on a hot night.', tier: 'RISKY',
          impact: impact(-4, 2, -2, -4, { coachPointsDelta: 10, injuryRisk: { chance: 0.1, weeks: 1 } }) },
        { id: 'opt_tap', label: 'Keep Serving Tap Water Without Mentioning the Notice', description: 'No panic and a full night of sales. People may get sick, and the health department keeps records.', tier: 'CORRUPT',
          impact: impact(-14, 6, -4, -20, { coachPointsDelta: 35, injuryRisk: { chance: 0.15, weeks: 1 } }) }
      ]
    })
  },
  {
    id: 'RIVAL_BAND_BUS',
    appliesTo: (_team, week) => when(isRegularSeason(week)),
    build: () => ({
      title: 'The Band Bus Breaks Down',
      scenario: `Your marching band's bus broke down, and this week's opponent offers room on theirs. After a heated week, some students refuse to ride with the rivals.`,
      choices: [
        { id: 'opt_accept', label: 'Accept and Send Staff With Both Groups', description: 'The band makes the game. You pay for extra chaperones.', tier: 'GOOD',
          impact: impact(8, 2, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_instruments', label: 'Ask Them to Carry Only the Instruments', description: 'You keep some distance and rent a van for the students.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { coachPointsDelta: -15 }) },
        { id: 'opt_parent_rides', label: 'Have Families Arrange Their Own Rides', description: 'Free, and most of the band makes it. Unapproved rides are a liability.', tier: 'RISKY',
          impact: impact(-4, 0, -2, -6, { coachPointsDelta: 10 }) },
        { id: 'opt_blame_band', label: 'Tell the Band to Stay Home and Say They Chose Not to Come', description: 'No travel costs at all. The band directors and parents know the truth.', tier: 'CORRUPT',
          impact: impact(-14, -4, -6, 0, { coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'NEWSPAPER_CORRECTION',
    appliesTo: (team, week) => whenPlayer(week >= 3, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Student Paper Gets It Wrong',
      scenario: `The student newspaper ran an incorrect story about ${name(player!)}. The editor offers an online correction but says a printed retraction would make the paper look unreliable.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_print', label: 'Ask for a Clear Correction in Print and Online', description: 'His name is cleared everywhere. The journalism adviser takes up an afternoon of your week.', tier: 'GOOD',
          impact: impact(6, 0, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_online', label: 'Accept an Online Correction Only', description: 'Fixed fast, and the paper promises a big feature later. Print readers may never see it.', tier: 'COMPROMISE',
          impact: impact(-2, 2, -4, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_player_responds', label: 'Ask the Player to Respond Publicly', description: 'His response goes viral and ticket requests jump. He carries the burden of correcting the story.', tier: 'RISKY',
          impact: impact(-4, 2, -4, 0, { coachPointsDelta: 15 }) },
        { id: 'opt_ban_paper', label: 'Threaten to Ban the Paper From Games Unless It Retracts', description: 'You get your retraction and the boosters love the fight. Press access is not yours to take away.', tier: 'CORRUPT',
          impact: impact(-12, 6, -4, -12, { coachPointsDelta: 25 }) }
      ]
    })
  },
  {
    id: 'STADIUM_RENAMING',
    appliesTo: (_team, week) => when(week >= 2 && week <= 15),
    build: () => ({
      title: 'Stadium Renaming Debate',
      scenario: `The school board is deciding whether to rename the stadium after a controversial former coach. Donors want your players at the meeting in matching jerseys.`,
      choices: [
        { id: 'opt_students_decide', label: 'Let Players Decide Whether to Attend and Speak for Themselves', description: 'They have a real voice. The donors wanted a show of support.', tier: 'GOOD',
          impact: impact(6, -4, 6, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_attend_silent', label: 'Attend as a Team but Make No Statement', description: 'The donors are pleased. Some players feel used as a backdrop.', tier: 'COMPROMISE',
          impact: impact(-2, 4, -6, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_captains', label: 'Ask the Captains to Endorse the Renaming', description: 'The board hears "student support." The captains don\'t speak for the whole team.', tier: 'RISKY',
          impact: impact(-4, 8, -8, 0, { coachPointsDelta: 25 }) },
        { id: 'opt_require', label: 'Require Players to Speak in Favor to Protect Donor Ties', description: 'The donors are thrilled. Coercing students to speak is a complaint waiting to happen.', tier: 'CORRUPT',
          impact: impact(-12, 14, -14, -10, { coachPointsDelta: 50 }) }
      ]
    })
  },
  {
    id: 'RIVAL_LOST_DOG',
    appliesTo: (_team, week) => when(isDistrictPlay(week)),
    build: () => ({
      title: 'Lost Dog Before Kickoff',
      scenario: `A dog wearing the rival school's bandana is wandering near the stadium before kickoff. A child from the rival town says it's her family's, and their buses are about to unload.`,
      choices: [
        { id: 'opt_help', label: 'Pause Your Pregame and Help the Family Call Animal Control', description: 'The dog goes home. Your pregame routine is a mess.', tier: 'GOOD',
          impact: impact(8, 2, 2, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_staff', label: 'Have a Staff Member Keep the Dog Somewhere Safe', description: 'The game starts on time. Someone has to give up their night.', tier: 'COMPROMISE',
          impact: impact(4, 0, 0, 0, { coachPointsDelta: -5 }) },
        { id: 'opt_post', label: 'Post a Photo Online and Start the Game', description: 'The post gets thousands of shares. The dog waits in a busy parking lot.', tier: 'RISKY',
          impact: impact(-4, 0, 0, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_mascot', label: 'Keep the Dog as a Sideline "Mascot" Joke', description: 'The crowd loves it and the merch table sells out. The family sees their distress turned into a punchline.', tier: 'CORRUPT',
          impact: impact(-12, 6, -6, 0, { coachPointsDelta: 25 }) }
      ]
    })
  },
  {
    id: 'SCHOLARSHIP_CEREMONY',
    appliesTo: (team, week) => whenPlayer(inWeeks(week, LAST_REGULAR_SEASON_WEEK - 1, LAST_REGULAR_SEASON_WEEK + 6), pick(starters(team).filter((p) => p.classYear === 'Senior'))),
    build: (_team, _week, player) => ({
      title: 'Scholarship Ceremony vs. Practice',
      scenario: `${name(player!)} is a finalist for a local academic scholarship. The ceremony is during practice, and the organizer expects the whole team in the audience.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_whole_team', label: 'Move Practice So the Whole Team Can Attend', description: 'He feels the program behind him. You lose a practice before a big game.', tier: 'GOOD',
          impact: impact(8, 2, 6, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_captains', label: 'Send the Captains to Represent the Team', description: "He has support in the room. You pay for the captains' ride.", tier: 'COMPROMISE',
          impact: impact(4, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_after_practice', label: 'Ask Him to Go After Practice', description: 'A full practice. He may miss his own ceremony.', tier: 'RISKY',
          impact: impact(-4, 0, -4, 0, { fridayEdgeDelta: 1 }) },
        { id: 'opt_cancel', label: 'Tell the Organizer the Team Will Come, Then Cancel Without Notice', description: 'A full practice, and the team gift budget stays with football. He is embarrassed in front of the room.', tier: 'CORRUPT',
          impact: impact(-12, 0, -10, -4, { fridayEdgeDelta: 1, coachPointsDelta: 10 }) }
      ]
    })
  },
  {
    id: 'EMPTY_TROPHY_CASE',
    appliesTo: (_team, week) => when(isPreseasonOrCamp(week)),
    build: () => ({
      title: 'The Empty Trophy Case',
      scenario: `A former player says the team's old trophies were thrown away during summer renovations. He offers to donate replacements if the school labels them as the originals.`,
      choices: [
        { id: 'opt_accurate', label: 'Display New Trophies With Accurate Labels and Explain the Loss', description: 'The history stays true. He withholds the donation, so you restore the case yourself.', tier: 'GOOD',
          impact: impact(6, -6, 2, 4, { coachPointsDelta: -15 }) },
        { id: 'opt_replicas_note', label: 'Display Replicas With a Note That They Are Replacements', description: 'The case looks whole and honest. You pay for the engraved notes.', tier: 'COMPROMISE',
          impact: impact(4, 2, 0, 0, { coachPointsDelta: -5 }) },
        { id: 'opt_no_note', label: 'Display the Replicas Without Explanation', description: 'He donates and the case looks complete. Former players may challenge it.', tier: 'RISKY',
          impact: impact(-6, 6, -2, -2, { coachPointsDelta: 20 }) },
        { id: 'opt_originals', label: 'Label the Replacements as the Originals', description: 'He donates even more. A false history is a records problem the day someone checks.', tier: 'CORRUPT',
          impact: impact(-12, 10, -2, -12, { coachPointsDelta: 40 }) }
      ]
    })
  },
  {
    id: 'RIVAL_MEMORIAL',
    appliesTo: (_team, week) => when(isRegularSeason(week)),
    build: () => ({
      title: "A Rival Player's Memorial",
      scenario: `A former rival player died unexpectedly. His school asks your team to attend the memorial game, scheduled on your only full rest day this week.`,
      choices: [
        { id: 'opt_attend', label: 'Attend as a Team and Let Players Choose How to Take Part', description: 'A moment both towns will remember. Your players lose their recovery day.', tier: 'GOOD',
          impact: impact(10, 4, 6, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_delegation', label: 'Send a Delegation With a Message From the Team', description: "You honor the player. You pay for the delegation's travel.", tier: 'COMPROMISE',
          impact: impact(6, 2, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_silence', label: 'Hold a Moment of Silence at Your Next Game Instead', description: 'The rest day stays. The rival community sees it as distant.', tier: 'RISKY',
          impact: impact(-6, 0, 2, 0, { fridayEdgeDelta: 1 }) },
        { id: 'opt_decline', label: 'Decline: "They Need to Focus on Their Own Season"', description: 'Rest day kept and no travel bill. It may end the relationship between the towns.', tier: 'CORRUPT',
          impact: impact(-14, -2, -4, 0, { fridayEdgeDelta: 1, coachPointsDelta: 10 }) }
      ]
    })
  },
  {
    id: 'COACH_JOB_OFFER',
    appliesTo: (_team, week) => when(inWeeks(week, FIRST_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK)),
    build: () => ({
      title: 'A College Job Offer',
      scenario: `A college program offered you an assistant job, starting right after the season. Your family wants to stay in town, but the job could transform your career.`,
      choices: [
        { id: 'opt_truth', label: 'Tell the Team and the School, and Decide With Your Family', description: "You keep everyone's trust. The uncertainty unsettles the team this week.", tier: 'GOOD',
          impact: impact(8, -2, -2, 4, { fridayEdgeDelta: -1 }) },
        { id: 'opt_wait', label: 'Ask the College to Wait Until the Season Ends', description: "You keep coaching with a clear head. You pass on the college's camp partnership money.", tier: 'COMPROMISE',
          impact: impact(4, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_accept_private', label: 'Accept Privately and Keep Coaching Through the Playoffs', description: 'A signing bonus lands in your account. Your staff and players may feel misled.', tier: 'RISKY',
          impact: impact(-6, 0, -6, -2, { coachPointsDelta: 30 }) },
        { id: 'opt_leverage', label: 'Use the Offer to Demand a Raise From the School', description: 'You get the raise. The town sees its team as a bargaining chip.', tier: 'CORRUPT',
          impact: impact(-12, 4, -6, -4, { coachPointsDelta: 60 }) }
      ]
    })
  },
  {
    id: 'SISTER_HARASSMENT',
    appliesTo: (team, week) => whenPlayer(week >= 3, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'His Sister Is Being Harassed',
      scenario: `${name(player!)}'s sister tells you students are harassing her over something he did at school. He asks you not to get involved.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_school', label: 'Work With the School to Stop It, Respecting His Privacy', description: 'His family is protected. It takes real time with counselors and administrators.', tier: 'GOOD',
          impact: impact(8, 0, 4, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_ask', label: 'Ask Him What Support He Wants and Check In Later', description: 'He keeps control. The harassment may continue, and it weighs on him Friday.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_move_seats', label: 'Move His Sister to a Different Section at Games', description: "Quick, and no security costs. She pays for other people's behavior.", tier: 'RISKY',
          impact: impact(-4, 0, -2, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_silence', label: 'Tell Him to Make His Sister Stay Quiet Until the Season Ends', description: 'No distractions and no costs. Both of them may stop trusting the team.', tier: 'CORRUPT',
          impact: impact(-12, 2, -10, -6, { fridayEdgeDelta: 1, coachPointsDelta: 10 }) }
      ]
    })
  },
  {
    id: 'ALUMNUS_ACCUSED',
    appliesTo: (_team, week) => when(week >= 3),
    build: () => ({
      title: 'Beloved Booster Accused',
      scenario: `A former star who now owns a local business is accused of assaulting a student. He is a beloved alumnus and one of the program's biggest boosters.`,
      choices: [
        { id: 'opt_refer', label: 'Report It to School Officials and Keep Him Away From Players', description: 'Students come first. His donations stop.', tier: 'GOOD',
          impact: impact(10, -14, 6, 8, { coachPointsDelta: -25 }) },
        { id: 'opt_ask_away', label: 'Ask Him to Stay Away From the Team Voluntarily', description: "No public fight. The boundary isn't enforced, and his donations pause.", tier: 'COMPROMISE',
          impact: impact(4, -2, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_let_attend', label: 'Let Him Keep Coming to Games While the School Looks Into It', description: 'Community ties and donations hold. Students may feel unsafe.', tier: 'RISKY',
          impact: impact(-8, 6, -4, -6, { coachPointsDelta: 20 }) },
        { id: 'opt_settle', label: "Ask the Student's Family to Settle It Privately", description: "He funds a new scoreboard. Pressuring a victim's family is the kind of thing that ends careers.", tier: 'CORRUPT',
          impact: impact(-16, 10, -8, -22, { coachPointsDelta: 50 }) }
      ]
    })
  },
  {
    id: 'TRIP_FEE',
    appliesTo: (team, week) => whenPlayer(isPlayoffs(week), pickStarter(team)),
    build: (_team, _week, player) => ({
      title: "Can't Afford the Playoff Trip",
      scenario: `${name(player!)}'s family can't pay the playoff travel fee. He says he'll just stay home so nobody finds out.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_fund', label: 'Cover It Through the School Assistance Fund', description: 'He travels with dignity. You add to the fund so the next student is covered.', tier: 'GOOD',
          impact: impact(8, 0, 4, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_waive', label: 'Quietly Waive His Fee Yourself', description: 'He travels. Your budget absorbs it, and inconsistent rules breed resentment.', tier: 'COMPROMISE',
          impact: impact(4, 0, -2, 0, { coachPointsDelta: -15 }) },
        { id: 'opt_booster', label: 'Ask the Booster Club to Pay', description: 'Covered in an hour, and the booster club tops up the trip fund. He may feel he owes a donor.', tier: 'RISKY',
          impact: impact(-2, 4, 0, -10, { coachPointsDelta: 10 }) },
        { id: 'opt_fake_paid', label: 'Mark the Fee Paid and Cover It From Another Team Account', description: 'He travels and your budget is untouched. Moving money between accounts invites an audit.', tier: 'CORRUPT',
          impact: impact(-10, 2, -4, -18, { coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'OLD_INJURY_COACH',
    appliesTo: (_team, week) => when(isPreseasonOrCamp(week)),
    build: () => ({
      title: 'An Injured Former Star Wants to Coach',
      scenario: `A former star whose career ended with a serious injury wants to help coach your younger players. His family says being back on the field is too painful.`,
      choices: [
        { id: 'opt_non_contact', label: 'Offer a Non-Contact Role and Let Him Set the Boundaries', description: 'He stays connected to the game. You pay him a small stipend.', tier: 'GOOD',
          impact: impact(6, 2, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_trainer', label: 'Let Him Help at Practice With the Trainer Checking In', description: "Some connection, with unclear limits. The trainer's time isn't free.", tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_full_gear', label: 'Invite Him to Demonstrate Plays in Full Gear', description: 'Your players learn from the best. The activity could worsen his injury.', tier: 'RISKY',
          impact: impact(-6, 2, 2, -4, { fridayEdgeDelta: 1 }) },
        { id: 'opt_use_story', label: 'Use His Story to Fire Up the Team Without Asking Him', description: 'An inspired, emotional team. He may feel his hardship was turned into a tool.', tier: 'CORRUPT',
          impact: impact(-10, 4, -4, 0, { fridayEdgeDelta: 2 }) }
      ]
    })
  },
  {
    id: 'PARENT_TRUTH',
    appliesTo: (team, week) => whenPlayer(week >= 3, pick(starters(team).filter((p) => p.academics.gpa < 2.6 && (p.classYear === 'Junior' || p.classYear === 'Senior')))),
    build: (_team, _week, player) => ({
      title: 'A Parent Wants the Truth',
      scenario: `${name(player!)}'s mother asks whether he will play college football. He has talent, but his grades are poor and he shows little interest in schoolwork.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_honest', label: 'Give an Honest Assessment and Offer an Academic Plan', description: 'The family can act early. You pay for the tutoring plan.', tier: 'GOOD',
          impact: impact(6, -2, 2, 0, { gpaChanges: [{ playerId: player!.id, amount: 0.3 }], coachPointsDelta: -10 }) },
        { id: 'opt_strengths', label: 'Focus on His Strengths and Suggest Several Options', description: 'Hope stays alive. The family underestimates the academic work, and his grades slip.', tier: 'COMPROMISE',
          impact: impact(2, 2, 0, 0, { gpaChanges: [{ playerId: player!.id, amount: -0.1 }] }) },
        { id: 'opt_after_season', label: 'Tell Her to Wait Until After the Season', description: 'He stays focused on football. Valuable time to fix his grades is lost.', tier: 'RISKY',
          impact: impact(-2, 2, 0, 0, { gpaChanges: [{ playerId: player!.id, amount: -0.2 }], fridayEdgeDelta: 1 }) },
        { id: 'opt_promise', label: 'Promise He Will Get Recruited if He Keeps Starting', description: 'He plays harder than ever and his family joins the booster club. The promise may wreck his plans.', tier: 'CORRUPT',
          impact: impact(-8, 6, -2, -6, { gpaChanges: [{ playerId: player!.id, amount: -0.2 }], fridayEdgeDelta: 1, coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'TOWN_WANTS_WINNER',
    appliesTo: (team, week) => when(isRegularSeason(week) && team.record.losses >= 3 && team.record.losses > team.record.wins),
    build: () => ({
      title: 'The Town Wants a Winner',
      scenario: `The losing streak has the town restless. Local businesses say they will stop sponsoring the program unless results improve.`,
      choices: [
        { id: 'opt_rebuild', label: 'Tell the Town the Team Is Rebuilding', description: 'Realistic expectations and protected player development. Some sponsors leave.', tier: 'GOOD',
          impact: impact(6, -10, 6, 0, { coachPointsDelta: -20 }) },
        { id: 'opt_winnable', label: 'Focus on a Few Winnable Games', description: 'Support steadies. A couple of sponsors still walk.', tier: 'COMPROMISE',
          impact: impact(2, 2, -2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_overload', label: 'Load the Starters With Extra Practice', description: 'The urgency shows on Friday. Fatigue and resentment build.', tier: 'RISKY',
          impact: impact(-2, 4, -6, 0, { fridayEdgeDelta: 1, injuryRisk: { chance: 0.15, weeks: 1 } }) },
        { id: 'opt_guarantee', label: 'Guarantee a Winning Season to Keep the Sponsors', description: 'The sponsors sign on for more. Every loss now becomes a broken promise.', tier: 'CORRUPT',
          impact: impact(-14, 12, -10, 0, { coachPointsDelta: 40 }) }
      ]
    })
  },
  {
    id: 'LEAKED_PLAYBOOK',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Leaked Playbook',
      scenario: `${name(player!)} texted a photo of your playbook to a friend at this week's opponent. Kickoff is in three days.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_rebuild', label: 'Rebuild the Game Plan', description: "Nothing they saw will work. Three days isn't much time to learn a new plan.", tier: 'GOOD',
          impact: impact(6, 0, 4, 2, { fridayEdgeDelta: -1 }) },
        { id: 'opt_signals', label: 'Change Only the Key Signals', description: "Most of the week's preparation survives. Your staff works late all week.", tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_unchanged', label: 'Keep the Playbook Unchanged', description: 'Your players stay confident in a plan they know. The opponent is ready for your best calls.', tier: 'RISKY',
          impact: impact(2, 0, 2, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_fake', label: 'Send Them a Fake Playbook Through the Same Friend', description: "They prepare for plays you'll never run. Deception like this gets talked about.", tier: 'CORRUPT',
          impact: impact(-10, 6, -4, -12, { fridayEdgeDelta: 2 }) }
      ]
    })
  },
  {
    id: 'WRONG_JERSEY',
    appliesTo: (team, week) => whenPlayer(week >= 2 && week <= 15, pick(team.roster.filter((p) => p.classYear === 'Senior' && p.depthChartTier === 1))),
    build: (_team, _week, player) => ({
      title: 'The Wrong Jersey Number',
      scenario: `A freshman was issued the number of ${name(player!)}, who is hurt but hopes to return before the playoffs.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_senior', label: 'Give the Senior Priority', description: 'You honor his history. You order the freshman a new jersey.', tier: 'GOOD',
          impact: impact(4, 0, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_share', label: 'Let the Freshman Wear It Until the Senior Returns', description: 'No new jersey to buy. Both players feel their place is uncertain.', tier: 'COMPROMISE',
          impact: impact(-2, 0, -2, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_freshman', label: 'Give the Number to the Freshman Permanently', description: "His family joins the booster club. The senior's friends see it as disrespect.", tier: 'RISKY',
          impact: impact(-4, 2, -4, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_donation', label: 'Give It to the Player Whose Family Donates More', description: 'A generous donation. The players conclude money decides status.', tier: 'CORRUPT',
          impact: impact(-10, 12, -10, -4, { coachPointsDelta: 40 }) }
      ]
    })
  },
  {
    id: 'BUS_BREAKDOWN',
    appliesTo: (_team, week) => when(isGameWeek(week)),
    build: () => ({
      title: 'Team Bus Breaks Down',
      scenario: `Your team bus broke down on the way to Friday's road game, and kickoff is approaching.`,
      choices: [
        { id: 'opt_notify', label: 'Notify the Officials and Accept a Delay', description: 'Everyone travels safely. Warm-ups are cut short.', tier: 'GOOD',
          impact: impact(6, 0, 2, 4, { fridayEdgeDelta: -1 }) },
        { id: 'opt_cars', label: 'Send the Starters Ahead in Approved Rental Cars', description: "Your key players arrive on time. The rentals aren't cheap.", tier: 'COMPROMISE',
          impact: impact(2, 0, -2, 2, { coachPointsDelta: -15 }) },
        { id: 'opt_parents', label: 'Use Any Available Parent Rides', description: "Most of the team gets there, free. Some rides don't meet school rules.", tier: 'RISKY',
          impact: impact(-4, 2, 0, -10, { coachPointsDelta: 10 }) },
        { id: 'opt_misstate', label: 'Misstate When the Breakdown Happened to Buy More Time', description: 'A full warm-up and no rental bill. Lying to the league is a violation.', tier: 'CORRUPT',
          impact: impact(-10, 4, -2, -16, { fridayEdgeDelta: 1, coachPointsDelta: 10 }) }
      ]
    })
  },
  {
    id: 'ANONYMOUS_TIP',
    appliesTo: (_team, week) => when(isDistrictPlay(week) || isPlayoffs(week)),
    build: () => ({
      title: 'Anonymous Age Tip',
      scenario: `An anonymous message claims this week's opponent's best player is over the age limit.`,
      choices: [
        { id: 'opt_league', label: 'Send the Tip to the League', description: 'The right process. The paperwork eats your week, and the review may not finish in time.', tier: 'GOOD',
          impact: impact(6, 0, 2, 6, { coachPointsDelta: -10 }) },
        { id: 'opt_private', label: 'Ask Their Athletic Director to Check Privately', description: 'Maybe a quick answer. You spend a favor, and they may see it as intimidation.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_rumor', label: 'Spread the Rumor Among Coaches and Scouts', description: 'Their team is distracted all week. You may be hurting an innocent player.', tier: 'RISKY',
          impact: impact(-8, 4, -2, -6, { fridayEdgeDelta: 1 }) },
        { id: 'opt_evidence', label: 'Create Evidence to Get the Player Suspended', description: 'He sits Friday. Fabricating evidence is a major integrity violation.', tier: 'CORRUPT',
          impact: impact(-16, 6, -6, -24, { fridayEdgeDelta: 2 }) }
      ]
    })
  },
  {
    id: 'MISSING_EQUIPMENT',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), pickStarter(team, ['QB', 'RB', 'WR', 'TE', 'LB', 'CB', 'S', 'DE', 'DT', 'OT', 'OG', 'C'])),
    build: (_team, _week, player) => ({
      title: 'Damaged Helmets',
      scenario: `The day before the game, you find damaged padding in several helmets, including ${name(player!)}'s. Replacements won't arrive until next week.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_hold_out', label: 'Hold the Affected Players Out', description: 'Nobody plays in an unsafe helmet. You lose a starter for the game.', tier: 'GOOD',
          impact: impact(6, -2, 2, 6, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_borrow', label: 'Borrow Certified Helmets From Another School', description: 'Everyone plays. You pay a rental fee, and the fit is not quite right.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 2, { coachPointsDelta: -15 }) },
        { id: 'opt_players_decide', label: 'Let the Players Decide Whether to Wear Them', description: 'He plays. Teenagers underestimate the risk.', tier: 'RISKY',
          impact: impact(-6, 2, 0, -8, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.15, weeks: 2 } }) },
        { id: 'opt_hide', label: 'Hide the Damage During Inspection', description: 'Your lineup stays intact. You put players, and the school, at risk.', tier: 'CORRUPT',
          impact: impact(-14, 4, -4, -20, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, injuryRisk: { chance: 0.25, weeks: 3 } }) }
      ]
    })
  },
  {
    id: 'ASSISTANTS_SON',
    appliesTo: (team, week) => whenPlayer(week >= 2 && week <= 15, pick(backups(team).filter((p) => p.position !== 'K' && p.position !== 'P'))),
    build: (_team, _week, player) => ({
      title: "The Assistant Coach's Son",
      scenario: `Your offensive line coach wants more playing time for his son, ${name(player!)}. The starter ahead of him is clearly better.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_same_standard', label: 'Apply the Same Standard to Both', description: 'The fair call. The assistant starts looking at other jobs, and you start a quiet search.', tier: 'GOOD',
          impact: impact(6, 0, 6, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_evaluation', label: 'Give Both Players Evaluation Snaps Friday', description: 'A clear comparison. It disrupts your game plan.', tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_let_assistant', label: 'Let the Assistant Make the Call', description: 'No staff conflict today. His son starts, and favoritism is on display.', tier: 'RISKY',
          impact: impact(-4, 2, -6, 0, { promoteToStarterPlayerId: player!.id }) },
        { id: 'opt_start_son', label: 'Start His Son to Keep the Coach', description: 'Your experienced assistant stays, saving you a search. The better player loses trust in you.', tier: 'CORRUPT',
          impact: impact(-10, 4, -12, -4, { promoteToStarterPlayerId: player!.id, coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'SIDELINE_VIDEO',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week), pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Sideline Video Goes Viral',
      scenario: `A parent posted a short clip of a private sideline conversation between you and ${name(player!)}. Without context, it makes you look cruel.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_full_context', label: 'Work With the Family and School on the Full Context', description: 'You protect the player. The review takes your week and may expose something you need to own.', tier: 'GOOD',
          impact: impact(8, -2, 6, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_remove', label: 'Ask the Parent to Remove It and Meet With Administrators', description: 'The spread slows. You pay for a mediator, and the parent feels pressured.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_own_recording', label: 'Post Your Own Recording', description: "Your supporters rally behind you. It may expose the player's private information.", tier: 'RISKY',
          impact: impact(-6, 6, -6, -4, { coachPointsDelta: 15 }) },
        { id: 'opt_pressure_deny', label: 'Pressure the Player to Deny It Happened', description: 'The story dies and the boosters stand by you. The player may not stay quiet.', tier: 'CORRUPT',
          impact: impact(-14, 6, -12, -10, { coachPointsDelta: 25 }) }
      ]
    })
  },
  {
    id: 'INJURED_RIVAL',
    appliesTo: (_team, week) => when(isGameWeek(week) && week > FIRST_NON_DISTRICT_WEEK),
    build: () => ({
      title: 'Injured Rival Left Alone',
      scenario: `After last week's game, an injured opposing player was left alone on the bench while his team boarded their bus.`,
      choices: [
        { id: 'opt_stay', label: 'Stay Until His Family or Medical Staff Arrive', description: 'He is cared for. Your bus driver bills the overtime.', tier: 'GOOD',
          impact: impact(8, 2, 4, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_trainer', label: 'Ask Your Trainer to Check on Him', description: 'He gets help. Your trainer stays late.', tier: 'COMPROMISE',
          impact: impact(4, 0, 2, 0, { coachPointsDelta: -5 }) },
        { id: 'opt_assume', label: 'Assume Their Staff Will Handle It', description: 'You leave on schedule and skip the overtime. You may be wrong.', tier: 'RISKY',
          impact: impact(-4, 0, 0, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_leave', label: 'Leave Immediately', description: 'Home early and rested. It looks like indifference if he was left without help.', tier: 'CORRUPT',
          impact: impact(-12, 0, -4, 0, { fridayEdgeDelta: 1, coachPointsDelta: 15 }) }
      ]
    })
  },
  {
    id: 'WRONGFUL_EJECTION',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week) && week > FIRST_NON_DISTRICT_WEEK, bestStarter(team)),
    build: (_team, _week, player) => ({
      title: 'Captain Wrongly Ejected',
      scenario: `An official ejected your captain, ${name(player!)}, last Friday after a disputed call, which means a one-game suspension. Video suggests he was trying to separate players.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_appeal', label: 'Submit the Video Through the Appeal Process', description: 'The right way. He sits while the appeal runs.', tier: 'GOOD',
          impact: impact(6, 0, 4, 4, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_clarify', label: 'Ask the League for Clarification After the Season', description: 'No escalation. The suspension stands.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 2, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_play_him', label: 'Play Him Anyway and Dare the League to Act', description: 'Your leader plays Friday. Ignoring a suspension risks a forfeit.', tier: 'RISKY',
          impact: impact(-8, 4, -4, -12, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_edit_video', label: 'Edit the Video Before Submitting It', description: 'The appeal is a sure thing and he plays. Doctored evidence is exactly what gets programs sanctioned.', tier: 'CORRUPT',
          impact: impact(-12, 4, -4, -20, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, fridayEdgeDelta: 1 }) }
      ]
    })
  },
  {
    id: 'RIVALRY_BANNER',
    appliesTo: (_team, week) => when(isDistrictPlay(week)),
    build: () => ({
      title: 'Rivalry Banner Goes Too Far',
      scenario: `Students made a banner mocking a rival player's family hardship for Friday's game. The crowd loves it.`,
      choices: [
        { id: 'opt_remove', label: 'Take It Down and Explain Why', description: 'You protect the targeted player. The student section goes quiet on Friday.', tier: 'GOOD',
          impact: impact(8, -4, 4, 2, { fridayEdgeDelta: -1 }) },
        { id: 'opt_replace', label: 'Replace It With a General Rivalry Message', description: 'The energy stays. You pay for the new banner.', tier: 'COMPROMISE',
          impact: impact(4, 0, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_leave_up', label: 'Leave It Up but Discourage Photos', description: 'The crowd is electric. The banner spreads anyway.', tier: 'RISKY',
          impact: impact(-6, 2, 0, -4, { fridayEdgeDelta: 1 }) },
        { id: 'opt_share', label: 'Share It From the Team Account', description: 'A rocking stadium and a merch spike. It invites harassment and a sportsmanship review.', tier: 'CORRUPT',
          impact: impact(-14, 6, -4, -12, { fridayEdgeDelta: 1, coachPointsDelta: 20 }) }
      ]
    })
  },
  {
    id: 'LATE_HIT',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week) && week > FIRST_NON_DISTRICT_WEEK, pickStarter(team, ['DE', 'DT', 'LB', 'CB', 'S'])),
    build: (_team, _week, player) => ({
      title: 'Late Hit on Film',
      scenario: `Film from last Friday shows ${name(player!)} hitting an opponent well after the whistle and injuring him. The officials missed it.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_self_report', label: 'Report It and Suspend Him for a Game', description: 'You act responsibly. You lose a key defender.', tier: 'GOOD',
          impact: impact(8, -2, 6, 6, { sidelinePlayer: { playerId: player!.id, weeks: 1 } }) },
        { id: 'opt_internal', label: 'Discipline Him Internally and Sit Him the First Quarter', description: "A message without losing him for the game. The opponent's family feels it was minimized.", tier: 'COMPROMISE',
          impact: impact(2, 0, 2, 0, { fridayEdgeDelta: -1 }) },
        { id: 'opt_no_call', label: 'Do Nothing: There Was No Call', description: 'He plays. A league review could still come.', tier: 'RISKY',
          impact: impact(-6, 2, -6, -4, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true } }) },
        { id: 'opt_praise', label: 'Praise the Hit in Film Session', description: '"That\'s how we play." An aggressive defense, and a culture that injures people.', tier: 'CORRUPT',
          impact: impact(-14, 4, -10, -12, { playerAvailabilityOverride: { playerId: player!.id, isEligible: true }, fridayEdgeDelta: 1 }) }
      ]
    })
  },
  {
    id: 'EMPTY_CLASSROOM',
    appliesTo: (_team, week) => when(isRegularSeason(week)),
    build: () => ({
      title: 'Players Pulled From Class',
      scenario: `A teacher complains that players are pulled from class too often for team events. A pep assembly sponsored by a local business is scheduled during school hours.`,
      choices: [
        { id: 'opt_cancel', label: 'Cancel the Team Appearance', description: 'Class time is protected. The sponsor pulls its check.', tier: 'GOOD',
          impact: impact(6, -4, 2, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_caught_up', label: 'Send Only Players Who Are Caught Up', description: 'Responsibility is rewarded. You fund a make-up study session for the rest.', tier: 'COMPROMISE',
          impact: impact(4, 0, 0, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_excuse_later', label: 'Ask Teachers to Excuse the Missed Work Until After the Season', description: 'The assembly goes ahead and the sponsor pays. Assignments pile up.', tier: 'RISKY',
          impact: impact(-6, 4, -2, -2, { coachPointsDelta: 15 }) },
        { id: 'opt_alter', label: 'Alter the Attendance Records', description: 'No complaints and a bigger sponsorship. Falsified records are an investigation.', tier: 'CORRUPT',
          impact: impact(-12, 6, -4, -18, { coachPointsDelta: 25 }) }
      ]
    })
  },
  {
    id: 'MISPRINTED_PROGRAM',
    appliesTo: (_team, week) => when(isRegularSeason(week)),
    build: () => ({
      title: 'Misprinted Game Program',
      scenario: `This week's game program lists a student manager as a player. The manager asks you to leave it, hoping college coaches see it.`,
      choices: [
        { id: 'opt_correct', label: "Correct It and Highlight the Manager's Real Work", description: 'Honest, and the manager is celebrated for what he does. Reprints cost money.', tier: 'GOOD',
          impact: impact(6, 0, 2, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_digital', label: 'Correct the Digital Version Only', description: 'Future records are fixed. You pay the web designer, and printed copies still say it.', tier: 'COMPROMISE',
          impact: impact(2, 0, 0, 0, { coachPointsDelta: -5 }) },
        { id: 'opt_say_nothing', label: 'Say Nothing Unless Asked', description: 'No reprint bill. The false detail spreads.', tier: 'RISKY',
          impact: impact(-2, 0, 0, -4, { coachPointsDelta: 10 }) },
        { id: 'opt_claim', label: 'Tell the Student to Claim He Dressed for Games', description: 'No reprint and a grateful family in the booster club. A false roster claim is a records problem.', tier: 'CORRUPT',
          impact: impact(-8, 2, -2, -12, { coachPointsDelta: 15 }) }
      ]
    })
  },
  {
    id: 'PARENT_ON_FIELD',
    appliesTo: (team, week) => whenPlayer(isGameWeek(week) && week > FIRST_NON_DISTRICT_WEEK, pickStarter(team)),
    build: (_team, _week, player) => ({
      title: 'A Parent Rushes the Field',
      scenario: `After last week's close loss, a parent ran onto the field and confronted ${name(player!)} in front of the crowd. He asks what you're going to do about it.`,
      involvedPlayerId: player!.id,
      choices: [
        { id: 'opt_report_ban', label: 'Report the Incident and Ban the Parent From Games', description: 'Your player is protected. The family pulls its booster dues.', tier: 'GOOD',
          impact: impact(8, -4, 6, 2, { coachPointsDelta: -10 }) },
        { id: 'opt_ground_rules', label: 'Meet the Parent With Security and Set Ground Rules', description: 'Order restored, with a clear line. You pay for extra security at home games.', tier: 'COMPROMISE',
          impact: impact(4, 0, 2, 0, { coachPointsDelta: -10 }) },
        { id: 'opt_let_go', label: 'Let It Go to Avoid a Bigger Scene', description: 'The family stays in the booster club. Your player feels dismissed.', tier: 'RISKY',
          impact: impact(-4, 2, -4, 0, { coachPointsDelta: 10 }) },
        { id: 'opt_apologize', label: 'Tell the Player to Apologize So the Parent Stays Happy', description: "The parent's business sponsors the team. Your player learns adults won't protect him.", tier: 'CORRUPT',
          impact: impact(-10, 6, -10, 0, { coachPointsDelta: 25 }) }
      ]
    })
  }
];
