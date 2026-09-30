import React from 'react';

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
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>🏆 SCHOOL TROPHY CASE & ALUMNI</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Program Legacy Snapshot */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#64748B' }}>School Prestige</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563EB' }}>{schoolPrestige}</div>
          </div>
          <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#64748B' }}>College Signees</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>{alumniSigningsCount}</div>
          </div>
          <div style={{ flex: 1, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#64748B' }}>Total Titles</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>{trophies.length}</div>
          </div>
        </div>

        {/* Hardware Showcase */}
        <h4 style={{ margin: '0 0 10px 0' }}>Trophy Showcase</h4>
        {trophies.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {trophies.map((t, idx) => (
              <div key={idx} style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#B45309' }}>
                  {t.type === 'STATE_CHAMPIONSHIP' ? '👑 STATE CHAMPIONS' : t.name}
                </div>
                <div style={{ fontSize: '12px', color: '#4B5563' }}>Season {t.year}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#94A3B8', fontSize: '13px' }}>No trophies in case yet. Compete on Friday nights!</div>
        )}
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
  zIndex: 1150
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '90%',
  maxWidth: '560px'
};
