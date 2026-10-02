import React from 'react';
import { useGameStore } from '../store/gameStore';
import { calculateDistrictStandings } from '../sim/districtEngine';
import { findDistrict } from '../sim/league';
import { DistrictStandingsView } from './DistrictStandingsView';
import { AllDistrictsStandingsView } from './AllDistrictsStandingsView';
import { RankingsView } from './RankingsView';
import { ScoreboardView } from './ScoreboardView';

export type RankingsSection = 'HOME' | 'DISTRICT' | 'ALL_DISTRICTS' | 'POLLS' | 'SCORES';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Rankings: a main page linking to district standings, every district, and the polls. */
export const RankingsHub: React.FC<{ section: RankingsSection; onSection: (section: RankingsSection) => void }> = ({ section, onSection }) => {
  const { league, districtTeams, userTeamId, polls, seasonSchedule, currentWeek } = useGameStore();
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (section !== 'HOME') {
    return (
      <div>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '12px 16px 0' }}>
          <button className="ui-btn" onClick={() => onSection('HOME')}>
            ← Rankings
          </button>
        </div>
        {section === 'DISTRICT' && <DistrictStandingsView />}
        {section === 'ALL_DISTRICTS' && <AllDistrictsStandingsView onBack={() => onSection('HOME')} hideBackButton />}
        {section === 'POLLS' && polls && <RankingsView polls={polls} userTeamId={userTeamId} />}
        {section === 'SCORES' && <ScoreboardView />}
      </div>
    );
  }

  // Summaries for the link cards
  const standings = calculateDistrictStandings(districtTeams);
  const myRow = standings.find((r) => r.teamId === userTeamId);
  const districtName = (league && findDistrict(league, userTeamId)?.name) ?? 'Your district';
  const districtCount = league?.regions.reduce((n, r) => n + r.districts.length, 0) ?? 0;
  const state = userTeam?.state ?? league?.state;
  const stateRank = state ? polls?.stateRankings[state]?.find((e) => e.teamId === userTeamId)?.rank : undefined;
  const nationalRank = polls?.nationalTop25.find((e) => e.teamId === userTeamId)?.rank;
  const pollSummary = nationalRank
    ? `You're #${nationalRank} nationally${stateRank ? ` and #${stateRank} in ${state}` : ''}`
    : stateRank
      ? `You're #${stateRank} in ${state}`
      : 'Not ranked yet';

  const finals = seasonSchedule.filter((g) => g.week === currentWeek - 1 && g.homeScore !== undefined).length;
  const scoresSummary = finals > 0 ? `${finals} final scores from week ${currentWeek - 1}` : 'Scores and results from every game';

  const links: { id: RankingsSection; icon: string; title: string; summary: string }[] = [
    {
      id: 'DISTRICT',
      icon: '🏆',
      title: `${districtName} standings`,
      summary: myRow ? `${ordinal(myRow.rank)} place · ${myRow.districtRecord} district, ${myRow.overallRecord} overall` : 'Your district race'
    },
    { id: 'SCORES', icon: '📋', title: 'Scoreboard', summary: scoresSummary },
    { id: 'POLLS', icon: '🥇', title: 'Polls', summary: pollSummary },
    { id: 'ALL_DISTRICTS', icon: '🗺️', title: 'All district standings', summary: `Every district in ${league?.name ?? 'the league'}${districtCount ? ` (${districtCount})` : ''}` }
  ];

  return (
    <div className="ui-screen" style={{ maxWidth: '800px' }}>
      <h2 style={{ margin: '0 0 12px 0' }}>Rankings</h2>
      <div className="ui-stack">
        {links.map((l) => (
          <button key={l.id} className="ui-card ui-card-button" style={{ padding: '14px' }} onClick={() => onSection(l.id)}>
            <div className="ui-card-head">
              <div className="ui-card-title">
                {l.icon} {l.title}
              </div>
              <div className="ui-card-badge" aria-hidden="true">
                →
              </div>
            </div>
            <div className="ui-muted" style={{ marginTop: '4px', fontSize: '14px' }}>
              {l.summary}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
