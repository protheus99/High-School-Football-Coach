import React from 'react';
import { RosterDepthChartView } from './RosterDepthChartView';
import { PracticePlan } from './PracticePlan';
import { CollegeRecruitingView } from './CollegeRecruitingView';
import { CoachesOfficeView } from './CoachesOfficeView';
import { PageHeader } from './ui/PageHeader';
import { StaffView } from './StaffView';

export type TeamSection = 'ROSTER' | 'PRACTICE' | 'COLLEGE' | 'STAFF' | 'OFFICE';

const SECTIONS: { id: TeamSection; label: string; short: string }[] = [
  { id: 'ROSTER', label: '📋 Roster', short: 'Roster' },
  { id: 'PRACTICE', label: '🏋️ Practice', short: 'Practice' },
  { id: 'COLLEGE', label: '🎓 College', short: 'College' },
  { id: 'STAFF', label: '🧑‍🏫 Staff', short: 'Staff' },
  { id: 'OFFICE', label: '🏢 Office', short: 'Office' }
];

const SUBTITLES: Record<TeamSection, string> = {
  ROSTER: 'Roster and depth chart',
  PRACTICE: 'Practice plan: development focus and intensity',
  COLLEGE: 'College recruiting for your juniors and seniors',
  STAFF: 'Your coaching staff: assistants who give the program an edge',
  OFFICE: 'Strategy, schedule and trophies'
};

/** Team: roster and depth chart, practice plan, college recruiting, the coaching staff and the coach's office. */
export const TeamView: React.FC<{ section: TeamSection; onSection: (section: TeamSection) => void }> = ({ section, onSection }) => (
  <div>
    <PageHeader title="Team" subtitle={SUBTITLES[section]} tabs={SECTIONS} active={section} onTab={onSection} />
    {section === 'ROSTER' && <RosterDepthChartView />}
    {section === 'PRACTICE' && (
      <div className="ui-screen" style={{ maxWidth: '900px' }}>
        <PracticePlan />
      </div>
    )}
    {section === 'COLLEGE' && <CollegeRecruitingView />}
    {section === 'STAFF' && <StaffView />}
    {section === 'OFFICE' && <CoachesOfficeView />}
  </div>
);
