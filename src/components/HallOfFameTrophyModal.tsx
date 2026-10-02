import React from 'react';
import { Sheet } from './ui/Sheet';

export interface TrophyRecord {
  year: number;
  type: 'STATE_CHAMPIONSHIP' | 'DISTRICT_TITLE' | 'RIVALRY_BELL';
  name: string;
  opponent?: string;
}

interface TrophyModalProps {
  trophies: TrophyRecord[];
  alumniSigningsCount: number;
  schoolPrestige: number;
  onClose: () => void;
}

export const HallOfFameTrophyModal: React.FC<TrophyModalProps> = ({
  trophies,
  alumniSigningsCount,
  schoolPrestige,
  onClose
}) => {
  const stat = (label: string, value: number, color: string) => (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: '12px', color: '#64748B' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );

  return (
    <Sheet title="🏆 Trophy Case & Alumni" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '18px' }}>
        {stat('Prestige', schoolPrestige, '#2563EB')}
        {stat('College signees', alumniSigningsCount, '#10B981')}
        {stat('Titles', trophies.length, '#F59E0B')}
      </div>

      <h3 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Trophy showcase</h3>
      {trophies.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
          {trophies.map((t, idx) => (
            <div key={idx} style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '10px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#B45309' }}>{t.type === 'STATE_CHAMPIONSHIP' ? '👑 State Champions' : t.name}</div>
              <div style={{ fontSize: '13px', color: '#4B5563' }}>Season {t.year}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ui-muted">No trophies in the case yet. Go win some on Friday nights!</div>
      )}
    </Sheet>
  );
};
