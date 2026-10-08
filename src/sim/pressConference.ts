import { DilemmaChoice, GameSimulationState, Player, ScheduledGame, Team } from '../types/game';
import { lineScore } from './lineScore';
import { PlayoffBracketState, findUserNode } from './playoffEngine';
import { FIRST_DISTRICT_WEEK, LAST_REGULAR_SEASON_WEEK } from './scheduleEngine';
import { NewsArticle } from './newsEngine';

/**
 * The post-game press conference: one question a game, picked to fit what just happened (a comeback, a 4th-down call,
 * a losing streak...), with three answers. Each answer has a visible gain and loss, shown like a dilemma choice:
 * team-first answers lift the Rating and cost a little buzz (₡), bold ones bring booster buzz (₡) but can fire up the
 * next opponent or the board, a spotlight lifts a player's college exposure, excuses cost the most.
 *
 * Variety over a 3-5 season career without a huge list: every topic has a few phrasings from different outlets, the
 * game's own facts (names, stat lines, the score, the down and distance) fill them in, and the pick rotates: a topic
 * waits 4 weeks, comes up at most twice a season, never repeats its last phrasing, and topics asked least often in
 * the career are favored.
 */

export type PressOutlet = NewsArticle['outlet'];
export const OUTLET_NAMES: Record<PressOutlet, string> = {
  TOWN_JOURNAL: 'Town Journal',
  STUDENT_VOICE: 'The Student Voice',
  STATE_SPORTS_CENTRAL: 'State Sports Central',
  PREP_GRIDIRON_TALK: 'Prep Gridiron Talk'
};

/** What the press knows about the game that just ended. */
export interface PressContext {
  teamName: string;
  opponentName: string;
  won: boolean;
  margin: number;
  score: string; // "35-34", the coach's team first
  playoff: boolean;
  week: number;
  fourthDown?: { converted: boolean; spot: string }; // your last 4th-down attempt this game ("4th and 2 at your own 38")
  halftimeSwing?: { kind: 'COMEBACK' | 'COLLAPSE'; halftime: string }; // trailed at the half and won, or led and lost
  blewTenPointLead: boolean; // led by 10+ in the second half and lost
  lossStreak: number; // consecutive losses, this game included
  backupQb?: { backup: Player; starter: Player }; // the starter was out and the backup played
  youngStarters: Player[]; // freshman and sophomore starters
  finalGame: boolean; // the last game of the season
  gameBall?: Player; // the Player of the Game the coach picked
  gameBallLine?: string; // his line tonight ("27 car, 183 yds, 2 TD")
  prospect?: Player; // a junior or senior 4★+ starter who starred
  changedPlanAtHalftime: boolean;
}

export interface PressQuestion {
  id: string; // the topic
  phrasing: number; // which wording (never the same twice in a row)
  outlet: PressOutlet;
  question: string;
  reason: string; // why the press is asking (shown small under the question)
  answers: DilemmaChoice[];
}

export interface PressRecord {
  questionId: string;
  year: number;
  week: number;
  phrasing?: number;
}

type Impact = DilemmaChoice['impact'];
const impact = (board: number, booster: number, discipline: number, compliance: number, extra: Partial<Impact> = {}): Impact => ({
  schoolBoardTrustDelta: board,
  boosterApprovalDelta: booster,
  lockerRoomDisciplineDelta: discipline,
  complianceScoreDelta: compliance,
  ...extra
});
// Rating moves: one arrow up or down, two down for the worst answers (smaller than dilemmas: words, not deeds)
const UP = [4, 2, 2, 0] as const;
const DOWN = [-4, -2, -2, 0] as const;
const DOWN_BIG = [-6, -2, -6, 0] as const;
const EVEN = [0, 0, 0, 0] as const;
const answer = (id: string, label: string, rating: readonly [number, number, number, number], extra: Partial<Impact> = {}, tier: DilemmaChoice['tier'] = 'GOOD'): DilemmaChoice => ({
  id,
  label,
  description: '',
  tier,
  impact: impact(rating[0], rating[1], rating[2], rating[3], extra)
});
const name = (p: Player) => `${p.firstName[0]}. ${p.lastName}`;

