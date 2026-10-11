import { useEffect, useState } from 'react';
import { Career, CareerLength } from '../sim/careerScore';
import { fetchRemoteLeaderboard, LeaderboardEntry, localLeaderboard, rankEntries, toEntry } from '../services/leaderboard';

/**
 * One Hall of Fame board: this device's careers of that length, the server's when there is one, and the
 * current career as it stands now. Ranked.
 */
export function useHallOfFame(length: CareerLength, career: Career | null): LeaderboardEntry[] {
  const [remote, setRemote] = useState<LeaderboardEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    setRemote(null);
    void fetchRemoteLeaderboard(length).then((entries) => live && setRemote(entries));
    return () => {
      live = false;
    };
  }, [length, career]);
  const merged = new Map<string, LeaderboardEntry>();
  [...(remote ?? []), ...localLeaderboard(length)].forEach((e) => merged.set(e.careerId, { ...merged.get(e.careerId), ...e }));
  if (career && career.length === length && career.seasons.length) merged.set(career.id, toEntry(career));
  return rankEntries([...merged.values()]);
}
