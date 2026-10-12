import React from 'react';
import { RosterDepthChartView } from './RosterDepthChartView';
import { PracticePlan } from './PracticePlan';
import { CollegeRecruitingView } from './CollegeRecruitingView';
import { PageHeader } from './ui/PageHeader';
import { StaffView } from './StaffView';
import { ScheduleView } from './ScheduleView';
import { HallOfFameView } from './HallOfFameView';
import { InjuryReportView } from './InjuryReportView';
import { CoachCareerView } from './CoachCareerView';
import { ComplianceView } from './ComplianceView';
import { useGameStore } from '../store/gameStore';

export type TeamSection = 'ROSTER' | 'INJURIES' | 'PRACTICE' | 'COLLEGE' | 'STAFF' | 'SCHEDULE' | 'COMPLIANCE' | 'HALL_OF_FAME' | 'CAREER';

const SECTIONS: { id: TeamSection; label: string; short: string }[] = [
  { id: 'ROSTER', label: '📋 Roster', short: 'Roster' },
  { id: 'INJURIES', label: '🩹 Health', short: 'Health' },
  { id: 'PRACTICE', label: '🏋️ Practice', short: 'Practice' },
  { id: 'COLLEGE', label: '🎓 College', short: 'College' },
  { id: 'STAFF', label: '🧑‍🏫 Staff', short: 'Staff' },
  { id: 'SCHEDULE', label: '🗓️ Schedule', short: 'Schedule' },
  { id: 'COMPLIANCE', label: '⚖️ Compliance', short: 'Compliance' },
  { id: 'HALL_OF_FAME', label: '🏆 Hall of Fame', short: 'Hall of Fame' },
  { id: 'CAREER', label: '📇 Career', short: 'Career' }
];

const SUBTITLES: Record<TeamSection, string> = {
  ROSTER: 'Roster and depth chart',
  INJURIES: "Health: the team's fatigue, who needs rest, and who's out",
  PRACTICE: 'Practice: how hard the team trains this week',
  COLLEGE: 'College recruiting for your juniors and seniors',
  STAFF: 'Your coaching staff: assistants who give the program an edge',
  SCHEDULE: 'The season week by week',
  COMPLIANCE: "Booster offers and the state's attention",
  HALL_OF_FAME: 'Trophies, titles and your career in the Hall of Fame',
  CAREER: 'Every school you have coached'
};

/** Team: roster and depth chart, health (fatigue and injuries), practice, college recruiting, the coaching staff, the schedule, the Hall of Fame and the coach's career. */
export const TeamView: React.FC<{ section: TeamSection; onSection: (section: TeamSection) => void; collegeFocusId?: string | null }> = ({
  section,
  onSection,
  collegeFocusId
}) => {
  // Compliance shows once the coach's boosters have been involved (a clean program never sees it)
  const showCompliance = useGameStore((s) => s.compliance.offers.length > 0 || s.compliance.stage !== 'QUIET' || s.compliance.evidence > 0 || !!s.compliance.pendingDecision);
  const tabs = showCompliance ? SECTIONS : SECTIONS.filter((t) => t.id !== 'COMPLIANCE');
  return (
  <div>
    <PageHeader title="Team" subtitle={SUBTITLES[section]} tabs={tabs} active={section} onTab={onSection} />
    {section === 'ROSTER' && <RosterDepthChartView />}
    {section === 'INJURIES' && <InjuryReportView />}
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
    {section === 'COMPLIANCE' && <ComplianceView />}
    {section === 'HALL_OF_FAME' && <HallOfFameView />}
    {section === 'CAREER' && <CoachCareerView />}
  </div>
  );
};
