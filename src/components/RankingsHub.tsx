import React from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict } from '../sim/league';
import { DistrictStandingsView } from './DistrictStandingsView';
import { AllDistrictsStandingsView } from './AllDistrictsStandingsView';
import { RankingsView } from './RankingsView';
import { PageHeader } from './ui/PageHeader';
import { rulesForState } from '../sim/stateRules';
import { ScoreboardView } from './ScoreboardView';
import { PlayoffsView } from './PlayoffsView';

export type RankingsSection = 'HOME' | 'DISTRICT' | 'ALL_DISTRICTS' | 'POLLS' | 'PLAYOFFS' | 'SCORES';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const TABS: { id: Exclude<RankingsSection, 'HOME'>; label: string; short?: string }[] = [
  { id: 'DISTRICT', label: '🏆 District', short: 'District' },
  { id: 'POLLS', label: '🥇 Polls', short: 'Polls' },
  { id: 'PLAYOFFS', label: '🏟️ Playoffs', short: 'Playoffs' },
  { id: 'ALL_DISTRICTS', label: '🗺️ All Districts', short: 'All Districts' },
  { id: 'SCORES', label: '📋 Scoreboard', short: 'Scores' }
];

/** Rankings: district standings, the polls, every district and the scoreboard, under one sub navigation. */
export const RankingsHub: React.FC<{ section: RankingsSection; onSection: (section: RankingsSection) => void; onGoToGame: () => void }> = ({
  section,
  onSection,
  onGoToGame
}) => {
  const { league, districtTeams, userTeamId, polls, playoffBracket } = useGameStore();
  const active = section === 'HOME' ? 'DISTRICT' : section;
  const label = rulesForState(league?.state).districtLabel;
  const tabs = TABS.map((t) =>
    t.id === 'DISTRICT' ? { ...t, label: `🏆 ${label}`, short: label } : t.id === 'ALL_DISTRICTS' ? { ...t, label: `🗺️ All ${label}s`, short: `All ${label}s` } : t
  );
  const myRow = calculateDistrictStandings(districtTeams).find((r) => r.teamId === userTeamId);
  const districtName = (league && findDistrict(league, userTeamId)?.name) ?? 'Your district';
  const subtitles: Record<typeof active, string> = {
    DISTRICT: `${districtName} standings${myRow ? ` · you're ${ordinal(myRow.rank)} (${myRow.districtRecord})` : ''}`,
    POLLS: 'State and national polls',
    PLAYOFFS: playoffBracket ? `${playoffBracket.championshipTitle ?? 'State playoffs'}${playoffBracket.isPlayoffsActive ? '' : ' · complete'}` : 'State playoffs',
    ALL_DISTRICTS: `Standings for every ${label.toLowerCase()} in ${league?.name ?? 'the league'}`,
    SCORES: "Last week's results and this week's games"
  };
  return (
    <div>
      <PageHeader title="Rankings" subtitle={subtitles[active]} tabs={tabs} active={active} onTab={onSection} />
      {active === 'DISTRICT' && <DistrictStandingsView />}
      {active === 'ALL_DISTRICTS' && <AllDistrictsStandingsView onBack={() => onSection('DISTRICT')} hideBackButton />}
      {active === 'POLLS' && polls && <RankingsView polls={polls} userTeamId={userTeamId} />}
      {active === 'PLAYOFFS' && <PlayoffsView onGoToGame={onGoToGame} onStandings={() => onSection('DISTRICT')} />}
      {active === 'SCORES' && <ScoreboardView />}
    </div>
  );
};
