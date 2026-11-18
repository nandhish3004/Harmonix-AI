import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const HF_BASE = "https://router.huggingface.co/hf-inference/models";

// Zero-shot text prompts → also lets the model tell us what the board is made of
const CANDIDATE_LABELS = [
  "a green printed circuit board",
  "an aluminium metal plate",
  "a steel metal plate",
  "a clear acrylic sheet",
  "an electronic device",
];

export async function POST(request: Request) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HF_TOKEN not configured" }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (file.size > 2_000_000) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const model = process.env.HF_VISION_MODEL || "google/owlvit-base-patch32";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(`${HF_BASE}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: base64,
        parameters: { candidate_labels: CANDIDATE_LABELS },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Hugging Face returned ${res.status}`, detail: text.slice(0, 300) },
        { status: 502 }
      );
    }
    return NextResponse.json({ model, detections: JSON.parse(text) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Detection failed" },
      { status: 500 }
    );
  }
}
