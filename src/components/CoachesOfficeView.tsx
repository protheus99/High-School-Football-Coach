import React, { useState } from 'react';
import { TrophyCase } from './TrophyCase';
import { useGameStore } from '../store/gameStore';
import { CoachRPGSkillTreeModal } from './CoachRPGSkillTreeModal';
import { ScheduleView } from './ScheduleView';

export const CoachesOfficeView: React.FC = () => {
  const { districtTeams, userTeamId } = useGameStore();
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [subTab, setSubTab] = useState<'STRATEGY' | 'SCHEDULE' | 'TROPHIES'>('STRATEGY');
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (!userTeam) return null;

  return (
    <div className="ui-screen" style={{ maxWidth: '900px' }}>
      {showSkillTree && <CoachRPGSkillTreeModal onClose={() => setShowSkillTree(false)} />}

      <div className="ui-chips" aria-label="Office view" style={{ marginBottom: '8px' }}>
        <button className="ui-chip" aria-pressed={subTab === 'STRATEGY'} onClick={() => setSubTab('STRATEGY')}>
          Strategy
        </button>
        <button className="ui-chip" aria-pressed={subTab === 'SCHEDULE'} onClick={() => setSubTab('SCHEDULE')}>
          Schedule
        </button>
        <button className="ui-chip" aria-pressed={subTab === 'TROPHIES'} onClick={() => setSubTab('TROPHIES')}>
          🏆 Trophies
        </button>
      </div>
      <button className="ui-btn ui-btn-block" style={{ background: '#4F46E5', borderColor: '#4F46E5', color: '#fff', marginBottom: '16px' }} onClick={() => setShowSkillTree(true)}>
        🎖️ Coach Talents (spend ₡)
      </button>

      {subTab === 'TROPHIES' ? (
        <TrophyCase
          trophies={[]}
          collegeSignees={userTeam.roster.filter((p) => p.recruiting.isNationalLetterOfIntentSigned).length}
          schoolPrestige={userTeam.prestige}
        />
      ) : subTab === 'SCHEDULE' ? (
        <ScheduleView />
      ) : (
        <>
          <p className="ui-muted" style={{ margin: 0, fontSize: '13px' }}>
            Your assistant coaches are on the Staff tab.
          </p>
        </>
      )}
    </div>
  );
};
