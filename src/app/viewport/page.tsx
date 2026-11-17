"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Eye,
  Radio,
  Layers,
  ArrowRight,
  Volume2,
  VolumeX,
  Box,
  Play,
  Pause,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useChladniShader } from "@/hooks/useChladniShader";
import {
  chladniAmplitude,
  frequencyToMode,
  getStoredMaterial,
  getStoredThickness,
  MaterialData,
  DEFAULT_MATERIAL,
} from "@/utils/physics";

export default function ChladniViewportPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meshCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const [frequency, setFrequency] = useState<number>(740);
  const [showNodalGrid, setShowNodalGrid] = useState<boolean>(true);
  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [isAudioOn, setIsAudioOn] = useState<boolean>(false);
  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);

  const activeMode = frequencyToMode(frequency, material.acousticSpeedMs, thicknessMm);

  const { isWebGPUSupported, fps, particleCount, mountCanvas, updateParameters } =
    useChladniShader(frequency, activeMode.m, activeMode.n);

  useEffect(() => {
    setMaterial(getStoredMaterial());
    setThicknessMm(getStoredThickness());
    if (typeof window !== "undefined") {
      const savedFreq = Number(localStorage.getItem("harmonix_peak_freq"));
      if (Number.isFinite(savedFreq) && savedFreq >= 200) {
        setFrequency(savedFreq);
      }
    }
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 360;
      canvasRef.current.height = 360;
      mountCanvas(canvasRef.current);
    }
  }, [mountCanvas]);

  useEffect(() => {
    updateParameters(frequency, activeMode.m, activeMode.n, showNodalGrid);
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_peak_freq", String(frequency));
      localStorage.setItem(
        "harmonix_active_mode",
        JSON.stringify({
          id: `mode-${activeMode.m}-${activeMode.n}`,
          name: `Mode ${activeMode.label}`,
          indices: activeMode.label,
          m: activeMode.m,
          n: activeMode.n,
          freqHz: frequency,
        })
      );
    }
    if (oscRef.current && audioCtxRef.current) {
      oscRef.current.frequency.setValueAtTime(frequency, audioCtxRef.current.currentTime);
    }
  }, [frequency, activeMode.m, activeMode.n, activeMode.label, showNodalGrid, updateParameters]);

  useEffect(() => {
    return () => {
      oscRef.current?.stop();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Auto-Sweep Harmonics loop
  useEffect(() => {
    if (!isSweeping) return;
    const id = setInterval(() => {
      setFrequency((f) => (f >= 2450 ? 220 : f + 25));
    }, 80);
    return () => clearInterval(id);
  }, [isSweeping]);

  // 3D Bending Wireframe Mesh Renderer
  useEffect(() => {
    if (!is3DMode || !meshCanvasRef.current) return;
    const canvas = meshCanvasRef.current;
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    const cols = 22;
    const rows = 22;

    const draw3D = () => {
      phase += 0.14;
      const isDark = document.documentElement.classList.contains("dark");
      ctx.fillStyle = isDark ? "#0D191C" : "#F1F5F9";
      ctx.fillRect(0, 0, 360, 360);

      const osc = Math.sin(phase);
      const pts: { sx: number; sy: number; z: number }[][] = [];

      for (let r = 0; r <= rows; r++) {
        const rowArr: { sx: number; sy: number; z: number }[] = [];
        const ny = r / rows;
        for (let c = 0; c <= cols; c++) {
          const nx = c / cols;
          const w =
            activeMode.m === activeMode.n
              ? Math.sin(activeMode.m * Math.PI * nx) * Math.sin(activeMode.n * Math.PI * ny) +
                0.35 * Math.cos(activeMode.m * Math.PI * nx) * Math.cos(activeMode.n * Math.PI * ny)
              : chladniAmplitude(nx, ny, activeMode.m, activeMode.n);
          const z = w * osc * 22;

          // Isometric 3D projection
          const cx = nx - 0.5;
          const cy = ny - 0.5;
          const sx = 180 + (cx - cy) * 190;
          const sy = 190 + (cx + cy) * 95 - z;
          rowArr.push({ sx, sy, z: Math.abs(w) });
        }
        pts.push(rowArr);
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = pts[r][c];
          const pRight = pts[r][c + 1];
          const pDown = pts[r + 1][c];
          const amp = p.z;
          const color =
            amp < 0.2
              ? isDark
                ? "#10B981"
                : "#059669"
              : amp > 0.75
              ? "#EF4444"
              : isDark
              ? "#0EB29A"
              : "#0284C7";
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(pRight.sx, pRight.sy);
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(pDown.sx, pDown.sy);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw3D);
    };
    raf = requestAnimationFrame(draw3D);
    return () => cancelAnimationFrame(raf);
  }, [is3DMode, activeMode.m, activeMode.n]);

  const toggleAudioDrive = async () => {
    if (isAudioOn) {
      oscRef.current?.stop();
      oscRef.current = null;
      setIsAudioOn(false);
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, audioCtxRef.current.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtxRef.current.currentTime);
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    osc.start();
    oscRef.current = osc;
    setIsAudioOn(true);
  };

  // Approximate acoustic SPL from frequency & material damping
  const splDb = (74 + Math.min(18, frequency / 140)).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="AR CHLADNI VIEWPORT"
        step="SCREEN 04 // 10"
        subtitle={`${material.code} (${thicknessMm}mm)`}
        backHref="/material"
        rightAction={
          <HudBadge variant={isWebGPUSupported ? "teal" : "lime"} dot>
            {isWebGPUSupported ? "WEBGPU READY" : "CANVAS-2D"} // {fps} FPS
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Core AR Chladni Viewport */}
        <div className="relative w-full aspect-square bg-slate-100 dark:bg-[#0D191C] rounded-[20px] border border-slate-300 dark:border-[#294044] overflow-hidden flex items-center justify-center shadow-md dark:shadow-2xl">
          <canvas
            ref={canvasRef}
            className={`w-full h-full object-contain ${is3DMode ? "hidden" : "block"}`}
          />
          {is3DMode && (
            <canvas ref={meshCanvasRef} className="w-full h-full object-contain" />
          )}

          <div className="absolute inset-2 border border-slate-300/60 dark:border-[#294044]/40 rounded-[14px] pointer-events-none" />
          <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-sky-600 dark:border-[#0EB29A] pointer-events-none" />
          <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-sky-600 dark:border-[#0EB29A] pointer-events-none" />
          <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-sky-600 dark:border-[#0EB29A] pointer-events-none" />
          <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-sky-600 dark:border-[#0EB29A] pointer-events-none" />

          {/* Floating Live Frequency Telemetry Badge */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-none">
            <div className="bg-white/95 dark:bg-[#0D191C]/90 backdrop-blur-md px-3 py-1.5 rounded-[10px] border border-slate-200 dark:border-[#0EB29A]/50 flex items-center gap-2 shadow-sm">
              <Radio className="w-4 h-4 text-sky-600 dark:text-[#0EB29A] animate-pulse" />
              <div>
                <span className="text-[10px] font-mono tracking-widest text-slate-500 dark:text-[#8C999A] block leading-none font-semibold">
                  EXCITATION FREQUENCY
                </span>
                <span className="text-sm font-bold font-mono text-slate-900 dark:text-[#DDF0C2]">
                  {frequency} Hz // MODE {activeMode.label}
                </span>
              </div>
            </div>

            <div className="bg-white/90 dark:bg-[#0D191C]/80 px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#294044] text-[9px] font-mono text-slate-600 dark:text-[#8C999A] shadow-xs">
              PARTICLES: <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{particleCount.toLocaleString()}</span> // FPS:{" "}
              <span className="text-emerald-600 dark:text-[#4ADE80] font-bold">{fps}</span>
            </div>
          </div>

          {/* Sound Pressure Level + Audio Drive toggle */}
          <button
            onClick={toggleAudioDrive}
            className={`absolute bottom-4 left-4 z-20 backdrop-blur-md px-2.5 py-1.5 rounded-[8px] border text-[10px] font-mono flex items-center gap-1.5 shadow-xs transition-colors ${
              isAudioOn
                ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C] dark:border-[#0EB29A]"
                : "bg-white/95 dark:bg-[#0D191C]/90 text-slate-700 dark:text-[#F5FDFF] border-slate-200 dark:border-[#294044]"
            }`}
          >
            {isAudioOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />}
            <span>{isAudioOn ? `DRIVE ON (${splDb} dBA)` : `AUDIO DRIVE OFF`}</span>
          </button>

          {/* View Mode (3D Bending Mesh vs 2D Chladni) & SDF toggles */}
          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => setIs3DMode((v) => !v)}
              className={`text-[10px] font-mono px-2.5 py-1.5 rounded-[8px] border flex items-center gap-1 shadow-xs font-bold ${
                is3DMode
                  ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C] dark:border-[#0EB29A]"
                  : "bg-white/90 text-slate-700 border-slate-200 dark:bg-[#15282C]/90 dark:text-[#8C999A] dark:border-[#294044]"
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>{is3DMode ? "3D MESH" : "2D SAND"}</span>
            </button>

            {!is3DMode && (
              <button
                onClick={() => setShowNodalGrid(!showNodalGrid)}
                className="bg-white/90 hover:bg-slate-50 text-slate-700 dark:bg-[#15282C]/90 text-[10px] font-mono dark:text-[#8C999A] px-2.5 py-1.5 rounded-[8px] border border-slate-200 dark:border-[#294044] flex items-center gap-1 shadow-xs"
              >
                <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
                <span>{showNodalGrid ? "SDF ON" : "SDF OFF"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Plain-English Visual Guide */}
        <div className="px-3 py-2 rounded-[10px] bg-sky-50 dark:bg-[#15282C] border border-sky-200 dark:border-[#294044] text-[11px] font-mono text-slate-700 dark:text-[#DDF0C2] flex items-center justify-between">
          <span>
            {is3DMode
              ? "Green = Calm (Safe) • Red Peaks = High Flexing"
              : "Particles gather on calm nodal lines where parts stay safe."}
          </span>
          <button
            onClick={() => setIsSweeping((s) => !s)}
            className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 border ${
              isSweeping
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-white text-sky-700 border-sky-300 dark:bg-[#101F23] dark:text-[#0EB29A] dark:border-[#0EB29A]"
            }`}
          >
            {isSweeping ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isSweeping ? "STOP" : "AUTO-SWEEP"}</span>
          </button>
        </div>

        {/* Live Frequency Slider Fine Tuner */}
        <ChamferedCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
              REAL-TIME ACOUSTIC DRIVE
            </span>
            <span className="text-sm font-mono font-bold text-sky-700 dark:text-[#0EB29A]">
              {frequency} HZ → MODE {activeMode.label}
            </span>
          </div>

          <input
            type="range"
            min="200"
            max="2500"
            step="5"
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
            className="w-full accent-sky-600 dark:accent-[#0EB29A] bg-slate-200 dark:bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            <span>200 HZ (1,1)</span>
            <span className="text-slate-700 dark:text-[#DDF0C2] font-semibold">SWEEP HARMONICS</span>
            <span>2500 HZ (4,2)</span>
          </div>
        </ChamferedCard>

        {/* Quick Pipeline Links */}
        <div className="grid grid-cols-2 gap-3">
          <HudButton
            variant="secondary"
            size="md"
            onClick={() => router.push("/tuner")}
            className="flex items-center justify-center gap-2"
          >
            <Activity className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
            <span>OPEN PITCH TUNER</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            onClick={() => router.push("/modes")}
            className="flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4 text-sky-600 dark:text-[#DDF0C2]" />
            <span>HARMONIC GALLERY</span>
          </HudButton>
        </div>

        {/* Proceed to Tuner CTA */}
        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/tuner")}
            className="flex items-center justify-center gap-2"
          >
            <span>PROCEED TO AUDIO PITCH TUNER</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
