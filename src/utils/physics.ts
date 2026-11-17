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
}

export const DEFAULT_MATERIAL: MaterialData = {
  id: "fr4",
  name: "FR4 Glass Epoxy",
  code: "PCB-FR4-STD",
  category: "CIRCUIT SUBSTRATE",
  youngsModulusGpa: 24.0,
  densityKgM3: 1850,
  poissonRatio: 0.12,
  acousticSpeedMs: 3600,
  yieldStrengthMpa: 276.0,
};

export const MATERIAL_YIELD_MPA: Record<string, number> = {
  fr4: 276.0,
  al6061: 276.0,
  steel: 370.0,
  acrylic: 72.0,
};

export interface ModePair {
  m: number;
  n: number;
  label: string;
}

const MODE_LADDER: { maxFreq: number; m: number; n: number; label: string }[] = [
  { maxFreq: 320, m: 1, n: 1, label: "(1, 1)" },
  { maxFreq: 550, m: 2, n: 0, label: "(2, 0)" },
  { maxFreq: 900, m: 2, n: 2, label: "(2, 2)" },
  { maxFreq: 1350, m: 3, n: 1, label: "(3, 1)" },
  { maxFreq: 1950, m: 3, n: 3, label: "(3, 3)" },
  { maxFreq: 3500, m: 4, n: 2, label: "(4, 2)" },
];

/** Map an excitation frequency (scaled by material acoustic speed) to a Chladni (m, n) mode pair. */
export function frequencyToMode(
  freqHz: number,
  acousticSpeedMs: number = 3600,
  thicknessMm: number = 1.6
): ModePair {
  // Normalize frequency against FR4 1.6mm reference
  const scale = (3600 / Math.max(1000, acousticSpeedMs)) * (1.6 / Math.max(0.4, thicknessMm));
  const normFreq = freqHz * Math.max(0.4, Math.min(2.2, scale));
  for (const step of MODE_LADDER) {
    if (normFreq <= step.maxFreq) {
      return { m: step.m, n: step.n, label: step.label };
    }
  }
  return { m: 4, n: 2, label: "(4, 2)" };
}

/** Normalized Chladni standing-wave amplitude W(x, y) in [-2, 2] for normX, normY in [0, 1]. */
export function chladniAmplitude(normX: number, normY: number, m: number, n: number): number {
  const pi = Math.PI;
  return (
    Math.sin(n * pi * normX) * Math.sin(m * pi * normY) -
    Math.sin(m * pi * normX) * Math.sin(n * pi * normY)
  );
}

export function getStoredMaterial(): MaterialData {
  if (typeof window === "undefined") return DEFAULT_MATERIAL;
  try {
    const raw = localStorage.getItem("harmonix_material");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_MATERIAL,
        ...parsed,
        yieldStrengthMpa: MATERIAL_YIELD_MPA[parsed.id] ?? 276.0,
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
