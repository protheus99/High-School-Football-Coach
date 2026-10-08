import React from 'react';
import { luminance } from '../utils/color';

interface FieldVisualizerProps {
  yardLine: number; // 1 to 99 relative to offensive goal line
  distance: number;
  possessionColor: string;
  caption?: React.ReactNode;
  /** Home team drives right to left, the visitors left to right. */
  possessionIsHome: boolean;
  homeTeamName: string;
  homeColor: string;
  homeSecondaryColor?: string;
}

export const FieldVisualizer: React.FC<FieldVisualizerProps> = ({
  yardLine,
  distance,
  possessionColor,
  caption,
  possessionIsHome,
  homeTeamName,
  homeColor,
  homeSecondaryColor
}) => {
  // SVG coordinates: 0 to 120 (10-yard end zones on each side, goal lines at x = 10 and x = 110).
  // yardLine is measured from the offense's own goal line: the visitors' own goal is on the left,
  // the home team's own goal is on the right, so the home team attacks right to left.
  const dir = possessionIsHome ? -1 : 1;
  const ownGoalX = possessionIsHome ? 110 : 10;
  const ballX = ownGoalX + dir * yardLine;
  const lineToGainX = Math.max(10, Math.min(110, ballX + dir * distance));

  // End zones painted in the home team's color with the name in whichever text color reads best
  const endZoneFill = homeColor || '#1B5E20';
  const fillLum = luminance(endZoneFill) ?? 0;
  const secondaryLum = homeSecondaryColor ? luminance(homeSecondaryColor) : undefined;
  // Lettering in the school's second color when it stands out, otherwise white or dark text
  const endZoneText =
    homeSecondaryColor && secondaryLum !== undefined && Math.abs(secondaryLum - fillLum) > 0.4 ? homeSecondaryColor : fillLum > 0.45 ? '#0F172A' : '#FFFFFF';
  const endZoneLabel = homeTeamName.toUpperCase();

  return (
    <div style={{ background: '#1B4D3E', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '2px solid #2E7D32' }}>
      <svg viewBox="0 0 120 40" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Field Grass Background */}
        <rect x="0" y="0" width="120" height="40" fill="#2E7D32" />

        {/* End Zones: home colors with the home team's name running vertically */}
        <rect x="0" y="0" width="10" height="40" fill={endZoneFill} />
        <rect x="110" y="0" width="10" height="40" fill={endZoneFill} />
        <text
          transform="translate(5.9 20) rotate(-90)"
          fill={endZoneText}
          fontSize="4"
          fontWeight="bold"
          textAnchor="middle"
          textLength={Math.min(36, endZoneLabel.length * 2.6)}
          lengthAdjust="spacingAndGlyphs"
        >
          {endZoneLabel}
        </text>
        <text
          transform="translate(114.1 20) rotate(90)"
          fill={endZoneText}
          fontSize="4"
          fontWeight="bold"
          textAnchor="middle"
          textLength={Math.min(36, endZoneLabel.length * 2.6)}
          lengthAdjust="spacingAndGlyphs"
        >
          {endZoneLabel}
        </text>

        {/* Yard lines: every 5 yards, the 10s brighter */}
        {Array.from({ length: 19 }, (_, i) => 15 + i * 5).map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="40" stroke="#FFFFFF" strokeWidth={x % 10 === 0 ? 0.4 : 0.25} strokeOpacity={x % 10 === 0 ? 0.6 : 0.4} />
        ))}

        {/* 50-Yard Line Marker */}
        <line x1="60" y1="0" x2="60" y2="40" stroke="#FFFFFF" strokeWidth="0.8" />

        {/* Hash marks every yard: along both sidelines and the two inbounds rows (the field in thirds, like high school) */}
        {Array.from({ length: 99 }, (_, i) => 11 + i)
          .filter((x) => x % 5 !== 0)
          .map((x) => (
            <g key={`hash${x}`} stroke="#FFFFFF" strokeWidth="0.25" strokeOpacity="0.75">
              <line x1={x} y1="0.3" x2={x} y2="1.3" />
              <line x1={x} y1="12.8" x2={x} y2="13.8" />
              <line x1={x} y1="26.2" x2={x} y2="27.2" />
              <line x1={x} y1="38.7" x2={x} y2="39.7" />
            </g>
          ))}

        {/* Yard numbers on both sides of the field: 10 through 50 and back */}
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((yard, i) =>
          [8, 35].map((y) => (
            <text key={`${i}-${y}`} x={20 + i * 10} y={y} fill="#FFFFFF" fontSize="4" textAnchor="middle" fontWeight={yard === 50 ? 'bold' : undefined} opacity={yard === 50 ? 1 : 0.9}>
              {yard}
            </text>
          ))
        )}

        {/* Line to Gain (Yellow Line) */}
        <line x1={lineToGainX} y1="0" x2={lineToGainX} y2="40" stroke="#FACC15" strokeWidth="1.2" strokeDasharray="1 0.5" />

        {/* Line of Scrimmage (Blue Line) */}
        <line x1={ballX} y1="0" x2={ballX} y2="40" stroke="#60A5FA" strokeWidth="1.2" />

        {/* Football Marker (Brown Ellipse) */}
        <ellipse cx={ballX} cy="20" rx="2" ry="1.2" fill="#78350F" stroke="#FFFFFF" strokeWidth="0.3" />

        {/* Drive Direction Arrow */}
        <polygon
          points={`${ballX + dir * 3},20 ${ballX + dir * 1},18.5 ${ballX + dir * 1},21.5`}
          fill={possessionColor || '#F59E0B'}
        />
      </svg>

      {/* Message strip under the field: the latest play, or a flashing banner for big moments */}
      {caption && <div style={{ marginTop: '8px' }}>{caption}</div>}
    </div>
  );
};
