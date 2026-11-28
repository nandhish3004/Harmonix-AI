export interface MaterialData {
  id: string;
  name: string;
  code: string;
  category: string;
  youngsModulusGpa: number;
  densityKgM3: number;
  poissonRatio: number;
  acousticSpeedMs: number;
  yieldStrengthMpa?: number;
  lossFactorEta?: number;
  fatigueStrengthCoeffMpa?: number;
  fatigueExponentB?: number;
}

export const MATERIAL_CONSTANTS: Record<
  string,
  {
    yieldStrengthMpa: number;
    lossFactorEta: number;
    fatigueStrengthCoeffMpa: number;
    fatigueExponentB: number;
  }
> = {
  fr4: {
    yieldStrengthMpa: 276.0,
    lossFactorEta: 0.015,
    fatigueStrengthCoeffMpa: 380.0,
    fatigueExponentB: -0.095,
  },
  al6061: {
    yieldStrengthMpa: 276.0,
    lossFactorEta: 0.0025,
    fatigueStrengthCoeffMpa: 450.0,
    fatigueExponentB: -0.095,
  },
  steel: {
    yieldStrengthMpa: 370.0,
    lossFactorEta: 0.0018,
    fatigueStrengthCoeffMpa: 620.0,
    fatigueExponentB: -0.095,
  },
  acrylic: {
    yieldStrengthMpa: 72.0,
    lossFactorEta: 0.038,
    fatigueStrengthCoeffMpa: 110.0,
    fatigueExponentB: -0.105,
  },
};

export const MATERIAL_YIELD_MPA: Record<string, number> = {
  fr4: 276.0,
  al6061: 276.0,
  steel: 370.0,
  acrylic: 72.0,
};

export const DEFAULT_MATERIAL: MaterialData = {
  id: "fr4",
  name: "FR4 Glass Epoxy",
  code: "PCB-FR4-STD",
  category: "CIRCUIT SUBSTRATE",
  youngsModulusGpa: 24.0,
  densityKgM3: 1850,
  poissonRatio: 0.12,
  acousticSpeedMs: 3600,
  ...MATERIAL_CONSTANTS.fr4,
};

export interface ModePair {
  m: number;
  n: number;
  label: string;
  eigenFreqHz: number;
  qFactor: number;
  resonanceGain: number;
}

export interface ComputedHarmonicMode {
  id: string;
  name: string;
  indices: string;
  m: number;
  n: number;
  freqHz: number;
  qFactor: number;
  type: string;
  svgPath: string;
  isPeakResonance?: boolean;
}

export interface StandoffPin {
  id?: string;
  x: number;
  y: number;
}

export interface Point2D {
  x: number;
  y: number;
}

const CANONICAL_MODES: Omit<ComputedHarmonicMode, "freqHz" | "qFactor">[] = [
  {
    id: "mode-1-1",
    name: "Fundamental Mode",
    indices: "(1, 1)",
    m: 1,
    n: 1,
    type: "DIAGONAL SYMMETRY",
    svgPath: "M 20 20 L 80 80 M 80 20 L 20 80",
  },
  {
    id: "mode-2-0",
    name: "Saddle Torsion",
    indices: "(2, 0)",
    m: 2,
    n: 0,
    type: "HYPERBOLIC",
    svgPath: "M 50 10 L 50 90 M 10 50 L 90 50",
  },
  {
    id: "mode-2-2",
    name: "Radial Cross",
    indices: "(2, 2)",
    m: 2,
    n: 2,
    type: "RESONANT HARMONIC",
    svgPath: "M 20 50 Q 50 20 80 50 Q 50 80 20 50 M 50 20 Q 20 50 50 80 Q 80 50 50 20",
    isPeakResonance: true,
  },
  {
    id: "mode-3-1",
    name: "Clover Leaf",
    indices: "(3, 1)",
    m: 3,
    n: 1,
    type: "COMPLEX MULTI-NODE",
    svgPath: "M 30 10 L 30 90 M 70 10 L 70 90 M 10 50 L 90 50",
  },
  {
    id: "mode-3-3",
    name: "Starburst Matrix",
    indices: "(3, 3)",
    m: 3,
    n: 3,
    type: "HIGH FREQUENCY",
    svgPath: "M 25 25 L 75 75 M 75 25 L 25 75 M 50 15 L 50 85 M 15 50 L 85 50",
  },
  {
    id: "mode-4-2",
    name: "Higher Harmonic",
    indices: "(4, 2)",
    m: 4,
    n: 2,
    type: "MODAL OVERTONE",
    svgPath: "M 20 10 L 20 90 M 40 10 L 40 90 M 60 10 L 60 90 M 80 10 L 80 90",
  },
];

