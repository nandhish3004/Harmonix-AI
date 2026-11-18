/**
 * Client for the app's own /api/ai/* routes (server-side Hugging Face Inference).
 * Every call degrades gracefully to null so the on-device engines take over.
 */

export interface AiHealth {
  status: "online" | "offline";
  hfConfigured: boolean;
  models?: { vision: string; audio: string };
}

export async function checkAiHealth(): Promise<AiHealth> {
  try {
    const res = await fetch("/api/ai/health", { cache: "no-store" });
    if (!res.ok) return { status: "offline", hfConfigured: false };
    return await res.json();
  } catch {
    return { status: "offline", hfConfigured: false };
  }
}

export interface BoardDetection {
  model: string;
  label: string;
  score: number;
  /** Bounding box in the coordinate space of the image that was sent */
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
  materialId: "fr4" | "al6061" | "steel" | "acrylic" | null;
}

function materialFromLabel(label: string): BoardDetection["materialId"] {
  const l = label.toLowerCase();
  if (l.includes("circuit")) return "fr4";
  if (l.includes("aluminium") || l.includes("aluminum")) return "al6061";
  if (l.includes("steel")) return "steel";
  if (l.includes("acrylic")) return "acrylic";
  return null;
}

/** Zero-shot detection (OWL-ViT) → best box + material guess. */
export async function detectBoardHF(image: Blob): Promise<BoardDetection | null> {
  try {
    const form = new FormData();
    form.append("file", image, "frame.jpg");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    const res = await fetch("/api/ai/detect", { method: "POST", body: form, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      model: string;
      detections: { score: number; label: string; box: BoardDetection["box"] }[];
    };
    if (!Array.isArray(data.detections) || data.detections.length === 0) return null;
    const best = [...data.detections].sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 0.04) return null;
    return {
      model: data.model,
      label: best.label,
      score: best.score,
      box: best.box,
      materialId: materialFromLabel(best.label),
    };
  } catch {
    return null;
  }
}

export interface TapSoundLabels {
  model: string;
  labels: { label: string; score: number }[];
}

/** Audio Spectrogram Transformer classification of the tap sound. */
export async function classifyTapHF(wav: Blob): Promise<TapSoundLabels | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    const res = await fetch("/api/ai/audio", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { model: string; labels: { label: string; score: number }[] };
    if (!Array.isArray(data.labels) || data.labels.length === 0) return null;
    return { model: data.model, labels: data.labels.slice(0, 4) };
  } catch {
    return null;
  }
}
