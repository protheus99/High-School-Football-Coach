import React from 'react';

// Title marks, the same on every phone and computer (Windows draws no flag emoji): a state pennant for a state
// title and a small drawn US flag for a national title.

const ABBREVIATIONS: Record<string, string> = {
  Texas: 'TX',
  California: 'CA',
  Georgia: 'GA',
  Ohio: 'OH',
  Alabama: 'AL',
  Florida: 'FL',
  Pennsylvania: 'PA',
  'North Carolina': 'NC',
  Tennessee: 'TN',
  Louisiana: 'LA',
  Maryland: 'MD',
  'New Jersey': 'NJ'
};
const stateAbbreviation = (state: string) => ABBREVIATIONS[state] ?? state.slice(0, 2).toUpperCase();

const STATE_COLORS: Record<string, [string, string]> = {
  Texas: ['#BF0A30', '#fff'],
  California: ['#C8102E', '#fff'],
  Georgia: ['#002868', '#fff'],
  Ohio: ['#BB133E', '#fff'],
  Alabama: ['#9E1B32', '#fff'],
  Florida: ['#E35205', '#fff'],
  Pennsylvania: ['#002D72', '#FFD100'],
  'North Carolina': ['#002868', '#fff'],
  Tennessee: ['#CC0000', '#fff'],
  Louisiana: ['#003DA5', '#FFD700'],
  Maryland: ['#E8B10C', '#000'],
  'New Jersey': ['#E1C16E', '#00205B']
};

/** A small pennant in the state's colors with its abbreviation ("TX"). */
export const StatePennant: React.FC<{ state: string }> = ({ state }) => {
  const [bg, fg] = STATE_COLORS[state] ?? ['#334155', '#fff'];
  return (
    <span
      aria-label={`${state} state title`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '16px',
        padding: '0 10px 0 4px',
        fontSize: '9.5px',
        fontWeight: 900,
        letterSpacing: '0.04em',
        clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
        background: bg,
        color: fg,
        lineHeight: 1
      }}
    >
      {stateAbbreviation(state)}
    </span>
  );
};

/** A tiny US flag (13 stripes and the blue field), drawn so it looks the same everywhere. */
export const UsFlag: React.FC<{ width?: number }> = ({ width = 19 }) => (
  <svg width={width} height={(width * 13) / 19} viewBox="0 0 19 13" role="img" aria-label="National title" style={{ display: 'inline-block', borderRadius: '1px', boxShadow: '0 0 0 1px rgba(15,23,42,.15)' }}>
    {Array.from({ length: 13 }, (_, i) => (
      <rect key={i} y={i} width="19" height="1" fill={i % 2 ? '#fff' : '#B22234'} />
    ))}
    <rect width="8" height="7" fill="#3C3B6E" />
    <g fill="#fff">
      {[1.2, 3.2, 5.2].flatMap((y) => [1.3, 3.3, 5.3, 7].map((x) => <circle key={`${x}_${y}`} cx={x} cy={y} r="0.45" />))}
    </g>
  </svg>
);
