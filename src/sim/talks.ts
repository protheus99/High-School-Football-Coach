import { GameSimulationState, WeatherType } from '../types/game';
import type { PlayoffRound } from './playoffEngine';

// ---------------------------------------------------------------------------
// Locker-room speeches: one before kickoff (it lasts the first half) and one at halftime (the second half and
// overtime). Each screen offers a few speeches that fit the game (sim/talkPicker.ts); every speech helps and costs.
// Effects are in play-quality points (the engine's scale; see matchEngine), sized so a speech swings what it
// promises by about 3 to 5 points over a half (src/sim/tests/halftime.test.ts measures them).
// ---------------------------------------------------------------------------

/** What a speech changes for its team, in the engine's units. */
export interface TalkEffect {
  offense: number; // added to this team's offensive plays
  defense: number; // taken off the opponent's offensive plays
  run: number; // added to this team's runs (and run tries)
  pass: number; // added to this team's passes
  redZone: number; // added to this team's plays inside the opponent's 20
  redZoneDefense: number; // taken off the opponent's plays inside this team's 20
  shortYardage: number; // added to this team's plays with 3 yards or less to go (and two-point tries)
  explosive: number; // lowers the bar for this team's 20-yard plays
  giveUpBig: number; // lowers the bar for the opponent's 20-yard plays (missed tackles)
  ballSecurity: number; // raises this team's fumble and interception line (more turnovers)
  takeaways: number; // raises the opponent's fumble and interception line
  preSnapFouls: number; // multiplies this team's false starts, offsides and the like
  liveFouls: number; // multiplies this team's holding, interference and late hits
  tempo: number; // multiplies the clock this team's offense uses a snap (below 1: a hurry-up, more snaps)
  specialTeams: number; // kick returns and coverage, field goals, holding on to kickoffs
}

export const NO_EFFECT: TalkEffect = {
  offense: 0,
  defense: 0,
  run: 0,
  pass: 0,
  redZone: 0,
  redZoneDefense: 0,
  shortYardage: 0,
  explosive: 0,
  giveUpBig: 0,
  ballSecurity: 0,
  takeaways: 0,
  preSnapFouls: 1,
  liveFouls: 1,
  tempo: 1,
  specialTeams: 0
};

/** The kind of plan a speech is; a screen never offers two of a kind. */
export type TalkFamily = 'MOMENTUM' | 'OFFENSE' | 'BIG_PLAY' | 'DEFENSE' | 'CONTROL' | 'DISCIPLINE' | 'SPECIAL';
export type TalkPhase = 'PRE' | 'HALF';

/** The game as a speech sees it (sim/talkPicker.ts reads it from the game and the season). */
export interface TalkSituation {
  phase: TalkPhase;
  home: boolean;
  // Halftime only (0 before kickoff)
  margin: number; // the coach's lead
  pointsFor: number;
  pointsAgainst: number;
  runFor: number; // points the coach's team scored unanswered to end the half
  runAgainst: number;
  turnovers: number; // the coach's team gave it away
  takeaways: number; // the other team gave it away
  flags: number; // against the coach's team
  carries: number;
  yardsPerCarry: number;
  redZoneStalls: number; // drives inside the other team's 20 that ended without a touchdown
  theirRedZoneStalls: number;
  shortYardageFails: number; // 3rd or 4th and 3 or less, not converted
  bigKickPlay: boolean; // a blocked kick, a muffed punt or a fumbled kickoff
  // Both
  weather: WeatherType;
  playoffRound: PlayoffRound | null;
  ourRank: number | null; // state rank, top 10 only
  theirRank: number | null;
  favored: number; // win share gap in the coach's favor (-1 to 1): records, or ranks when one side is ranked
  homecoming: boolean;
  seniorNight: boolean;
  rivalry: boolean;
  lowMorale: boolean;
  // Before kickoff only
  seasonOpener: boolean;
  lostLastWeek: boolean;
  bigWinLastWeek: boolean;
  winStreak: number;
  lossStreak: number;
  starterOut: boolean;
  theyAreChampions: boolean; // last season's state champion
}

