import React from 'react';
import { useGameStore } from '../store/gameStore';

export const FeedersScoutingView: React.FC = () => {
  const { scoutingPool, coachingAP, spendAP } = useGameStore();

  const handleScout = (id: string) => {
    if (spendAP(20)) {
      const p = scoutingPool.find((prospect) => prospect.id === id);
      if (p) p.revealedPotential = 'A';
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>Middle School Feeder Pipeline</h2>
        <div style={{ background: '#DBEAFE', color: '#1E40AF', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold' }}>
          Available AP: {coachingAP} / 100
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {scoutingPool.map((p) => (
          <div key={p.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{p.name}</div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>{p.middleSchool} | Projected Pos: {p.projectedPosition}</div>
            <div style={{ margin: '8px 0', fontSize: '12px' }}>
              Potential: <span style={{ fontWeight: 'bold', color: '#2563EB' }}>{p.revealedPotential}</span> | Interest: {p.interestScore}%
            </div>
            <button
              onClick={() => handleScout(p.id)}
              disabled={p.revealedPotential !== 'UNKNOWN' || coachingAP < 20}
              style={{ padding: '6px 12px', background: p.revealedPotential !== 'UNKNOWN' ? '#9CA3AF' : '#2563EB', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              {p.revealedPotential !== 'UNKNOWN' ? 'Scouted' : 'Scout Prospect (20 AP)'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
