"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  AlertTriangle,
  Cpu,
  ArrowRight,
  RotateCcw,
  PlusCircle,
  Sparkles,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import {
  chladniAmplitude,
  computeEigenfrequencyHz,
  DEFAULT_MATERIAL,
  evalPlateMechanics,
  getStoredActiveMode,
  getStoredMaterial,
  getStoredPlateGeometry,
  getStoredStandoffs,
  getStoredThickness,
  MaterialData,
} from "@/utils/physics";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance } from "@/context/autopilot";

interface StandoffItem {
  id: string;
  x: number;
  y: number;
}

interface ComponentItem {
  id: string;
  name: string;
  tag: string;
  x: number;
  y: number;
  sensitivity: "HIGH" | "CRITICAL" | "MEDIUM";
}

const INITIAL_COMPONENTS: ComponentItem[] = [
  { id: "comp-1", name: "Timing Crystal (Fragile)", tag: "CRYSTAL", x: 180, y: 160, sensitivity: "CRITICAL" },
  { id: "comp-2", name: "Main Processor Chip", tag: "CPU-CHIP", x: 95, y: 95, sensitivity: "HIGH" },
  { id: "comp-3", name: "Ceramic Cap (Cracks easily)", tag: "CAPACITOR", x: 265, y: 240, sensitivity: "HIGH" },
];

