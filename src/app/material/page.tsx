"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { MATERIAL_CONSTANTS, MaterialData } from "@/utils/physics";
import { useAutoAdvance } from "@/context/autopilot";

interface MaterialConfig extends MaterialData {
  emoji: string;
  plain: string;
  tag: string;
}

const MATERIALS: MaterialConfig[] = [
  {
    id: "fr4",
    emoji: "🟩",
    name: "Circuit Board (FR4)",
    code: "PCB-FR4-STD",
    category: "CIRCUIT SUBSTRATE",
    youngsModulusGpa: 24.0,
    densityKgM3: 1850,
    poissonRatio: 0.12,
    acousticSpeedMs: 3600,
    plain: "The green board inside phones, laptops & gadgets.",
    tag: "Most common",
    ...MATERIAL_CONSTANTS.fr4,
  },
  {
    id: "al6061",
    emoji: "⬜",
    name: "Aluminium Plate",
    code: "AL-6061-T6",
    category: "AEROSPACE ALLOY",
    youngsModulusGpa: 68.9,
    densityKgM3: 2700,
    poissonRatio: 0.33,
    acousticSpeedMs: 5050,
    plain: "Light, strong silver metal — brackets, frames, heat-sinks.",
    tag: "Light metal",
    ...MATERIAL_CONSTANTS.al6061,
  },
  {
    id: "steel",
    emoji: "🔩",
    name: "Steel Plate",
    code: "STEEL-AISI-1018",
    category: "FERROUS ALLOY",
    youngsModulusGpa: 200.0,
    densityKgM3: 7850,
    poissonRatio: 0.29,
    acousticSpeedMs: 5120,
    plain: "Very stiff and heavy — machine parts & structures.",
    tag: "Heavy duty",
    ...MATERIAL_CONSTANTS.steel,
  },
  {
    id: "acrylic",
    emoji: "🔷",
    name: "Acrylic Sheet",
    code: "PMMA-CAST",
    category: "POLYMER",
    youngsModulusGpa: 3.2,
    densityKgM3: 1180,
    poissonRatio: 0.37,
    acousticSpeedMs: 2730,
    plain: "Clear plastic — displays, covers & enclosures.",
    tag: "Flexible",
    ...MATERIAL_CONSTANTS.acrylic,
  },
];

const THICKNESS_PRESETS = [
  { mm: 0.8, label: "Thin", sub: "0.8 mm" },
  { mm: 1.6, label: "Standard", sub: "1.6 mm" },
  { mm: 3.0, label: "Thick", sub: "3.0 mm" },
  { mm: 5.0, label: "Very thick", sub: "5.0 mm" },
];

function Meter({ label, value, from, to }: { label: string; value: number; from: string; to: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-[#8C999A] mb-0.5">
        <span>{label}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#233A3D] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(6, Math.min(100, value * 100))}%`,
            background: `linear-gradient(90deg, ${from}, ${to})`,
          }}
        />
      </div>
    </div>
  );
}

