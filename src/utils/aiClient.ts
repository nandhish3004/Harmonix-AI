export interface AiBackendHealth {
  status: "online" | "offline";
  device?: string;
  models?: {
    vision: string;
    audio: string;
    physics: string;
  };
}

export function getAiBackendUrl(): string {
  return process.env.NEXT_PUBLIC_AI_BACKEND_URL || "http://localhost:8000";
}

export async function checkAiHealth(): Promise<AiBackendHealth> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${getAiBackendUrl()}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { status: "offline" };
    return await res.json();
  } catch {
    return { status: "offline" };
  }
}

export async function segmentPlateWithDinoV2(
  blob: Blob,
  targetWidth: number,
  targetHeight: number
): Promise<{
  corners: { x: number; y: number; label: string }[];
  confidence: number;
  model: string;
} | null> {
  try {
    const form = new FormData();
    form.append("file", blob, "frame.png");
    form.append("target_width", String(targetWidth));
    form.append("target_height", String(targetHeight));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${getAiBackendUrl()}/api/cv/segment-plate`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function analyzeTapWithAst(
  samples: number[],
  sampleRate: number,
  baselineHz: number
): Promise<{
  model: string;
  peak_hz: number;
  delta_hz: number;
  anomaly_flagged: boolean;
  ast_top_class: string;
  ast_confidence: number;
} | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${getAiBackendUrl()}/api/audio/analyze-tap?sample_rate=${sampleRate}&baseline_hz=${baselineHz}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samples),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function computePinnModal(
  m: number,
  n: number,
  standoffs: { nx: number; ny: number }[]
): Promise<{
  model: string;
  mean_displacement: number;
  max_displacement: number;
  grid: number[][];
} | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${getAiBackendUrl()}/api/physics/pinn-modal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ m, n, grid_size: 32, standoffs }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