/**
 * Kirchhoff-Love Flexural Plate Rigidity:
 * D = E * h^3 / (12 * (1 - nu^2)) [N*m]
 */
export function computeFlexuralRigidity(
  youngsModulusGpa: number,
  thicknessMm: number,
  poissonRatio: number
): number {
  const E = Math.max(0.1, youngsModulusGpa) * 1e9;
  const h = Math.max(0.1, thicknessMm) * 1e-3;
  const nu = Math.min(0.49, Math.max(0, poissonRatio));
  return (E * h * h * h) / (12 * (1 - nu * nu));
}

/**
 * Derive physical plate dimensions a, b (meters) from area (mm^2) & aspect ratio.
 */
export function computePlateDimensionsMeters(
  areaMm2: number = 14250,
  aspectRatio: number = 1.2
): { a: number; b: number; areaM2: number } {
  const safeAreaM2 = Math.max(400, areaMm2) * 1e-6;
  const safeAr = Math.min(4.0, Math.max(0.25, aspectRatio));
  const a = Math.sqrt(safeAreaM2 * safeAr);
  const b = Math.sqrt(safeAreaM2 / safeAr);
  return { a, b, areaM2: safeAreaM2 };
}

/**
 * Kirchhoff-Love Thin Plate Eigenfrequency dispersion relation:
 * f_{m,n} = (pi / 2) * sqrt(D / (rho * h)) * ((m/a)^2 + (n/b)^2) * sqrt(1 + 0.14 * standoffs)
 */
export function computeEigenfrequencyHz(
  m: number,
  n: number,
  material: MaterialData,
  thicknessMm: number,
  areaMm2: number = 14250,
  aspectRatio: number = 1.2,
  standoffCount: number = 0
): number {
  const D = computeFlexuralRigidity(
    material.youngsModulusGpa,
    thicknessMm,
    material.poissonRatio
  );
  const h = Math.max(0.1, thicknessMm) * 1e-3;
  const rho = Math.max(100, material.densityKgM3);
  const { a, b } = computePlateDimensionsMeters(areaMm2, aspectRatio);

  const waveNumberSq = Math.pow(m / a, 2) + Math.pow(n / b, 2);
  const stiffeningFactor = Math.sqrt(1 + 0.14 * Math.max(0, standoffCount));
  const rawFreq = (Math.PI / 2) * Math.sqrt(D / (rho * h)) * waveNumberSq * stiffeningFactor;

  return Math.round(Math.max(80, Math.min(40000, rawFreq)));
}

/**
 * Compute all 6 canonical eigenmodes dynamically for the plate geometry & material.
 */
export function computeAllModes(
  material: MaterialData,
  thicknessMm: number,
  areaMm2: number = 14250,
  aspectRatio: number = 1.2,
  standoffCount: number = 0
): ComputedHarmonicMode[] {
  const eta =
    material.lossFactorEta ?? MATERIAL_CONSTANTS[material.id]?.lossFactorEta ?? 0.015;

  return CANONICAL_MODES.map((mode) => {
    const freqHz = computeEigenfrequencyHz(
      mode.m,
      mode.n,
      material,
      thicknessMm,
      areaMm2,
      aspectRatio,
      standoffCount
    );
    const qFactor = Math.max(
      12,
      Math.round(1 / (eta * (1 + 0.04 * (mode.m + mode.n))))
    );
    return {
      ...mode,
      freqHz,
      qFactor,
    };
  });
}

/**
 * Lorentzian Single-DOF Modal Amplification Factor:
 * H(f) = 1 / sqrt((1 - r^2)^2 + (r / Q)^2), r = f / f_{m,n}
 */
export function computeLorentzianGain(
  freqHz: number,
  eigenFreqHz: number,
  qFactor: number
): number {
  const r = freqHz / Math.max(1, eigenFreqHz);
  const q = Math.max(5, qFactor);
  const denom = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
  return 1 / Math.max(1 / q, denom);
}

/**
 * Map an excitation frequency to the nearest Kirchhoff-Love mode and Lorentzian resonance gain.
 */
