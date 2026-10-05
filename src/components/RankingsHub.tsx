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
import { LeaderboardView } from './LeaderboardView';

export type RankingsSection = 'HOME' | 'DISTRICT' | 'ALL_DISTRICTS' | 'POLLS' | 'SCORES' | 'LEADERBOARD';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const TABS: { id: Exclude<RankingsSection, 'HOME'>; label: string; short?: string }[] = [
  { id: 'DISTRICT', label: '🏆 District', short: 'District' },
  { id: 'POLLS', label: '🥇 Polls', short: 'Polls' },
  { id: 'ALL_DISTRICTS', label: '🗺️ All Districts', short: 'All Districts' },
  { id: 'SCORES', label: '📋 Scoreboard', short: 'Scores' },
  { id: 'LEADERBOARD', label: '🎖️ Leaderboard', short: 'Leaderboard' }
];

/** Rankings: district standings, the polls, every district and the scoreboard, under one sub navigation. */
export const RankingsHub: React.FC<{ section: RankingsSection; onSection: (section: RankingsSection) => void }> = ({ section, onSection }) => {
  const { league, districtTeams, userTeamId, polls } = useGameStore();
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
    ALL_DISTRICTS: `Standings for every ${label.toLowerCase()} in ${league?.name ?? 'the league'}`,
    SCORES: "Last week's results and this week's games",
    LEADERBOARD: 'Coaching careers, ranked by points each season'
  };
  return (
    <div>
      <PageHeader title="Rankings" subtitle={subtitles[active]} tabs={tabs} active={active} onTab={onSection} />
      {active === 'DISTRICT' && <DistrictStandingsView />}
      {active === 'ALL_DISTRICTS' && <AllDistrictsStandingsView onBack={() => onSection('DISTRICT')} hideBackButton />}
      {active === 'POLLS' && polls && <RankingsView polls={polls} userTeamId={userTeamId} />}
      {active === 'SCORES' && <ScoreboardView />}
      {active === 'LEADERBOARD' && <LeaderboardView />}
    </div>
  );
};
