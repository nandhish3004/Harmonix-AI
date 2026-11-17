"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ArrowRight,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import {
  computeAllModes,
  ComputedHarmonicMode,
  DEFAULT_MATERIAL,
  getStoredMaterial,
  getStoredPlateGeometry,
  getStoredStandoffs,
  getStoredThickness,
  MaterialData,
} from "@/utils/physics";

const INITIAL_MODES: ComputedHarmonicMode[] = computeAllModes(DEFAULT_MATERIAL, 1.6);

export default function HarmonicModesPage() {
  const router = useRouter();
  const [modes, setModes] = useState<ComputedHarmonicMode[]>(INITIAL_MODES);
  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [selectedModeId, setSelectedModeId] = useState<string>("mode-2-2");

  useEffect(() => {
    const mat = getStoredMaterial();
    const thick = getStoredThickness();
    const geo = getStoredPlateGeometry();
    const pins = getStoredStandoffs();
    setMaterial(mat);
    setThicknessMm(thick);
    setModes(computeAllModes(mat, thick, geo.areaMm2, geo.aspectRatio, pins.length));
  }, []);

  const selectedMode = modes.find((m) => m.id === selectedModeId) || modes[2];

  const handleSelectMode = (mode: ComputedHarmonicMode) => {
    setSelectedModeId(mode.id);
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_active_mode", JSON.stringify(mode));
      localStorage.setItem("harmonix_peak_freq", String(mode.freqHz));
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
        subtitle={`Kirchhoff-Love // ${material.code} (${thicknessMm.toFixed(1)}mm)`}
        backHref="/tuner"
        rightAction={
          <HudBadge variant="teal">
            6 EIGENMODES
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        <div>
          <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider block mb-1 font-semibold">
            fₘ,ₙ = (π/2)√(D/ρh) · [(m/a)² + (n/b)²]
          </span>
          <p className="text-xs font-mono text-slate-600 dark:text-[#8C999A]">
            Select mode shape calibrated to your scanned area &amp; material rigidity.
          </p>
        </div>

        {/* 2-Column Gallery Grid */}
        <div className="grid grid-cols-2 gap-3">
          {modes.map((mode) => {
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
