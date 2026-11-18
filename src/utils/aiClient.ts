/**
 * Client for Hugging Face Inference — tries /api/ai/* if HF_TOKEN is configured,
 * and seamlessly runs fast quantized in-browser ONNX models (YOLOS-Tiny / CLIP / AST).
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

export async function checkAiHealth(): Promise<AiHealth> {
  try {
    const res = await fetch("/api/ai/health", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.hfConfigured) {
        return { ...data, status: "online", mode: "cloud" };
      }
    }
  } catch {
    // ignore and report browser ONNX mode
  }

  return {
    status: "online",
    hfConfigured: true,
    mode: "browser-onnx",
    models: {
      vision: "Xenova/yolos-tiny + clip-vit (ONNX)",
      audio: "Xenova/ast-finetuned-audioset (ONNX)",
    },
  };
}

export interface BoardDetection {
  model: string;
  label: string;
  score: number;
  box?: { xmin: number; ymin: number; xmax: number; ymax: number };
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

/** Fast object + material detection (Cloud OWL-ViT if HF_TOKEN set, else in-browser YOLOS-Tiny ONNX + cropped CLIP ROI). */
export async function detectBoardHF(
  fullImage: Blob,
  croppedImage?: Blob
): Promise<BoardDetection | null> {
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
    // fallback to fast in-browser YOLOS-Tiny ONNX
  }

  const obj = await detectObjectInBrowser(fullImage, 3500);
  if (obj) {
    return {
      model: obj.model,
      label: obj.label,
      score: obj.score,
      box: obj.box,
      materialId: materialFromLabel(obj.label),
    };
  }

  const cls = await classifyBoardInBrowser(croppedImage ?? fullImage, 3500);
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

  if (rawSamples16k) {
    return classifyAudioInBrowser(rawSamples16k, 3500);
  }
  return null;
}
