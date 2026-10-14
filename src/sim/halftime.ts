import { GameSimulationState, HalftimeTalk } from '../types/game';

// ---------------------------------------------------------------------------
// The halftime locker room: the coach picks one message for the second half, and every one helps and costs.
// Effects are in play-quality points (the engine's scale; see matchEngine), sized so each talk swings what it
// promises by about 3 to 5 points over a typical second half (src/sim/tests/halftime.test.ts measures it).
//   Momentum lifts the team on both sides of the ball (its offense plays better, its defense gives up less).
//   Offense and Defense are mirror images: whatever one side gains, the other loses by the same amount.
// ---------------------------------------------------------------------------

export interface TalkEffect {
  offense: number; // added to this team's offensive plays
  defense: number; // taken off the opponent's offensive plays
  foulRate: number; // multiplies this team's penalty chances
  explosive: number; // lowers the bar for this team's explosive plays
  ballSecurity: number; // raises this team's fumble and interception line (more turnovers)
}

// Measured over thousands of games between equal teams (about 10 points each in a second half without a talk):
//   Fire them up: +1 scored, -1.5 allowed, about +3 net despite twice the penalties
//   Offense: about +5 scored and +5 allowed; Defense: about -4 scored and -4 allowed
//   Big play: big plays x2.4, +3.4 scored, +2.4 allowed (more turnovers, less momentum): a gamble near even
const MOMENTUM = 2;
const SIDE = 3.5;
const BIG_PLAY = 10; // the big-play bar drops by this much: about twice the big plays
const NONE: TalkEffect = { offense: 0, defense: 0, foulRate: 1, explosive: 0, ballSecurity: 0 };

export const HALFTIME_TALKS: { id: HalftimeTalk; header: string; color: string; gains: string[]; costs: string[]; effect: TalkEffect }[] = [
  { id: 'FIRE_UP', header: 'This is OUR house!', color: '#B91C1C', gains: ['▲ Momentum'], costs: ['▲ Penalties'], effect: { ...NONE, offense: MOMENTUM, defense: MOMENTUM, foulRate: 2 } },
  { id: 'OFFENSE', header: 'Put points on the board!', color: '#1D4ED8', gains: ['▲ Offense'], costs: ['▼ Defense'], effect: { ...NONE, offense: SIDE, defense: -SIDE } },
  { id: 'DEFENSE', header: 'Nobody crosses that goal line!', color: '#047857', gains: ['▲ Defense'], costs: ['▼ Offense'], effect: { ...NONE, offense: -SIDE, defense: SIDE } },
  {
    id: 'BIG_PLAY',
    header: 'Swing for the fences!',
    color: '#B45309',
    gains: ['▲▲ Big plays'],
    costs: ['▼ Ball security', '▼ Momentum'],
    effect: { ...NONE, offense: -MOMENTUM / 2, defense: -MOMENTUM / 2, explosive: BIG_PLAY, ballSecurity: 3 }
  }
];

/** The halftime talk a team chose (no effect before halftime or without one). */
export function talkEffect(state: GameSimulationState, teamId: string): TalkEffect {
  const talk = state.halftimeTalks?.[teamId];
  return (talk && HALFTIME_TALKS.find((t) => t.id === talk)?.effect) || NONE;
}
