"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { getStoredActiveMode, getStoredPlateGeometry } from "@/utils/physics";

export default function DefectAnalysisPage() {
  const router = useRouter();

  const [baselineHz, setBaselineHz] = useState<number>(740);
  const [actualHz, setActualHz] = useState<number>(702);
  const [plateAreaMm2, setPlateAreaMm2] = useState<number>(14250);

  useEffect(() => {
    const mode = getStoredActiveMode();
    const geo = getStoredPlateGeometry();
    setPlateAreaMm2(geo.areaMm2);

    if (typeof window !== "undefined") {
      const savedBase = Number(localStorage.getItem("harmonix_peak_freq"));
      const base = Number.isFinite(savedBase) && savedBase > 50 ? savedBase : mode.freqHz;
      const meas = Number(localStorage.getItem("harmonix_measured_freq"));
      setBaselineHz(base);
      if (Number.isFinite(meas) && meas > 50) {
        setActualHz(meas);
      } else {
        setActualHz(Math.max(50, base - 38));
      }
    }
  }, []);

  const deltaHz = actualHz - baselineHz;
  const freqRatioSq = Math.pow(actualHz / Math.max(1, baselineHz), 2);
  const stiffnessDeltaPct = ((freqRatioSq - 1) * 100).toFixed(1);
  const damageIndex = Math.max(0, 1 - freqRatioSq);
  const voidRadiusMm = Math.sqrt((Math.abs(1 - freqRatioSq) * plateAreaMm2) / Math.PI);
  const defectDetected = Math.abs(deltaHz) > 15;

  const handleProceed = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_defect_detected", String(defectDetected));
      localStorage.setItem("harmonix_delta_hz", String(deltaHz));
    }
    router.push("/export");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="DEFECT ANOMALY CALLER"
        step="SCREEN 09 // 10"
        subtitle="Baseline Comparison & Subsurface Void NDT"
        backHref="/stress"
        rightAction={
          <HudBadge variant={defectDetected ? "danger" : "safe"} dot>
            {defectDetected ? "DEFECT FLAGGED" : "NOMINAL PASS"}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Main Defect Callout Banner */}
        <ChamferedCard
          variant={defectDetected ? "danger" : "safe"}
          className="p-4 space-y-2 shadow-sm dark:shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center gap-2 text-xs font-mono font-bold uppercase ${
                defectDetected
                  ? "text-red-700 dark:text-[#FF4444]"
                  : "text-emerald-700 dark:text-[#4ADE80]"
              }`}
            >
              {defectDetected ? (
                <ShieldAlert className="w-5 h-5 shrink-0" />
              ) : (
                <ShieldCheck className="w-5 h-5 shrink-0" />
              )}
              <span>
                {defectDetected
                  ? "SUB-SURFACE ANOMALY IDENTIFIED"
                  : "STRUCTURAL INTEGRITY VERIFIED"}
              </span>
            </div>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                defectDetected
                  ? "bg-red-600 text-white dark:bg-[#FF4444] dark:text-[#0D191C]"
                  : "bg-emerald-600 text-white dark:bg-[#4ADE80] dark:text-[#0D191C]"
              }`}
            >
              {defectDetected ? "98.4% CONF" : "PASS"}
            </span>
          </div>

          <p
            className={`text-xs font-mono leading-relaxed ${
              defectDetected
                ? "text-red-800 dark:text-[#FF8888]"
                : "text-emerald-800 dark:text-[#DDF0C2]"
            }`}
          >
            {defectDetected
              ? `Frequency shift (${deltaHz >= 0 ? `+${deltaHz}` : deltaHz} Hz) exceeds ±15 Hz NDT threshold. Asymmetrical nodal distortion detected in Quadrant Q2.`
              : `Measured resonance (${actualHz} Hz) aligns with golden baseline (${baselineHz} Hz) within ±15 Hz NDT tolerance.`}
          </p>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
            <div className="bg-white/80 dark:bg-[#101F23]/80 p-2 rounded border border-slate-200 dark:border-[#294044]">
              <span className="text-slate-500 dark:text-[#8C999A] block text-[9px]">GOLDEN REF FREQ:</span>
              <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{baselineHz} Hz</span>
            </div>
            <div className="bg-white/80 dark:bg-[#101F23]/80 p-2 rounded border border-slate-200 dark:border-[#294044]">
              <span className="text-slate-500 dark:text-[#8C999A] block text-[9px]">MEASURED FREQ:</span>
              <span
                className={`font-bold ${
                  defectDetected ? "text-red-700 dark:text-[#FF4444]" : "text-emerald-700 dark:text-[#4ADE80]"
                }`}
              >
                {actualHz} Hz ({deltaHz >= 0 ? `+${deltaHz}` : deltaHz} Hz)
              </span>
            </div>
          </div>
        </ChamferedCard>

        {/* Asymmetry Comparison Viewport Frame */}
        <div className="relative w-full aspect-square bg-slate-100 dark:bg-[#101F23] rounded-[16px] border border-slate-300 dark:border-[#294044] overflow-hidden flex items-center justify-center shadow-md dark:shadow-xl">
          <div className="absolute inset-0 ar-grid-bg opacity-50 dark:opacity-30 pointer-events-none" />

          <svg className="w-full h-full p-6" viewBox="0 0 320 320">
            <path
              d="M 40 160 Q 160 40 280 160 Q 160 280 40 160"
              className="stroke-sky-600 dark:stroke-[#0EB29A]"
              strokeWidth="2"
              strokeDasharray="4 4"
              fill="none"
              opacity="0.6"
            />
            <path
              d="M 160 40 Q 40 160 160 280 Q 280 160 160 40"
              className="stroke-sky-600 dark:stroke-[#0EB29A]"
              strokeWidth="2"
              strokeDasharray="4 4"
              fill="none"
              opacity="0.6"
            />

            {defectDetected && (
              <>
                <path
                  d="M 40 160 Q 170 30 250 135 Q 230 190 280 200 Q 160 280 40 160"
                  stroke="#DC2626"
                  strokeWidth="3.5"
                  fill="none"
                />
                <circle
                  cx="215"
                  cy="120"
                  r={Math.min(34, Math.max(8, voidRadiusMm * 0.45))}
                  fill="rgba(220, 38, 38, 0.2)"
                  stroke="#DC2626"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
                <text x="215" y="100" fill="#DC2626" fontSize="10" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                  VOID r≈{voidRadiusMm.toFixed(1)}mm
                </text>
              </>
            )}
          </svg>

          <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-[#0D191C]/90 px-2.5 py-1 rounded border border-slate-200 dark:border-[#294044] text-[9px] font-mono text-slate-600 dark:text-[#8C999A] shadow-xs">
            <span className="text-sky-700 dark:text-[#0EB29A] font-semibold">-- BASELINE</span> //{" "}
            <span className={defectDetected ? "text-red-700 dark:text-[#FF4444] font-semibold" : "text-emerald-600 font-semibold"}>
              {defectDetected ? "— ACTUAL ANOMALY" : "— ALIGNED"}
            </span>
          </div>
        </div>

        {/* Interactive Measured Frequency Comparison Slider */}
        <ChamferedCard className="p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 dark:text-[#8C999A]">SIMULATE / ADJUST MEASURED FREQ:</span>
            <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{actualHz} Hz</span>
          </div>
          <input
            type="range"
            min={Math.max(100, baselineHz - 100)}
            max={baselineHz + 100}
            step="1"
            value={actualHz}
            onChange={(e) => setActualHz(Number(e.target.value))}
            className="w-full accent-sky-600 dark:accent-[#0EB29A] bg-slate-200 dark:bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between text-xs font-mono pt-1">
            <span className="text-slate-500 dark:text-[#8C999A]">STIFFNESS PERTURBATION (Δk/k₀):</span>
            <span className={`font-bold ${defectDetected ? "text-red-700 dark:text-[#FF4444]" : "text-emerald-700 dark:text-[#4ADE80]"}`}>
              {stiffnessDeltaPct}% (D = {damageIndex.toFixed(3)})
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 dark:text-[#8C999A]">EQUIVALENT VOID RADIUS:</span>
            <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">
              {voidRadiusMm.toFixed(1)} mm (A = {plateAreaMm2} mm²)
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 dark:text-[#8C999A]">NDT STANDARD CONFORMANCE:</span>
            <span className={`font-bold ${defectDetected ? "text-red-700 dark:text-[#FF4444]" : "text-emerald-700 dark:text-[#4ADE80]"}`}>
              {defectDetected ? "NON-CONFORMANT (FAIL)" : "CONFORMANT (PASS)"}
            </span>
          </div>
        </ChamferedCard>

        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleProceed}
            className="flex items-center justify-center gap-2"
          >
            <span>GENERATE NDT INSPECTION REPORT</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
