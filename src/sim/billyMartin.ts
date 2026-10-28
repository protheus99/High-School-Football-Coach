import { DilemmaChoice, DilemmaRecord, DilemmaSeverity, MisconductThread, NarrativeDilemma, Team } from '../types/game';
import { randomInt } from './math/variance';

// ---------------------------------------------------------------------------
// The Billy Martin rule: everyone gets a second and a third chance to fix their errors. They may choose not to,
// but the chance is always offered. A risky or corrupt dilemma call can start a thread of up to three steps: a
// warning, a second warning (the story goes public), then the end. Every warning offers two ways to make it right.
// Ignored to the end, a minor call costs Rating, a serious one Rating and a game, and a major one is a reckoning.
// The coach never sees "strike", "thread" or the severity: only the story, his choices and their costs.
// Billy Martin is somewhere in every warning (a teacher, a booster, a captain's dad, a reporter...).
// ---------------------------------------------------------------------------

type Impact = DilemmaChoice['impact'];
type Tier = DilemmaChoice['tier'];

/** How often a call starts a thread: good and compromise calls never do. */
export const THREAD_START_CHANCE: Record<Tier, number> = { GOOD: 0, COMPROMISE: 0, RISKY: 0.3, CORRUPT: 0.6 };

/** Weeks from the call to the first warning, and between steps. */
export const STEP_WEEKS: Record<DilemmaSeverity, [number, number]> = { MINOR: [6, 18], SERIOUS: [10, 24], MAJOR: [12, 36] };

const LEVELS: DilemmaSeverity[] = ['MINOR', 'SERIOUS', 'MAJOR'];
/** A risky call is as bad as its dilemma; a corrupt one is a level worse (a major one stays major). */
export function threadSeverity(base: DilemmaSeverity, tier: Tier): DilemmaSeverity {
  return tier === 'CORRUPT' ? LEVELS[Math.min(2, LEVELS.indexOf(base) + 1)] : base;
}

export const rollStepWeeks = (severity: DilemmaSeverity) => randomInt(...STEP_WEEKS[severity]);

/** The thread a call starts, if it starts one. */
export function maybeStartThread(record: DilemmaRecord, base: DilemmaSeverity | undefined, playerId?: string): MisconductThread | null {
  if (!base || Math.random() >= THREAD_START_CHANCE[record.tier]) return null;
  const severity = threadSeverity(base, record.tier);
  return {
    id: `bm_${record.templateId.toLowerCase()}_${record.year}_${record.week}`,
    templateId: record.templateId,
    title: record.title,
    ...(record.choiceLabel && { choiceLabel: record.choiceLabel }),
    ...(playerId && { playerId }),
    ...(record.playerName && { playerName: record.playerName }),
    severity,
    year: record.year,
    week: record.week,
    step: 1,
    weeksLeft: rollStepWeeks(severity)
  };
}

/** After the coach answers a step: made right or taken (the thread ends), or let ride (the next step comes later). */
export function afterThreadChoice(thread: MisconductThread, choice: DilemmaChoice): MisconductThread | null {
  if (choice.thread !== 'IGNORE' || thread.step === 3) return null;
  return { ...thread, step: (thread.step + 1) as 2 | 3, weeksLeft: rollStepWeeks(thread.severity) };
}

/** Reckonings add up over a career: the 1st suspends him for the season, the 2nd bans him a year, the 3rd fires him. */
export type Reckoning = NonNullable<Impact['reckoning']>;
export function reckoningFor(previous: number, gamesLeftThisSeason: boolean): Reckoning {
  if (previous >= 2) return 'FIRED';
  if (previous === 1) return 'BAN';
  return gamesLeftThisSeason ? 'SEASON' : 'NEXT_SEASON';
}
/** From the 2nd reckoning on, the career is an invalid playthrough (the 1st is the coach's Billy Martin chance). */
export const reckoningInvalidates = (reckoning: Reckoning) => reckoning === 'BAN' || reckoning === 'FIRED';

