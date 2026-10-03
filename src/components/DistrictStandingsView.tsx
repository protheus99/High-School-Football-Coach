import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { rulesForState } from '../sim/stateRules';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { AllDistrictsStandingsView } from './AllDistrictsStandingsView';
import { StandingsList } from './ui/StandingsList';

export const DistrictStandingsView: React.FC = () => {
  const { districtTeams, league, userTeamId } = useGameStore();
  const [showAll, setShowAll] = useState(false);
  const standings = calculateDistrictStandings(districtTeams);
  const districtCount = league?.regions.reduce((n, r) => n + r.districts.length, 0) ?? 4;
  const { playoffs } = rulesForState(league?.state);
  const split = !!league?.splitDivisions && playoffs.divisionSplit === 'TOP_ENROLLMENT_HALF';
  const bracketSize = districtCount * (split ? playoffs.qualifiersPerDistrict / playoffs.divisionNames.length : playoffs.qualifiersPerDistrict);
  const qualifyText = playoffs.format === 'STATEWIDE_RANKING'
    ? `${rulesForState(league?.state).districtLabel} champions are guaranteed a playoff spot and a top-${playoffs.bracketSize / 2} seed; the rest of the ${playoffs.bracketSize}-team bracket is filled by the statewide power ranking.`
    : split
    ? `Top ${playoffs.qualifiersPerDistrict} teams qualify; they are split by enrollment into the ${playoffs.divisionNames.join(' and ')} ${bracketSize}-team state brackets.`
    : `Top ${playoffs.qualifiersPerDistrict} teams qualify for the ${bracketSize}-team state tournament.`;

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