/** Skipping the press: "No comment" costs the Rating and the booster buzz, with nothing in return. */
export const NO_COMMENT: DilemmaChoice = answer('no_comment', 'No comment', [-4, -4, 0, 0], { coachPointsDelta: -10 }, 'RISKY');

type Phrasing = [PressOutlet, string];

interface QuestionTemplate {
  id: string;
  weight: number; // how much the topic stands out when it fits (rarer, more specific stories weigh more)
  when: (c: PressContext) => boolean;
  phrasings: (c: PressContext) => Phrasing[];
  reason: (c: PressContext) => string;
  answers: (c: PressContext) => DilemmaChoice[];
}

export const PRESS_QUESTIONS: QuestionTemplate[] = [
  {
    id: 'BLOWN_LEAD',
    weight: 8,
    when: (c) => c.blewTenPointLead,
    phrasings: (c) => [
      ['TOWN_JOURNAL', "What's the message to the team after giving up a double-digit lead?"],
      ['STATE_SPORTS_CENTRAL', `You led by double digits in the second half and lost ${c.score}. What happened?`],
      ['STUDENT_VOICE', 'How do the players come back from a second half like that?']
    ],
    reason: () => 'You led by 10 or more in the second half and lost.',
    answers: () => [
      answer('on_me', '"We got too conservative. That\'s on me."', UP, { coachPointsDelta: -10 }),
      answer('together', '"We\'ll learn from this together."', UP, { fridayEdgeDelta: -1 }),
      answer('quit', '"Some guys stopped playing in the fourth quarter."', DOWN_BIG, { fridayEdgeDelta: 1 }, 'RISKY')
    ]
  },
  {
    id: 'SENIORS',
    weight: 10,
    when: (c) => c.finalGame,
    phrasings: (c) => [
      ['TOWN_JOURNAL', 'What are you most proud of about this group of seniors?'],
      ['STUDENT_VOICE', `What will ${c.teamName} remember about this senior class?`],
      ['STATE_SPORTS_CENTRAL', 'How do you sum up the legacy of these seniors?']
    ],
    reason: () => 'The last game of the season.',
    answers: () => [
      answer('standard', '"They set the standard for every class after them."', UP, { coachPointsDelta: -5 }),
      answer('town', '"They brought this town together on Friday nights."', DOWN, { coachPointsDelta: 15 }, 'COMPROMISE'),
      answer('better', '"They left this program better than they found it."', UP, { coachPointsDelta: -10 })
    ]
  },
  {
    id: 'FOURTH_DOWN',
    weight: 6,
    when: (c) => !!c.fourthDown,
    phrasings: (c) => [
      ['TOWN_JOURNAL', `You went for it on ${c.fourthDown!.spot} and ${c.fourthDown!.converted ? 'got it' : "came up short"}. What went into that call?`],
      ['STATE_SPORTS_CENTRAL', `Walk us through the decision to go for it on ${c.fourthDown!.spot}.`],
      ['PREP_GRIDIRON_TALK', `Gutsy call on ${c.fourthDown!.spot}. Would you make it again?`]
    ],
    reason: () => 'You went for it on 4th down.',
    answers: (c) => [
      answer('trust', c.fourthDown!.converted ? '"I trust my guys in those spots."' : '"That one\'s on me."', UP, { coachPointsDelta: -5 }),
      answer('numbers', '"The numbers said go. We play the percentages."', DOWN, { coachPointsDelta: 10 }, 'COMPROMISE'),
      answer('again', '"I\'d make the same call again, every week."', DOWN, { fridayEdgeDelta: 1 }, 'RISKY')
    ]
  },
  {
    id: 'HALFTIME',
    weight: 6,
    when: (c) => !!c.halftimeSwing,
    phrasings: (c) => [
      ['TOWN_JOURNAL', 'What did you tell the team at halftime?'],
      ['STATE_SPORTS_CENTRAL', `It was ${c.halftimeSwing!.halftime} at the half. What changed?`],
      ['STUDENT_VOICE', c.halftimeSwing!.kind === 'COMEBACK' ? 'What turned this game around after halftime?' : 'Where did the second half get away from you?']
    ],
    reason: (c) => (c.halftimeSwing!.kind === 'COMEBACK' ? 'You trailed at the half and won.' : 'You led at the half and lost.'),
    answers: (c) => [
      answer('trust', '"I told them to trust each other."', UP, { coachPointsDelta: -5 }),
      answer('plan', c.changedPlanAtHalftime ? '"We changed the game plan, and it showed."' : '"We stuck to our plan."', DOWN, { coachPointsDelta: 10 }, 'COMPROMISE'),
      answer('private', '"That stays in the locker room."', UP, { coachPointsDelta: -10 }, 'COMPROMISE')
    ]
  },
  {
    id: 'LOSING_STREAK',
    weight: 5,
    when: (c) => !c.won && c.lossStreak >= 3,
    phrasings: (c) => [
      ['TOWN_JOURNAL', `That's ${c.lossStreak} losses in a row. How do you keep the locker room positive?`],
      ['STATE_SPORTS_CENTRAL', `${c.lossStreak} straight losses. Is the season slipping away?`],
      ['STUDENT_VOICE', 'What do you say to the students who keep showing up during this streak?']
    ],
    reason: () => 'A losing streak.',
    answers: () => [
      answer('process', '"Our process hasn\'t changed. Results will follow."', UP, { coachPointsDelta: -10 }),
      answer('open', '"Every position is open this week."', DOWN, { fridayEdgeDelta: 1 }, 'COMPROMISE'),
      answer('schedule', '"Nobody has played a tougher schedule."', DOWN, { coachPointsDelta: 5 }, 'RISKY')
    ]
  },
  {
    id: 'BACKUP_QB',
    weight: 5,
    when: (c) => !!c.backupQb,
    phrasings: (c) => [
      ['TOWN_JOURNAL', `How has the team rallied around ${name(c.backupQb!.backup)} with ${name(c.backupQb!.starter)} out?`],
      ['STATE_SPORTS_CENTRAL', `Is ${name(c.backupQb!.backup)} your quarterback until ${name(c.backupQb!.starter)} is back?`]
    ],
    reason: () => 'Your starting quarterback was out.',
    answers: (c) => [
      answer('trust', `"${name(c.backupQb!.backup)} has our full trust. Next man up."`, EVEN, { fridayEdgeDelta: 1, coachPointsDelta: -5 }),
      answer('options', '"We\'ll look at every option at quarterback."', EVEN, { coachPointsDelta: 10, fridayEdgeDelta: -1 }, 'COMPROMISE'),
      answer('depends', `"Our season depends on ${name(c.backupQb!.starter)}'s recovery."`, DOWN, { coachPointsDelta: 5 }, 'RISKY')
    ]
  },
  {
    id: 'TURNING_POINT',
    weight: 3,
    when: (c) => c.margin <= 8,
    phrasings: (c) => [
      ['TOWN_JOURNAL', 'What was the turning point tonight?'],
      ['STATE_SPORTS_CENTRAL', `A ${c.score} ${c.won ? 'win' : 'loss'}. Which play decided it?`],
      ['PREP_GRIDIRON_TALK', `Close one tonight. Where did it swing ${c.won ? 'your way' : 'away from you'}?`]
    ],
    reason: () => 'A one-score game.',
    answers: (c) => [
      answer('kids', '"Our kids made the plays when it mattered."', UP, { coachPointsDelta: -5 }),
      answer('staff', '"The adjustment our staff made in the second half."', DOWN, { coachPointsDelta: 10 }, 'COMPROMISE'),
      c.won
        ? answer('better', '"We were the better team all night."', EVEN, { coachPointsDelta: 10, fridayEdgeDelta: -1 }, 'RISKY')
        : // Criticizing officials draws a state association review (⚠)
          answer('officials', '"That call by the officials."', [-2, 2, 0, -10], { coachPointsDelta: 10 }, 'RISKY')
    ]
  },
  {
    id: 'COLLEGE',
    weight: 3,
    when: (c) => !!c.prospect,
    phrasings: (c) => [
      ['STATE_SPORTS_CENTRAL', `How are you helping ${name(c.prospect!)} get to the next level?`],
      ['PREP_GRIDIRON_TALK', `College coaches are calling about ${name(c.prospect!)}. Where does he fit?`],
      ['TOWN_JOURNAL', `Is ${name(c.prospect!)} the best player you've coached here?`]
    ],
    reason: () => 'A college prospect starred.',
    answers: (c) => [
      answer('film', `"${name(c.prospect!)} has Division I talent. We'll send his film everywhere."`, EVEN, { exposurePlayerIds: [c.prospect!.id], coachPointsDelta: -10 }),
      answer('winners', '"We win games. College coaches find winners."', UP, { coachPointsDelta: -5 }, 'COMPROMISE'),
      answer('guaranteed', '"He\'ll sign with a Power 4 school. Guaranteed."', DOWN, { exposurePlayerIds: [c.prospect!.id] }, 'RISKY')
    ]
  },
  {
    id: 'YOUNG_STARTERS',
    weight: 2,
    when: (c) => c.youngStarters.length >= 2 && c.week >= FIRST_DISTRICT_WEEK,
    phrasings: (c) => [
      ['TOWN_JOURNAL', 'Can you talk about the progress of your young starters?'],
      ['STUDENT_VOICE', `You start ${c.youngStarters.length} freshmen and sophomores. Are they ready for this?`],
      ['STATE_SPORTS_CENTRAL', `${name(c.youngStarters[0])} is starting as an underclassman. What have you seen from him?`]
    ],
    reason: (c) => `You start ${c.youngStarters.length} freshmen and sophomores.`,
    answers: (c) => [
      answer('ahead', '"They\'re ahead of schedule."', DOWN, { skillBoostPlayerIds: c.youngStarters.map((p) => p.id) }),
      answer('lessons', '"They\'re learning hard lessons every Friday."', UP, { coachPointsDelta: -5 }, 'COMPROMISE'),
      answer('best_class', '"They\'ll be the best class this school has seen."', DOWN, { coachPointsDelta: 15 }, 'RISKY')
    ]
  },
  {
    id: 'STEPPED_UP',
    weight: 2,
    when: (c) => c.won && !!c.gameBall,
    phrasings: (c) => [
      ['TOWN_JOURNAL', 'Which players stepped up in the key moments?'],
      ['STATE_SPORTS_CENTRAL', `${name(c.gameBall!)} finished with ${c.gameBallLine}. Who else stood out?`],
      ['STUDENT_VOICE', `Who deserves the credit for tonight's ${c.score} win?`]
    ],
    reason: () => 'After a win.',
    answers: (c) => [
      answer('spotlight', `"${name(c.gameBall!)} was special tonight."`, DOWN, { exposurePlayerIds: [c.gameBall!.id] }),
      answer('line', '"Give the credit to our offensive line."', UP, { coachPointsDelta: -5 }, 'COMPROMISE'),
      answer('nobody', '"Nobody yet. We have a long way to go."', DOWN, { fridayEdgeDelta: 1 }, 'RISKY')
    ]
  },
  {
    id: 'WIN_MEANS',
    weight: 1,
    when: (c) => c.won,
    phrasings: (c) => [
      ['TOWN_JOURNAL', `What does this win mean for ${c.teamName} and the community?`],
      ['STUDENT_VOICE', 'The student section was loud tonight. What does that support mean to the team?'],
      ['PREP_GRIDIRON_TALK', `Beating ${c.opponentName} ${c.score}. Statement win?`]
    ],
    reason: () => 'After a win.',
    answers: () => [
      answer('community', '"It belongs to this community."', UP, { coachPointsDelta: -5 }),
      answer('more', '"Expect a lot more of these."', EVEN, { coachPointsDelta: 10, fridayEdgeDelta: -1 }, 'COMPROMISE'),
      answer('nothing', '"One win doesn\'t change anything."', DOWN, { fridayEdgeDelta: 1 }, 'RISKY')
    ]
  },
  {
    id: 'BOUNCE_BACK',
    weight: 1,
    when: (c) => !c.won,
    phrasings: (c) => [
      ['TOWN_JOURNAL', 'How do you bounce back from this loss?'],
      ['STATE_SPORTS_CENTRAL', `A ${c.score} loss to ${c.opponentName}. What do you fix first?`],
      ['STUDENT_VOICE', 'What do you tell the team on the bus ride home?']
    ],
    reason: () => 'After a loss.',
    answers: () => [
      answer('film', '"We\'ll watch the film and fix it."', UP, { coachPointsDelta: -5 }),
      answer('tougher', '"Practice will be a lot tougher this week."', DOWN, { fridayEdgeDelta: 1 }, 'COMPROMISE'),
      answer('missing', '"We were missing key players tonight."', DOWN, { coachPointsDelta: 5 }, 'RISKY')
    ]
  }
];

