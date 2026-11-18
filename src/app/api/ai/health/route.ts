import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const hfConfigured = Boolean(process.env.HF_TOKEN);
  return NextResponse.json({
    status: hfConfigured ? "online" : "offline",
    hfConfigured,
    models: {
      vision: process.env.HF_VISION_MODEL || "google/owlvit-base-patch32",
      audio: process.env.HF_AUDIO_MODEL || "MIT/ast-finetuned-audioset-10-10-0.4593",
    },
  });
}