export function frequencyToMode(
  freqHz: number,
  materialOrSpeed: MaterialData | number = DEFAULT_MATERIAL,
  thicknessMm: number = 1.6,
  areaMm2: number = 14250,
  aspectRatio: number = 1.2
): ModePair {
  const material: MaterialData =
    typeof materialOrSpeed === "number"
      ? { ...DEFAULT_MATERIAL, acousticSpeedMs: materialOrSpeed }
      : materialOrSpeed;

  const modes = computeAllModes(material, thicknessMm, areaMm2, aspectRatio, 0);

  let closest = modes[0];
  let bestDist = Infinity;
  for (const mode of modes) {
    const dist = Math.abs(freqHz - mode.freqHz);
    if (dist < bestDist) {
      bestDist = dist;
      closest = mode;
    }
  }

  // Cap effective Q for visual dynamic range so resonances stand out cleanly without Infinity
  const visualQ = Math.min(24, closest.qFactor);
  const resonanceGain = computeLorentzianGain(freqHz, closest.freqHz, visualQ);

  return {
    m: closest.m,
    n: closest.n,
    label: closest.indices,
    eigenFreqHz: closest.freqHz,
    qFactor: closest.qFactor,
    resonanceGain,
  };
}

/** Normalized Chladni standing-wave amplitude W(x, y) in [-2, 2] for normX, normY in [0, 1]. */
export function chladniAmplitude(normX: number, normY: number, m: number, n: number): number {
  const pi = Math.PI;
  if (m === n) {
    return (
      Math.sin(m * pi * normX) * Math.sin(n * pi * normY) +
      0.35 * Math.cos(m * pi * normX) * Math.cos(n * pi * normY)
    );
  }
  return (
    Math.sin(n * pi * normX) * Math.sin(m * pi * normY) -
    Math.sin(m * pi * normX) * Math.sin(n * pi * normY)
  );
}

function evalShapeWithStandoffs(
  nx: number,
  ny: number,
  m: number,
  n: number,
  normalizedStandoffs: { nx: number; ny: number }[]
): number {
  let phi = chladniAmplitude(nx, ny, m, n);
  for (const pin of normalizedStandoffs) {
    const d2 = (nx - pin.nx) * (nx - pin.nx) + (ny - pin.ny) * (ny - pin.ny);
    phi *= 1 - Math.exp(-d2 / 0.018);
  }
  return phi;
}

export interface PlateMechanicsResult {
  shapeAmplitude: number;
  deflectionMm: number;
  sigmaXxMpa: number;
  sigmaYyMpa: number;
  tauXyMpa: number;
  vonMisesMpa: number;
  rmsAccelG: number;
  fatigueLifeCycles: number;
}

/**
 * Evaluate full 2D Kirchhoff-Love bending stress tensor, displacement, RMS acceleration,
 * and Basquin solder-joint fatigue life at normalized coordinates (nx, ny).
 */
