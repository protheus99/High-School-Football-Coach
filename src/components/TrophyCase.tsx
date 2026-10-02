import React from 'react';

export interface TrophyRecord {
  year: number;
  type: 'STATE_CHAMPIONSHIP' | 'DISTRICT_TITLE' | 'RIVALRY_BELL';
  name: string;
  opponent?: string;
}

/** Trophy case (Team › Office): program prestige, college signees and the titles the program has won. */
export const TrophyCase: React.FC<{ trophies: TrophyRecord[]; collegeSignees: number; schoolPrestige: number }> = ({ trophies, collegeSignees, schoolPrestige }) => {
  const stat = (label: string, value: number, color: string) => (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: '12px', color: '#64748B' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '18px' }}>
        {stat('Prestige', schoolPrestige, '#2563EB')}
        {stat('College signees', collegeSignees, '#10B981')}
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
        <div className="ui-muted">No trophies in the case yet. District titles and state championships you win will be displayed here.</div>
      )}
    </div>
  );
};
