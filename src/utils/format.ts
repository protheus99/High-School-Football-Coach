/** A 0-100 value as a whole percentage ("90%"): fatigue and stamina are stored with decimals. */
export const formatPercent = (value: number) => `${Math.round(value)}%`;

/** 1st, 2nd, 3rd, 4th, 11th, 21st... */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const STATE_ABBREVIATIONS: Record<string, string> = {
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

/** "TX" for Texas. */
export const stateAbbreviation = (state: string) => STATE_ABBREVIATIONS[state] ?? state.slice(0, 2).toUpperCase();

/** The school and its state, "Miami Northwestern (FL)"; a name with its own brackets reads "Catholic, Baton Rouge (LA)". */
export const schoolWithState = (program: string, state: string) => `${program.replace(/\s*\(([^)]*)\)\s*$/, ', $1')} (${stateAbbreviation(state)})`;