export function evalPlateMechanics(
  nx: number,
  ny: number,
  m: number,
  n: number,
  material: MaterialData,
  thicknessMm: number,
  areaMm2: number = 14250,
  aspectRatio: number = 1.2,
  normalizedStandoffs: { nx: number; ny: number }[] = [],
  driveFreqHz?: number
): PlateMechanicsResult {
  const { a, b } = computePlateDimensionsMeters(areaMm2, aspectRatio);
  const f0 = computeEigenfrequencyHz(
    m,
    n,
    material,
    thicknessMm,
    areaMm2,
    aspectRatio,
    normalizedStandoffs.length
  );
  const f = driveFreqHz ?? f0;
  const eta =
    material.lossFactorEta ?? MATERIAL_CONSTANTS[material.id]?.lossFactorEta ?? 0.015;
  const qFactor = Math.max(12, Math.round(1 / (eta * (1 + 0.04 * (m + n)))));
  const qEff = Math.min(45, qFactor);
  const H = computeLorentzianGain(f, f0, qEff);

  // Modal displacement amplitude W0 under 3.5G equivalent acoustic/shaker excitation
  const omega = 2 * Math.PI * f0;
  const g0 = 9.80665;
  const gIn = 3.5;
  const W0 = (H * gIn * g0) / Math.max(1e4, omega * omega); // meters

  const phi = evalShapeWithStandoffs(nx, ny, m, n, normalizedStandoffs);

  // Analytical or O(eps^2) central difference spatial second derivatives of phi
  let d2PhiDx2 = 0;
  let d2PhiDy2 = 0;
  let d2PhiDxDy = 0;
  const pi = Math.PI;

  if (normalizedStandoffs.length === 0) {
    if (m === n) {
      d2PhiDx2 = -Math.pow((m * pi) / a, 2) * phi;
      d2PhiDy2 = -Math.pow((n * pi) / b, 2) * phi;
      d2PhiDxDy =
        ((m * n * pi * pi) / (a * b)) *
        (Math.cos(m * pi * nx) * Math.cos(n * pi * ny) +
          0.35 * Math.sin(m * pi * nx) * Math.sin(n * pi * ny));
    } else {
      d2PhiDx2 =
        -Math.pow(pi / a, 2) *
        (n * n * Math.sin(n * pi * nx) * Math.sin(m * pi * ny) -
          m * m * Math.sin(m * pi * nx) * Math.sin(n * pi * ny));
      d2PhiDy2 =
        -Math.pow(pi / b, 2) *
        (m * m * Math.sin(n * pi * nx) * Math.sin(m * pi * ny) -
          n * n * Math.sin(m * pi * nx) * Math.sin(n * pi * ny));
      d2PhiDxDy =
        ((m * n * pi * pi) / (a * b)) *
        (Math.cos(n * pi * nx) * Math.cos(m * pi * ny) -
          Math.cos(m * pi * nx) * Math.cos(n * pi * ny));
    }
  } else {
    const eps = 0.0025;
    const dx = eps * a;
    const dy = eps * b;
    const phiXp = evalShapeWithStandoffs(nx + eps, ny, m, n, normalizedStandoffs);
    const phiXm = evalShapeWithStandoffs(nx - eps, ny, m, n, normalizedStandoffs);
    const phiYp = evalShapeWithStandoffs(nx, ny + eps, m, n, normalizedStandoffs);
    const phiYm = evalShapeWithStandoffs(nx, ny - eps, m, n, normalizedStandoffs);
    const phiPp = evalShapeWithStandoffs(nx + eps, ny + eps, m, n, normalizedStandoffs);
    const phiPm = evalShapeWithStandoffs(nx + eps, ny - eps, m, n, normalizedStandoffs);
    const phiMp = evalShapeWithStandoffs(nx - eps, ny + eps, m, n, normalizedStandoffs);
    const phiMm = evalShapeWithStandoffs(nx - eps, ny - eps, m, n, normalizedStandoffs);

    d2PhiDx2 = (phiXp - 2 * phi + phiXm) / (dx * dx);
    d2PhiDy2 = (phiYp - 2 * phi + phiYm) / (dy * dy);
    d2PhiDxDy = (phiPp - phiPm - phiMp + phiMm) / (4 * dx * dy);
  }

  // Kirchhoff-Love Plane Stress Tensor at outer fiber z = h / 2
  const E = material.youngsModulusGpa * 1e9;
  const h = Math.max(0.2, thicknessMm) * 1e-3;
  const z = h * 0.5;
  const nu = Math.min(0.49, Math.max(0, material.poissonRatio));

  const d2wDx2 = W0 * d2PhiDx2;
  const d2wDy2 = W0 * d2PhiDy2;
  const d2wDxDy = W0 * d2PhiDxDy;

  const factor = -(E * z) / (1 - nu * nu);
  const sigmaXxMpa = (factor * (d2wDx2 + nu * d2wDy2)) * 1e-6;
  const sigmaYyMpa = (factor * (d2wDy2 + nu * d2wDx2)) * 1e-6;
  const tauXyMpa = (-(E * z) / (1 + nu)) * d2wDxDy * 1e-6;

  const vonMisesMpa = Math.sqrt(
    sigmaXxMpa * sigmaXxMpa -
      sigmaXxMpa * sigmaYyMpa +
      sigmaYyMpa * sigmaYyMpa +
      3 * tauXyMpa * tauXyMpa
  );

  const absW = Math.abs(W0 * phi);
  const rmsAccelG = (Math.pow(2 * Math.PI * f, 2) * absW) / (Math.SQRT2 * g0);

  // Basquin high-cycle solder-joint fatigue law: N_f = 0.5 * (K_t * sigma_vm / sigma_f')^(1/b)
  const consts = MATERIAL_CONSTANTS[material.id] ?? MATERIAL_CONSTANTS.fr4;
  const sigmaF = material.fatigueStrengthCoeffMpa ?? consts.fatigueStrengthCoeffMpa;
  const bExp = material.fatigueExponentB ?? consts.fatigueExponentB;
  const ktStressConcentration = 2.6;
  const localSolderStress = Math.max(0.8, vonMisesMpa * ktStressConcentration);
  const rawNf = 0.5 * Math.pow(localSolderStress / sigmaF, 1 / bExp);
  const fatigueLifeCycles = Math.round(Math.min(10_000_000, Math.max(500, rawNf)));

  return {
    shapeAmplitude: Math.abs(phi),
    deflectionMm: absW * 1000,
    sigmaXxMpa,
    sigmaYyMpa,
    tauXyMpa,
    vonMisesMpa,
    rmsAccelG,
    fatigueLifeCycles,
  };
}

