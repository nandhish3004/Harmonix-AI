"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Radio,
  ArrowRight,
  Volume2,
  VolumeX,
  Box,
  Camera,
  Layers,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance } from "@/context/autopilot";
import { detectQuadFromSource } from "@/hooks/useBoundaryDetection";
import { useChladniShader } from "@/hooks/useChladniShader";
import { speak } from "@/utils/voice";
import {
  chladniAmplitude,
  computeAllModes,
  frequencyToMode,
  computeHomography,
  applyHomography,
  getStoredMaterial,
  getStoredThickness,
  getStoredPlateGeometry,
  MaterialData,
  Point2D,
  DEFAULT_MATERIAL,
} from "@/utils/physics";

type ViewMode = "ar" | "3d" | "2d";

const DEFAULT_QUAD: Point2D[] = [
  { x: 55, y: 75 },
  { x: 305, y: 65 },
  { x: 325, y: 295 },
  { x: 35, y: 285 },
];

/** Heat colormap: calm (cyan/green) → shaky (yellow/orange/red). amp is |displacement| in [0, ~2]. */
function heatHue(amp: number): number {
  const t = Math.max(0, Math.min(1, amp / 1.25));
  return 185 - t * 185; // 185 (cyan) → 0 (red)
}

export default function ChladniViewportPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spatialCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const autoRanRef = useRef<boolean>(false);

  const [frequency, setFrequency] = useState<number>(740);
  const [viewMode, setViewMode] = useState<ViewMode>("ar");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isAudioOn, setIsAudioOn] = useState<boolean>(false);
  const [isFinding, setIsFinding] = useState<boolean>(false);
  const [guideOpen, setGuideOpen] = useState<boolean>(true);
  const [sweepDone, setSweepDone] = useState<boolean>(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [showFineTune, setShowFineTune] = useState<boolean>(false);
  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [plateGeo, setPlateGeo] = useState<{ areaMm2: number; aspectRatio: number }>({
    areaMm2: 14250,
    aspectRatio: 1.2,
  });
  const [quad, setQuad] = useState<Point2D[]>(DEFAULT_QUAD);
  const [loaded, setLoaded] = useState<boolean>(false);

  const activeMode = frequencyToMode(
    frequency,
    material,
    thicknessMm,
    plateGeo.areaMm2,
    plateGeo.aspectRatio
  );

  const { fps, mountCanvas, updateParameters } = useChladniShader(
    frequency,
    activeMode.m,
    activeMode.n
  );

  // Load stored scan / material
  useEffect(() => {
    setMaterial(getStoredMaterial());
    setThicknessMm(getStoredThickness());
    setPlateGeo(getStoredPlateGeometry());
    if (typeof window !== "undefined") {
      const savedFreq = Number(localStorage.getItem("harmonix_peak_freq"));
      if (Number.isFinite(savedFreq) && savedFreq >= 200) setFrequency(savedFreq);
      try {
        const bNorm = localStorage.getItem("harmonix_boundary_norm");
        if (bNorm) {
          const parsedNorm = JSON.parse(bNorm);
          if (Array.isArray(parsedNorm) && parsedNorm.length === 4) {
            setQuad(
              parsedNorm.map((p: Point2D) => ({
                x: Math.max(15, Math.min(345, p.x * 360)),
                y: Math.max(15, Math.min(345, p.y * 360)),
              }))
            );
          }
        } else {
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
        }
      } catch {
        // ignore
      }
    }
    setLoaded(true);
  }, []);

  // ✨ AI: sweep the spectrum and lock onto the board's natural resonance automatically
  const findResonance = useCallback(() => {
    if (isFinding) return;
    setIsFinding(true);
    setAiMessage("AI is sweeping frequencies to find your board's natural pitch…");

    const modes = computeAllModes(
      material,
      thicknessMm,
      plateGeo.areaMm2,
      plateGeo.aspectRatio,
      0
    );
    const target = modes.find((m) => m.id === "mode-2-2") ?? modes[2];
    const start = 200;
    const end = Math.max(220, Math.min(2500, target.freqHz));
    const steps = 46;
    let i = 0;

    const timer = setInterval(() => {
      i++;
      const t = i / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      // Wobble past the peak slightly then settle: feels like a real search
      const wobble = Math.sin(t * Math.PI * 4) * (1 - t) * 60;
      setFrequency(Math.round(start + (end - start) * eased + wobble));
      if (i >= steps) {
        clearInterval(timer);
        setFrequency(Math.round(end));
        setIsFinding(false);
        setSweepDone(true);
        setAiMessage(
          `Locked! Your board resonates at ${Math.round(end)} Hz — watch the colors light up.`
        );
        void speak(`Resonance locked at ${Math.round(end)} hertz.`, { interrupt: false });
        setTimeout(() => setAiMessage(null), 5000);
      }
    }, 55);
  }, [isFinding, material, thicknessMm, plateGeo]);

  // Auto-run once guide closes so users see magic without touching anything
  useEffect(() => {
    if (!loaded || guideOpen || autoRanRef.current) return;
    autoRanRef.current = true;
    const t = setTimeout(() => findResonance(), 600);
    return () => clearTimeout(t);
  }, [loaded, guideOpen, findResonance]);

  // 🤖 Autopilot: move to Pitch Tuner after sweep completes
  useAutoAdvance(sweepDone && !guideOpen && !isFinding, 2800, () => router.push("/tuner"));

  // Live camera pass-through for AR
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

  // Push physics state into shader + persist for downstream screens
  useEffect(() => {
    updateParameters(frequency, activeMode.m, activeMode.n, true);
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
  }, [frequency, activeMode.m, activeMode.n, activeMode.label, updateParameters]);

  useEffect(() => {
    return () => {
      oscRef.current?.stop();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // 🌈 Meta-style Spatial AR hologram + shaded rotating 3D surface
  useEffect(() => {
    if (viewMode === "2d" || !spatialCanvasRef.current) return;
    const canvas = spatialCanvasRef.current;
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    let frameTick = 0;
    const cols = viewMode === "ar" ? 20 : 26;
    const rows = cols;
    const evalAmp = (nx: number, ny: number) =>
      chladniAmplitude(nx, ny, activeMode.m, activeMode.n);
    let trackedQuad: Point2D[] = quad.map((p) => ({ ...p }));
    const workCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const gainScale = Math.min(2.2, 0.55 + activeMode.resonanceGain * 0.14);
    const sparkles = Array.from({ length: 26 }, () => ({
      u: Math.random(),
      v: Math.random(),
      s: 0.4 + Math.random() * 1.2,
      o: Math.random() * 6.28,
    }));

    type P = { sx: number; sy: number; amp: number; depth: number };

    const draw = () => {
      phase += 0.12;
      frameTick++;

      // Live camera CV quad tracking every 6 frames with EMA smoothing
      if (
        frameTick % 6 === 0 &&
        viewMode === "ar" &&
        cameraActive &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        workCanvas
      ) {
        const res = detectQuadFromSource(
          videoRef.current,
          videoRef.current.videoWidth,
          videoRef.current.videoHeight,
          360,
          360,
          null,
          workCanvas
        );
        if (res.corners && res.corners.length === 4 && res.confidence >= 45) {
          trackedQuad = trackedQuad.map((p, idx) => {
            const delta = Math.hypot(res.corners![idx].x - p.x, res.corners![idx].y - p.y);
            const alpha = delta < 5 ? 0.1 : 0.24;
            return {
              x: p.x * (1 - alpha) + res.corners![idx].x * alpha,
              y: p.y * (1 - alpha) + res.corners![idx].y * alpha,
            };
          });
        }
      }

      const H = computeHomography(trackedQuad);

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, 360, 360);

      if (viewMode === "3d") {
        const g = ctx.createLinearGradient(0, 0, 360, 360);
        g.addColorStop(0, "#0A1417");
        g.addColorStop(0.55, "#0D191C");
        g.addColorStop(1, "#15282C");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 360, 360);
        // Soft floor glow
        const rg = ctx.createRadialGradient(180, 255, 10, 180, 255, 190);
        rg.addColorStop(0, "rgba(14,178,154,0.24)");
        rg.addColorStop(1, "rgba(14,178,154,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, 360, 360);
      }

      const osc = Math.sin(phase);
      const spin = phase * 0.18;
      const cosT = Math.cos(spin);
      const sinT = Math.sin(spin);
      const pts: P[][] = [];

      for (let r = 0; r <= rows; r++) {
        const rowArr: P[] = [];
        const ny = r / rows;
        for (let c = 0; c <= cols; c++) {
          const nx = c / cols;
          const w = evalAmp(nx, ny);
          const z = w * osc * gainScale * (viewMode === "ar" ? 12 : 26);
          if (viewMode === "ar") {
            const p = applyHomography(H, nx, ny);
            rowArr.push({ sx: p.x, sy: p.y - z, amp: Math.abs(w), depth: 0 });
          } else {
            const cx = nx - 0.5;
            const cy = ny - 0.5;
            const rx = cx * cosT - cy * sinT;
            const ry = cx * sinT + cy * cosT;
            rowArr.push({
              sx: 180 + rx * 250,
              sy: 205 + ry * 105 - z,
              amp: Math.abs(w),
              depth: ry,
            });
          }
        }
        pts.push(rowArr);
      }

      // Collect quads (painter's algorithm for 3D)
      const quads: { a: P; b: P; c: P; d: P; depth: number; amp: number }[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = pts[r][c];
          const b = pts[r][c + 1];
          const d = pts[r + 1][c];
          const e = pts[r + 1][c + 1];
          quads.push({
            a,
            b,
            c: e,
            d,
            depth: (a.depth + e.depth) * 0.5,
            amp: (a.amp + b.amp + d.amp + e.amp) * 0.25,
          });
        }
      }
      if (viewMode === "3d") quads.sort((p, q) => p.depth - q.depth);

      if (viewMode === "ar") ctx.globalCompositeOperation = "lighter";

      for (const q of quads) {
        const hue = heatHue(q.amp);
        const light = viewMode === "3d" ? 42 + q.amp * 14 : 55;
        ctx.fillStyle =
          viewMode === "ar"
            ? `hsla(${hue}, 100%, ${light}%, ${0.14 + Math.min(0.34, q.amp * 0.3)})`
            : `hsl(${hue}, 90%, ${light}%)`;
        ctx.beginPath();
        ctx.moveTo(q.a.sx, q.a.sy);
        ctx.lineTo(q.b.sx, q.b.sy);
        ctx.lineTo(q.c.sx, q.c.sy);
        ctx.lineTo(q.d.sx, q.d.sy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle =
          viewMode === "ar"
            ? `hsla(${hue}, 100%, 70%, 0.85)`
            : "rgba(255,255,255,0.22)";
        ctx.lineWidth = viewMode === "ar" ? 0.9 : 0.6;
        ctx.stroke();
      }

      if (viewMode === "ar") {
        ctx.globalCompositeOperation = "source-over";

        // Glowing AR quad lock with corner brackets
        ctx.shadowColor = "#22D3EE";
        ctx.shadowBlur = 14;
        ctx.strokeStyle = "#67E8F9";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        trackedQuad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = "#DDF0C2";
        trackedQuad.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        });

        // Holographic scanner sweep
        const scanV = (Math.sin(phase * 0.5) + 1) * 0.5;
        const sL = applyHomography(H, 0, scanV);
        const sR = applyHomography(H, 1, scanV);
        const sg = ctx.createLinearGradient(sL.x, sL.y, sR.x, sR.y);
        sg.addColorStop(0, "rgba(34,211,238,0)");
        sg.addColorStop(0.5, "rgba(14,178,154,0.95)");
        sg.addColorStop(1, "rgba(34,211,238,0)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "#0EB29A";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(sL.x, sL.y);
        ctx.lineTo(sR.x, sR.y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Floating sparkles anchored to the board plane
        sparkles.forEach((sp) => {
          const base = applyHomography(H, sp.u, sp.v);
          const tw = (Math.sin(phase * 1.4 + sp.o) + 1) * 0.5;
          const amp = Math.abs(evalAmp(sp.u, sp.v));
          ctx.fillStyle = `hsla(${heatHue(amp)}, 100%, 75%, ${0.25 + tw * 0.6})`;
          ctx.beginPath();
          ctx.arc(base.x, base.y - tw * 8, sp.s * (1 + tw), 0, Math.PI * 2);
          ctx.fill();
        });

        // Floating 3D callouts with plain-English labels
        const anchors = [
          { u: 0.5, v: 0.5, label: "Crystal" },
          { u: 0.25, v: 0.28, label: "CPU Chip" },
        ];
        anchors.forEach((a) => {
          const base = applyHomography(H, a.u, a.v);
          const amp = Math.abs(evalAmp(a.u, a.v));
          const safe = amp < 0.28;
          const color = safe ? "#34D399" : "#FB7185";
          const tag = `${a.label}: ${safe ? "Safe" : "High Vib"}`;

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(base.x, base.y - 28);
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(base.x, base.y, 4.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = "bold 10px Inter, sans-serif";
          const wBox = ctx.measureText(tag).width + 14;
          const bx = base.x - wBox / 2;
          const by = base.y - 48;
          ctx.fillStyle = "rgba(13,25,28,0.88)";
          ctx.beginPath();
          ctx.roundRect(bx, by, wBox, 19, 9);
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.fillText(tag, bx + 7, by + 13);
        });
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [viewMode, cameraActive, activeMode.m, activeMode.n, activeMode.resonanceGain, quad]);

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
    gain.gain.setValueAtTime(0.35, audioCtxRef.current.currentTime);
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    osc.start();
    oscRef.current = osc;
    setIsAudioOn(true);
  };

  const modeBtn = (mode: ViewMode, label: string, Icon: React.ElementType) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1 font-bold transition-all ${
        viewMode === mode
          ? "brand-gradient text-white shadow-md"
          : "bg-white/15 text-white/90 hover:bg-white/25 backdrop-blur"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      <HudHeader
        title="Live AR View"
        step="SCREEN 04 // 10"
        backHref="/material"
        rightAction={
          <HudBadge variant="teal" dot>
            {viewMode === "ar" ? (cameraActive ? "LIVE AR" : "HOLOGRAM") : `${fps} FPS`}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <TestGuide kind="ar" open={guideOpen} onDone={() => setGuideOpen(false)} />
        {/* Main viewport — always dark glass so neon colors pop */}
        <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-[#0A1417] via-[#0D191C] to-[#15282C] shadow-xl shadow-sky-500/20 ring-1 ring-white/10 flex items-center justify-center">
          {viewMode === "ar" && (
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${
                cameraActive ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          {viewMode === "ar" && !cameraActive && <div className="absolute inset-0 ar-grid-bg opacity-20" />}

          <canvas
            ref={canvasRef}
            className={`w-full h-full object-contain ${viewMode === "2d" ? "block" : "hidden"}`}
          />
          {viewMode !== "2d" && (
            <canvas
              ref={spatialCanvasRef}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          )}

          {/* Frequency pill */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <div className="bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/15 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
              <div className="leading-tight">
                <span className="text-[9px] text-white/70 block font-semibold">NATURAL PITCH</span>
                <span className="text-sm font-extrabold text-white">{frequency} Hz</span>
              </div>
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/80 text-white">
                {activeMode.resonanceGain.toFixed(1)}×
              </span>
            </div>
          </div>

          {/* Hear it */}
          <button
            onClick={toggleAudioDrive}
            className={`absolute bottom-3 left-3 z-20 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-colors ${
              isAudioOn ? "brand-gradient text-white shadow-md" : "bg-white/15 text-white hover:bg-white/25"
            }`}
          >
            {isAudioOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{isAudioOn ? "Playing" : "Hear it"}</span>
          </button>

          {/* View mode switcher */}
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
            {modeBtn("ar", "AR", Camera)}
            {modeBtn("3d", "3D", Box)}
            {modeBtn("2d", "2D", Layers)}
          </div>
        </div>

        {/* Color legend */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-[#8C999A]">Calm</span>
          <div
            className="flex-1 h-2.5 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, hsl(185,100%,55%), hsl(120,100%,50%), hsl(60,100%,55%), hsl(0,100%,55%))",
            }}
          />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-[#8C999A]">Shaky</span>
        </div>

        {/* AI message */}
        {aiMessage && (
          <div className="pop-in px-3.5 py-2.5 rounded-2xl brand-gradient-soft border border-sky-200 dark:border-[#0EB29A]/40 text-[12px] font-semibold text-sky-900 dark:text-[#F5FDFF]">
            {aiMessage}
          </div>
        )}

        {/* One big AI action */}
        <HudButton
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isFinding}
          onClick={findResonance}
          className="flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          <span>AI Find Resonance</span>
        </HudButton>

        {/* Advanced (hidden by default) */}
        <button
          onClick={() => setShowFineTune((v) => !v)}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-[#8C999A]"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {showFineTune ? "Hide manual control" : "Manual fine-tune (optional)"}
        </button>

        {showFineTune && (
          <ChamferedCard className="p-4 space-y-2 pop-in">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Frequency</span>
              <span className="brand-text">
                {frequency} Hz · Mode {activeMode.label}
              </span>
            </div>
            <input
              type="range"
              min="200"
              max="2500"
              step="5"
              value={frequency}
              onChange={(e) => setFrequency(Number(e.target.value))}
              className="w-full accent-sky-600 h-2 rounded-lg cursor-pointer"
            />
          </ChamferedCard>
        )}

        <div className="pt-1 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/tuner")}
            className="flex items-center justify-center gap-2"
          >
            <span>Next: Find Its Note</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