/** The coach on the sidelines or not: games he sits (served as his team plays) and whole seasons he misses. */
export interface CoachBench {
  gamesLeft: number;
  seasons: number[];
}
export const NO_BENCH: CoachBench = { gamesLeft: 0, seasons: [] };
export const isCoachBenched = (bench: CoachBench | undefined, year: number) => !!bench && (bench.gamesLeft > 0 || bench.seasons.includes(year));
/** What the coach sees on this week's game while he sits. */
export function benchNote(bench: CoachBench, year: number): string {
  if (bench.seasons.includes(year)) return "You're suspended this season: your coordinator coaches every game, and you run everything else.";
  return bench.gamesLeft === 1 ? "You're suspended for this game: your coordinator coaches it." : `You're suspended for ${bench.gamesLeft} games: your coordinator coaches them.`;
}

// ---------------------------------------------------------------------------
// The stories
// ---------------------------------------------------------------------------

type Family = 'ACADEMIC' | 'MONEY' | 'CONDUCT' | 'SAFETY' | 'GAMES' | 'RECRUITING' | 'COMMUNITY';

/** What the call was about, in plain words ({player}: the player, or "your former star" once he's gone). */
const DEEDS: Record<string, [Family, string]> = {
  GRADE_CRISIS: ['ACADEMIC', 'how {player} stayed eligible with a failing Algebra grade'],
  TEAM_GRADES: ['ACADEMIC', 'the help your players got to stay above the grade line'],
  PLAGIARISM: ['ACADEMIC', "how {player}'s plagiarism case went away"],
  TRUANCY: ['ACADEMIC', 'how {player} kept playing while skipping first period'],
  SAT_CONFLICT: ['ACADEMIC', "the special arrangements around {player}'s SAT date and the road game"],
  ELIGIBILITY_PAPERWORK: ['ACADEMIC', '{player} practicing without a valid physical on file'],
  EMPTY_CLASSROOM: ['ACADEMIC', 'the players pulled out of class for football'],
  BOOSTER_HEADSETS: ['MONEY', 'the booster who paid for the headsets and got his say'],
  FILM_ROOM_GIFT: ['MONEY', "the booster's film room gift that never went through the school"],
  BOOSTER_PLAYCALLING: ['MONEY', "the booster club president's say in your game plan"],
  ENERGY_DRINK_SPONSOR: ['MONEY', 'the energy drink deal you made for the team'],
  SUPPLEMENT_SPONSOR: ['MONEY', 'the supplement shop deal and what ended up in your weight room'],
  BOOSTER_CASH_HANDSHAKE: ['MONEY', 'the cash handshakes your players got after the game'],
  YOUTH_CAMP_FEES: ['MONEY', "the youth camp money that never reached the district's books"],
  PLAYOFF_TICKET_SCALPING: ['MONEY', 'the playoff tickets that went to donors'],
  TRIP_FEE: ['MONEY', 'how the playoff trip got paid for'],
  STAFF_STIPEND: ['MONEY', 'the booster bonuses paid to your assistants'],
  CHARITY_GAME: ['MONEY', 'the awareness night and where its money went'],
  TOWN_WANTS_WINNER: ['MONEY', 'the winning season you promised the sponsors'],
  TRASH_TALK: ['CONDUCT', "how you handled {player}'s trash talk before the rivalry game"],
  PARTY_PHOTOS: ['CONDUCT', '{player} playing after those weekend party photos'],
  HALLWAY_FIGHT: ['CONDUCT', "how {player}'s hallway fight was handled"],
  HAZING_REPORT: ['CONDUCT', 'the hazing report that never got filed'],
  MASCOT_PRANK: ['CONDUCT', 'the rival mascot prank and how it was handled'],
  SHOPLIFTING_ARREST: ['CONDUCT', 'the help {player} got after his shoplifting arrest'],
  SKIPPED_PRACTICE: ['CONDUCT', '{player} skipping practice and playing anyway'],
  LATE_HIT: ['CONDUCT', "how {player}'s late hit was handled"],
  RIVALRY_BANNER: ['CONDUCT', 'the rivalry banner that went too far'],
  WRONGFUL_EJECTION: ['CONDUCT', "how you fought {player}'s ejection"],
  PARENT_ON_FIELD: ['CONDUCT', 'the parent who rushed the field to confront {player}'],
  CONCUSSION_PROTOCOL: ['SAFETY', '{player} going back in after a hit to the head'],
  HEAT_ADVISORY: ['SAFETY', 'the full-pads practice during the heat advisory'],
  PAINKILLERS: ['SAFETY', 'the painkillers in your locker room'],
  STEROID_RUMOR: ['SAFETY', 'how the steroid rumors around {player} were handled'],
  HIDDEN_INJURY: ['SAFETY', '{player} playing through an injury his family never heard about'],
  MENTAL_HEALTH: ['SAFETY', "how {player}'s anxiety was handled"],
  UNSAFE_FIELD: ['SAFETY', 'the practice field that was never inspected'],
  MISSING_EQUIPMENT: ['SAFETY', 'the damaged helmets your team played in'],
  WATER_CRISIS: ['SAFETY', 'the game you played through a boil-water notice'],
  BUS_BREAKDOWN: ['SAFETY', 'the night the team bus broke down'],
  INJURED_RIVAL: ['SAFETY', 'the injured rival player your team left alone'],
  STOLEN_SIGNALS: ['GAMES', "the opponent's lost signal sheet and where it ended up"],
  FILM_EXCHANGE: ['GAMES', "the game film exchange that didn't go by the rules"],
  PRACTICE_DRONE: ['GAMES', "the drone over a rival's practice"],
  REF_CONNECTION: ['GAMES', 'the referee with a family tie to your staff'],
  LEAKED_PLAYBOOK: ['GAMES', 'the fake playbook you leaked to the rival'],
  ANONYMOUS_TIP: ['GAMES', 'the anonymous age tip about a rival player'],
  PLAYOFF_PRACTICE_HOURS: ['GAMES', "the extra practice hours over the state's limit"],
  ASSISTANT_CONTACT: ['RECRUITING', "your assistant's talks with middle school prospects"],
  COORDINATOR_POACHED: ['RECRUITING', 'how you kept your coordinator from the rival school'],
  ASSISTANT_DUI: ['RECRUITING', 'the assistant who kept his duties after a DUI arrest'],
  RECRUITING_TAMPERING: ['RECRUITING', 'your players recruiting middle schoolers for the program'],
  RESIDENCY_TRANSFER: ['RECRUITING', "the transfer whose address doesn't add up"],
  STAR_TRANSFER_REQUEST: ['RECRUITING', 'what was promised to keep {player} from transferring'],
  COLLEGE_COACH_VISIT: ['RECRUITING', 'the college coach you let into practice'],
  FAMILY_HARDSHIP: ['RECRUITING', "the help {player}'s family got while he worked nights"],
  FRESHMAN_PHENOM: ['RECRUITING', "how {player}'s jump up the depth chart came about"],
  HELICOPTER_PARENT: ['COMMUNITY', 'the parent who got his way on playing time'],
  REPORTER_LEAK: ['COMMUNITY', 'how the locker-room leak to the press was handled'],
  QB_CONTROVERSY: ['COMMUNITY', 'how the quarterback job was decided'],
  SENIOR_NIGHT_WALKON: ['COMMUNITY', 'the Senior Night promise to {player}'],
  TEAM_CAPTAIN_VOTE: ['COMMUNITY', "the captain vote that didn't stand"],
  RIVAL_BAND_BUS: ['COMMUNITY', "the night the rival band's bus broke down"],
  NEWSPAPER_CORRECTION: ['COMMUNITY', "how you handled the student paper's story about {player}"],
  STADIUM_RENAMING: ['COMMUNITY', "the team's part in the stadium renaming fight"],
  RIVAL_LOST_DOG: ['COMMUNITY', 'the lost dog before kickoff'],
  SCHOLARSHIP_CEREMONY: ['COMMUNITY', "the team missing {player}'s scholarship ceremony"],
  EMPTY_TROPHY_CASE: ['COMMUNITY', 'what went into the empty trophy case'],
  RIVAL_MEMORIAL: ['COMMUNITY', "how the program answered the rival's memorial"],
  COACH_JOB_OFFER: ['COMMUNITY', 'the college job offer you kept quiet'],
  SISTER_HARASSMENT: ['COMMUNITY', "how the harassment of {player}'s sister was handled"],
  ALUMNUS_ACCUSED: ['COMMUNITY', 'how the accusation against the beloved booster was handled'],
  OLD_INJURY_COACH: ['COMMUNITY', 'the injured former star you brought onto the sideline'],
  PARENT_TRUTH: ['COMMUNITY', "what you told {player}'s family about his college chances"],
  WRONG_JERSEY: ['COMMUNITY', 'how the jersey number was given out'],
  ASSISTANTS_SON: ['COMMUNITY', "the playing time for your assistant's son"],
  SIDELINE_VIDEO: ['COMMUNITY', 'the sideline video of {player} that went viral'],
  MISPRINTED_PROGRAM: ['COMMUNITY', 'the misprint in the game program']
};
/** Older saves can hold calls from dilemmas that have since been retired. */
const GENERIC_DEED: [Family, string] = ['COMMUNITY', 'your call on "{title}"'];

