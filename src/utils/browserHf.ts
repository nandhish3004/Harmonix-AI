"use client";

/**
 * In-Browser Hugging Face ONNX Runtime (@huggingface/transformers)
 * Runs quantized zero-shot vision & audio models locally via WebAssembly/WebGPU.
 * Zero API keys required, zero cost, cached permanently in browser Cache Storage.
 */

const CANDIDATE_LABELS = [
  "a green printed circuit board",
  "an aluminium metal plate",
  "a dark steel metal plate",
  "a clear acrylic plastic sheet",
];

function labelToMaterialId(label: string): "fr4" | "al6061" | "steel" | "acrylic" | null {
  const l = label.toLowerCase();
  if (l.includes("circuit")) return "fr4";
  if (l.includes("aluminium") || l.includes("aluminum")) return "al6061";
  if (l.includes("steel")) return "steel";
  if (l.includes("acrylic")) return "acrylic";
  return null;
}

type ProgressListener = (pct: number | null, label?: string) => void;
const listeners = new Set<ProgressListener>();

export function onHfProgress(fn: ProgressListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitProgress(pct: number | null, label?: string) {
  listeners.forEach((fn) => fn(pct, label));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let visionPipePromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let audioPipePromise: Promise<any> | null = null;

async function loadTransformersEnv() {
  const mod = await import("@huggingface/transformers");
  mod.env.allowLocalModels = false;
  mod.env.useBrowserCache = true;
  return mod;
}

async function getVisionPipeline() {
  if (!visionPipePromise) {
    visionPipePromise = (async () => {
      const { pipeline } = await loadTransformersEnv();
      emitProgress(5, "Loading CLIP vision model");
      const pipe = await pipeline(
        "zero-shot-image-classification",
        "Xenova/clip-vit-base-patch32",
        {
          dtype: "q8",
          progress_callback: (info: { status?: string; progress?: number }) => {
            if (info?.status === "progress" && typeof info.progress === "number") {
              emitProgress(Math.round(info.progress), "Loading CLIP vision model");
            } else if (info?.status === "ready") {
              emitProgress(null, "CLIP model ready");
            }
          },
        }
      );
      emitProgress(null, "CLIP model ready");
      return pipe;
    })().catch((err) => {
      visionPipePromise = null;
      emitProgress(null);
      throw err;
    });
  }
  return visionPipePromise;
}

async function getAudioPipeline() {
  if (!audioPipePromise) {
    audioPipePromise = (async () => {
      const { pipeline } = await loadTransformersEnv();
      emitProgress(5, "Loading AST audio model");
      const pipe = await pipeline(
        "audio-classification",
        "Xenova/ast-finetuned-audioset-10-10-0.4593",
        {
          dtype: "q8",
          progress_callback: (info: { status?: string; progress?: number }) => {
            if (info?.status === "progress" && typeof info.progress === "number") {
              emitProgress(Math.round(info.progress), "Loading AST audio model");
            } else if (info?.status === "ready") {
              emitProgress(null, "AST audio model ready");
            }
          },
        }
      );
      emitProgress(null, "AST audio model ready");
      return pipe;
    })().catch((err) => {
      audioPipePromise = null;
      emitProgress(null);
      throw err;
    });
  }
  return audioPipePromise;
}

export interface BrowserVisionClassification {
  model: string;
  label: string;
  score: number;
  materialId: "fr4" | "al6061" | "steel" | "acrylic" | null;
}

export async function classifyBoardInBrowser(
  imageBlob: Blob
): Promise<BrowserVisionClassification | null> {
  if (typeof window === "undefined") return null;
  let objectUrl: string | null = null;
  try {
    const pipe = await getVisionPipeline();
    objectUrl = URL.createObjectURL(imageBlob);
    const results = (await pipe(objectUrl, CANDIDATE_LABELS)) as {
      label: string;
      score: number;
    }[];
    if (!Array.isArray(results) || results.length === 0) return null;
    const best = results[0];
    return {
      model: "Xenova/clip-vit-base-patch32 (ONNX)",
      label: best.label,
      score: best.score,
      materialId: labelToMaterialId(best.label),
    };
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export interface BrowserAudioClassification {
  model: string;
  labels: { label: string; score: number }[];
}

export async function classifyAudioInBrowser(
  samples16k: Float32Array
): Promise<BrowserAudioClassification | null> {
  if (typeof window === "undefined" || samples16k.length < 512) return null;
  try {
    const pipe = await getAudioPipeline();
    const results = (await pipe(samples16k, { top_k: 4 })) as {
      label: string;
      score: number;
    }[];
    if (!Array.isArray(results) || results.length === 0) return null;
    return {
      model: "Xenova/ast-finetuned-audioset (ONNX)",
      labels: results.slice(0, 4),
    };
  } catch {
    return null;
  }
}
