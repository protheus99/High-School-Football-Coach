import { GameSimulationState } from '../types/game';
import { useGameStore } from '../store/gameStore';
import { TalkOption, firstHalfLines, gameStakes, halftimeSituation, pickTalks, pregameSituation, stakesFromGame, talkCount } from '../sim/talkPicker';

/** The speeches offered at halftime and the first half's lines (shared with the playtest's halftime panel) */
export function halftimeOffer(gameState: GameSimulationState, userTeamId: string): { options: TalkOption[]; lines: string[] } {
  const s = useGameStore.getState();
  const stakes = gameStakes(s) ?? stakesFromGame(gameState, userTeamId);
  const situation = halftimeSituation(pregameSituation(s, stakes, gameState.weather), gameState, userTeamId);
  return {
    options: pickTalks(situation, { seed: `${gameState.gameId}:HALF`, count: talkCount('HALF', s.coachingStaff), recent: s.recentTalks }),
    lines: firstHalfLines(situation, stakes)
  };
}
