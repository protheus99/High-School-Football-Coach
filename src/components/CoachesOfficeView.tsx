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
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      {showSkillTree && <CoachRPGSkillTreeModal onClose={() => setShowSkillTree(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Head Coach Office & Strategy</h2>
        <button
          onClick={() => setShowSkillTree(true)}
          style={{ padding: '8px 16px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
        >
          🎖️ Coach Skill Tree & RPG
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setSubTab('STRATEGY')}
          style={{ padding: '6px 14px', background: subTab === 'STRATEGY' ? '#2563EB' : '#E5E7EB', color: subTab === 'STRATEGY' ? '#fff' : '#374151', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Strategy & Staff
        </button>
        <button
          onClick={() => setSubTab('SCHEDULE')}
          style={{ padding: '6px 14px', background: subTab === 'SCHEDULE' ? '#2563EB' : '#E5E7EB', color: subTab === 'SCHEDULE' ? '#fff' : '#374151', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Season Schedule & Film
        </button>
      </div>

      {subTab === 'SCHEDULE' ? (
        <ScheduleView />
      ) : (
        <>
          {/* Practice Plan Settings */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Weekly Practice Intensity</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['WALKTHROUGH', 'STANDARD', 'CONTACT'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPracticeIntensity(mode)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: practiceIntensity === mode ? '#2563EB' : '#fff',
                    color: practiceIntensity === mode ? '#fff' : '#374151',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px' }}>
              {practiceIntensity === 'WALKTHROUGH' && 'Walkthrough: +15% Stamina Recovery, +3 Football IQ, 0% Injury Risk.'}
              {practiceIntensity === 'STANDARD' && 'Standard: Balanced development reps, baseline fatigue.'}
              {practiceIntensity === 'CONTACT' && 'Full Pads Contact: +15% Physical Progression, -10% Stamina, 3% Injury Risk.'}
            </p>
          </div>

          {/* Assistant Coaching Staff */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Coaching Staff</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '13px' }}>
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
