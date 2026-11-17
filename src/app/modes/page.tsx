"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowRight,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";

interface HarmonicMode {
  id: string;
  name: string;
  indices: string;
  freqHz: number;
  qFactor: number;
  type: string;
  svgPath: string;
  isPeakResonance?: boolean;
}

const MODES: HarmonicMode[] = [
  {
    id: "mode-1-1",
    name: "Fundamental Mode",
    indices: "(1, 1)",
    freqHz: 215,
    qFactor: 142,
    type: "DIAGONAL SYMMETRY",
    svgPath: "M 20 20 L 80 80 M 80 20 L 20 80",
  },
  {
    id: "mode-2-0",
    name: "Saddle Torsion",
    indices: "(2, 0)",
    freqHz: 430,
    qFactor: 210,
    type: "HYPERBOLIC",
    svgPath: "M 50 10 L 50 90 M 10 50 L 90 50",
  },
  {
    id: "mode-2-2",
    name: "Radial Cross",
    indices: "(2, 2)",
    freqHz: 740,
    qFactor: 380,
    type: "RESONANT HARMONIC",
    svgPath: "M 20 50 Q 50 20 80 50 Q 50 80 20 50 M 50 20 Q 20 50 50 80 Q 80 50 50 20",
    isPeakResonance: true,
  },
  {
    id: "mode-3-1",
    name: "Clover Leaf",
    indices: "(3, 1)",
    freqHz: 1120,
    qFactor: 295,
    type: "COMPLEX MULTI-NODE",
    svgPath: "M 30 10 L 30 90 M 70 10 L 70 90 M 10 50 L 90 50",
  },
  {
    id: "mode-3-3",
    name: "Starburst Matrix",
    indices: "(3, 3)",
    freqHz: 1850,
    qFactor: 420,
    type: "HIGH FREQUENCY",
    svgPath: "M 25 25 L 75 75 M 75 25 L 25 75 M 50 15 L 50 85 M 15 50 L 85 50",
  },
  {
    id: "mode-4-2",
    name: "Higher Harmonic",
    indices: "(4, 2)",
    freqHz: 2480,
    qFactor: 310,
    type: "MODAL OVERTONE",
    svgPath: "M 20 10 L 20 90 M 40 10 L 40 90 M 60 10 L 60 90 M 80 10 L 80 90",
  },
];

export default function HarmonicModesPage() {
  const router = useRouter();
  const [selectedModeId, setSelectedModeId] = useState<string>("mode-2-2");

  const selectedMode = MODES.find((m) => m.id === selectedModeId) || MODES[2];

  const handleSelectMode = (mode: HarmonicMode) => {
    setSelectedModeId(mode.id);
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_active_mode", JSON.stringify(mode));
    }
  };

  const handleProceed = () => {
    handleSelectMode(selectedMode);
    router.push("/safety");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="HARMONIC GALLERY"
        step="SCREEN 06 // 10"
        subtitle="Pre-computed Eigenmode Shapes"
        backHref="/tuner"
        rightAction={
          <HudBadge variant="teal">
            6 MODES COMPUTED
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        <div>
          <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider block mb-1 font-semibold">
            EIGENVALUE NODAL EQUATIONS
          </span>
          <p className="text-xs font-mono text-slate-600 dark:text-[#8C999A]">
            Select mode shape to test mechanical placement boundaries and isolate component shear stress.
          </p>
        </div>

        {/* 2-Column Gallery Grid */}
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((mode) => {
            const isSelected = selectedModeId === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelectMode(mode)}
                className="text-left focus:outline-none transition-all group"
              >
                <ChamferedCard
                  variant={isSelected ? "active" : "default"}
                  className="p-3 border flex flex-col justify-between h-[180px] transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-mono tracking-widest text-sky-600 dark:text-[#0EB29A] font-bold">
                        MODE {mode.indices}
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-[#F5FDFF] truncate max-w-[110px]">
                        {mode.name}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-sky-600 dark:bg-[#0EB29A] flex items-center justify-center text-white dark:text-[#0D191C]">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>

                  {/* SVG Chladni Nodal Shape Thumbnail */}
                  <div className="w-full h-16 my-1 bg-slate-100 dark:bg-[#101F23] rounded-[8px] border border-slate-200 dark:border-[#233A3D] flex items-center justify-center p-1 relative overflow-hidden">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <rect width="100" height="100" fill="transparent" />
                      <path
                        d={mode.svgPath}
                        className={
                          isSelected
                            ? "stroke-sky-600 dark:stroke-[#DDF0C2]"
                            : "stroke-slate-700 dark:stroke-[#0EB29A]"
                        }
                        strokeWidth="3"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    {mode.isPeakResonance && (
                      <span className="absolute bottom-1 right-1 text-[8px] font-mono bg-sky-600 text-white dark:bg-[#0EB29A] dark:text-[#0D191C] px-1 rounded font-bold">
                        PEAK
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono border-t border-slate-200 dark:border-[#294044]/60 pt-1.5">
                    <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">{mode.freqHz} Hz</span>
                    <span className="text-slate-500 dark:text-[#8C999A]">Q: {mode.qFactor}</span>
                  </div>
                </ChamferedCard>
              </button>
            );
          })}
        </div>

        {/* Selected Mode Summary Card */}
        <ChamferedCard className="p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-500 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
              ACTIVE SELECTION
            </span>
            <span className="text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A]">
              MODE {selectedMode.indices} @ {selectedMode.freqHz} HZ
            </span>
          </div>
          <div className="text-xs font-mono text-slate-900 dark:text-[#F5FDFF]">
            {selectedMode.name} — {selectedMode.type}
          </div>
          <div className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            Zero-displacement nodal lines ready for high-reliability component placement.
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
            <span>EVALUATE COMPONENT PLACEMENT SAFETY</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
