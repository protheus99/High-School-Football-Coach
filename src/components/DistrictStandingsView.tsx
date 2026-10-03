import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { AllDistrictsStandingsView } from './AllDistrictsStandingsView';
import { StandingsList } from './ui/StandingsList';

export const DistrictStandingsView: React.FC = () => {
  const { districtTeams, league, userTeamId } = useGameStore();
  const [showAll, setShowAll] = useState(false);
  const standings = calculateDistrictStandings(districtTeams);
  const districtCount = league?.regions.reduce((n, r) => n + r.districts.length, 0) ?? 4;
  const bracketSize = districtCount * (league?.splitDivisions ? 2 : 4);
  const qualifyText = league?.splitDivisions
    ? `Top 4 teams qualify; they are split by enrollment into the Division 1 and Division 2 ${bracketSize}-team state brackets.`
    : `Top 4 teams qualify for the ${bracketSize}-team state tournament.`;

  if (showAll) return <AllDistrictsStandingsView onBack={() => setShowAll(false)} />;

  return (
    <div className="ui-screen" style={{ maxWidth: '900px' }}>
      <p className="ui-muted" style={{ margin: '0 0 12px 0' }}>
        {qualifyText} Tiebreakers cap point differential at &plusmn;17 per game.
      </p>
      <StandingsList rows={standings} highlightTeamId={userTeamId} />
      {league && league.regions.some((r) => r.districts.length > 1) && (
        <button className="ui-btn ui-btn-block" style={{ marginTop: '12px' }} onClick={() => setShowAll(true)}>
          View all district standings →
        </button>
      )}
    </div>
  );
};
