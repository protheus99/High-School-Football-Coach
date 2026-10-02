import React from 'react';
import { RosterDepthChartView } from './RosterDepthChartView';
import { PracticePlan } from './PracticePlan';
import { CollegeRecruitingView } from './CollegeRecruitingView';
import { CoachesOfficeView } from './CoachesOfficeView';

export type TeamSection = 'ROSTER' | 'PRACTICE' | 'COLLEGE' | 'OFFICE';

const SECTIONS: { id: TeamSection; label: string }[] = [
  { id: 'ROSTER', label: '📋 Roster' },
  { id: 'PRACTICE', label: '🏋️ Practice' },
  { id: 'COLLEGE', label: '🎓 College' },
  { id: 'OFFICE', label: '🏢 Office' }
];

/** Team: roster and depth chart, practice plan, college recruiting and the coach's office in one place. */
export const TeamView: React.FC<{ section: TeamSection; onSection: (section: TeamSection) => void }> = ({ section, onSection }) => (
  <div>
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '12px 16px 0' }}>
      <div className="ui-chips" role="tablist" aria-label="Team sections">
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" className="ui-chip" aria-selected={section === s.id} aria-pressed={section === s.id} onClick={() => onSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
    {section === 'ROSTER' && <RosterDepthChartView />}
    {section === 'PRACTICE' && (
      <div className="ui-screen" style={{ maxWidth: '900px' }}>
        <h2 style={{ margin: '0 0 4px 0' }}>Practice Plan</h2>
        <PracticePlan />
      </div>
    )}
    {section === 'COLLEGE' && <CollegeRecruitingView />}
    {section === 'OFFICE' && <CoachesOfficeView />}
  </div>
);