interface Option {
  label: string;
  description: string;
}
interface FamilyText {
  first: { title: string; story: string; fixes: [Option, Option]; ignore: Option };
  second: { title: string; story: string; fix: Option; money: Option; ignore: Option };
  minorEnd: { title: string; story: string; accept: Option };
  seriousEnd: { title: string; story: string };
}

// {deed}: what the call was about. Every first warning ends "He wants to hear your side of it."
const FAMILIES: Record<Family, FamilyText> = {
  ACADEMIC: {
    first: {
      title: 'A Teacher Has Questions',
      story: 'Billy Martin, who has taught math here for thirty years, stopped by your office about {deed}. He hasn\'t gone to the principal yet. He wants to hear your side of it.',
      fixes: [
        { label: 'Open the Grade Book to the Principal', description: "Let the school check your athletes' grades the normal way." },
        { label: 'Pay for Real Tutoring', description: 'Tutors for every player near the line, out of the program budget.' }
      ],
      ignore: { label: 'Thank Him and Move On', description: "He's a math teacher. He isn't going to take on the football program." }
    },
    second: {
      title: 'The Faculty Takes Sides',
      story: 'Billy Martin brought it up at the faculty meeting: {deed}. Now the whole school is talking, and the principal wants answers by Friday.',
      fix: { label: 'Cooperate With a Full Grade Audit', description: "Every athlete's record gets checked, starting with this one." },
      money: { label: 'Fund Tutoring for the Whole School', description: 'Not just football: every student near the line gets help.' },
      ignore: { label: 'Wait for It to Blow Over', description: 'Teachers complain every year. This will pass.' }
    },
    minorEnd: {
      title: "The Principal's Letter",
      story: 'Billy Martin got his answer: the principal put a letter about {deed} in your file and read it to the school board.',
      accept: { label: 'Accept the Letter', description: 'The board and your players will remember it.' }
    },
    seriousEnd: { title: 'The Grade Audit Comes Back', story: 'The audit Billy Martin asked for is back: {deed} broke school rules. The principal suspends you for a game.' }
  },
  MONEY: {
    first: {
      title: "The Treasurer's Ledger",
      story: "Billy Martin, the booster club's treasurer, can't make the books balance and keeps coming back to {deed}. He hasn't told the board. He wants to hear your side of it.",
      fixes: [
        { label: 'Hand Everything to the Athletic Director', description: 'Every receipt, before anyone else asks.' },
        { label: 'Pay It Back Out of the Program Budget', description: 'Square the books quietly and correctly.' }
      ],
      ignore: { label: 'Tell Him It All Adds Up', description: "He's a volunteer with a calculator. It's his word against yours." }
    },
    second: {
      title: 'The Booster Meeting Gets Loud',
      story: 'Billy Martin read his ledger out loud at the booster meeting, and {deed} is now the talk of the town. The school board wants the records.',
      fix: { label: 'Open the Books to the School Board', description: 'Every account, every donor, every check.' },
      money: { label: 'Return the Money With Interest', description: 'Pay back every dollar and then some.' },
      ignore: { label: 'Let the Boosters Sort It Out', description: 'Booster clubs fight about money every year.' }
    },
    minorEnd: {
      title: 'The Boosters Vote',
      story: 'Billy Martin got his vote: the booster club formally censured the football office over {deed}.',
      accept: { label: 'Take the Censure', description: 'The board hears about it, and so does the locker room.' }
    },
    seriousEnd: { title: 'The Audit Is In', story: 'The school board\'s audit backs up Billy Martin\'s ledger on {deed}. The superintendent suspends you for a game.' }
  },
  CONDUCT: {
    first: {
      title: 'A Word After the Booster Lunch',
      story: "Billy Martin, your senior captain's dad, stopped you after the booster lunch: the players are still talking about {deed}. He wants to hear your side of it.",
      fixes: [
        { label: 'Hold a Team Meeting on Accountability', description: 'Same rules for everyone, starting now.' },
        { label: 'Bring in a Character Coach', description: 'A paid program on discipline for the whole team.' }
      ],
      ignore: { label: 'Let It Ride', description: "They'll forget about it once we keep winning." }
    },
    second: {
      title: 'The Parents Group Chat',
      story: 'Billy Martin took it to the parents group chat: {deed}. The screenshots are all over town, and the athletic director wants a meeting.',
      fix: { label: 'Apologize to the Team and the Parents', description: 'In person, and on the record.' },
      money: { label: 'Pay for a Season-Long Mentor Program', description: 'Every player gets a mentor, and every parent hears about it.' },
      ignore: { label: 'Say Nothing', description: "It's a group chat. It'll be something else next week." }
    },
    minorEnd: {
      title: 'The Locker Room Remembers',
      story: 'Billy Martin stopped coming to games, and the players noticed why: {deed}. The athletic director wrote it up.',
      accept: { label: 'Accept the Write-Up', description: 'The board and the locker room both took note.' }
    },
    seriousEnd: { title: "The Athletic Director's Decision", story: 'After Billy Martin\'s complaint about {deed}, the athletic director suspends you for a game.' }
  },
  SAFETY: {
    first: {
      title: "The Team Doctor's Concern",
      story: "Billy Martin, the doctor who volunteers on your sideline, can't stop thinking about {deed}. He hasn't filed a report. He wants to hear your side of it.",
      fixes: [
        { label: 'Report It to the District Yourself', description: 'Put it on the record before anyone else does.' },
        { label: 'Pay for a Safety Review', description: 'An outside expert checks every protocol you run.' }
      ],
      ignore: { label: 'Reassure Him and Move On', description: 'Nobody got hurt. Why make it a thing?' }
    },
    second: {
      title: 'The Report Is Filed',
      story: 'Billy Martin filed his report on {deed}, and the district nurse has called a meeting with parents.',
      fix: { label: 'Cooperate With the District Review', description: 'Every practice log, every trainer note.' },
      money: { label: 'Buy New Safety Equipment and Training', description: 'The whole staff gets certified again.' },
      ignore: { label: 'Stand by Your Staff', description: "Doctors worry. That's their job." }
    },
    minorEnd: {
      title: 'A Note in Your File',
      story: "Billy Martin's report on {deed} went to the school board, and it went in your file.",
      accept: { label: 'Accept the Note', description: 'The board and the parents will remember.' }
    },
    seriousEnd: { title: "The District's Safety Ruling", story: "The district backs Billy Martin's report on {deed}. You're suspended for a game." }
  },
  GAMES: {
    first: {
      title: 'A Rules Question',
      story: "Billy Martin, the officials' association's rules chairman, called about {deed}. He hasn't sent anything to the league. He wants to hear your side of it.",
      fixes: [
        { label: 'Tell the League Yourself', description: 'Own it before the rules committee meets.' },
        { label: 'Pay the Fine Up Front', description: 'Offer the league its penalty before it has to ask.' }
      ],
      ignore: { label: 'Play Dumb', description: "Everybody bends the rules a little. He can't prove a thing." }
    },
    second: {
      title: 'The Rules Committee Meets',
      story: 'Billy Martin took it to the rules committee: {deed}. The rival schools are lining up to testify.',
      fix: { label: 'Apologize to the League', description: 'A public apology and a promise it won\'t happen again.' },
      money: { label: 'Pay the Rival School Back', description: 'Make the other program whole, with interest.' },
      ignore: { label: 'Fight It', description: 'Let them prove it.' }
    },
    minorEnd: {
      title: "The League's Reprimand",
      story: "Billy Martin's committee issued a public reprimand over {deed}. Every coach in the league read it.",
      accept: { label: 'Accept the Reprimand', description: 'The board and your players heard about it too.' }
    },
    seriousEnd: { title: "The Committee's Ruling", story: "The rules committee sides with Billy Martin on {deed}. You're suspended for a game." }
  },
  RECRUITING: {
    first: {
      title: "The Compliance Officer's Call",
      story: "Billy Martin, the state association's compliance officer, called about {deed}. It isn't a case yet. He wants to hear your side of it.",
      fixes: [
        { label: 'Self-Report to the State', description: 'Tell him everything before it becomes a case.' },
        { label: 'Send the Staff to Compliance Training', description: 'A paid course for every coach on the staff.' }
      ],
      ignore: { label: 'Tell Him There Is Nothing to Report', description: "It's his word against yours. Let's hope he doesn't run with it." }
    },
    second: {
      title: 'An Official Inquiry',
      story: "Billy Martin opened an official inquiry into {deed}. The letter is on your athletic director's desk.",
      fix: { label: 'Cooperate Fully With the State', description: 'Hand over every text and email.' },
      money: { label: 'Hire an Outside Compliance Firm', description: 'Experts review every recruiting contact you made.' },
      ignore: { label: 'Deny Everything', description: "They don't have enough to make it stick." }
    },
    minorEnd: {
      title: 'A Letter From the State',
      story: 'Billy Martin closed his inquiry into {deed} with a formal warning letter, copied to your school board.',
      accept: { label: 'Accept the Warning', description: 'The board and your players heard about it.' }
    },
    seriousEnd: { title: "The State's Finding", story: "Billy Martin's inquiry found {deed} broke the rules. The state association suspends you for a game." }
  },
  COMMUNITY: {
    first: {
      title: 'A Call From the Town Journal',
      story: 'Billy Martin, a reporter from the Town Journal, called the athletic office asking about {deed}. He hasn\'t written anything yet. He wants to hear your side of it.',
      fixes: [
        { label: 'Come Clean to the AD', description: 'Tell him what really happened before the paper does.' },
        { label: 'Make It Right With the Family', description: 'A real apology, and the program pays to fix it.' }
      ],
      ignore: { label: 'Say Nothing', description: "He isn't really going to write about something that small." }
    },
    second: {
      title: 'The Story Runs',
      story: "Billy Martin's story about {deed} is on the front page of the Town Journal. The school board wants to talk to you.",
      fix: { label: 'Own It on the Record', description: "An on-the-record apology in Friday's paper." },
      money: { label: 'Host a Community Night', description: 'Free tickets and food for the town, paid by the program.' },
      ignore: { label: 'No Comment', description: "It's his word against yours. Let's hope it's old news by Friday." }
    },
    minorEnd: {
      title: 'The Follow-Up Story',
      story: "Billy Martin's follow-up on {deed} ran on Sunday. The school board read it, and so did your players.",
      accept: { label: 'Read It and Move On', description: 'The board and the locker room both took note.' }
    },
    seriousEnd: { title: "The Board's Response", story: "After Billy Martin's series on {deed}, the school board suspends you for a game." }
  }
};

