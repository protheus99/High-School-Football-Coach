import React from 'react';

interface FieldVisualizerProps {
  yardLine: number; // 1 to 99 relative to offensive goal line
  down: number;
  distance: number;
  possessionTeamName: string;
  possessionColor: string;
}

export const FieldVisualizer: React.FC<FieldVisualizerProps> = ({
  yardLine,
  down,
  distance,
  possessionTeamName,
  possessionColor
}) => {
  // SVG coordinates: 0 to 120 (10 yd end zones on each side)
  // Field runs from x = 10 (Own 0-yd line) to x = 110 (Opponent Goal Line)
  const ballX = 10 + yardLine;
  const lineToGainX = Math.min(110, ballX + distance);

  return (
    <div style={{ background: '#1B4D3E', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '2px solid #2E7D32' }}>
      <svg viewBox="0 0 120 40" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Field Grass Background */}
        <rect x="0" y="0" width="120" height="40" fill="#2E7D32" />

        {/* End Zones */}
        <rect x="0" y="0" width="10" height="40" fill="#1B5E20" />
        <rect x="110" y="0" width="10" height="40" fill="#1B5E20" />

        {/* Yard Lines (every 10 yards) */}
        {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="40" stroke="#FFFFFF" strokeWidth="0.4" strokeOpacity="0.6" />
        ))}

        {/* 50-Yard Line Marker */}
        <line x1="60" y1="0" x2="60" y2="40" stroke="#FFFFFF" strokeWidth="0.8" />

        {/* Yard Number Markings */}
        <text x="30" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.6">20</text>
        <text x="40" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.6">30</text>
        <text x="50" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.6">40</text>
        <text x="60" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.8" fontWeight="bold">50</text>
        <text x="70" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.6">40</text>
        <text x="80" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.6">30</text>
        <text x="90" y="8" fill="#FFFFFF" fontSize="3" textAnchor="middle" opacity="0.6">20</text>

        {/* Line to Gain (Yellow Line) */}
        <line x1={lineToGainX} y1="0" x2={lineToGainX} y2="40" stroke="#FACC15" strokeWidth="1.2" strokeDasharray="1 0.5" />

        {/* Line of Scrimmage (Blue Line) */}
        <line x1={ballX} y1="0" x2={ballX} y2="40" stroke="#60A5FA" strokeWidth="1.2" />

        {/* Football Marker (Brown Ellipse) */}
        <ellipse cx={ballX} cy="20" rx="2" ry="1.2" fill="#78350F" stroke="#FFFFFF" strokeWidth="0.3" />

        {/* Drive Direction Arrow */}
        <polygon
          points={`${ballX + 3},20 ${ballX + 1},18.5 ${ballX + 1},21.5`}
          fill={possessionColor || '#F59E0B'}
        />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#E2E8F0', fontSize: '11px', marginTop: '6px' }}>
        <span><strong>Possession:</strong> <span style={{ color: possessionColor || '#60A5FA' }}>{possessionTeamName}</span></span>
        <span><strong>Ball On:</strong> {yardLine > 50 ? `Opp ${100 - yardLine}` : `Own ${yardLine}`} | <strong>{down}{down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'} & {distance}</strong></span>
      </div>
    </div>
  );
};
