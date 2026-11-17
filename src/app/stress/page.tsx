"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, ArrowRight } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import {
  computePlateDimensionsMeters,
  evalPlateMechanics,
  getStoredActiveMode,
  getStoredMaterial,
  getStoredPlateGeometry,
  getStoredStandoffs,
  getStoredThickness,
} from "@/utils/physics";

export default function StressHeatmapPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showMesh, setShowMesh] = useState<boolean>(true);
  const [peakStressMpa, setPeakStressMpa] = useState<number>(84.6);
  const [yieldStrengthMpa, setYieldStrengthMpa] = useState<number>(276.0);
  const [peakCoordsMm, setPeakCoordsMm] = useState<{ x: number; y: number }>({ x: 65, y: 55 });
  const [peakRelPos, setPeakRelPos] = useState<{ leftPct: number; topPct: number }>({
    leftPct: 50,
    topPct: 50,
  });
  const [modeLabel, setModeLabel] = useState<string>("(2, 2)");

  const sfNum = yieldStrengthMpa / Math.max(0.1, peakStressMpa);
  const safetyFactor = sfNum >= 100 ? ">99" : sfNum.toFixed(2);
  const isSafe = sfNum >= 1.5;

  useEffect(() => {
    const mode = getStoredActiveMode();
    const mat = getStoredMaterial();
    const thickness = getStoredThickness();
    const geo = getStoredPlateGeometry();
    const standoffs = getStoredStandoffs();
    const normStandoffs = standoffs.map((s) => ({
      nx: Math.max(0, Math.min(1, s.x / 360)),
      ny: Math.max(0, Math.min(1, s.y / 320)),
    }));

    setModeLabel(mode.indices);
    const yieldMpa = mat.yieldStrengthMpa ?? 276.0;
    setYieldStrengthMpa(yieldMpa);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 170;
    const H = 170;
    canvas.width = W;
    canvas.height = H;

    // 1. Evaluate exact Kirchhoff-Love von Mises tensor over the 2D plate grid
    const field = new Float32Array(W * H);
    let maxVm = 0;
    let maxX = Math.floor(W / 2);
    let maxY = Math.floor(H / 2);

    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W;
        const mech = evalPlateMechanics(
          nx,
          ny,
          mode.m,
          mode.n,
          mat,
          thickness,
          geo.areaMm2,
          geo.aspectRatio,
          normStandoffs
        );
        const vm = mech.vonMisesMpa;
        field[y * W + x] = vm;
        if (vm > maxVm) {
          maxVm = vm;
          maxX = x;
          maxY = y;
        }
      }
    }

    // 2. Map physical von Mises stress [MPa] to heatmap spectrum
    const colorScaleMax = Math.max(1.0, Math.min(yieldMpa, maxVm * 1.05));
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let i = 0; i < W * H; i++) {
      const stress = Math.min(1, field[i] / colorScaleMax);
      let r = 0,
        g = 0,
        b = 0;
      if (stress < 0.25) {
        r = 13;
        g = Math.floor(stress * 4 * 120);
        b = 180;
      } else if (stress < 0.5) {
        r = 14;
        g = Math.floor(120 + (stress - 0.25) * 4 * 135);
        b = 154;
      } else if (stress < 0.75) {
        r = Math.floor((stress - 0.5) * 4 * 245);
        g = 240;
        b = 30;
      } else {
        r = 255;
        g = Math.floor(240 - (stress - 0.75) * 4 * 200);
        b = 30;
      }
      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 232;
    }
    ctx.putImageData(imgData, 0, 0);

    const { a, b } = computePlateDimensionsMeters(geo.areaMm2, geo.aspectRatio);
    setPeakStressMpa(parseFloat(maxVm.toFixed(1)));
    setPeakCoordsMm({
      x: Math.round(((maxX + 0.5) / W) * a * 1000),
      y: Math.round(((maxY + 0.5) / H) * b * 1000),
    });
    setPeakRelPos({
      leftPct: Math.max(12, Math.min(88, ((maxX + 0.5) / W) * 100)),
      topPct: Math.max(12, Math.min(88, ((maxY + 0.5) / H) * 100)),
    });

    // Draw FEA Mesh lines if enabled
    if (showMesh) {
      const isDark =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");
      ctx.strokeStyle = isDark ? "rgba(41, 64, 68, 0.45)" : "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 0.75;
      const step = 10;
      for (let x = 0; x <= W; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }
  }, [showMesh]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="STRESS HEATMAP"
        step="SCREEN 08 // 10"
        subtitle="Kirchhoff-Love von Mises Tensor"
        backHref="/safety"
        rightAction={
          <HudBadge variant={isSafe ? "safe" : "danger"} dot>
            SF: {safetyFactor}X ({isSafe ? "SAFE" : "RISK"})
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Heatmap Viewport Frame */}
        <div className="relative w-full aspect-square bg-slate-100 dark:bg-[#101F23] rounded-[16px] border border-slate-300 dark:border-[#294044] overflow-hidden flex items-center justify-center shadow-md dark:shadow-xl">
          <canvas ref={canvasRef} className="w-full h-full object-cover" />

          {/* Dynamic Hotspot Reticle Marker anchored to computed stress maximum */}
          <div
            style={{
              left: `${peakRelPos.leftPct}%`,
              top: `${peakRelPos.topPct}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="absolute pointer-events-none flex flex-col items-center z-10"
          >
            <div className="w-6 h-6 rounded-full border-2 border-red-500 animate-ping" />
            <div className="w-2.5 h-2.5 rounded-full bg-red-600 absolute top-1.5" />
            <div className="bg-white/95 dark:bg-[#0D191C]/90 px-2 py-0.5 rounded border border-red-500 text-[9px] font-mono text-red-700 dark:text-[#FF8888] font-bold mt-1 shadow-xs whitespace-nowrap">
              PEAK: {peakStressMpa} MPa ({modeLabel})
            </div>
          </div>

          {/* Controls overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <div className="bg-white/95 dark:bg-[#0D191C]/90 backdrop-blur-md px-2.5 py-1 rounded-[8px] border border-slate-200 dark:border-[#294044] text-[10px] font-mono text-slate-700 dark:text-[#8C999A] shadow-xs">
              VON MISES: <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">σ_vm [MPa]</span>
            </div>
          </div>

          <div className="absolute bottom-3 right-3 pointer-events-auto">
            <button
              onClick={() => setShowMesh(!showMesh)}
              className="bg-white/90 text-slate-700 hover:text-slate-900 border-slate-200 dark:bg-[#15282C]/90 text-xs font-mono dark:text-[#8C999A] dark:hover:text-[#F5FDFF] px-2.5 py-1.5 rounded-[8px] border dark:border-[#294044] flex items-center gap-1.5 shadow-xs"
            >
              <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
              <span>{showMesh ? "MESH ON" : "MESH OFF"}</span>
            </button>
          </div>
        </div>

        {/* Heatmap Spectrum Gradient Legend */}
        <div className="p-3 bg-white dark:bg-[#15282C] rounded-[12px] border border-slate-200 dark:border-[#294044] space-y-1.5 shadow-sm">
          <div className="flex justify-between text-[10px] font-mono text-slate-600 dark:text-[#8C999A]">
            <span>0 MPa</span>
            <span className="text-sky-700 dark:text-[#0EB29A]">{(peakStressMpa * 0.35).toFixed(1)} MPa</span>
            <span className="text-amber-600 dark:text-[#F5C518]">{(peakStressMpa * 0.7).toFixed(1)} MPa</span>
            <span className="text-red-600 dark:text-[#FF4444]">{yieldStrengthMpa.toFixed(0)} MPa (YIELD)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-gradient-to-r from-blue-900 via-sky-500 via-emerald-400 via-yellow-400 to-red-500 border border-slate-300 dark:border-[#233A3D]" />
        </div>

        {/* Stress Metrics Telemetry */}
        <ChamferedCard className="p-3.5 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 bg-slate-50 dark:bg-[#101F23] rounded-[8px] border border-slate-200 dark:border-[#233A3D]">
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">PEAK CONCENTRATION</span>
              <span className="text-slate-900 dark:text-[#F5FDFF] font-bold text-sm">{peakStressMpa} MPa</span>
              <span className="text-[9px] text-slate-500 dark:text-[#8C999A] block mt-0.5">
                @ X:{peakCoordsMm.x}mm, Y:{peakCoordsMm.y}mm
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-[#101F23] rounded-[8px] border border-slate-200 dark:border-[#233A3D]">
              <span className="text-slate-500 dark:text-[#8C999A] block text-[10px]">ALLOWABLE YIELD (σ_y)</span>
              <span className="text-emerald-700 dark:text-[#4ADE80] font-bold text-sm">{yieldStrengthMpa.toFixed(1)} MPa</span>
              <span className="text-[9px] text-sky-700 dark:text-[#DDF0C2] block mt-0.5 font-semibold">
                SAFETY FACTOR: {safetyFactor}x
              </span>
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