/** A Rating drop as background meters: compliance, board trust and boosters (or board trust and morale). */
function ratingCost(points: number, morale = false): Pick<Impact, 'schoolBoardTrustDelta' | 'boosterApprovalDelta' | 'lockerRoomDisciplineDelta' | 'complianceScoreDelta'> {
  const total = points * 4; // Rating is the average of the four meters
  if (morale) {
    const board = Math.ceil(total / 2);
    return { schoolBoardTrustDelta: -board, boosterApprovalDelta: 0, lockerRoomDisciplineDelta: -(total - board), complianceScoreDelta: 0 };
  }
  // Compliance stays above -10, so the warnings never read as a new investigation risk
  const compliance = Math.min(9, Math.round(total * 0.35));
  const board = Math.round((total - compliance) * 0.6);
  return { schoolBoardTrustDelta: -board, boosterApprovalDelta: -(total - compliance - board), lockerRoomDisciplineDelta: 0, complianceScoreDelta: -compliance };
}

/** What each step costs, by severity: Rating points, Coach Points, games the coach sits. */
const COSTS: Record<DilemmaSeverity, { first: [number, number, number]; second: [number, number]; secondOut: number; secondOutRating: number; end: number }> = {
  // first: [fix A Rating, fix B Rating, fix B ₡]; second: [fix Rating, money Rating] (+ ₡ below); end: Rating
  MINOR: { first: [2, 0, 50], second: [4, 1], secondOut: 0, secondOutRating: 0, end: 4 },
  SERIOUS: { first: [3, 1, 120], second: [5, 2], secondOut: 1, secondOutRating: 2, end: 6 },
  MAJOR: { first: [4, 2, 250], second: [7, 3], secondOut: 1, secondOutRating: 3, end: 7 }
};
const SECOND_MONEY: Record<DilemmaSeverity, number> = { MINOR: 120, SERIOUS: 300, MAJOR: 500 };