export default function ComponentSafetyPage() {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const nodalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState({ m: 2, n: 2, indices: "(2, 2)", freqHz: 740 });
  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [plateGeo, setPlateGeo] = useState<{ areaMm2: number; aspectRatio: number }>({
    areaMm2: 14250,
    aspectRatio: 1.2,
  });
  const [components, setComponents] = useState<ComponentItem[]>(INITIAL_COMPONENTS);
  const [standoffs, setStandoffs] = useState<StandoffItem[]>([]);
  const [isAddingStandoff, setIsAddingStandoff] = useState<boolean>(false);
  const [pinnActive, setPinnActive] = useState<boolean>(false);
  const [selectedCompId, setSelectedCompId] = useState<string>("comp-1");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ w: 360, h: 320 });

  useEffect(() => {
    const active = getStoredActiveMode();
    setMode({ m: active.m, n: active.n, indices: active.indices, freqHz: active.freqHz });
    setMaterial(getStoredMaterial());
    setThicknessMm(getStoredThickness());
    setPlateGeo(getStoredPlateGeometry());
    const savedPins = getStoredStandoffs();
    if (savedPins.length > 0) {
      setStandoffs(
        savedPins.map((p, i) => ({ id: p.id || `pin-${i}`, x: p.x, y: p.y }))
      );
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("harmonix_components");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setComponents(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Evaluate amplitude at normalized (nx, ny) including virtual standoff clamping
  const evalWithStandoffs = (nx: number, ny: number) => {
    let amp = Math.abs(chladniAmplitude(nx, ny, mode.m, mode.n));
    for (const pin of standoffs) {
      const pnx = pin.x / boardSize.w;
      const pny = pin.y / boardSize.h;
      const dist2 = (nx - pnx) ** 2 + (ny - pny) ** 2;
      amp *= 1 - Math.exp(-dist2 / 0.018);
    }
    return amp;
  };

  // Render real Chladni nodal safe corridors on background canvas (with standoffs + optional PyTorch PINN)
  useEffect(() => {
    const canvas = nodalCanvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;
    const rect = board.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width));
    const h = Math.max(200, Math.round(rect.height));
    setBoardSize({ w, h });
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const data = img.data;

    for (let y = 0; y < h; y++) {
      const ny = y / h;
      for (let x = 0; x < w; x++) {
        const nx = x / w;
        const amp = evalWithStandoffs(nx, ny);
        const idx = (y * w + x) * 4;
        if (amp < 0.16) {
          data[idx] = 16;
          data[idx + 1] = 185;
          data[idx + 2] = 129;
          data[idx + 3] = Math.round((1 - amp / 0.16) * 110);
        } else if (amp > 0.75) {
          data[idx] = 239;
          data[idx + 1] = 68;
          data[idx + 2] = 68;
          data[idx + 3] = Math.round(((amp - 0.75) / 1.25) * 65);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [mode.m, mode.n, standoffs]);

  const computeScore = (comp: ComponentItem) => {
    const nx = Math.max(0, Math.min(1, comp.x / boardSize.w));
    const ny = Math.max(0, Math.min(1, comp.y / boardSize.h));
    const amp = evalWithStandoffs(nx, ny);
    return Math.max(8, Math.min(99, Math.round(100 - amp * 68)));
  };

  const activeComp = components.find((c) => c.id === selectedCompId) || components[0];
  const vibrationScore = computeScore(activeComp);
  const isSafe = vibrationScore >= 70;

  const normStandoffs = standoffs.map((s) => ({
    nx: s.x / boardSize.w,
    ny: s.y / boardSize.h,
  }));
  const activeMech = evalPlateMechanics(
    Math.max(0, Math.min(1, activeComp.x / boardSize.w)),
    Math.max(0, Math.min(1, activeComp.y / boardSize.h)),
    mode.m,
    mode.n,
    material,
    thicknessMm,
    plateGeo.areaMm2,
    plateGeo.aspectRatio,
    normStandoffs
  );
  const baseEigenHz = computeEigenfrequencyHz(
    mode.m,
    mode.n,
    material,
    thicknessMm,
    plateGeo.areaMm2,
    plateGeo.aspectRatio,
    0
  );
  const stiffenedEigenHz = computeEigenfrequencyHz(
    mode.m,
    mode.n,
    material,
    thicknessMm,
    plateGeo.areaMm2,
    plateGeo.aspectRatio,
    standoffs.length
  );
  const stiffeningDeltaHz = stiffenedEigenHz - baseEigenHz;

  const handlePointerDown = (id: string) => {
    setSelectedCompId(id);
    setActiveDragId(id);
  };

  const handleBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeDragId || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.max(25, Math.min(rect.width - 25, e.clientX - rect.left));
    const y = Math.max(25, Math.min(rect.height - 25, e.clientY - rect.top));

    setComponents((prev) =>
      prev.map((c) => (c.id === activeDragId ? { ...c, x: Math.round(x), y: Math.round(y) } : c))
    );
  };

  const handlePointerUp = () => {
    setActiveDragId(null);
  };

  const handleProceed = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_safety_score", String(vibrationScore));
      localStorage.setItem("harmonix_components", JSON.stringify(components));
      localStorage.setItem("harmonix_standoffs", JSON.stringify(standoffs));
    }
    router.push("/stress");
  };

  const handleBoardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingStandoff || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.round(Math.max(15, Math.min(rect.width - 15, e.clientX - rect.left)));
    const y = Math.round(Math.max(15, Math.min(rect.height - 15, e.clientY - rect.top)));
    setStandoffs((prev) => [...prev, { id: `pin-${Date.now()}`, x, y }]);
    setIsAddingStandoff(false);
  };

  // Intelligent Standoff Optimizer: searches the 2D modal field to find the standoff
  // location that maximizes the minimum safety score across all components.
  const handleAutoOptimizeStandoff = () => {
    let bestX = Math.round(boardSize.w * 0.5);
    let bestY = Math.round(boardSize.h * 0.5);
    let bestMinScore = -1;

    for (let gx = 0.15; gx <= 0.85; gx += 0.07) {
      for (let gy = 0.15; gy <= 0.85; gy += 0.07) {
        const px = gx * boardSize.w;
        const py = gy * boardSize.h;
        let minCompScore = 100;

        for (const comp of components) {
          const nx = Math.max(0, Math.min(1, comp.x / boardSize.w));
          const ny = Math.max(0, Math.min(1, comp.y / boardSize.h));
          let amp = Math.abs(
            mode.m === mode.n
              ? Math.sin(mode.m * Math.PI * nx) * Math.sin(mode.n * Math.PI * ny) +
                  0.35 * Math.cos(mode.m * Math.PI * nx) * Math.cos(mode.n * Math.PI * ny)
              : chladniAmplitude(nx, ny, mode.m, mode.n)
          );
          for (const pin of [...standoffs, { id: "cand", x: px, y: py }]) {
            const d2 = (nx - pin.x / boardSize.w) ** 2 + (ny - pin.y / boardSize.h) ** 2;
            amp *= 1 - Math.exp(-d2 / 0.018);
          }
          const score = Math.max(8, Math.min(99, Math.round(100 - amp * 68)));
          if (score < minCompScore) minCompScore = score;
        }

        if (minCompScore > bestMinScore) {
          bestMinScore = minCompScore;
          bestX = Math.round(px);
          bestY = Math.round(py);
        }
      }
    }

    setStandoffs((prev) => [...prev, { id: `ai-pin-${Date.now()}`, x: bestX, y: bestY }]);
  };

  // 🤖 AUTOMATION: once guide closes, if any part sits in a danger zone, AI places a support screw by itself
  const [guideOpen, setGuideOpen] = useState<boolean>(true);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const autoFixRef = useRef<() => void>(() => {});
  autoFixRef.current = () => {
    const anyRisk = components.some((c) => computeScore(c) < 70);
    if (anyRisk && standoffs.length === 0) {
      handleAutoOptimizeStandoff();
      setAiNote("✨ AI spotted a risky part and added a support screw (S1) to protect it.");
    } else if (!anyRisk) {
      setAiNote("✅ All parts are already in safe spots. Nice!");
    }
  };
  useEffect(() => {
    if (guideOpen) return;
    const t = setTimeout(() => autoFixRef.current(), 1200);
    return () => clearTimeout(t);
  }, [guideOpen]);

  useAutoAdvance(!guideOpen, 3200, () => handleProceed());

  return (
    <div className="min-h-screen flex flex-col select-none transition-colors duration-200">
      <HudHeader
        title="Part Safety"
        step="SCREEN 07 // 10"
        backHref="/modes"
        rightAction={
          <button
            onClick={() => {
              setComponents(INITIAL_COMPONENTS);
              setStandoffs([]);
              setAiNote(null);
            }}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A]"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        <TestGuide kind="safety" open={guideOpen} onDone={() => setGuideOpen(false)} />
        <ChamferedCard
          variant={isSafe ? "safe" : "danger"}
          className="p-3.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            {isSafe ? (
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-[#4ADE80]" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-[#FF4444]" />
            )}
            <div>
              <span className="text-sm font-extrabold block">
                {isSafe ? "Safe spot — barely moves here" : "Danger — shakes a lot here"}
              </span>
              <span className="text-[11px] opacity-80">
                Checking: {activeComp.name}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span
              className={`text-2xl font-black font-mono ${
                isSafe ? "text-emerald-700 dark:text-[#4ADE80]" : "text-red-700 dark:text-[#FF4444]"
              }`}
            >
              {vibrationScore}
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] block">/ 100</span>
          </div>
        </ChamferedCard>

        {/* Interactive Drag & Drop Board with Real Nodal Field Canvas */}
        <div
          ref={boardRef}
          onClick={handleBoardClick}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`relative w-full h-[320px] bg-slate-100 dark:bg-[#101F23] rounded-[16px] border overflow-hidden flex items-center justify-center touch-none shadow-md ${
            isAddingStandoff
              ? "border-sky-500 ring-2 ring-sky-400/40 cursor-cell"
              : "border-slate-300 dark:border-[#294044] cursor-crosshair"
          }`}
        >
          <div className="absolute inset-0 ar-grid-bg opacity-45 dark:opacity-25 pointer-events-none" />
          <canvas ref={nodalCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Virtual Standoff Screws */}
          {standoffs.map((pin, idx) => (
            <div
              key={pin.id}
              style={{ left: `${pin.x}px`, top: `${pin.y}px`, transform: "translate(-50%, -50%)" }}
              className="absolute w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md flex items-center justify-center text-[8px] font-mono font-black text-slate-900 z-20 pointer-events-none"
              title={`Standoff S${idx + 1}`}
            >
              S{idx + 1}
            </div>
          ))}

          {components.map((comp) => {
            const compScore = computeScore(comp);
            const compSafe = compScore >= 70;
            const isSelected = selectedCompId === comp.id;
            return (
              <div
                key={comp.id}
                onPointerDown={() => handlePointerDown(comp.id)}
                style={{
                  left: `${comp.x}px`,
                  top: `${comp.y}px`,
                  transform: "translate(-50%, -50%)",
                }}
                className={`absolute p-2 rounded-[10px] border flex flex-col items-center justify-center font-mono cursor-grab active:cursor-grabbing transition-shadow z-30 select-none ${
                  isSelected
                    ? compSafe
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-md dark:bg-[#1C332E] dark:border-[#4ADE80] dark:text-[#DDF0C2] scale-105"
                      : "bg-red-50 border-red-500 text-red-900 shadow-md dark:bg-[#2D0A0A] dark:border-[#FF4444] dark:text-[#FF8888] scale-105"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-[#15282C] dark:border-[#294044] dark:text-[#8C999A]"
                }`}
              >
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase">
                  <Cpu className="w-3 h-3" />
                  <span>{comp.tag}</span>
                </div>
                <span className="text-[8px] opacity-80 mt-0.5">
                  SCORE {compScore}
                </span>
              </div>
            );
          })}

          <div className="absolute bottom-2 left-3 pointer-events-none text-[9px] font-mono text-slate-600 dark:text-[#8C999A] bg-white/80 dark:bg-[#0D191C]/80 px-2 py-0.5 rounded">
            {isAddingStandoff
              ? "TAP ANY RED ZONE TO ADD A VIRTUAL STANDOFF SCREW"
              : `GREEN = SAFE • RED = ANTINODE${pinnActive ? " • PYTORCH PINN ACTIVE" : ""}`}
          </div>
        </div>

        {aiNote && (
          <div className="pop-in px-3.5 py-2.5 rounded-2xl brand-gradient-soft border border-sky-200 dark:border-[#0EB29A]/40 text-[12px] font-semibold text-sky-900 dark:text-[#F5FDFF]">
            {aiNote}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <HudButton
            variant="primary"
            size="md"
            onClick={() => {
              handleAutoOptimizeStandoff();
              setAiNote("✨ AI added another support screw where it helps most.");
            }}
            className="flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Fix</span>
          </HudButton>
          <HudButton
            variant="secondary"
            size="md"
            onClick={() => setIsAddingStandoff((v) => !v)}
            className="flex items-center justify-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isAddingStandoff ? "Tap the board" : "Add screw"}</span>
          </HudButton>
        </div>

        {/* Component Selector Pills */}
        <div className="grid grid-cols-3 gap-2">
          {components.map((c) => {
            const s = computeScore(c);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCompId(c.id)}
                className={`p-2 rounded-[10px] border text-left font-mono transition-all ${
                  selectedCompId === c.id
                    ? "bg-sky-50 border-sky-500 text-slate-900 dark:bg-[#1C332E] dark:border-[#0EB29A] dark:text-[#F5FDFF]"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-[#15282C] dark:border-[#294044] dark:text-[#8C999A]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-sky-600 dark:text-[#0EB29A] font-bold">{c.tag}</span>
                  <span className={`text-[9px] font-bold ${s >= 70 ? "text-emerald-600" : "text-red-600"}`}>
                    {s}
                  </span>
                </div>
                <div className="text-[10px] truncate">{c.name}</div>
              </button>
            );
          })}
        </div>

        {/* Placement Telemetry Specs (Kirchhoff-Love + Basquin Fatigue) */}
        <ChamferedCard className="p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 dark:text-[#8C999A]">Screws made board stiffer by:</span>
            <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">
              {stiffeningDeltaHz > 0 ? `+${stiffeningDeltaHz} Hz` : "0 Hz"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 dark:text-[#8C999A]">Shaking strength:</span>
            <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">
              {activeMech.rmsAccelG.toFixed(2)} G · {activeMech.vonMisesMpa.toFixed(1)} MPa
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500 dark:text-[#8C999A]">Life before cracking:</span>
            <span className={isSafe ? "text-emerald-700 dark:text-[#4ADE80] font-bold" : "text-red-700 dark:text-[#FF4444] font-bold"}>
              {activeMech.fatigueLifeCycles >= 1_000_000
                ? "> 1,000,000 CYCLES"
                : `${activeMech.fatigueLifeCycles.toLocaleString()} CYCLES`}
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
            <span>Continue to Stress Map</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
