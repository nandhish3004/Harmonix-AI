import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL = process.env.PYTORCH_BACKEND_URL || "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${BACKEND_URL}/api/cv/segment-plate`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json({ error: `Backend returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "PyTorch CV backend offline" }, { status: 503 });
  }
}
