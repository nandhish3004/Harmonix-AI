"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { useAutoAdvance } from "@/context/autopilot";
import {
  chladniAmplitude,
  computeAllModes,
  ComputedHarmonicMode,
  DEFAULT_MATERIAL,
  getStoredMaterial,
  getStoredPlateGeometry,
  getStoredStandoffs,
  getStoredThickness,
} from "@/utils/physics";

const PLAIN_NAMES: Record<string, { name: string; desc: string }> = {
  "mode-1-1": { name: "Gentle Bowl", desc: "Whole board flexes like a bowl" },
  "mode-2-0": { name: "Saddle Twist", desc: "Two sides bend opposite ways" },
  "mode-2-2": { name: "Cross Pattern", desc: "Four calm lines form a cross" },
  "mode-3-1": { name: "Clover", desc: "Leaf-shaped vibration zones" },
  "mode-3-3": { name: "Starburst", desc: "Fine grid of calm lines" },
  "mode-4-2": { name: "Stripes", desc: "Parallel bands of motion" },
};

const INITIAL_MODES: ComputedHarmonicMode[] = computeAllModes(DEFAULT_MATERIAL, 1.6);

/** Live mini-render of the real mode shape, heat-colored. */
function ModeThumb({ m, n }: { m: number; n: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const S = 72;
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const amp = Math.abs(chladniAmplitude(x / S, y / S, m, n));
        const t = Math.min(1, amp / 1.25);
        const hue = 185 - t * 185;
        // hsl → rgb (s=100%, l=55%)
        const l = 0.55;
        const a = Math.min(l, 1 - l);
        const f = (k: number) => {
          const kk = (k + hue / 30) % 12;
          return l - a * Math.max(-1, Math.min(kk - 3, Math.min(9 - kk, 1)));
        };
        const i = (y * S + x) * 4;
        img.data[i] = Math.round(f(0) * 255);
        img.data[i + 1] = Math.round(f(8) * 255);
        img.data[i + 2] = Math.round(f(4) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [m, n]);
  return <canvas ref={ref} className="w-full h-full rounded-xl" />;
}

export default function HarmonicModesPage() {
  const router = useRouter();
  const [modes, setModes] = useState<ComputedHarmonicMode[]>(INITIAL_MODES);
  const [selectedModeId, setSelectedModeId] = useState<string>("mode-2-2");
  const [aiPickId, setAiPickId] = useState<string>("mode-2-2");

  useEffect(() => {
    const mat = getStoredMaterial();
    const thick = getStoredThickness();
    const geo = getStoredPlateGeometry();
    const pins = getStoredStandoffs();
    const computed = computeAllModes(mat, thick, geo.areaMm2, geo.aspectRatio, pins.length);
    setModes(computed);

    // 🤖 AI auto-pick: the mode whose frequency is closest to the board's measured note
    let measured = 0;
    if (typeof window !== "undefined") {
      measured = Number(localStorage.getItem("harmonix_measured_freq")) || 0;
    }
    let pick = computed.find((m) => m.id === "mode-2-2") ?? computed[2];
    if (measured > 50) {
      pick = computed.reduce((best, cur) =>
        Math.abs(cur.freqHz - measured) < Math.abs(best.freqHz - measured) ? cur : best
      );
    }
    setAiPickId(pick.id);
    setSelectedModeId(pick.id);
  }, []);

  const selectedMode = modes.find((m) => m.id === selectedModeId) || modes[2];

  const persist = (mode: ComputedHarmonicMode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_active_mode", JSON.stringify(mode));
      localStorage.setItem("harmonix_peak_freq", String(mode.freqHz));
    }
  };

  const handleSelect = (mode: ComputedHarmonicMode) => {
    setSelectedModeId(mode.id);
    persist(mode);
  };

  useAutoAdvance(true, 2600, () => {
    persist(selectedMode);
    router.push("/safety");
  });

  return (
    <div className="min-h-screen flex flex-col">
      <HudHeader title="Vibration Shapes" step="SCREEN 06 // 10" backHref="/tuner" />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl brand-gradient-soft border border-sky-200 dark:border-[#0EB29A]/40 text-[12px] font-semibold text-sky-900 dark:text-[#F5FDFF]">
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
          <span>
            AI picked <b>{PLAIN_NAMES[aiPickId]?.name}</b> because it best matches your board&apos;s note. Tap any shape to
            compare.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {modes.map((mode) => {
            const isSelected = selectedModeId === mode.id;
            const info = PLAIN_NAMES[mode.id];
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelect(mode)}
                className="text-left focus:outline-none active:scale-[0.97] transition-transform"
              >
                <ChamferedCard variant={isSelected ? "active" : "default"} className="p-3 flex flex-col gap-2 h-full">
                  <div className="relative aspect-square w-full">
                    <ModeThumb m={mode.m} n={mode.n} />
                    {aiPickId === mode.id && (
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-extrabold px-2 py-0.5 rounded-full brand-gradient text-white shadow">
                        ✨ AI PICK
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white flex items-center justify-center text-sky-600 shadow">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-extrabold leading-tight">{info?.name ?? mode.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-[#8C999A] leading-snug">{info?.desc}</div>
                  </div>
                  <div className="text-[11px] font-bold brand-text">{mode.freqHz} Hz</div>
                </ChamferedCard>
              </button>
            );
          })}
        </div>

        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              persist(selectedMode);
              router.push("/safety");
            }}
            className="flex items-center justify-center gap-2"
          >
            <span>Check Part Safety</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