const option = (id: string, o: Option, thread: DilemmaChoice['thread'], tier: Tier, impact: Impact): DilemmaChoice => ({ id, label: o.label, description: o.description, tier, impact, thread });
const nothing: Impact = { schoolBoardTrustDelta: 0, boosterApprovalDelta: 0, lockerRoomDisciplineDelta: 0, complianceScoreDelta: 0 };

const RECKONINGS: Record<Reckoning, { title: string; story: string; accept: Option; losses: string[] }> = {
  SEASON: {
    title: "The District's Findings",
    story: "The district's findings are in, and Billy Martin was right about {deed}: you were warned twice and let it ride. You're suspended for the rest of the season, playoffs included.",
    accept: { label: 'Accept the Suspension', description: 'Your coordinator coaches every game left this season. You still run practice, recruiting and the program.' },
    losses: ['Suspended: rest of the season']
  },
  NEXT_SEASON: {
    title: "The District's Findings",
    story: "The district's findings are in, and Billy Martin was right about {deed}: you were warned twice and let it ride. You're suspended for all of next season's games.",
    accept: { label: 'Accept the Suspension', description: 'Your coordinator coaches every game next season. You still run practice, recruiting and the program.' },
    losses: ['Suspended: next season']
  },
  BAN: {
    title: 'Banned for a Year',
    story: "It happened again. Billy Martin's complaint about {deed} went all the way to the state association, and with your record it has banned you from coaching for a full year.",
    accept: { label: 'Accept the Ban', description: "You miss next season's games: your coordinator coaches them. You're back for the one after." },
    losses: ['Banned: 1 year', '☠️ Invalid playthrough']
  },
  FIRED: {
    title: 'Fired',
    story: 'A third scandal. Billy Martin was in the room when the school board voted on {deed}. Your contract is terminated, effective today.',
    accept: { label: 'Clean Out Your Office', description: 'Your career at this school is over.' },
    losses: ['Fired', '☠️ Invalid playthrough']
  }
};

