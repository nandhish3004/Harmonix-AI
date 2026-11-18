"use client";

/**
 * In-Browser Hugging Face ONNX Runtime (@huggingface/transformers)
 * Runs quantized zero-shot object detection, vision & audio models locally via WebAssembly/WebGPU.
 * Zero API keys required, zero cost, with fast timeouts so the UI never hangs on slow networks.
 */

const VISION_CLASSES: {
  prompt: string;
  display: string;
  materialId: "fr4" | "al6061" | "steel" | "acrylic";
}[] = [
  {
    prompt: "a smartphone or mobile phone back cover in a case",
    display: "Smartphone / Polymer-Alloy Chassis",
    materialId: "acrylic",
  },
  {
    prompt: "a green printed circuit board PCB with electronic chips",
    display: "FR-4 Printed Circuit Board (PCB)",
    materialId: "fr4",
  },
  {
    prompt: "a shiny brushed silver aluminium metal plate",
    display: "6061-T6 Aluminium Plate",
    materialId: "al6061",
  },
  {
    prompt: "a heavy dark steel or iron metal plate",
    display: "A36 Structural Steel Plate",
    materialId: "steel",
  },
  {
    prompt: "a clear or colored plastic acrylic polymer sheet",
    display: "Cast Acrylic / Polymer Sheet",
    materialId: "acrylic",
  },
  {
    prompt: "a wooden board or hardcover book",
    display: "Wood / Composite Board",
    materialId: "fr4",
  },
];

const CANDIDATE_LABELS = VISION_CLASSES.map((c) => c.prompt);

const EXCLUDED_ROOM_CLASSES = new Set([
  "person",
  "chair",
  "couch",
  "bed",
  "dining table",
  "tv",
  "potted plant",
]);

function formatDetectedLabel(label: string): string {
  const l = label.toLowerCase();
  if (l === "cell phone") return "Smartphone / Polymer-Alloy Chassis";
  if (l === "book") return "Wood / Composite Board";
  if (l === "laptop") return "Laptop PCB / Alloy Chassis";
  if (l === "remote") return "Handheld FR-4 Enclosure";
  if (l === "keyboard") return "Mechanical PCB Assembly";
  return label;
}

function classifyVisionEntry(promptLabel: string): {
  display: string;
  materialId: "fr4" | "al6061" | "steel" | "acrylic" | null;
} {
  const matched = VISION_CLASSES.find((c) => c.prompt === promptLabel);
  if (matched) return { display: matched.display, materialId: matched.materialId };
  return { display: promptLabel, materialId: labelToMaterialId(promptLabel) };
}

function labelToMaterialId(label: string): "fr4" | "al6061" | "steel" | "acrylic" | null {
  const l = label.toLowerCase();
  if (l.includes("smartphone") || l.includes("cell phone") || l.includes("polymer")) return "acrylic";
  if (l.includes("circuit") || l.includes("pcb") || l.includes("fr-4") || l.includes("wood") || l.includes("composite")) {
    return "fr4";
  }
  if (l.includes("aluminium") || l.includes("aluminum")) return "al6061";
  if (l.includes("steel") || l.includes("iron")) return "steel";
  if (l.includes("acrylic") || l.includes("plastic")) return "acrylic";
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
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
let objDetectPipePromise: Promise<any> | null = null;
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

async function getObjectDetectionPipeline() {
  if (!objDetectPipePromise) {
    objDetectPipePromise = (async () => {
      const { pipeline } = await loadTransformersEnv();
      emitProgress(5, "Loading YOLOS object detector");
      const pipe = await pipeline("object-detection", "Xenova/yolos-tiny", {
        dtype: "q8",
        progress_callback: (info: { status?: string; progress?: number }) => {
          if (info?.status === "progress" && typeof info.progress === "number") {
            emitProgress(Math.round(info.progress), "Loading YOLOS object detector");
          } else if (info?.status === "ready") {
            emitProgress(null, "YOLOS ready");
          }
        },
      });
      emitProgress(null, "YOLOS ready");
      return pipe;
    })().catch((err) => {
      objDetectPipePromise = null;
      emitProgress(null);
      throw err;
    });
  }
  return objDetectPipePromise;
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

export function preloadVisionModels(): void {
  if (typeof window === "undefined") return;
  void getObjectDetectionPipeline().catch(() => {});
  void getVisionPipeline().catch(() => {});
}

export interface BrowserObjectDetection {
  model: string;
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

export async function detectObjectInBrowser(
  imageBlob: Blob,
  timeoutMs = 3500
): Promise<BrowserObjectDetection | null> {
  if (typeof window === "undefined") return null;
  let objectUrl: string | null = null;
  try {
    const res = await withTimeout(
      (async () => {
        const pipe = await getObjectDetectionPipeline();
        objectUrl = URL.createObjectURL(imageBlob);
        const results = (await pipe(objectUrl, {
          threshold: 0.12,
          percentage: false,
        })) as {
          label: string;
          score: number;
          box: { xmin: number; ymin: number; xmax: number; ymax: number };
        }[];
        if (!Array.isArray(results) || results.length === 0) return null;
        const candidates = results.filter(
          (r) => !EXCLUDED_ROOM_CLASSES.has(r.label.toLowerCase())
        );
        if (candidates.length === 0) return null;
        const best = candidates.sort((a, b) => b.score - a.score)[0];
        if (!best || !best.box) return null;
        return {
          model: "Xenova/yolos-tiny (ONNX)",
          label: formatDetectedLabel(best.label),
          score: best.score,
          box: best.box,
        };
      })(),
      timeoutMs
    );
    return res;
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export interface BrowserVisionClassification {
  model: string;
  label: string;
  score: number;
  materialId: "fr4" | "al6061" | "steel" | "acrylic" | null;
}

export async function classifyBoardInBrowser(
  imageBlob: Blob,
  timeoutMs = 3500
): Promise<BrowserVisionClassification | null> {
  if (typeof window === "undefined") return null;
  let objectUrl: string | null = null;
  try {
    return await withTimeout(
      (async () => {
        const pipe = await getVisionPipeline();
        objectUrl = URL.createObjectURL(imageBlob);
        const results = (await pipe(objectUrl, CANDIDATE_LABELS)) as {
          label: string;
          score: number;
        }[];
        if (!Array.isArray(results) || results.length === 0) return null;
        const best = results[0];
        const info = classifyVisionEntry(best.label);
        return {
          model: "Xenova/clip-vit-base-patch32 (ONNX)",
          label: info.display,
          score: best.score,
          materialId: info.materialId,
        };
      })(),
      timeoutMs
    );
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
  samples16k: Float32Array,
  timeoutMs = 3500
): Promise<BrowserAudioClassification | null> {
  if (typeof window === "undefined" || samples16k.length < 512) return null;
  try {
    return await withTimeout(
      (async () => {
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
      })(),
      timeoutMs
    );
  } catch {
    return null;
  }
}