/**
 * Compute 3x3 Projective Homography Matrix mapping unit square [(0,0),(1,0),(1,1),(0,1)]
 * onto arbitrary screen quadrilateral [P1, P2, P3, P4] via 8x8 Direct Linear Transform (DLT)
 * and Gaussian elimination with partial pivoting.
 */
export function computeHomography(quad: Point2D[]): number[] {
  if (quad.length !== 4) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const src: Point2D[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  // Build 8x9 augmented matrix [A | rhs]
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const u = src[i].x;
    const v = src[i].y;
    const x = quad[i].x;
    const y = quad[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > maxVal) {
        maxVal = Math.abs(A[r][col]);
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmp;
    }
    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-10) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    for (let c = col; c <= n; c++) {
      A[col][c] /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      for (let c = col; c <= n; c++) {
        A[r][c] -= factor * A[col][c];
      }
    }
  }

  return [
    A[0][8], A[1][8], A[2][8],
    A[3][8], A[4][8], A[5][8],
    A[6][8], A[7][8], 1.0,
  ];
}

/**
 * Apply 3x3 Projective Homography with perspective division.
 */
export function applyHomography(H: number[], u: number, v: number): Point2D {
  const denom = H[6] * u + H[7] * v + H[8];
  const safeDenom = Math.abs(denom) < 1e-6 ? 1e-6 : denom;
  return {
    x: (H[0] * u + H[1] * v + H[2]) / safeDenom,
    y: (H[3] * u + H[4] * v + H[5]) / safeDenom,
  };
}

export function getStoredMaterial(): MaterialData {
  if (typeof window === "undefined") return DEFAULT_MATERIAL;
  try {
    const raw = localStorage.getItem("harmonix_material");
    if (raw) {
      const parsed = JSON.parse(raw);
      const consts = MATERIAL_CONSTANTS[parsed.id] ?? MATERIAL_CONSTANTS.fr4;
      return {
        ...DEFAULT_MATERIAL,
        ...parsed,
        ...consts,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_MATERIAL;
}

export function getStoredThickness(): number {
  if (typeof window === "undefined") return 1.6;
  const val = Number(localStorage.getItem("harmonix_thickness"));
  return Number.isFinite(val) && val > 0 ? val : 1.6;
}

export function getStoredPlateGeometry(): { areaMm2: number; aspectRatio: number } {
  if (typeof window === "undefined") return { areaMm2: 14250, aspectRatio: 1.2 };
  const area = Number(localStorage.getItem("harmonix_plate_area"));
  const ar = Number(localStorage.getItem("harmonix_aspect_ratio"));
  return {
    areaMm2: Number.isFinite(area) && area >= 400 ? area : 14250,
    aspectRatio: Number.isFinite(ar) && ar >= 0.25 && ar <= 4 ? ar : 1.2,
  };
}

export function getStoredStandoffs(): { id?: string; x: number; y: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("harmonix_standoffs");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function getStoredActiveMode(): {
  id: string;
  name: string;
  indices: string;
  m: number;
  n: number;
  freqHz: number;
} {
  if (typeof window === "undefined") {
    return { id: "mode-2-2", name: "Radial Cross", indices: "(2, 2)", m: 2, n: 2, freqHz: 740 };
  }
  try {
    const raw = localStorage.getItem("harmonix_active_mode");
    if (raw) {
      const parsed = JSON.parse(raw);
      const match = String(parsed.indices || "(2, 2)").match(/(\d+)\s*,\s*(\d+)/);
      const m = parsed.m ?? (match ? Number(match[1]) : 2);
      const n = parsed.n ?? (match ? Number(match[2]) : 2);
      return {
        id: parsed.id || "mode-2-2",
        name: parsed.name || "Radial Cross",
        indices: parsed.indices || `(${m}, ${n})`,
        m,
        n,
        freqHz: Number(parsed.freqHz) || 740,
      };
    }
  } catch {
    // ignore
  }
  return { id: "mode-2-2", name: "Radial Cross", indices: "(2, 2)", m: 2, n: 2, freqHz: 740 };
}
