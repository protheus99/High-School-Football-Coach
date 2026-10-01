/**
 * Generates normally distributed variance using the standard Box-Muller transform.
 * @param mean Target mean (default 0)
 * @param stdev Standard deviation (default 12 for high school variance)
 */
export function calculateGaussianVariance(mean = 0, stdev = 12): number {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdev + mean;
}

/**
 * Clamps a numerical value within bounds.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Random integer within inclusive range [min, max].
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