/** A topic waits this many weeks before it can come up again, and comes up at most this often in a season. */
export const PRESS_COOLDOWN_WEEKS = 4;
export const PRESS_MAX_PER_SEASON = 2;

/**
 * The question for this game. Topics that fit, aren't on cooldown and haven't hit the season cap are drawn at random:
 * the more specific the story, the likelier, and topics asked least in the career are favored. The phrasing skips
 * whichever wording this topic used last time.
 */
export function pickPressQuestion(context: PressContext, history: PressRecord[], year: number, random: () => number = Math.random): PressQuestion | null {
  const eligible = PRESS_QUESTIONS.filter((q) => {
    if (!q.when(context)) return false;
    const asked = history.filter((r) => r.questionId === q.id);
    const thisSeason = asked.filter((r) => r.year === year);
    if (thisSeason.length >= PRESS_MAX_PER_SEASON) return false;
    return !thisSeason.some((r) => context.week - r.week < PRESS_COOLDOWN_WEEKS);
  });
  if (eligible.length === 0) return null;
  const weights = eligible.map((q) => q.weight / (1 + history.filter((r) => r.questionId === q.id).length));
  let roll = random() * weights.reduce((s, w) => s + w, 0);
  const template = eligible.find((_, i) => (roll -= weights[i]) <= 0) ?? eligible[eligible.length - 1];

  const phrasings = template.phrasings(context);
  const last = [...history].reverse().find((r) => r.questionId === template.id)?.phrasing;
  const options = phrasings.map((_, i) => i).filter((i) => i !== last || phrasings.length === 1);
  const phrasing = options[Math.floor(random() * options.length)];
  const [outlet, question] = phrasings[phrasing];
  return { id: template.id, phrasing, outlet, question, reason: template.reason(context), answers: template.answers(context) };
}

