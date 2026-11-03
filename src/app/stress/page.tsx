"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flame,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  Eye,
  Crosshair,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";

export default function StressHeatmapPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showMesh, setShowMesh] = useState<boolean>(true);
  const [peakStressMpa, setPeakStressMpa] = useState<number>(84.6);
  const yieldStrengthMpa = 276.0;
  const safetyFactor = (yieldStrengthMpa / peakStressMpa).toFixed(2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 340;
    canvas.height = 340;

    // Render 2D von Mises gradient field
    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const nx = (x / canvas.width) * 2 - 1;
        const ny = (y / canvas.height) * 2 - 1;

        // Bending stress distribution: sigma_vm ~ |d2w/dx2| + |d2w/dy2|
        const s1 = Math.abs(Math.sin(3 * Math.PI * nx) * Math.sin(3 * Math.PI * ny));
        const s2 = Math.exp(-((nx - 0.2) ** 2 + (ny + 0.3) ** 2) * 8) * 0.9;
        const stress = Math.min(1, s1 * 0.7 + s2);

        // Color gradient: Cold Blue -> Cyan -> Green -> Yellow -> Red Hotspot
        let r = 0, g = 0, b = 0;
        if (stress < 0.25) {
          r = 13; g = Math.floor(stress * 4 * 120); b = 180;
        } else if (stress < 0.5) {
          r = 14; g = Math.floor(120 + (stress - 0.25) * 4 * 135); b = 154;
        } else if (stress < 0.75) {
          r = Math.floor((stress - 0.5) * 4 * 245); g = 240; b = 30;
        } else {
          r = 255; g = Math.floor(240 - (stress - 0.75) * 4 * 200); b = 30;
        }

        const idx = (y * canvas.width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 230;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw FEA Mesh lines if enabled
    if (showMesh) {
      ctx.strokeStyle = "rgba(41, 64, 68, 0.4)";
      ctx.lineWidth = 1;
      const step = 20;
      for (let x = 0; x <= canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
  }, [showMesh]);

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col">
      <HudHeader
        title="STRESS HEATMAP"
        step="SCREEN 08 // 10"
        subtitle="Dynamic von Mises FEA Stress Tensor"
        backHref="/safety"
        rightAction={
          <HudBadge variant="safe" dot>
            SF: {safetyFactor}X (SAFE)
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Heatmap Viewport Frame */}
        <div className="relative w-full aspect-square bg-[#101F23] rounded-[16px] border border-[#294044] overflow-hidden flex items-center justify-center shadow-xl">
          <canvas ref={canvasRef} className="w-full h-full object-cover" />

          {/* Hotspot Reticle Marker */}
          <div className="absolute top-[32%] right-[38%] pointer-events-none flex flex-col items-center">
            <div className="w-6 h-6 rounded-full border-2 border-[#FF4444] animate-ping" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF4444] absolute top-1.5" />
            <div className="bg-[#0D191C]/90 px-2 py-0.5 rounded border border-[#FF4444] text-[9px] font-mono text-[#FF8888] font-bold mt-1">
              PEAK: 84.6 MPa
            </div>
          </div>

          {/* Controls overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <div className="bg-[#0D191C]/90 backdrop-blur-md px-2.5 py-1 rounded-[8px] border border-[#294044] text-[10px] font-mono text-[#8C999A]">
              VON MISES: <span className="text-[#DDF0C2] font-bold">σ_vm [MPa]</span>
            </div>
          </div>

          <div className="absolute bottom-3 right-3 pointer-events-auto">
            <button
              onClick={() => setShowMesh(!showMesh)}
              className="bg-[#15282C]/90 text-xs font-mono text-[#8C999A] hover:text-[#F5FDFF] px-2.5 py-1.5 rounded-[8px] border border-[#294044] flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-[#0EB29A]" />
              <span>{showMesh ? "MESH ON" : "MESH OFF"}</span>
            </button>
          </div>
        </div>

        {/* Heatmap Spectrum Gradient Legend */}
        <div className="p-3 bg-[#15282C] rounded-[12px] border border-[#294044] space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono text-[#8C999A]">
            <span>0 MPa (MIN)</span>
            <span className="text-[#0EB29A]">50 MPa</span>
            <span className="text-[#F5C518]">150 MPa</span>
            <span className="text-[#FF4444]">276 MPa (YIELD)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-gradient-to-r from-blue-900 via-[#0EB29A] via-[#DDF0C2] via-yellow-400 to-[#FF4444] border border-[#233A3D]" />
        </div>

        {/* Stress Metrics Telemetry */}
        <ChamferedCard className="p-3.5 bg-[#15282C] border-[#294044] space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 bg-[#101F23] rounded-[8px] border border-[#233A3D]">
              <span className="text-[#8C999A] block text-[10px]">PEAK CONCENTRATION</span>
              <span className="text-[#F5FDFF] font-bold text-sm">84.6 MPa</span>
              <span className="text-[9px] text-[#8C999A] block mt-0.5">@ X:182mm, Y:94mm</span>
            </div>

            <div className="p-2.5 bg-[#101F23] rounded-[8px] border border-[#233A3D]">
              <span className="text-[#8C999A] block text-[10px]">ALLOWABLE YIELD (σ_y)</span>
              <span className="text-[#4ADE80] font-bold text-sm">276.0 MPa</span>
              <span className="text-[9px] text-[#DDF0C2] block mt-0.5">SAFETY FACTOR: 3.26x</span>
            </div>
          </div>
        </ChamferedCard>

        {/* Proceed CTA */}
        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/defects")}
            className="flex items-center justify-center gap-2"
          >
            <span>RUN SUBSURFACE DEFECT CORRELATION</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}

