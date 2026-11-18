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
  ComputedHarmonicMode,
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
  const orbitYawRef = useRef<number>(0.45);
  const orbitPitchRef = useRef<number>(0.62);
  const userOrbitedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const [frequency, setFrequency] = useState<number>(740);
  const [viewMode, setViewMode] = useState<ViewMode>("ar");
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [arTargetVisible, setArTargetVisible] = useState<boolean>(false);
  const [freqSource, setFreqSource] = useState<"theoretical" | "measured">("theoretical");
  const [isAudioOn, setIsAudioOn] = useState<boolean>(false);
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [guideOpen, setGuideOpen] = useState<boolean>(true);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [showFineTune, setShowFineTune] = useState<boolean>(false);
  const [material, setMaterial] = useState<MaterialData>(DEFAULT_MATERIAL);
  const [thicknessMm, setThicknessMm] = useState<number>(1.6);
  const [plateGeo, setPlateGeo] = useState<{ areaMm2: number; aspectRatio: number }>({
    areaMm2: 14250,
    aspectRatio: 1.2,
  });
  const [allModes, setAllModes] = useState<ComputedHarmonicMode[]>([]);
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

  // Load stored scan / material / theoretical vs measured frequency source
  useEffect(() => {
    const mat = getStoredMaterial();
    const thick = getStoredThickness();
    const geo = getStoredPlateGeometry();
    setMaterial(mat);
    setThicknessMm(thick);
    setPlateGeo(geo);
    const computed = computeAllModes(mat, thick, geo.areaMm2, geo.aspectRatio, 0);
    setAllModes(computed);
    const defaultMode = computed.find((m) => m.id === "mode-2-2") ?? computed[2] ?? computed[0];

    if (typeof window !== "undefined") {
      const srcType = localStorage.getItem("harmonix_freq_source");
      const measFreq = Number(localStorage.getItem("harmonix_measured_freq"));
      const savedPeak = Number(localStorage.getItem("harmonix_peak_freq"));
      if (srcType === "measured" && Number.isFinite(measFreq) && measFreq >= 80) {
        setFrequency(Math.round(measFreq));
        setFreqSource("measured");
      } else if (Number.isFinite(savedPeak) && savedPeak >= 80) {
        setFrequency(Math.round(savedPeak));
        setFreqSource("theoretical");
      } else if (defaultMode) {
        setFrequency(defaultMode.freqHz);
        setFreqSource("theoretical");
      }
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

  // Honest Theoretical Eigenfrequency Solver + Live Acoustic Excitation Sweep
  const runEigenSolverAndSweep = useCallback(() => {
    if (isSolving || !loaded) return;
    setIsSolving(true);
    const modes = computeAllModes(
      material,
      thicknessMm,
      plateGeo.areaMm2,
      plateGeo.aspectRatio,
      0
    );
    setAllModes(modes);
    const target = modes.find((m) => m.m === activeMode.m && m.n === activeMode.n) ?? modes[2] ?? modes[0];
    const solvedHz = Math.max(100, Math.min(3500, target.freqHz));
    setFrequency(solvedHz);
    setFreqSource("theoretical");
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_peak_freq", String(solvedHz));
    }

    // Play brief live excitation tone sweep into speaker if audio context allowed
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ac = new AudioCtx();
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(Math.max(120, solvedHz * 0.72), ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(solvedHz, ac.currentTime + 0.55);
        g.gain.setValueAtTime(0.01, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.75);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 0.78);
        setTimeout(() => ac.close().catch(() => {}), 900);
      }
    } catch {
      // speaker excitation optional
    }

    setAiMessage(
      `Kirchhoff-Love FEA Mode ${target.indices}: ${solvedHz} Hz (theoretical baseline). Next screen measures actual board pitch with your mic.`
    );
    void speak(`Calculated mode frequency ${solvedHz} hertz.`, { interrupt: false });
    setTimeout(() => setIsSolving(false), 750);
  }, [isSolving, loaded, material, thicknessMm, plateGeo, activeMode.m, activeMode.n]);

  useAutoAdvance(false, 2800, () => router.push("/tuner"));

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

  // Spatial AR hologram + shaded rotating 3D surface
  useEffect(() => {
    if (viewMode === "2d" || !spatialCanvasRef.current) return;
    const canvas = spatialCanvasRef.current;
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (viewMode === "ar") setArTargetVisible(false);

    let raf = 0;
    let phase = 0;
    let frameTick = 0;
    let targetVisible = false;
    let missStreak = 0;
    let prevTrackState = null as ReturnType<typeof detectQuadFromSource>["track"];
    const cols = viewMode === "ar" ? 20 : 26;
    const rows = cols;
    const evalAmp = (nx: number, ny: number) =>
      chladniAmplitude(nx, ny, activeMode.m, activeMode.n);
    let trackedQuad: Point2D[] = quad.map((p) => ({ ...p }));
    const workCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const normW = plateGeo.aspectRatio >= 1 ? 1.0 : Math.max(0.45, plateGeo.aspectRatio);
    const normH = plateGeo.aspectRatio >= 1 ? Math.max(0.45, 1.0 / plateGeo.aspectRatio) : 1.0;
    const gainScale = Math.min(2.2, 0.55 + activeMode.resonanceGain * 0.14);
    const sparkles = Array.from({ length: 26 }, () => ({
      u: Math.random(),
      v: Math.random(),
      s: 0.4 + Math.random() * 1.2,
      o: Math.random() * 6.28,
    }));

    type P = { sx: number; sy: number; amp: number; w: number; depth: number };

    const draw = () => {
      phase += 0.12;
      frameTick++;

      // Live camera CV quad verification on AR frames (never hallucinate without camera lock)
      if (
        (frameTick === 1 || frameTick % 4 === 0) &&
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
          workCanvas,
          prevTrackState
        );
        prevTrackState = res.track;
        if (res.corners && res.corners.length === 4 && res.confidence >= 65) {
          missStreak = 0;
          if (!targetVisible) {
            targetVisible = true;
            setArTargetVisible(true);
            trackedQuad = res.corners.map((p) => ({ x: p.x, y: p.y }));
          } else {
            trackedQuad = trackedQuad.map((p, idx) => {
              const delta = Math.hypot(res.corners![idx].x - p.x, res.corners![idx].y - p.y);
              const alpha = delta < 1.5 ? 0 : delta < 6 ? 0.18 : 0.32;
              return {
                x: p.x * (1 - alpha) + res.corners![idx].x * alpha,
                y: p.y * (1 - alpha) + res.corners![idx].y * alpha,
              };
            });
          }
        } else {
          missStreak++;
          if (missStreak >= 3 && targetVisible) {
            targetVisible = false;
            setArTargetVisible(false);
          }
        }
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, 360, 360);

      // In AR mode without a confirmed workpiece in camera view, draw clean engineering target reticle only
      if (viewMode === "ar" && !targetVisible) {
        ctx.save();
        ctx.strokeStyle = "rgba(34, 211, 238, 0.72)";
        ctx.lineWidth = 2;
        const bx0 = 64, by0 = 72, bx1 = 296, by1 = 288, br = 22;
        const corners = [
          [bx0, by0, 1, 1],
          [bx1, by0, -1, 1],
          [bx1, by1, -1, -1],
          [bx0, by1, 1, -1],
        ];
        corners.forEach(([cx, cy, dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy + dy * br);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + dx * br, cy);
          ctx.stroke();
        });
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(170, 180);
        ctx.lineTo(190, 180);
        ctx.moveTo(180, 170);
        ctx.lineTo(180, 190);
        ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";
        ctx.stroke();

        ctx.fillStyle = "rgba(13, 25, 28, 0.84)";
        ctx.beginPath();
        ctx.roundRect(38, 162, 284, 44, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(34, 211, 238, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#67E8F9";
        ctx.font = "bold 10px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          cameraActive ? "NO WORKPIECE IN CAMERA VIEW" : "CAMERA OFF FOR LIVE AR",
          180,
          181
        );
        ctx.fillStyle = "#CBD5E1";
        ctx.font = "9px Inter, sans-serif";
        ctx.fillText("POINT CAMERA AT BOARD OR SWITCH TO 3D / 2D", 180, 197);
        ctx.restore();

        raf = requestAnimationFrame(draw);
        return;
      }

      const H = computeHomography(trackedQuad);

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
      if (viewMode === "3d" && !userOrbitedRef.current) {
        orbitYawRef.current += 0.008;
      }
      const yaw = orbitYawRef.current;
      const pitch = orbitPitchRef.current;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const pts: P[][] = [];

      for (let r = 0; r <= rows; r++) {
        const rowArr: P[] = [];
        const ny = r / rows;
        for (let c = 0; c <= cols; c++) {
          const nx = c / cols;
          const w = evalAmp(nx, ny);
          const z = w * osc * gainScale * (viewMode === "ar" ? 12 : 24);
          if (viewMode === "ar") {
            const p = applyHomography(H, nx, ny);
            rowArr.push({ sx: p.x, sy: p.y - z, amp: Math.abs(w), w, depth: 0 });
          } else {
            const cx = (nx - 0.5) * normW;
            const cy = (ny - 0.5) * normH;
            const rx = cx * cosY - cy * sinY;
            const ry = cx * sinY + cy * cosY;
            rowArr.push({
              sx: 180 + rx * 230,
              sy: 196 + ry * cosP * 205 - z * sinP,
              amp: Math.abs(w),
              w,
              depth: ry * sinP,
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

        // Nodal zero-crossing contour lines on 3D surface
        if (viewMode === "3d") {
          const edges: [P, P][] = [
            [q.a, q.b],
            [q.b, q.c],
            [q.c, q.d],
            [q.d, q.a],
          ];
          const hits: { x: number; y: number }[] = [];
          for (const [p0, p1] of edges) {
            if ((p0.w <= 0 && p1.w > 0) || (p0.w >= 0 && p1.w < 0)) {
              const t = Math.abs(p0.w) / (Math.abs(p0.w) + Math.abs(p1.w) + 1e-6);
              hits.push({
                x: p0.sx + (p1.sx - p0.sx) * t,
                y: p0.sy + (p1.sy - p0.sy) * t,
              });
            }
          }
          if (hits.length >= 2) {
            ctx.strokeStyle = "rgba(248, 250, 252, 0.85)";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(hits[0].x, hits[0].y);
            ctx.lineTo(hits[1].x, hits[1].y);
            ctx.stroke();
          }
        }
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
  }, [viewMode, cameraActive, activeMode.m, activeMode.n, activeMode.resonanceGain, plateGeo.aspectRatio, quad]);

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
          <HudBadge variant={viewMode === "ar" && !arTargetVisible ? "warning" : "teal"} dot>
            {viewMode === "ar"
              ? !cameraActive
                ? "CAMERA OFF"
                : arTargetVisible
                ? "AR LOCKED"
                : "NO TARGET"
              : `${fps} FPS`}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <TestGuide kind="ar" open={guideOpen} onDone={() => setGuideOpen(false)} />
        {/* Main viewport — interactive pointer drag-to-orbit in 3D mode */}
        <div
          onPointerDown={(e) => {
            if (viewMode !== "3d") return;
            userOrbitedRef.current = true;
            dragStartRef.current = {
              x: e.clientX,
              y: e.clientY,
              yaw: orbitYawRef.current,
              pitch: orbitPitchRef.current,
            };
          }}
          onPointerMove={(e) => {
            if (viewMode !== "3d" || !dragStartRef.current) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            orbitYawRef.current = dragStartRef.current.yaw + dx * 0.012;
            orbitPitchRef.current = Math.max(
              0.2,
              Math.min(1.35, dragStartRef.current.pitch + dy * 0.008)
            );
          }}
          onPointerUp={() => {
            dragStartRef.current = null;
          }}
          onPointerLeave={() => {
            dragStartRef.current = null;
          }}
          className={`relative w-full aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-[#0A1417] via-[#0D191C] to-[#15282C] shadow-xl shadow-sky-500/20 ring-1 ring-white/10 flex items-center justify-center ${
            viewMode === "3d" ? "cursor-grab active:cursor-grabbing touch-none" : ""
          }`}
        >
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
            <div className="bg-black/55 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/15 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
              <div className="leading-tight">
                <span className="text-[9px] text-white/75 block font-semibold">
                  {freqSource === "measured" ? "MIC MEASURED" : "THEORETICAL FEA"}
                </span>
                <span className="text-sm font-extrabold text-white">{frequency} Hz</span>
              </div>
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/80 text-white">
                {activeMode.resonanceGain.toFixed(1)}×
              </span>
            </div>
          </div>

          {viewMode === "3d" && (
            <div className="absolute top-3 right-3 z-20 pointer-events-none px-2 py-1 rounded-full bg-black/50 text-[9px] font-mono text-white/80">
              DRAG TO ORBIT
            </div>
          )}

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

        {/* Canonical Mode Selection Pills */}
        {allModes.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {allModes.map((m) => {
              const selected = activeMode.m === m.m && activeMode.n === m.n;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setFrequency(m.freqHz);
                    setFreqSource("theoretical");
                  }}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border transition-colors ${
                    selected
                      ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C] dark:border-[#0EB29A]"
                      : "bg-white dark:bg-[#15282C] text-slate-600 dark:text-[#8C999A] border-slate-200 dark:border-[#294044]"
                  }`}
                >
                  {m.indices} · {m.freqHz}Hz
                </button>
              );
            })}
          </div>
        )}

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

        {/* Theoretical Solver + Acoustic Sweep CTA */}
        <HudButton
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSolving}
          onClick={runEigenSolverAndSweep}
          className="flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          <span>Solve Theoretical Mode & Excite</span>
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
