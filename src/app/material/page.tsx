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

interface MaterialConfig {
  id: string;
  name: string;
  code: string;
  category: string;
  youngsModulusGpa: number;
  densityKgM3: number;
  poissonRatio: number;
  acousticSpeedMs: number;
  description: string;
}

const MATERIALS: MaterialConfig[] = [
  {
    id: "fr4",
    name: "FR4 Glass Epoxy",
    code: "PCB-FR4-STD",
    category: "CIRCUIT SUBSTRATE",
    youngsModulusGpa: 24.0,
    densityKgM3: 1850,
    poissonRatio: 0.12,
    acousticSpeedMs: 3600,
    description: "Standard woven fiberglass cloth with epoxy resin binder.",
  },
  {
    id: "al6061",
    name: "Aluminum 6061-T6",
    code: "AL-6061-T6",
    category: "AEROSPACE ALLOY",
    youngsModulusGpa: 68.9,
    densityKgM3: 2700,
    poissonRatio: 0.33,
    acousticSpeedMs: 5050,
    description: "Precipitation-hardened aluminum alloy with high strength-to-weight ratio.",
  },
  {
    id: "steel",
    name: "Structural Carbon Steel",
    code: "STEEL-AISI-1018",
    category: "FERROUS ALLOY",
    youngsModulusGpa: 200.0,
    densityKgM3: 7850,
    poissonRatio: 0.29,
    acousticSpeedMs: 5120,
    description: "Cold-drawn mild steel with uniform elasticity and high density.",
  },
  {
    id: "acrylic",
    name: "Cast Acrylic (PMMA)",
    code: "PMMA-CAST",
    category: "POLYMER",
    youngsModulusGpa: 3.2,
    densityKgM3: 1180,
    poissonRatio: 0.37,
    acousticSpeedMs: 2730,
    description: "Optically clear thermoplastic with high damping and lower resonance peaks.",
  },
];

export default function MaterialSelectionPage() {
  const router = useRouter();
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("fr4");
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);

  const selectedMaterial =
    MATERIALS.find((m) => m.id === selectedMaterialId) || MATERIALS[0];

  // Flexural plate rigidity: D = E * h^3 / (12 * (1 - nu^2))
  const flexuralRigidity = (
    (selectedMaterial.youngsModulusGpa * 1e9 * Math.pow(thicknessMm * 1e-3, 3)) /
    (12 * (1 - Math.pow(selectedMaterial.poissonRatio, 2)))
  ).toFixed(2);

  const handleConfirm = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_material", JSON.stringify(selectedMaterial));
      localStorage.setItem("harmonix_thickness", String(thicknessMm));
    }
    router.push("/viewport");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="MATERIAL MATRIX"
        step="SCREEN 03 // 10"
        subtitle="Physical Constants & Rigidity Setup"
        backHref="/scan"
      />

      <div className="p-4 space-y-4 flex-1">
        <div>
          <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider block mb-1 font-semibold">
            WORKPIECE SUBSTRATE SELECTION
          </span>
          <p className="text-xs font-mono text-slate-600 dark:text-[#8C999A]">
            Select mechanical composition to calibrate speed of sound and theoretical Chladni nodal harmonics.
          </p>
        </div>

        {/* 4 Material Cards */}
        <div className="space-y-3">
          {MATERIALS.map((mat) => {
            const isSelected = selectedMaterialId === mat.id;
            return (
              <button
                key={mat.id}
                type="button"
                onClick={() => setSelectedMaterialId(mat.id)}
                className="w-full text-left focus:outline-none transition-all"
              >
                <ChamferedCard
                  variant={isSelected ? "active" : "default"}
                  className="p-3.5 border transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest text-sky-600 dark:text-[#0EB29A] uppercase font-semibold">
                        {mat.category}
                      </span>
                      <h3 className="text-sm font-bold font-mono text-slate-900 dark:text-[#F5FDFF]">
                        {mat.name}
                      </h3>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        isSelected
                          ? "border-sky-600 bg-sky-600 text-white dark:border-[#0EB29A] dark:bg-[#0EB29A] dark:text-[#0D191C]"
                          : "border-slate-200 bg-slate-100 dark:border-[#294044] dark:bg-[#101F23] text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </div>

                  <p className="text-[11px] font-mono text-slate-600 dark:text-[#8C999A] mt-1.5 leading-snug">
                    {mat.description}
                  </p>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-200 dark:border-[#294044]/60 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-500 dark:text-[#8C999A] block">MODULUS (E)</span>
                      <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">
                        {mat.youngsModulusGpa} GPa
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-[#8C999A] block">DENSITY (ρ)</span>
                      <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">
                        {mat.densityKgM3} kg/m³
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-[#8C999A] block">WAVE SPEED (c)</span>
                      <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">
                        {mat.acousticSpeedMs} m/s
                      </span>
                    </div>
                  </div>
                </ChamferedCard>
              </button>
            );
          })}
        </div>

        {/* Thickness Slider Control */}
        <ChamferedCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
              PLATE THICKNESS (h)
            </span>
            <span className="text-sm font-mono font-bold text-sky-700 dark:text-[#0EB29A]">
              {thicknessMm.toFixed(1)} mm
            </span>
          </div>

          <input
            type="range"
            min="0.8"
            max="6.0"
            step="0.1"
            value={thicknessMm}
            onChange={(e) => setThicknessMm(parseFloat(e.target.value))}
            className="w-full accent-sky-600 dark:accent-[#0EB29A] bg-slate-200 dark:bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            <span>0.8 mm (FLEXIBLE)</span>
            <span>STANDARD: 1.6 mm</span>
            <span>6.0 mm (RIGID)</span>
          </div>

          <div className="p-2.5 bg-slate-50 dark:bg-[#101F23] rounded-[8px] border border-slate-200 dark:border-[#233A3D] flex items-center justify-between text-xs font-mono">
            <span className="text-slate-600 dark:text-[#8C999A]">FLEXURAL RIGIDITY (D):</span>
            <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">{flexuralRigidity} N·m</span>
          </div>
        </ChamferedCard>

        {/* Proceed CTA */}
        <div className="pt-2">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleConfirm}
            className="flex items-center justify-center gap-2"
          >
            <span>CONFIRM MATERIAL → ENTER VIEWPORT</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
