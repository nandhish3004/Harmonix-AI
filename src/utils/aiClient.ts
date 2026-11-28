/**
 * Client for Hugging Face Inference — checks once whether cloud HF_TOKEN is configured,
 * and otherwise skips dead network POSTs to run WebGPU/proxied ONNX YOLOS-Tiny + MobileViT + Spectral CV.
 */
import {
  classifyAudioInBrowser,
  classifyBoardInBrowser,
  detectObjectInBrowser,
} from "@/utils/browserHf";

export interface AiHealth {
  status: "online" | "offline";
  hfConfigured: boolean;
  mode?: "cloud" | "browser-onnx";
  models?: { vision: string; audio: string };
}

let cloudHfConfigured: boolean | null = null;

async function isCloudHfAvailable(): Promise<boolean> {
  if (cloudHfConfigured !== null) return cloudHfConfigured;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch("/api/ai/health", { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      cloudHfConfigured = Boolean(data?.hfConfigured);
      return cloudHfConfigured;
    }
  } catch {
    // offline or error -> avoid stalling on cloud routes
  }
  cloudHfConfigured = false;
  return false;
}

export async function checkAiHealth(): Promise<AiHealth> {
  try {
    const res = await fetch("/api/ai/health", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      cloudHfConfigured = Boolean(data?.hfConfigured);
      if (data.hfConfigured) {
        return { ...data, status: "online", mode: "cloud" };
      }
    }
  } catch {
    // ignore and report browser ONNX mode
  }
  cloudHfConfigured = false;

  return {
    status: "online",
    hfConfigured: true,
    mode: "browser-onnx",
    models: {
      vision: "Xenova/mobilevit-small + yolos-tiny (ONNX)",
      audio: "Xenova/ast-finetuned-audioset (ONNX)",
    },
  };
}

export interface BoardDetection {
  model: string;
  label: string;
  score: number;
  box?: { xmin: number; ymin: number; xmax: number; ymax: number };
  boxNorm?: { xmin: number; ymin: number; xmax: number; ymax: number };
  materialId: "fr4" | "al6061" | "steel" | "acrylic" | null;
}

function materialFromLabel(label: string): BoardDetection["materialId"] {
  const l = label.toLowerCase();
  if (l.includes("smartphone") || l.includes("cell phone") || l.includes("polymer")) return "acrylic";
  if (
    l.includes("circuit") ||
    l.includes("pcb") ||
    l.includes("fr-4") ||
    l.includes("wood") ||
    l.includes("composite") ||
    l.includes("remote") ||
    l.includes("laptop") ||
    l.includes("keyboard") ||
    l.includes("book")
  ) {
    return "fr4";
  }
  if (l.includes("aluminium") || l.includes("aluminum")) return "al6061";
  if (l.includes("steel") || l.includes("iron")) return "steel";
  if (l.includes("acrylic") || l.includes("plastic")) return "acrylic";
  return null;
}

export interface BackendSegmentation {
  model: string;
  corners: { x: number; y: number; label: string }[];
  confidence: number;
  can_lock?: boolean;
  guidance?: "good" | "too-far" | "too-close" | "tilted" | "low-contrast" | "hand-occlusion";
  reasoning?: string;
}

/**
 * Calls the local/cloud PyTorch DINOv2 + High-Res Color/PCA-Quad endpoint
 * via the Next.js /api/cv/segment-plate proxy. Returns null quickly if offline.
 */
export async function segmentPlateBackend(
  imageBlob: Blob,
  targetWidth: number,
  targetHeight: number
): Promise<BackendSegmentation | null> {
  try {
    const form = new FormData();
    form.append("file", imageBlob, "frame.jpg");
    form.append("target_width", String(Math.round(targetWidth)));
    form.append("target_height", String(Math.round(targetHeight)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/cv/segment-plate", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as BackendSegmentation;
    if (Array.isArray(data?.corners) && data.corners.length === 4) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/** Fast parallel object-detection + MobileViT material ID (Cloud if HF_TOKEN set, else browser ONNX). */
export async function detectBoardHF(
  fullImage: Blob,
  croppedImage?: Blob
): Promise<BoardDetection | null> {
  if (await isCloudHfAvailable()) {
    try {
      const form = new FormData();
      form.append("file", fullImage, "frame.jpg");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch("/api/ai/detect", { method: "POST", body: form, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as {
          model: string;
          detections: { score: number; label: string; box: NonNullable<BoardDetection["box"]> }[];
        };
        if (Array.isArray(data.detections) && data.detections.length > 0) {
          const best = [...data.detections].sort((a, b) => b.score - a.score)[0];
          if (best && best.score >= 0.04) {
            return {
              model: data.model,
              label: best.label,
              score: best.score,
              box: best.box,
              materialId: materialFromLabel(best.label),
            };
          }
        }
      }
    } catch {
      // fallback to fast in-browser YOLOS-Tiny + MobileViT ONNX
    }
  }

  const [obj, cls] = await Promise.all([
    detectObjectInBrowser(fullImage, 900),
    croppedImage ? classifyBoardInBrowser(croppedImage, 700) : Promise.resolve(null),
  ]);

  if (obj && cls) {
    const objMat = materialFromLabel(obj.label);
    const useObjLabel = objMat !== null && obj.score >= cls.score * 0.85;
    return {
      model: "Xenova/yolos-tiny + mobilevit-small (ONNX Ensemble)",
      label: useObjLabel ? obj.label : cls.label,
      score: Math.max(obj.score, cls.score),
      boxNorm: obj.boxNorm,
      materialId: useObjLabel ? objMat : cls.materialId,
    };
  }

  if (obj) {
    return {
      model: obj.model,
      label: obj.label,
      score: obj.score,
      boxNorm: obj.boxNorm,
      materialId: materialFromLabel(obj.label),
    };
  }

  if (cls) {
    return {
      model: cls.model,
      label: cls.label,
      score: cls.score,
      materialId: cls.materialId,
    };
  }
  return null;
}

export interface TapSoundLabels {
  model: string;
  labels: { label: string; score: number }[];
}

/** Audio Spectrogram Transformer tap classification (Cloud AST if HF_TOKEN set, else in-browser ONNX). */
export async function classifyTapHF(
  wav: Blob,
  rawSamples16k?: Float32Array
): Promise<TapSoundLabels | null> {
  if (await isCloudHfAvailable()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch("/api/ai/audio", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { model: string; labels: { label: string; score: number }[] };
        if (Array.isArray(data.labels) && data.labels.length > 0) {
          return { model: data.model, labels: data.labels.slice(0, 4) };
        }
      }
    } catch {
      // fallback to in-browser Hugging Face AST ONNX
    }
  }

  if (rawSamples16k) {
    return classifyAudioInBrowser(rawSamples16k, 1200);
  }
  return null;
}
