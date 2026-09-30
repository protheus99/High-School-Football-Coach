import React, { useState } from 'react';

export interface CoachTalent {
  id: string;
  branch: 'TACTICIAN' | 'MOTIVATOR' | 'DEVELOPER' | 'POLITICIAN';
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
}

export const CoachRPGSkillTreeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [skillPoints, setSkillPoints] = useState(3);
  const [talents, setTalents] = useState<CoachTalent[]>([
    { id: 't1', branch: 'TACTICIAN', name: '4th Down Aggression', description: '+8% conversion rate on 4th & short plays.', cost: 1, unlocked: true },
    { id: 't2', branch: 'TACTICIAN', name: 'Cover-Zero Blitzing', description: 'Increases opponent sack rate by +15%.', cost: 2, unlocked: false },
    { id: 'm1', branch: 'MOTIVATOR', name: 'Halftime Rally Speech', description: '+10 team composure when trailing by 7+ at half.', cost: 1, unlocked: false },
    { id: 'm2', branch: 'MOTIVATOR', name: 'Senior Leadership Boost', description: 'Starting seniors radiate +5 discipline to freshmen.', cost: 2, unlocked: false },
    { id: 'd1', branch: 'DEVELOPER', name: 'Weight Room Fanatic', description: '+20% underclassman off-season strength growth.', cost: 1, unlocked: false },
    { id: 'd2', branch: 'DEVELOPER', name: 'QB Whispering', description: 'Freshmen QBs start with +10 Football IQ.', cost: 2, unlocked: false },
    { id: 'p1', branch: 'POLITICIAN', name: 'Board Room Shield', description: '+15 permanent buffer to School Board Trust.', cost: 1, unlocked: true },
    { id: 'p2', branch: 'POLITICIAN', name: 'Booster Breakfasts', description: '+10% extra equipment and perk funding.', cost: 2, unlocked: false }
  ]);

  const handleUnlock = (talent: CoachTalent) => {
    if (skillPoints >= talent.cost && !talent.unlocked) {
      setSkillPoints(skillPoints - talent.cost);
      setTalents(talents.map((t) => (t.id === talent.id ? { ...t, unlocked: true } : t)));
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0 }}>🎖️ HEAD COACH TALENT TREE</h2>
            <div style={{ fontSize: '13px', color: '#64748B' }}>Available Skill Points: <strong style={{ color: '#2563EB' }}>{skillPoints}</strong></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* 4-Branch Talent Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {(['TACTICIAN', 'MOTIVATOR', 'DEVELOPER', 'POLITICIAN'] as const).map((branch) => (
            <div key={branch} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#1E293B', fontSize: '13px' }}>{branch} BRANCH</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {talents.filter((t) => t.branch === branch).map((t) => (
                  <div key={t.id} style={{ background: t.unlocked ? '#F0FDF4' : '#fff', border: t.unlocked ? '1px solid #86EFAC' : '1px solid #CBD5E1', borderRadius: '6px', padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '12px' }}>{t.name}</strong>
                      {t.unlocked ? (
                        <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 'bold' }}>✓ Unlocked</span>
                      ) : (
                        <button
                          onClick={() => handleUnlock(t)}
                          disabled={skillPoints < t.cost}
                          style={{ padding: '3px 8px', background: skillPoints >= t.cost ? '#2563EB' : '#94A3B8', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                        >
                          Unlock ({t.cost} SP)
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>{t.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15, 23, 42, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1250
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '680px',
  maxHeight: '85vh',
  overflowY: 'auto'
};
