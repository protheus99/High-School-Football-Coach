import React from 'react';

// The referee's penalty flag, drawn so it looks the same everywhere (the 🚩 emoji is a golf pennant): a weighted
// ball on top, a knot, and the yellow cloth fanning down at an angle. Drawn on a 64 x 64 grid.

const EDGE = '#A16207';

/** The flag's shapes, for use inside another SVG (the field). */
export const PenaltyFlagShape: React.FC = () => (
  <>
    <path d="M41 22 L13 29 L5 45 Z" fill="#EAB308" stroke={EDGE} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M41 22 L7 43 L19 59 Z" fill="#FACC15" stroke={EDGE} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M42 23 L19 59 L35 56 L44 27 Z" fill="#FDE047" stroke={EDGE} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M37 19 Q41 17 44 21 Q45 25 41 27 Q37 26 37 19 Z" fill="#EAB308" stroke={EDGE} strokeWidth="1.6" />
    <circle cx="47" cy="13" r="8" fill="#FACC15" stroke={EDGE} strokeWidth="1.6" />
  </>
);

/** The penalty flag as an icon. */
export const PenaltyFlag: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className} style={{ flex: 'none', verticalAlign: 'middle' }}>
    <PenaltyFlagShape />
  </svg>
);
