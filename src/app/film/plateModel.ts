/** Ideal, homogeneous, isotropic Kirchhoff–Love plate. SI units throughout. */
export const PLATE = { a: 0.24, b: 0.18, h: 0.0016, E: 68.9e9, rho: 2700, nu: 0.33 } as const;

/** Simply supported plate eigenfrequency, Hz. m and n are positive integers. */
export function idealFrequency(m: number, n: number): number {
  const { a, b, h, E, rho, nu } = PLATE;
  const D = E * h ** 3 / (12 * (1 - nu ** 2));
  return Math.PI / 2 * Math.sqrt(D / (rho * h)) * ((m / a) ** 2 + (n / b) ** 2);
}

/** Normalized displacement for an ideal simply supported rectangular mode. */
export function modeAmplitude(u: number, v: number, m: number, n: number): number {
  return Math.sin(m * Math.PI * u) * Math.sin(n * Math.PI * v);
}