export interface Talk {
  id: string;
  phase: TalkPhase;
  family: TalkFamily;
  lines: string[]; // what the coach says; a speech that comes back uses its next line
  gains: string[];
  costs: string[];
  risky?: boolean; // a bigger swing both ways, only offered in the situation it's built for
  effect: TalkEffect;
  /** How well it fits: 3 for the situation it was written for, about 1 for a general fit, 0 when it doesn't belong. */
  fit: (s: TalkSituation) => number;
}

// Sizes (play-quality points). Momentum lifts both sides of the ball; a side lean gives the other side up.
const MOMENTUM = 2;
const SIDE = 3.5;
const BIG_PLAY = 10;
const fx = (e: Partial<TalkEffect>): TalkEffect => ({ ...NO_EFFECT, ...e });
const fouls = (rate: number) => ({ preSnapFouls: rate, liveFouls: rate });
const MOMENTUM_FX = fx({ offense: MOMENTUM, defense: MOMENTUM, ...fouls(2) });

const close = (s: TalkSituation, points: number) => Math.abs(s.margin) <= points;
const badWeather = (s: TalkSituation) => s.weather === 'HEAVY_RAIN' || s.weather === 'FREEZING_SNOW' || s.weather === 'HIGH_WIND';
const underdog = (s: TalkSituation) => (s.theirRank !== null && (s.ourRank === null || s.ourRank > s.theirRank)) || s.favored <= -0.3;
const finalRounds = (s: TalkSituation) => s.playoffRound === 'STATE_SEMIFINAL' || s.playoffRound === 'STATE_FINAL';

