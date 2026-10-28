import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { WinLoss, allBrackets, playoffRecords } from '../sim/seasonRecord';

/** Every team's playoff games this season (the coach's state and the others), for full records on screen. */
export function usePlayoffRecords(): Map<string, WinLoss> {
  const playoffBracket = useGameStore((s) => s.playoffBracket);
  const nationalLeagues = useGameStore((s) => s.nationalLeagues);
  const week = useGameStore((s) => s.currentWeek);
  return useMemo(() => {
    void week; // other states' brackets advance in place (the same array): recount each week
    return playoffRecords(allBrackets({ playoffBracket, nationalLeagues }));
  }, [playoffBracket, nationalLeagues, week]);
}
