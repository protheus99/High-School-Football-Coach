import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { CoachRPGSkillTreeModal } from './CoachRPGSkillTreeModal';
import { ScheduleView } from './ScheduleView';

export const CoachesOfficeView: React.FC = () => {
  const { districtTeams, userTeamId, practiceIntensity, setPracticeIntensity } = useGameStore();
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [subTab, setSubTab] = useState<'STRATEGY' | 'SCHEDULE'>('STRATEGY');
  const userTeam = districtTeams.find((t) => t.id === userTeamId);

  if (!userTeam) return null;

  return (
    <div className="ui-screen" style={{ maxWidth: '900px' }}>
      {showSkillTree && <CoachRPGSkillTreeModal onClose={() => setShowSkillTree(false)} />}

      <h2 style={{ margin: '0 0 10px 0' }}>Coach&apos;s Office</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <button className={`ui-btn${subTab === 'STRATEGY' ? ' ui-btn-primary' : ''}`} aria-pressed={subTab === 'STRATEGY'} onClick={() => setSubTab('STRATEGY')}>
          Strategy &amp; Staff
        </button>
        <button className={`ui-btn${subTab === 'SCHEDULE' ? ' ui-btn-primary' : ''}`} aria-pressed={subTab === 'SCHEDULE'} onClick={() => setSubTab('SCHEDULE')}>
          Schedule
        </button>
      </div>
      <button className="ui-btn ui-btn-block" style={{ background: '#4F46E5', borderColor: '#4F46E5', color: '#fff', marginBottom: '16px' }} onClick={() => setShowSkillTree(true)}>
        🎖️ Coach Skill Tree
      </button>

      {subTab === 'SCHEDULE' ? (
        <ScheduleView />
      ) : (
        <>
          {/* Practice Plan Settings */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Weekly Practice Intensity</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
              {(['WALKTHROUGH', 'STANDARD', 'CONTACT'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`ui-btn${practiceIntensity === mode ? ' ui-btn-primary' : ''}`}
                  aria-pressed={practiceIntensity === mode}
                  onClick={() => setPracticeIntensity(mode)}
                  style={{ paddingLeft: '4px', paddingRight: '4px' }}
                >
                  {mode === 'WALKTHROUGH' ? 'Walkthrough' : mode === 'STANDARD' ? 'Standard' : 'Contact'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '8px' }}>
              {practiceIntensity === 'WALKTHROUGH' && 'Walkthrough: +15% Stamina Recovery, +3 Football IQ, 0% Injury Risk.'}
              {practiceIntensity === 'STANDARD' && 'Standard: Balanced development reps, baseline fatigue.'}
              {practiceIntensity === 'CONTACT' && 'Full Pads Contact: +15% Physical Progression, -10% Stamina, 3% Injury Risk.'}
            </p>
          </div>

          {/* Assistant Coaching Staff */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Coaching Staff</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', fontSize: '13px' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{userTeam.staff.offensiveCoordinator.name}</div>
                <div style={{ color: '#6B7280' }}>Offensive Coordinator</div>
                <div>Play Calling: {userTeam.staff.offensiveCoordinator.playCalling}</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold' }}>{userTeam.staff.defensiveCoordinator.name}</div>
                <div style={{ color: '#6B7280' }}>Defensive Coordinator</div>
                <div>Tackling Tech: {userTeam.staff.defensiveCoordinator.tacklingTech}</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold' }}>{userTeam.staff.strengthCoach.name}</div>
                <div style={{ color: '#6B7280' }}>Strength & Conditioning</div>
                <div>Conditioning: {userTeam.staff.strengthCoach.conditioningRating}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