export default function MaterialSelectionPage() {
  const router = useRouter();
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("fr4");
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [area, setArea] = useState<number | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const a = Number(localStorage.getItem("harmonix_plate_area"));
      if (Number.isFinite(a) && a > 0) setArea(a);

      // 🤖 AI material guess: Hugging Face label first, otherwise colour analysis of the scanned board
      const hf = localStorage.getItem("harmonix_hf_material");
      const hfLabel = localStorage.getItem("harmonix_hf_material_label");
      const applyGuess = (id: string, reason: string) => {
        setSelectedMaterialId(id);
        setThicknessMm(id === "fr4" ? 1.6 : 3.0);
        setAiReason(reason);
        setAiReady(true);
      };
      if (hf && ["fr4", "al6061", "steel", "acrylic"].includes(hf)) {
        applyGuess(hf, `Hugging Face recognised "${hfLabel ?? hf}" in your scan.`);
      } else {
        const thumb = localStorage.getItem("harmonix_scan_thumb");
        if (thumb) {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = 24;
            c.height = 24;
            const ctx = c.getContext("2d");
            if (!ctx) {
              applyGuess("fr4", "Defaulting to the most common material.");
              return;
            }
            ctx.drawImage(img, 0, 0, 24, 24);
            const d = ctx.getImageData(0, 0, 24, 24).data;
            let r = 0;
            let g = 0;
            let b = 0;
            const n = d.length / 4;
            for (let i = 0; i < d.length; i += 4) {
              r += d[i];
              g += d[i + 1];
              b += d[i + 2];
            }
            r /= n;
            g /= n;
            b /= n;
            const mx = Math.max(r, g, b);
            const mn = Math.min(r, g, b);
            const sat = mx === 0 ? 0 : (mx - mn) / mx;
            const bright = mx / 255;
            if (g > r * 1.1 && g > b * 1.04 && sat > 0.2) {
              applyGuess("fr4", "Your board is mostly green, typical of a circuit board (FR4).");
            } else if (sat < 0.22 && bright > 0.58) {
              applyGuess("al6061", "Light silvery-grey surface, it looks like aluminium.");
            } else if (sat < 0.22) {
              applyGuess("steel", "Dark grey surface, it looks like steel.");
            } else {
              applyGuess("fr4", "Colour was unclear, so I chose the most common material.");
            }
          };
          img.onerror = () => applyGuess("fr4", "Defaulting to the most common material.");
          img.src = thumb;
        } else {
          setAiReason("No scan colour data yet, so I chose the most common material (FR4).");
          setAiReady(true);
        }
      }
    }
  }, []);

  const selected = MATERIALS.find((m) => m.id === selectedMaterialId) || MATERIALS[0];

  const handleConfirm = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_material", JSON.stringify(selected));
      localStorage.setItem("harmonix_thickness", String(thicknessMm));
    }
    router.push("/viewport");
  };

  // 🤖 Autopilot: confirm the AI's pick automatically after a short pause
  useAutoAdvance(aiReady, 3200, () => handleConfirm());

  return (
    <div className="min-h-screen flex flex-col">
      <HudHeader title="Pick Material" step="SCREEN 03 // 10" backHref="/scan" />

      <div className="p-4 space-y-4 flex-1">
        {/* AI recommendation */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl brand-gradient-soft border border-sky-200 dark:border-[#0EB29A]/40 text-[12px] font-semibold text-sky-900 dark:text-[#F5FDFF]">
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
          <span>
            <b>AI pick:</b> {aiReason ?? "analysing your scan…"} Tap another card to override.
            {area ? ` (Scanned area ≈ ${Math.round(area / 100) / 10} cm²)` : ""}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {MATERIALS.map((mat) => {
            const isSelected = selectedMaterialId === mat.id;
            return (
              <button
                key={mat.id}
                type="button"
                onClick={() => setSelectedMaterialId(mat.id)}
                className="text-left focus:outline-none active:scale-[0.97] transition-transform"
              >
                <ChamferedCard
                  variant={isSelected ? "active" : "default"}
                  className="p-3.5 h-full flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-3xl leading-none">{mat.emoji}</span>
                    {isSelected ? (
                      <span className="w-6 h-6 rounded-full brand-gradient flex items-center justify-center text-white">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#233A3D] text-slate-500 dark:text-[#8C999A]">
                        {mat.tag}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold leading-tight">{mat.name}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-[#8C999A] leading-snug mt-0.5">{mat.plain}</p>
                  </div>
                  <div className="space-y-1.5 mt-auto pt-1">
                    <Meter label="Stiffness" value={mat.youngsModulusGpa / 200} from="#22D3EE" to="#0284C7" />
                    <Meter label="Weight" value={mat.densityKgM3 / 7850} from="#FBBF24" to="#F59E0B" />
                  </div>
                </ChamferedCard>
              </button>
            );
          })}
        </div>

        {/* Thickness chips */}
        <div>
          <span className="text-sm font-extrabold block mb-2">How thick is it?</span>
          <div className="grid grid-cols-4 gap-2">
            {THICKNESS_PRESETS.map((t) => {
              const on = thicknessMm === t.mm;
              return (
                <button
                  key={t.mm}
                  onClick={() => setThicknessMm(t.mm)}
                  className={`rounded-2xl py-2.5 px-1 text-center border-2 transition-all active:scale-95 ${
                    on
                      ? "brand-gradient text-white border-transparent shadow-md shadow-sky-400/40"
                      : "bg-white dark:bg-[#15282C] border-slate-200 dark:border-[#294044] text-slate-700 dark:text-[#F5FDFF]"
                  }`}
                >
                  <span className="block text-xs font-extrabold">{t.label}</span>
                  <span className={`block text-[10px] ${on ? "text-white/90" : "text-slate-500"}`}>{t.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleConfirm}
            className="flex items-center justify-center gap-2"
          >
            <span>Continue to Live AR</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