/** What a thread is about, in plain words, for the stories. */
export function threadDeed(thread: MisconductThread, team: Team): string {
  const [, deed] = DEEDS[thread.templateId] ?? GENERIC_DEED;
  const player = thread.playerId ? team.roster.find((p) => p.id === thread.playerId) : undefined;
  const who = player ? `${player.position} ${player.firstName} ${player.lastName}` : thread.playerId ? 'your former star' : thread.playerName ? 'your former star' : 'one of your players';
  return deed.split('{player}').join(who).split('{title}').join(thread.title);
}

const fill = (s: string, deed: string) => s.split('{deed}').join(deed);

/**
 * The card for a thread's next step, shown exactly like the Hub's dilemma card. `reckonings` is how many the coach
 * has had in his career so far; `gamesLeft` whether his team still has games this season.
 */
export function buildThreadStep(thread: MisconductThread, team: Team, reckonings: number, gamesLeft: boolean): NarrativeDilemma {
  const [family] = DEEDS[thread.templateId] ?? GENERIC_DEED;
  const text = FAMILIES[family];
  const deed = threadDeed(thread, team);
  const cost = COSTS[thread.severity];
  const base = { id: `${thread.id}_${thread.step}`, templateId: `BM_${thread.templateId}`, weekTriggered: 0, threadId: thread.id, threadStep: thread.step };
  if (thread.step === 1) {
    const [a, b] = text.first.fixes;
    return {
      ...base,
      title: text.first.title,
      scenario: fill(text.first.story, deed),
      choices: [
        option('bm_fix', a, 'RESOLVE', 'GOOD', { ...nothing, ...ratingCost(cost.first[0]) }),
        option('bm_pay', b, 'RESOLVE', 'COMPROMISE', { ...nothing, ...ratingCost(cost.first[1]), coachPointsDelta: -cost.first[2] }),
        option('bm_ignore', text.first.ignore, 'IGNORE', 'RISKY', nothing)
      ]
    };
  }
  if (thread.step === 2) {
    // The bigger way out: a game on the bench for serious and major calls, money for minor ones
    const second =
      cost.secondOut > 0
        ? option('bm_sit', { label: 'Suspend Yourself for a Game', description: 'Your coordinator runs the team next Friday.' }, 'RESOLVE', 'COMPROMISE', {
            ...nothing,
            ...ratingCost(cost.secondOutRating),
            coachGamesOut: cost.secondOut
          })
        : option('bm_pay', text.second.money, 'RESOLVE', 'COMPROMISE', { ...nothing, ...ratingCost(cost.second[1]), coachPointsDelta: -SECOND_MONEY[thread.severity] });
    return {
      ...base,
      title: text.second.title,
      scenario: fill(text.second.story, deed),
      choices: [option('bm_fix', text.second.fix, 'RESOLVE', 'GOOD', { ...nothing, ...ratingCost(cost.second[0]) }), second, option('bm_ignore', text.second.ignore, 'IGNORE', 'RISKY', nothing)]
    };
  }
  // The end: minor and serious calls cost Rating (and a game); a major one is a reckoning
  if (thread.severity === 'MINOR') {
    return {
      ...base,
      title: text.minorEnd.title,
      scenario: fill(text.minorEnd.story, deed),
      choices: [option('bm_accept', text.minorEnd.accept, 'ACCEPT', 'RISKY', { ...nothing, ...ratingCost(cost.end, true) })]
    };
  }
  if (thread.severity === 'SERIOUS') {
    return {
      ...base,
      title: text.seriousEnd.title,
      scenario: fill(text.seriousEnd.story, deed),
      choices: [
        option('bm_accept', { label: 'Accept the Suspension', description: 'Your coordinator coaches the next game. You still run everything else.' }, 'ACCEPT', 'RISKY', {
          ...nothing,
          ...ratingCost(cost.end),
          coachGamesOut: 1
        })
      ]
    };
  }
  const reckoning = reckoningFor(reckonings, gamesLeft);
  const r = RECKONINGS[reckoning];
  return {
    ...base,
    title: r.title,
    scenario: fill(r.story, deed),
    choices: [option('bm_accept', r.accept, 'ACCEPT', 'CORRUPT', { ...nothing, ...ratingCost(cost.end), reckoning, plainLosses: r.losses })]
  };
}

/** Every warning's text, for tests: the words the coach must never see. */
export const HIDDEN_WORDS = /\b(strike|thread|1-2-3|minor|serious|major|severity)\b/i;
