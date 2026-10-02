import React, { useState } from 'react';
import { Sheet } from './ui/Sheet';

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
    <Sheet title="🎖️ Head Coach Talent Tree" subtitle={<>Skill points available: <strong style={{ color: '#2563EB' }}>{skillPoints}</strong></>} onClose={onClose}>
      {/* One branch per row on phones; two columns on wider screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        {(['TACTICIAN', 'MOTIVATOR', 'DEVELOPER', 'POLITICIAN'] as const).map((branch) => (
          <div key={branch} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#1E293B', fontSize: '14px' }}>{branch.charAt(0) + branch.slice(1).toLowerCase()} branch</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {talents
                .filter((t) => t.branch === branch)
                .map((t) => (
                  <div
                    key={t.id}
                    style={{ background: t.unlocked ? '#F0FDF4' : '#fff', border: t.unlocked ? '1px solid #86EFAC' : '1px solid #CBD5E1', borderRadius: '8px', padding: '10px' }}
                  >
                    <strong style={{ fontSize: '14px' }}>{t.name}</strong>
                    <div style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 8px' }}>{t.description}</div>
                    {t.unlocked ? (
                      <span style={{ fontSize: '13px', color: '#16A34A', fontWeight: 'bold' }}>✓ Unlocked</span>
                    ) : (
                      <button className="ui-btn ui-btn-primary" onClick={() => handleUnlock(t)} disabled={skillPoints < t.cost}>
                        Unlock ({t.cost} SP)
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
};
