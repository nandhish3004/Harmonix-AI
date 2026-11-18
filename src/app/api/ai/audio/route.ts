import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const HF_BASE = "https://router.huggingface.co/hf-inference/models";

export async function POST(request: Request) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HF_TOKEN not configured" }, { status: 503 });
  }

  try {
    const body = await request.arrayBuffer();
    if (body.byteLength < 1000 || body.byteLength > 1_500_000) {
      return NextResponse.json({ error: "Invalid audio size" }, { status: 400 });
    }
    const model = process.env.HF_AUDIO_MODEL || "MIT/ast-finetuned-audioset-10-10-0.4593";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(`${HF_BASE}/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" },
      body,
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
    return NextResponse.json({ model, labels: JSON.parse(text) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Audio classification failed" },
      { status: 500 }
    );
  }
}