const spotLabel = (snapDistance: number | undefined, snapYardLine: number | undefined): string => {
  const toGo = snapYardLine !== undefined && snapDistance !== undefined && snapYardLine + snapDistance >= 100 ? 'goal' : `${snapDistance ?? '?'}`;
  if (snapYardLine === undefined) return `4th and ${toGo}`;
  const where = snapYardLine === 50 ? 'midfield' : snapYardLine < 50 ? `your own ${snapYardLine}` : `their ${100 - snapYardLine}`;
  return `4th and ${toGo} at ${where}`;
};

/** Reads the finished game for the press: the score story, the 4th-down calls, the halftime swing, streaks and the roster. */
export function buildPressContext(args: {
  game: GameSimulationState;
  team: Team; // the coach's team in the store (its roster as it stands)
  userTeamId: string;
  schedule: ScheduledGame[];
  week: number;
  bracket: PlayoffBracketState | null;
  gameBall?: Player;
  gameBallLine?: string;
  changedPlanAtHalftime: boolean;
}): PressContext {
  const { game, team, userTeamId, schedule, week, bracket, gameBall, gameBallLine, changedPlanAtHalftime } = args;
  const home = game.homeTeam.id === userTeamId;
  const ours = home ? game.homeScore : game.awayScore;
  const theirs = home ? game.awayScore : game.homeScore;
  const won = ours > theirs;
  const playoff = game.gameId.startsWith('po_');

  // The coach's last 4th-down attempt (not a punt or field goal)
  const attempts = game.eventLog.filter((e) => e.snapTeamId === userTeamId && e.snapDown === 4 && !e.isTry && e.playConcept !== 'PUNT' && e.playConcept !== 'FIELD_GOAL');
  const last = attempts[attempts.length - 1];
  const fourthDown = last
    ? { converted: last.turnoverType !== 'DOWNS' && !last.isTurnover && (last.isScore || last.down === 1), spot: spotLabel(last.snapDistance, last.snapYardLine) }
    : undefined;

  // The halftime score from the line score; second-half leads from each play's score
  const line = lineScore(game);
  const firstHalf = (side: number[]) => side[0] + side[1];
  const ourHalf = home ? firstHalf(line.home) : firstHalf(line.away);
  const theirHalf = home ? firstHalf(line.away) : firstHalf(line.home);
  const kind = ourHalf < theirHalf && won ? 'COMEBACK' : ourHalf > theirHalf && !won ? 'COLLAPSE' : undefined;
  const halftimeSwing = kind ? { kind: kind as 'COMEBACK' | 'COLLAPSE', halftime: `${ourHalf}-${theirHalf}` } : undefined;
  const blewTenPointLead =
    !won &&
    game.eventLog.some((e) => {
      const q = e.snapQuarter ?? e.quarter;
      if (q !== 3 && q !== 4) return false;
      const lead = home ? (e.homeScoreAfter ?? 0) - (e.awayScoreAfter ?? 0) : (e.awayScoreAfter ?? 0) - (e.homeScoreAfter ?? 0);
      return lead >= 10;
    });

  // The losing streak, this game included
  const results = schedule
    .filter((g) => g.homeScore !== undefined && g.awayScore !== undefined && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId) && g.gameId !== game.gameId)
    .sort((a, b) => a.week - b.week)
    .map((g) => (g.homeTeamId === userTeamId ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!));
  results.push(won);
  let lossStreak = 0;
  for (let i = results.length - 1; i >= 0 && !results[i]; i--) lossStreak++;

  // The starting quarterback out: the backup played
  const available = (p: Player) => p.condition.injuryStatus === 'HEALTHY' && p.academics.isEligible;
  const qbs = team.roster.filter((p) => p.position === 'QB').sort((a, b) => a.depthChartTier - b.depthChartTier || (a.depthOrder ?? 99) - (b.depthOrder ?? 99));
  const starterQb = qbs.find((p) => p.depthChartTier === 1);
  const backupQb = starterQb && !available(starterQb) ? qbs.find((p) => p !== starterQb && available(p)) : undefined;

  const starters = team.roster.filter((p) => p.depthChartTier === 1);
  const youngStarters = starters.filter((p) => p.classYear === 'Freshman' || p.classYear === 'Sophomore');

  // The last game of the season: a playoff loss, the title game, or a losing team's last regular-season game
  const userNode = bracket ? findUserNode(bracket, userTeamId) : undefined;
  const titleGame = !!userNode && bracket!.currentRoundIndex === userNode.division.rounds.length - 1;
  const finalGame = (playoff && (!won || titleGame)) || (!playoff && week === LAST_REGULAR_SEASON_WEEK && team.record.wins + (won ? 1 : 0) <= team.record.losses + (won ? 0 : 1));

  // A college prospect who starred: the game ball, or the best junior/senior 4★+ starter with a big game
  const stats = game.playerGameStats ?? {};
  const isProspect = (p: Player) => (p.classYear === 'Junior' || p.classYear === 'Senior') && p.recruiting.starRating >= 4 && p.depthChartTier === 1;
  const starred = (p: Player) => !!stats[p.id] && (stats[p.id].rushYards + stats[p.id].receivingYards + stats[p.id].passYards / 2 >= 80 || stats[p.id].tackles >= 7);
  const prospect = gameBall && isProspect(gameBall) ? gameBall : starters.filter((p) => isProspect(p) && starred(p)).sort((a, b) => b.overallRating - a.overallRating)[0];

  return {
    teamName: team.name,
    opponentName: (home ? game.awayTeam : game.homeTeam).name,
    won,
    margin: Math.abs(ours - theirs),
    score: `${ours}-${theirs}`,
    playoff,
    week,
    fourthDown,
    halftimeSwing,
    blewTenPointLead,
    lossStreak,
    backupQb: backupQb && starterQb ? { backup: backupQb, starter: starterQb } : undefined,
    youngStarters,
    finalGame,
    gameBall,
    gameBallLine,
    prospect,
    changedPlanAtHalftime
  };
}
