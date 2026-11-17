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
  Camera,
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

type ViewMode = "ar" | "3d" | "2d";

interface Point2D {
  x: number;
  y: number;
}

const DEFAULT_QUAD: Point2D[] = [
  { x: 55, y: 75 },
  { x: 305, y: 65 },
  { x: 325, y: 295 },
  { x: 35, y: 285 },
];

/** Bilinear perspective projection from normalized (u, v) in [0,1]^2 to quad P1..P4. */
function projectToQuad(u: number, v: number, q: Point2D[]): Point2D {
  const topX = q[0].x * (1 - u) + q[1].x * u;
  const topY = q[0].y * (1 - u) + q[1].y * u;
  const botX = q[3].x * (1 - u) + q[2].x * u;
  const botY = q[3].y * (1 - u) + q[2].y * u;
  return {
    x: topX * (1 - v) + botX * v,
    y: topY * (1 - v) + botY * v,
  };
}

export default function ChladniViewportPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spatialCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const [frequency, setFrequency] = useState<number>(740);
  const [showNodalGrid, setShowNodalGrid] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("ar");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [xrayOpacity, setXrayOpacity] = useState<number>(0.85);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [isAudioOn, setIsAudioOn] = useState<boolean>(false);
  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [quad, setQuad] = useState<Point2D[]>(DEFAULT_QUAD);

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
      try {
        const b = localStorage.getItem("harmonix_boundary");
        if (b) {
          const parsed = JSON.parse(b);
          if (Array.isArray(parsed) && parsed.length === 4) {
            setQuad(
              parsed.map((p: Point2D) => ({
                x: Math.max(20, Math.min(340, p.x)),
                y: Math.max(20, Math.min(340, (p.y / 380) * 360)),
              }))
            );
          }
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Live Camera Pass-Through for Spatial AR
  useEffect(() => {
    if (viewMode !== "ar") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (navigator.mediaDevices?.getUserMedia && videoRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setCameraActive(true);
        }
      } catch {
        setCameraActive(false);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [viewMode]);

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

  // Meta-style Spatial AR Quad-Warped Hologram + 3D Bending Mesh Renderer
  useEffect(() => {
    if (viewMode === "2d" || !spatialCanvasRef.current) return;
    const canvas = spatialCanvasRef.current;
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    const cols = 18;
    const rows = 18;

    const evalAmp = (nx: number, ny: number) =>
      activeMode.m === activeMode.n
        ? Math.sin(activeMode.m * Math.PI * nx) * Math.sin(activeMode.n * Math.PI * ny) +
          0.35 * Math.cos(activeMode.m * Math.PI * nx) * Math.cos(activeMode.n * Math.PI * ny)
        : chladniAmplitude(nx, ny, activeMode.m, activeMode.n);

    const draw = () => {
      phase += 0.13;
      ctx.clearRect(0, 0, 360, 360);

      if (viewMode === "3d") {
        const isDark = document.documentElement.classList.contains("dark");
        ctx.fillStyle = isDark ? "#0D191C" : "#F1F5F9";
        ctx.fillRect(0, 0, 360, 360);
      }

      const osc = Math.sin(phase);
      const pts: { sx: number; sy: number; amp: number }[][] = [];

      for (let r = 0; r <= rows; r++) {
        const rowArr: { sx: number; sy: number; amp: number }[] = [];
        const ny = r / rows;
        for (let c = 0; c <= cols; c++) {
          const nx = c / cols;
          const w = evalAmp(nx, ny);
          const zLift = w * osc * (viewMode === "ar" ? 14 : 22);

          if (viewMode === "ar") {
            const p = projectToQuad(nx, ny, quad);
            rowArr.push({ sx: p.x, sy: p.y - zLift, amp: Math.abs(w) });
          } else {
            const cx = nx - 0.5;
            const cy = ny - 0.5;
            rowArr.push({
              sx: 180 + (cx - cy) * 190,
              sy: 190 + (cx + cy) * 95 - zLift,
              amp: Math.abs(w),
            });
          }
        }
        pts.push(rowArr);
      }

      ctx.save();
      ctx.globalAlpha = viewMode === "ar" ? xrayOpacity : 1;

      // Draw translucent glowing stress/nodal quads + wireframe
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = pts[r][c];
          const pR = pts[r][c + 1];
          const pD = pts[r + 1][c];
          const pRD = pts[r + 1][c + 1];
          const amp = p.amp;

          if (viewMode === "ar") {
            ctx.fillStyle =
              amp < 0.18
                ? "rgba(16, 185, 129, 0.24)"
                : amp > 0.72
                ? "rgba(239, 68, 68, 0.34)"
                : "rgba(14, 178, 154, 0.12)";
            ctx.beginPath();
            ctx.moveTo(p.sx, p.sy);
            ctx.lineTo(pR.sx, pR.sy);
            ctx.lineTo(pRD.sx, pRD.sy);
            ctx.lineTo(pD.sx, pD.sy);
            ctx.closePath();
            ctx.fill();
          }

          ctx.strokeStyle =
            amp < 0.18 ? "#34D399" : amp > 0.72 ? "#F87171" : "#38BDF8";
          ctx.lineWidth = viewMode === "ar" ? 1.1 : 1.3;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(pR.sx, pR.sy);
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(pD.sx, pD.sy);
          ctx.stroke();
        }
      }

      // Spatial AR anchors, LiDAR scanline, and floating 3D callouts
      if (viewMode === "ar") {
        // Outer glowing AR quad lock
        ctx.strokeStyle = "#00F5D4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(quad[0].x, quad[0].y);
        ctx.lineTo(quad[1].x, quad[1].y);
        ctx.lineTo(quad[2].x, quad[2].y);
        ctx.lineTo(quad[3].x, quad[3].y);
        ctx.closePath();
        ctx.stroke();

        // Sweeping LiDAR scanline across the physical quad
        const scanV = (Math.sin(phase * 0.5) + 1) * 0.5;
        const sL = projectToQuad(0, scanV, quad);
        const sR = projectToQuad(1, scanV, quad);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sL.x, sL.y);
        ctx.lineTo(sR.x, sR.y);
        ctx.stroke();

        // Floating 3D Spatial Pin Callouts anchored to board coordinates
        const anchors = [
          { u: 0.5, v: 0.5, label: "XTAL-24M" },
          { u: 0.25, v: 0.28, label: "MCU-BGA" },
        ];
        anchors.forEach((a) => {
          const base = projectToQuad(a.u, a.v, quad);
          const amp = Math.abs(evalAmp(a.u, a.v));
          const safe = amp < 0.28;
          const color = safe ? "#10B981" : "#EF4444";
          const tag = `${a.label}: ${safe ? "SAFE" : "HIGH VIB"}`;

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(base.x, base.y - 26);
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(base.x, base.y, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = "bold 9px monospace";
          const wBox = ctx.measureText(tag).width + 10;
          ctx.fillStyle = "rgba(13, 25, 28, 0.88)";
          ctx.fillRect(base.x - wBox / 2, base.y - 42, wBox, 16);
          ctx.strokeRect(base.x - wBox / 2, base.y - 42, wBox, 16);
          ctx.fillStyle = safe ? "#6EE7B7" : "#FCA5A5";
          ctx.fillText(tag, base.x - wBox / 2 + 5, base.y - 31);
        });
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [viewMode, activeMode.m, activeMode.n, quad, xrayOpacity]);

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

  const splDb = (74 + Math.min(18, frequency / 140)).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="AR CHLADNI VIEWPORT"
        step="SCREEN 04 // 10"
        subtitle={`${material.code} (${thicknessMm}mm)`}
        backHref="/material"
        rightAction={
          <HudBadge variant={viewMode === "ar" ? "teal" : isWebGPUSupported ? "teal" : "lime"} dot>
            {viewMode === "ar" ? (cameraActive ? "LIVE SPATIAL AR" : "AR HOLOGRAM") : `${fps} FPS`}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Core Spatial AR / 3D / 2D Viewport */}
        <div className="relative w-full aspect-square bg-slate-900 dark:bg-[#0D191C] rounded-[20px] border border-slate-300 dark:border-[#294044] overflow-hidden flex items-center justify-center shadow-md dark:shadow-2xl">
          {/* Live Camera Pass-Through in Spatial AR mode */}
          {viewMode === "ar" && (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover ${
                  cameraActive ? "opacity-100" : "opacity-0"
                }`}
              />
              {!cameraActive && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-[#0D191C] opacity-95">
                  <div className="absolute inset-0 ar-grid-bg opacity-30" />
                </div>
              )}
            </>
          )}

          {/* 2D Chladni Particle Canvas */}
          <canvas
            ref={canvasRef}
            className={`w-full h-full object-contain ${viewMode === "2d" ? "block" : "hidden"}`}
          />

          {/* Spatial AR / 3D Bending Mesh Canvas */}
          {viewMode !== "2d" && (
            <canvas
              ref={spatialCanvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Floating Live Frequency Telemetry Badge */}
          <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
            <div className="bg-white/95 dark:bg-[#0D191C]/90 backdrop-blur-md px-3 py-1.5 rounded-[10px] border border-slate-200 dark:border-[#0EB29A]/50 flex items-center gap-2 shadow-sm">
              <Radio className="w-4 h-4 text-sky-600 dark:text-[#0EB29A] animate-pulse" />
              <div>
                <span className="text-[9px] font-mono tracking-widest text-slate-500 dark:text-[#8C999A] block leading-none font-semibold">
                  EXCITATION FREQUENCY
                </span>
                <span className="text-xs font-bold font-mono text-slate-900 dark:text-[#DDF0C2]">
                  {frequency} Hz // MODE {activeMode.label}
                </span>
              </div>
            </div>

            {viewMode === "2d" && (
              <div className="bg-white/90 dark:bg-[#0D191C]/80 px-2.5 py-1 rounded-[6px] border border-slate-200 dark:border-[#294044] text-[9px] font-mono text-slate-600 dark:text-[#8C999A]">
                PARTICLES: <span className="font-bold">{particleCount.toLocaleString()}</span> // FPS: <span className="font-bold">{fps}</span>
              </div>
            )}
          </div>

          {/* Audio Drive Toggle */}
          <button
            onClick={toggleAudioDrive}
            className={`absolute bottom-3 left-3 z-20 backdrop-blur-md px-2.5 py-1.5 rounded-[8px] border text-[10px] font-mono flex items-center gap-1.5 shadow-xs transition-colors ${
              isAudioOn
                ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C]"
                : "bg-white/90 dark:bg-[#0D191C]/90 text-slate-800 dark:text-[#F5FDFF] border-slate-200 dark:border-[#294044]"
            }`}
          >
            {isAudioOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />}
            <span>{isAudioOn ? `${splDb} dBA` : "AUDIO"}</span>
          </button>

          {/* Spatial AR / 3D Mesh / 2D Sand Mode Switcher */}
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 pointer-events-auto">
            <button
              onClick={() => setViewMode("ar")}
              className={`text-[10px] font-mono px-2 py-1.5 rounded-[8px] border flex items-center gap-1 font-bold ${
                viewMode === "ar"
                  ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C]"
                  : "bg-white/90 text-slate-700 border-slate-200 dark:bg-[#15282C]/90 dark:text-[#8C999A] dark:border-[#294044]"
              }`}
            >
              <Camera className="w-3 h-3" />
              <span>AR</span>
            </button>

            <button
              onClick={() => setViewMode("3d")}
              className={`text-[10px] font-mono px-2 py-1.5 rounded-[8px] border flex items-center gap-1 font-bold ${
                viewMode === "3d"
                  ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C]"
                  : "bg-white/90 text-slate-700 border-slate-200 dark:bg-[#15282C]/90 dark:text-[#8C999A] dark:border-[#294044]"
              }`}
            >
              <Box className="w-3 h-3" />
              <span>3D</span>
            </button>

            <button
              onClick={() => setViewMode("2d")}
              className={`text-[10px] font-mono px-2 py-1.5 rounded-[8px] border flex items-center gap-1 font-bold ${
                viewMode === "2d"
                  ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C]"
                  : "bg-white/90 text-slate-700 border-slate-200 dark:bg-[#15282C]/90 dark:text-[#8C999A] dark:border-[#294044]"
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>2D</span>
            </button>
          </div>
        </div>

        {/* Plain-English Visual Guide + Auto-Sweep + X-Ray Blend */}
        <div className="px-3 py-2 rounded-[10px] bg-sky-50 dark:bg-[#15282C] border border-sky-200 dark:border-[#294044] text-[11px] font-mono text-slate-700 dark:text-[#DDF0C2] flex items-center justify-between gap-2">
          <span className="truncate">
            {viewMode === "ar"
              ? "Spatial AR locked to P1–P4 • Green = Safe • Red = Shake"
              : viewMode === "3d"
              ? "3D flexing mesh • Red peaks = High stress"
              : "Particles settle on calm nodal lines"}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {viewMode === "ar" && (
              <input
                type="range"
                min="0.3"
                max="1"
                step="0.05"
                value={xrayOpacity}
                onChange={(e) => setXrayOpacity(Number(e.target.value))}
                className="w-14 accent-sky-600 dark:accent-[#0EB29A]"
                title="Hologram X-Ray Opacity"
              />
            )}
            <button
              onClick={() => setIsSweeping((s) => !s)}
              className={`px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-1 border ${
                isSweeping
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white text-sky-700 border-sky-300 dark:bg-[#101F23] dark:text-[#0EB29A] dark:border-[#0EB29A]"
              }`}
            >
              {isSweeping ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isSweeping ? "STOP" : "SWEEP"}</span>
            </button>
          </div>
        </div>

        {/* Live Frequency Slider Fine Tuner */}
        <ChamferedCard className="p-3.5 space-y-2.5">
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

        <div className="pt-1 mt-auto">
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
