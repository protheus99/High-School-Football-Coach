import React from 'react';
import { RosterDepthChartView } from './RosterDepthChartView';
import { PracticePlan } from './PracticePlan';
import { CollegeRecruitingView } from './CollegeRecruitingView';
import { PageHeader } from './ui/PageHeader';
import { StaffView } from './StaffView';
import { ScheduleView } from './ScheduleView';
import { HallOfFameView } from './HallOfFameView';

export type TeamSection = 'ROSTER' | 'PRACTICE' | 'COLLEGE' | 'STAFF' | 'SCHEDULE' | 'HALL_OF_FAME';

const SECTIONS: { id: TeamSection; label: string; short: string }[] = [
  { id: 'ROSTER', label: '📋 Roster', short: 'Roster' },
  { id: 'PRACTICE', label: '🏋️ Practice', short: 'Practice' },
  { id: 'COLLEGE', label: '🎓 College', short: 'College' },
  { id: 'STAFF', label: '🧑‍🏫 Staff', short: 'Staff' },
  { id: 'SCHEDULE', label: '🗓️ Schedule', short: 'Schedule' },
  { id: 'HALL_OF_FAME', label: '🏆 Hall of Fame', short: 'Hall of Fame' }
];

const SUBTITLES: Record<TeamSection, string> = {
  ROSTER: 'Roster and depth chart',
  PRACTICE: 'Practice plan: development focus and intensity',
  COLLEGE: 'College recruiting for your juniors and seniors',
  STAFF: 'Your coaching staff: assistants who give the program an edge',
  SCHEDULE: 'The season week by week',
  HALL_OF_FAME: 'Trophies, titles and your career on the leaderboard'
};

/** Team: roster and depth chart, practice plan, college recruiting, the coaching staff, the schedule and the Hall of Fame. */
export const TeamView: React.FC<{ section: TeamSection; onSection: (section: TeamSection) => void; collegeFocusId?: string | null }> = ({
  section,
  onSection,
  collegeFocusId
}) => (
  <div>
    <PageHeader title="Team" subtitle={SUBTITLES[section]} tabs={SECTIONS} active={section} onTab={onSection} />
    {section === 'ROSTER' && <RosterDepthChartView />}
    {section === 'PRACTICE' && (
      <div className="ui-screen" style={{ maxWidth: '900px' }}>
        <PracticePlan />
      </div>
    )}
    {section === 'COLLEGE' && <CollegeRecruitingView focusPlayerId={collegeFocusId} />}
    {section === 'STAFF' && <StaffView />}
    {section === 'SCHEDULE' && (
      <div className="ui-screen">
        <ScheduleView />
      </div>
    )}
    {section === 'HALL_OF_FAME' && <HallOfFameView />}
  </div>
);
