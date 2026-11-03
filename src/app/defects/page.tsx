"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  ArrowRight,
  ShieldAlert,
  Search,
  Scan,
  Zap,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";

export default function DefectAnalysisPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overlay" | "baseline">("overlay");

  const baselineHz = 740;
  const actualHz = 702;
  const deltaHz = actualHz - baselineHz; // -38 Hz shift

  const handleProceed = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_defect_detected", "true");
      localStorage.setItem("harmonix_delta_hz", String(deltaHz));
    }
    router.push("/export");
  };

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col">
      <HudHeader
        title="DEFECT ANOMALY CALLER"
        step="SCREEN 09 // 10"
        subtitle="Baseline Comparison & Subsurface Void NDT"
        backHref="/stress"
        rightAction={
          <HudBadge variant="danger" dot>
            DEFECT FLAGGED
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Main Defect Callout Banner */}
        <ChamferedCard
          variant="danger"
          className="p-4 bg-[#2D0A0A] border-[#FF4444]/60 space-y-2 shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#FF4444] uppercase">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>SUB-SURFACE ANOMALY IDENTIFIED</span>
            </div>
            <span className="text-xs font-mono bg-[#FF4444] text-[#0D191C] font-bold px-2 py-0.5 rounded">
              98.4% CONFIDENCE
            </span>
          </div>

          <p className="text-xs font-mono text-[#FF8888] leading-relaxed">
            Layer 3 Internal Delamination & Micro-void located at Quadrant Q2 (X: 215mm, Y: 120mm). Asymmetrical nodal distortion verified.
          </p>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
            <div className="bg-[#101F23]/80 p-2 rounded border border-[#FF4444]/30">
              <span className="text-[#8C999A] block text-[9px]">GOLDEN REF FREQ:</span>
              <span className="text-[#F5FDFF] font-bold">{baselineHz} Hz</span>
            </div>
            <div className="bg-[#101F23]/80 p-2 rounded border border-[#FF4444]/30">
              <span className="text-[#8C999A] block text-[9px]">MEASURED FREQ:</span>
              <span className="text-[#FF4444] font-bold">
                {actualHz} Hz ({deltaHz} Hz)
              </span>
            </div>
          </div>
        </ChamferedCard>

        {/* Asymmetry Comparison Viewport Frame */}
        <div className="relative w-full aspect-square bg-[#101F23] rounded-[16px] border border-[#294044] overflow-hidden flex items-center justify-center shadow-xl">
          <div className="absolute inset-0 ar-grid-bg opacity-30 pointer-events-none" />

          {/* SVG Diagram: Symmetrical Green Baseline vs Warped Red Defect Contour */}
          <svg className="w-full h-full p-6">
            {/* Golden Reference Nodal Pattern (Cyan Dashed) */}
            <path
              d="M 40 160 Q 160 40 280 160 Q 160 280 40 160"
              stroke="#0EB29A"
              strokeWidth="2"
              strokeDasharray="4 4"
              fill="none"
              opacity="0.5"
            />
            <path
              d="M 160 40 Q 40 160 160 280 Q 280 160 160 40"
              stroke="#0EB29A"
              strokeWidth="2"
              strokeDasharray="4 4"
              fill="none"
              opacity="0.5"
            />

            {/* Actual Warped Nodal Line (Solid Red showing void distortion) */}
            <path
              d="M 40 160 Q 170 30 250 135 Q 230 190 280 200 Q 160 280 40 160"
              stroke="#FF4444"
              strokeWidth="3.5"
              fill="none"
            />

            {/* Defect void marker */}
            <circle cx="215" cy="120" r="14" fill="rgba(255, 68, 68, 0.25)" stroke="#FF4444" strokeWidth="2" strokeDasharray="3 3" />
            <text x="215" y="100" fill="#FF8888" fontSize="10" fontFamily="monospace" textAnchor="middle">
              VOID Q2
            </text>
          </svg>

          {/* Overlay Tag */}
          <div className="absolute bottom-3 left-3 bg-[#0D191C]/90 px-2.5 py-1 rounded border border-[#294044] text-[9px] font-mono text-[#8C999A]">
            <span className="text-[#0EB29A]">-- BASELINE</span> // <span className="text-[#FF4444]">— ACTUAL ANOMALY</span>
          </div>
        </div>

        {/* Anomaly Spectral Metrics */}
        <ChamferedCard className="p-3.5 bg-[#15282C] border-[#294044] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8C999A]">STIFFNESS REDUCTION (Δk):</span>
            <span className="text-[#FF4444] font-bold">-9.8% IN Q2</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8C999A]">ESTIMATED VOID RADIUS:</span>
            <span className="text-[#DDF0C2] font-bold">2.4 mm ± 0.3mm</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#8C999A]">NDT STANDARD CONFORMANCE:</span>
            <span className="text-[#FF4444] font-bold">NON-CONFORMANT (FAIL)</span>
          </div>
        </ChamferedCard>

        {/* Proceed CTA */}
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