const HALFTIME: Omit<Talk, 'phase'>[] = [
  // Momentum
  { id: 'FIRE_UP', family: 'MOMENTUM', lines: ['This is OUR house!', 'Nobody walks in here and pushes us around!', 'Make this place shake!'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (!s.home ? 0 : close(s, 14) ? 1.5 : 0.3) },
  { id: 'ROAD_TRIP', family: 'MOMENTUM', lines: ["Let's quiet this crowd!", 'Their whole town showed up. Send them home early.', 'Us against everybody in this stadium.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (s.home ? 0 : close(s, 14) ? 1.5 : 0.3) },
  { id: 'SENIOR_NIGHT', family: 'MOMENTUM', lines: ['Seniors, this is your last time on this field.', 'Twenty-four minutes left on this field. Make them count.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (!s.seniorNight ? 0 : close(s, 14) ? 3 : 1) },
  { id: 'HOMECOMING', family: 'MOMENTUM', lines: ['The whole town is watching. Finish it.', 'Give the alumni something to talk about.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (!s.homecoming ? 0 : close(s, 14) ? 3 : 1) },
  { id: 'RIVALRY', family: 'MOMENTUM', lines: ['Twenty-four minutes for a whole year of bragging rights.', 'This is the one they remember.'], gains: ['▲ Momentum', '▲ Defense'], costs: ['▲▲ Penalties'], effect: fx({ offense: 1.5, defense: 3, ...fouls(2.5) }), fit: (s) => (!s.rivalry ? 0 : close(s, 14) ? 3.2 : 1) },
  { id: 'GIANT_KILLER', family: 'MOMENTUM', lines: ['Nobody thinks we belong here.', "They're ranked. We're still standing.", 'Let them read about us tomorrow.'], gains: ['▲ Momentum', '▲ Big plays'], costs: ['▲ Penalties', '▼ Ball security'], effect: fx({ offense: 1.5, defense: 1.5, explosive: 3.5, ballSecurity: 1.5, ...fouls(1.8) }), fit: (s) => (underdog(s) && s.margin >= -14 && s.margin <= 7 ? 2.8 : 0) },
  { id: 'KEEP_COMING', family: 'MOMENTUM', lines: ['Keep that fire going!', "They felt that run. Don't let them breathe.", 'We just found our legs. Keep coming.'], gains: ['▲ Momentum', '▲ Offense'], costs: ['▲ Penalties', '▼ Defense'], effect: fx({ offense: 3, ...fouls(2) }), fit: (s) => (s.runFor < 14 ? 0 : s.margin <= 0 ? 3 : s.margin <= 7 ? 2 : 0) },
  { id: 'BIG_STAGE', family: 'MOMENTUM', lines: ['This is what we dreamed about!', 'Every kid in this state wants to be in your shoes.'], gains: ['▲▲ Momentum'], costs: ['▲▲ Penalties'], risky: true, effect: fx({ offense: 3, defense: 3, ...fouls(3) }), fit: (s) => (finalRounds(s) ? 3.5 : 0) },
  // Offense
  { id: 'OFFENSE', family: 'OFFENSE', lines: ['Put points on the board!', 'We need touchdowns, not yards.', 'Go take what they are giving us.'], gains: ['▲ Offense'], costs: ['▼ Defense'], effect: fx({ offense: SIDE, defense: -SIDE }), fit: (s) => (s.margin <= -1 && s.margin >= -14 ? 2 : s.margin === 0 ? 1 : 0.3) },
  { id: 'ONE_AT_A_TIME', family: 'OFFENSE', lines: ['One score at a time.', "Don't look at the scoreboard. Win the next drive.", 'Chip away. Ten plays, seven points.'], gains: ['▲ Offense', '▲ Ball security'], costs: ['▼ Defense', '▼ Big plays'], effect: fx({ offense: 3, defense: -3, ballSecurity: -2, explosive: -5 }), fit: (s) => (s.margin <= -15 ? 2.5 : 0) },
  { id: 'AIR_IT_OUT', family: 'OFFENSE', lines: ['Make them cover the whole field.', 'Take the top off their defense.'], gains: ['▲ Offense', '▲ Big plays'], costs: ['▼ Defense', '▼ Ball security'], effect: fx({ offense: 1.5, defense: -3, explosive: 6, ballSecurity: 2 }), fit: (s) => (s.pointsFor <= 7 && close(s, 14) && !badWeather(s) ? 2.4 : 0) },
  { id: 'HURRY_UP', family: 'OFFENSE', lines: ['No huddle. Run them off the field!', 'Line up fast and make them chase us.'], gains: ['▲ Tempo', '▲ Offense'], costs: ['▼ Defense'], effect: fx({ tempo: 0.7, offense: 2.5, defense: -2.5 }), fit: (s) => (s.margin <= -8 ? 2.6 : 0) },
  { id: 'GROUND_GAME', family: 'OFFENSE', lines: ['Run it right down their throat.', "They can't stop it, so keep running it.", 'Lean on them till they quit.'], gains: ['▲ Run game'], costs: ['▼ Pass game'], effect: fx({ run: 3, pass: -6.5 }), fit: (s) => ((s.carries >= 6 && s.yardsPerCarry >= 5) || badWeather(s) ? 2.6 : 0) },
  { id: 'SPREAD_THEM', family: 'OFFENSE', lines: ['Spread them out and throw it.', "They've got eight in the box. Go over the top of it."], gains: ['▲ Pass game'], costs: ['▼ Run game'], effect: fx({ pass: 6, run: -4 }), fit: (s) => (s.carries >= 6 && s.yardsPerCarry < 3 && !badWeather(s) ? 2.5 : 0) },
  { id: 'FINISH_DRIVES', family: 'OFFENSE', lines: ['Six points, not three!', 'We are moving the ball. Now finish it.'], gains: ['▲ Red zone offense'], costs: ['▼ Offense between the 20s'], effect: fx({ redZone: 8, offense: -1.5 }), fit: (s) => (s.redZoneStalls >= 2 ? 2.8 : 0) },
  { id: 'SHOOTOUT', family: 'OFFENSE', lines: ['Answer every score.', 'They score, we score. Then we score again.'], gains: ['▲ Offense', '▲ Tempo'], costs: ['▼ Defense'], effect: fx({ offense: 3, tempo: 0.8, defense: -3.5 }), fit: (s) => (s.pointsFor >= 21 && s.pointsAgainst >= 21 ? 2.8 : 0) },
  // Big play
  { id: 'BIG_PLAY', family: 'BIG_PLAY', lines: ['Swing for the fences!', 'We need a big one. Go get it.'], gains: ['▲▲ Big plays'], costs: ['▼ Ball security', '▼ Momentum'], effect: fx({ offense: -MOMENTUM / 2, defense: -MOMENTUM / 2, explosive: BIG_PLAY, ballSecurity: 3 }), fit: (s) => (s.margin <= -8 ? 2 : s.margin >= 15 ? 0 : 0.3) },
  { id: 'ALL_IN', family: 'BIG_PLAY', lines: ['Nothing to lose. Empty the tank!', "Every trick play we've got. Now."], gains: ['▲▲ Offense', '▲▲ Big plays'], costs: ['▼▼ Defense', '▼ Ball security'], risky: true, effect: fx({ offense: 2, defense: -5, explosive: 12, ballSecurity: 4 }), fit: (s) => (s.margin <= -21 ? 3.2 : 0) },
  // Defense
  { id: 'DEFENSE', family: 'DEFENSE', lines: ['Nobody crosses that goal line!', 'Make them earn every single yard.', 'Our defense wins this game.'], gains: ['▲ Defense'], costs: ['▼ Offense'], effect: fx({ offense: -SIDE, defense: SIDE }), fit: (s) => (s.margin >= 1 && s.margin <= 14 ? 2 : s.margin === 0 ? 1 : s.margin > 14 ? 0.8 : 0.4) },
  { id: 'HIT_SOMEBODY', family: 'DEFENSE', lines: ['Set the tone. Hit somebody!', 'Every whistle, they should feel you.'], gains: ['▲ Defense'], costs: ['▲ Penalties'], effect: fx({ defense: 2.5, liveFouls: 2.2 }), fit: (s) => (close(s, 7) ? 1.8 : 0) },
  { id: 'STOP_BLEEDING', family: 'DEFENSE', lines: ['Stop the bleeding.', 'Get off the field. One stop changes everything.'], gains: ['▲ Defense', '▼ Penalties'], costs: ['▼ Offense'], effect: fx({ defense: 3, offense: -3.5, ...fouls(0.7) }), fit: (s) => (s.runAgainst >= 14 ? 3 : 0) },
  { id: 'STRIP_IT', family: 'DEFENSE', lines: ['Rip at that football!', 'Two hats on the ball carrier and punch it out.'], gains: ['▲ Takeaways'], costs: ['▲ Their big plays'], effect: fx({ takeaways: 3.5, giveUpBig: 3 }), fit: (s) => (s.takeaways === 0 && close(s, 21) ? 2.3 : close(s, 14) ? 1.2 : 0) },
  { id: 'BEND_DONT_BREAK', family: 'DEFENSE', lines: ["Bend, don't break.", 'Give them the middle of the field. Not the end zone.'], gains: ['▲ Red zone defense'], costs: ['▼ Defense between the 20s'], effect: fx({ redZoneDefense: 8, defense: -1.5 }), fit: (s) => (s.theirRedZoneStalls >= 2 ? 2.7 : s.margin >= 1 ? 1 : 0) },
  { id: 'LOCKDOWN', family: 'DEFENSE', lines: ['Not one more inch.', 'Shut the door. Lock it.'], gains: ['▲▲ Defense'], costs: ['▼▼ Offense'], risky: true, effect: fx({ defense: 5, offense: -5, explosive: -4, ballSecurity: -2 }), fit: (s) => (s.margin >= 8 && (s.playoffRound !== null || s.theirRank !== null) ? 3 : 0) },
  // Ball control
  { id: 'CLOCK', family: 'CONTROL', lines: ['Run the clock. Finish the job.', 'Make them watch the clock.', 'Four yards and a cloud of dust.'], gains: ['▲ Ball security', '▼ Tempo'], costs: ['▼ Big plays', '▼ Offense'], effect: fx({ ballSecurity: -3, tempo: 1.35, explosive: -3 }), fit: (s) => (s.margin >= 15 ? 3 : s.margin >= 8 ? 1.2 : 0) },
  { id: 'PROTECT_BALL', family: 'CONTROL', lines: ['Two hands on that football!', 'The ball is our season. Hold on to it.'], gains: ['▲▲ Ball security'], costs: ['▼ Big plays'], effect: fx({ ballSecurity: -4, explosive: -7 }), fit: (s) => (s.turnovers >= 2 ? 3 : badWeather(s) ? 2.6 : 0.3) },
  { id: 'SURVIVE', family: 'CONTROL', lines: ['Survive and advance.', 'Win ugly. Nobody remembers how.'], gains: ['▲ Ball security', '▼ Penalties'], costs: ['▼ Big plays'], effect: fx({ ballSecurity: -2.5, ...fouls(0.6), explosive: -7 }), fit: (s) => (s.playoffRound !== null && s.margin >= -7 ? 2.6 : 0) },
  { id: 'TRENCHES', family: 'CONTROL', lines: ['Win it up front.', 'Lower pad level. Move the pile.'], gains: ['▲ Short yardage'], costs: ['▼ Big plays'], effect: fx({ shortYardage: 8, explosive: -5 }), fit: (s) => (s.shortYardageFails >= 2 ? 2.8 : close(s, 7) ? 1 : 0) },
  // Discipline
  { id: 'CLEAN_IT_UP', family: 'DISCIPLINE', lines: ['Stop beating yourselves.', 'Every flag is a gift. Stop giving them gifts.'], gains: ['▼▼ Pre-snap flags'], costs: ['▼ Momentum'], effect: fx({ preSnapFouls: 0.3, offense: -0.5, defense: -0.5 }), fit: (s) => (s.flags >= 4 ? 3 : s.lowMorale ? 2.5 : 0.3) },
  { id: 'CLASS', family: 'DISCIPLINE', lines: ['Play with class. Finish the right way.', 'Respect the game and the other sideline.'], gains: ['▼ Penalties', '▲ Ball security'], costs: ['▼ Offense'], effect: fx({ ...fouls(0.6), ballSecurity: -2, offense: -2 }), fit: (s) => (s.margin >= 28 ? 3 : s.margin >= 21 ? 1 : 0) },
  // Special teams
  { id: 'HIDDEN_YARDS', family: 'SPECIAL', lines: ['Win the hidden yards!', 'Kicks and returns decide close games.'], gains: ['▲ Special teams'], costs: ['▼ Offense'], effect: fx({ specialTeams: 3, offense: -0.5 }), fit: (s) => (s.bigKickPlay ? 2.8 : close(s, 7) ? 1 : 0) }
];

const PREGAME: Omit<Talk, 'phase'>[] = [
  // Momentum
  { id: 'DEFEND_HOME', family: 'MOMENTUM', lines: ['Defend this field!', 'Our field, our town, our night.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (s.home ? 1.2 : 0) },
  { id: 'ROAD_WIN', family: 'MOMENTUM', lines: ["Pack your bags. We're taking this one home.", 'Nobody on that side wants us here. Good.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (s.home ? 0 : 1.2) },
  { id: 'UNDERDOG', family: 'MOMENTUM', lines: ['Nobody gave us a chance. Good.', 'Every paper picked them. Make them wrong.'], gains: ['▲ Momentum', '▲ Big plays'], costs: ['▲ Penalties', '▼ Ball security'], effect: fx({ offense: 1.5, defense: 1.5, explosive: 3.5, ballSecurity: 1.5, ...fouls(1.8) }), fit: (s) => (underdog(s) ? 2.8 : 0) },
  { id: 'DETHRONE', family: 'MOMENTUM', lines: ['Go take their crown.', 'The champs still have to play the game.'], gains: ['▲▲ Momentum'], costs: ['▲ Penalties', '▼ Ball security'], risky: true, effect: fx({ offense: 2.5, defense: 2.5, ballSecurity: 3, ...fouls(2.5) }), fit: (s) => (s.theyAreChampions ? 3 : 0) },
  { id: 'PLAYOFF_PUSH', family: 'MOMENTUM', lines: ['Lose and we turn in our pads.', 'Win and we play another week. That is all.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (s.playoffRound === null || s.playoffRound === 'STATE_FINAL' ? 0 : 3) },
  { id: 'STATE_FINAL', family: 'MOMENTUM', lines: ['Leave nothing in this locker room.', 'Forty-eight minutes. Then forever.'], gains: ['▲▲ Momentum'], costs: ['▲▲ Penalties'], risky: true, effect: fx({ offense: 3, defense: 3, ...fouls(3) }), fit: (s) => (s.playoffRound === 'STATE_FINAL' ? 3.5 : 0) },
  { id: 'FOR_THE_SENIORS', family: 'MOMENTUM', lines: ['For the seniors.', 'Send them out the right way.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (s.seniorNight ? 3 : 0) },
  { id: 'HOMECOMING_NIGHT', family: 'MOMENTUM', lines: ['The whole town came home tonight. Show them who we are.', 'Alumni in the stands. Make them proud.'], gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: MOMENTUM_FX, fit: (s) => (s.homecoming ? 3 : 0) },
  { id: 'RIVAL_WEEK', family: 'MOMENTUM', lines: ["They've had this one circled all year. So have we.", 'Nobody remembers your record. They remember this game.'], gains: ['▲ Momentum', '▲ Defense'], costs: ['▲▲ Penalties'], effect: fx({ offense: 1.5, defense: 3, ...fouls(2.5) }), fit: (s) => (s.rivalry ? 3.2 : 0) },
  // Big play
  { id: 'OPENER', family: 'BIG_PLAY', lines: ["We've waited all summer for this.", 'Two-a-days were for tonight.'], gains: ['▲ Momentum', '▲ Big plays'], costs: ['▲ Pre-snap flags'], effect: fx({ offense: 1, defense: 1, explosive: 3, preSnapFouls: 3.5 }), fit: (s) => (s.seasonOpener ? 3 : 0) },
  // Offense
  { id: 'BOUNCE_BACK', family: 'OFFENSE', lines: ['Last week is over. Answer it.', 'Nobody remembers a loss if you win the next one.'], gains: ['▲ Offense'], costs: ['▼ Defense'], effect: fx({ offense: SIDE, defense: -SIDE }), fit: (s) => (s.lostLastWeek ? 2.6 : 0.3) },
  { id: 'FAST_START', family: 'OFFENSE', lines: ['Punch them in the mouth early.', 'First drive, first score. Set the tone.'], gains: ['▲ Offense', '▲ Tempo'], costs: ['▼ Defense'], effect: fx({ offense: 3, tempo: 0.8, defense: -3.5 }), fit: (s) => (s.favored >= 0.2 || (s.ourRank !== null && s.theirRank === null) ? 2 : 0.5) },
  // Defense
  { id: 'STAY_HUNGRY', family: 'DEFENSE', lines: ["Don't you dare get comfortable.", 'Nobody remembers a streak. Go win this one.'], gains: ['▲ Defense', '▼ Penalties'], costs: ['▼ Big plays'], effect: fx({ defense: 2, ...fouls(0.7), explosive: -6 }), fit: (s) => (s.winStreak >= 3 ? 2.6 : 0) },
  { id: 'NEXT_MAN_UP', family: 'DEFENSE', lines: ['Next man up.', 'One of us goes down, the rest pick him up.'], gains: ['▲▲ Defense'], costs: ['▼ Offense', '▼ Big plays'], effect: fx({ defense: 4, offense: -3, explosive: -4 }), fit: (s) => (s.starterOut ? 3 : 0) },
  // Ball control
  { id: 'ONE_WIN', family: 'CONTROL', lines: ['One game. One win. Tonight.', 'Stop the streak. Play clean and win ugly.'], gains: ['▲ Ball security', '▲ Defense'], costs: ['▼ Big plays'], effect: fx({ ballSecurity: -2.5, defense: 2, offense: -0.5, explosive: -7 }), fit: (s) => (s.lossStreak >= 2 ? 2.8 : 0.3) },
  { id: 'WEATHER', family: 'CONTROL', lines: ['Hold onto the ball. The weather picks no sides.', 'Mud game. Tough team wins.'], gains: ['▲ Ball security', '▲ Run game'], costs: ['▼ Pass game'], effect: fx({ ballSecurity: -2.5, run: 2, pass: -5 }), fit: (s) => (badWeather(s) ? 3 : 0) },
  // Discipline
  { id: 'TRAP_GAME', family: 'DISCIPLINE', lines: ["Don't read your own headlines.", 'Their film looks bad. So did ours once.'], gains: ['▼ Penalties', '▲ Ball security'], costs: ['▼ Big plays'], effect: fx({ ...fouls(0.6), ballSecurity: -2, explosive: -6 }), fit: (s) => (s.favored >= 0.4 || (s.ourRank !== null && s.theirRank === null && s.favored >= 0.2) ? 2.6 : s.bigWinLastWeek ? 2 : 0) },
  { id: 'TRUST_PLAN', family: 'DISCIPLINE', lines: ['Trust the game plan.', 'We did the work this week. Now do your job.'], gains: ['▼ Penalties'], costs: ['▼ Momentum'], effect: fx({ ...fouls(0.5), offense: -0.5, defense: -0.5 }), fit: (s) => (s.lowMorale ? 2 : 0.5) }
];

export const TALKS: Talk[] = [...PREGAME.map((t) => ({ ...t, phase: 'PRE' as const })), ...HALFTIME.map((t) => ({ ...t, phase: 'HALF' as const }))];
const BY_ID = new Map(TALKS.map((t) => [t.id, t]));

export const talkById = (id: string | undefined): Talk | undefined => (id ? BY_ID.get(id) : undefined);

/** Families that push (offense, momentum, big plays, kicks) and that hold (defense, ball control, discipline). */
export const ATTACK_FAMILIES: TalkFamily[] = ['MOMENTUM', 'OFFENSE', 'BIG_PLAY', 'SPECIAL'];

/** The colors each family's speeches wear. */
export const FAMILY_COLORS: Record<TalkFamily, { edge: string; tint: string }> = {
  MOMENTUM: { edge: '#B91C1C', tint: '#FEF2F2' },
  OFFENSE: { edge: '#1D4ED8', tint: '#EFF6FF' },
  BIG_PLAY: { edge: '#B45309', tint: '#FFFBEB' },
  DEFENSE: { edge: '#047857', tint: '#ECFDF5' },
  CONTROL: { edge: '#4338CA', tint: '#EEF2FF' },
  DISCIPLINE: { edge: '#7E22CE', tint: '#FAF5FF' },
  SPECIAL: { edge: '#0E7490', tint: '#ECFEFF' }
};

/**
 * The speech a team is playing under right now: the pre-game speech in the first half, the halftime speech after
 * it (overtime included); no effect without one.
 */
export function talkEffect(state: GameSimulationState, teamId: string): TalkEffect {
  const firstHalf = state.currentQuarter === 1 || state.currentQuarter === 2;
  const id = firstHalf ? state.pregameTalks?.[teamId] : state.halftimeTalks?.[teamId];
  return talkById(id)?.effect ?? NO_EFFECT;
}
