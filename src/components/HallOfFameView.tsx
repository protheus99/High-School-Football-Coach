import React from 'react';
import { useGameStore } from '../store/gameStore';
import { TrophyCase, TrophyRecord } from './TrophyCase';
import { HallOfFameBoard } from './HallOfFameBoard';

/**
 * Hall of Fame (Team): the trophy case (prestige, college signees, the titles won) and the Hall of Fame boards
 * (this contract season by season, ranked against every career of the same length).
 */
export const HallOfFameView: React.FC = () => {
  const { districtTeams, userTeamId, career, rivalryLog } = useGameStore();
  const userTeam = districtTeams.find((t) => t.id === userTeamId);
  if (!userTeam) return null;

  const trophies: TrophyRecord[] = (career?.seasons ?? [])
    .filter((s) => s.stateTitle)
    .map((s): TrophyRecord => ({ year: s.year, type: 'STATE_CHAMPIONSHIP', name: 'State Champions' }))
    // Rivalry wins at this school go in the case too
    .concat(rivalryLog.filter((g) => g.won && g.school === userTeam.name).map((g): TrophyRecord => ({ year: g.year, type: 'RIVALRY_BELL', name: g.name, opponent: g.opponent })))
    .sort((a, b) => a.year - b.year);
  // A career counts every season's signees; a classic game, this year's
  const signees = career
    ? career.seasons.reduce((n, s) => n + s.collegeSignees, 0)
    : userTeam.roster.filter((p) => p.recruiting.isNationalLetterOfIntentSigned).length;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="ui-screen" style={{ paddingBottom: '8px' }}>
        <TrophyCase trophies={trophies} collegeSignees={signees} schoolPrestige={userTeam.prestige} />
      </div>
      <HallOfFameBoard />
    </div>
  );
};
