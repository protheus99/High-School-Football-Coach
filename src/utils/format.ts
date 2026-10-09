/** A 0-100 value as a whole percentage ("90%"): fatigue and stamina are stored with decimals. */
export const formatPercent = (value: number) => `${Math.round(value)}%`;
