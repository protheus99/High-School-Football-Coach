import React, { useState } from 'react';
import { Sheet } from './ui/Sheet';
import { useGameStore } from '../store/gameStore';
import { COACH_TALENTS, TALENT_BRANCH_LABELS, TalentBranch, cpCap, talentBlocker } from '../sim/coachPoints';

/** Coach talents: permanent upgrades bought with Coach Points. */
export const CoachRPGSkillTreeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { coachPoints, coachTalents, unlockTalent } = useGameStore();
  const [flash, setFlash] = useState<string | null>(null);

  const handleUnlock = (id: (typeof COACH_TALENTS)[number]['id'], name: string) => {
    const blocker = unlockTalent(id);
    setFlash(blocker ?? `${name} unlocked!`);
  };

  return (
    <Sheet
      title="🎖️ Coach Talents"
      subtitle={
        <>
          Coach Points: <strong style={{ color: '#2563EB' }}>{coachPoints}</strong> / {cpCap(coachTalents)}
        </>
      }
      onClose={onClose}
    >
      <p className="ui-muted" style={{ margin: '0 0 12px 0', fontSize: '13px' }}>
        Talents are permanent. Unlock the first talent in a branch to open the second.
      </p>
      {flash && (
        <div role="status" style={{ background: '#EEF2FF', color: '#3730A3', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
          {flash}
        </div>
      )}
      {/* One branch per row on phones; two columns on wider screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        {(Object.keys(TALENT_BRANCH_LABELS) as TalentBranch[]).map((branch) => (
          <div key={branch} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#1E293B', fontSize: '14px' }}>{TALENT_BRANCH_LABELS[branch]}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {COACH_TALENTS.filter((t) => t.branch === branch).map((t) => {
                const unlocked = coachTalents.includes(t.id);
                const blocker = talentBlocker(t.id, coachTalents, coachPoints);
                return (
                  <div
                    key={t.id}
                    style={{ background: unlocked ? '#F0FDF4' : '#fff', border: unlocked ? '1px solid #86EFAC' : '1px solid #CBD5E1', borderRadius: '8px', padding: '10px' }}
                  >
                    <strong style={{ fontSize: '14px' }}>{t.name}</strong>
                    <div style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 8px' }}>{t.description}</div>
                    {unlocked ? (
                      <span style={{ fontSize: '13px', color: '#16A34A', fontWeight: 'bold' }}>✓ Unlocked</span>
                    ) : (
                      <>
                        <button className="ui-btn ui-btn-primary" onClick={() => handleUnlock(t.id, t.name)} disabled={!!blocker}>
                          Unlock (₡{t.cost})
                        </button>
                        {blocker && <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>{blocker}</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
};
