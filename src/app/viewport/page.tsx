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
  Mic,
  RefreshCw,
  Lock,
  Unlock,
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
type ArVisualStyle = "sand" | "mesh";

const DEFAULT_QUAD: Point2D[] = [
  { x: 52, y: 68 },
  { x: 308, y: 68 },
  { x: 322, y: 296 },
  { x: 38, y: 296 },
];

/** Heat colormap: nodal calm (cyan/emerald) -> high displacement antinode (amber/red). */
function heatHue(amp: number): number {
  const t = Math.max(0, Math.min(1, amp / 1.25));
  return 185 - t * 185;
}

interface SandGrain {
  u: number;
  v: number;
}

export default function ChladniViewportPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spatialCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  // Live microphone drive refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micGainRef = useRef<number>(1.0);

  // 3D Orbit & Chladni sand particle physics refs
  const orbitYawRef = useRef<number>(0.45);
  const orbitPitchRef = useRef<number>(0.62);
  const userOrbitedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const sandGrainsRef = useRef<SandGrain[]>([]);

  const [frequency, setFrequency] = useState<number>(740);
  const [viewMode, setViewMode] = useState<ViewMode>("ar");
  const [arStyle, setArStyle] = useState<ArVisualStyle>("sand");
  const [arAnchorLocked, setArAnchorLocked] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [arTargetVisible, setArTargetVisible] = useState<boolean>(true);
  const [scanThumbUrl, setScanThumbUrl] = useState<string | null>(null);
  const [freqSource, setFreqSource] = useState<"theoretical" | "measured">("theoretical");
  const [isAudioOn, setIsAudioOn] = useState<boolean>(false);
  const [isMicDriveOn, setIsMicDriveOn] = useState<boolean>(false);
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

  /** Initialize or scatter 1,800 physical Chladni sand grains uniformly across the board [0..1]^2. */
  const scatterSandGrains = useCallback(() => {
    const count = 1800;
    const grains: SandGrain[] = new Array(count);
    for (let i = 0; i < count; i++) {
      grains[i] = {
        u: 0.02 + Math.random() * 0.96,
        v: 0.02 + Math.random() * 0.96,
      };
    }
    sandGrainsRef.current = grains;
  }, []);

  useEffect(() => {
    scatterSandGrains();
  }, [scatterSandGrains, activeMode.m, activeMode.n]);

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
      const thumb = localStorage.getItem("harmonix_scan_thumb");
      if (thumb) setScanThumbUrl(thumb);

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
                x: Math.max(18, Math.min(342, p.x * 360)),
                y: Math.max(18, Math.min(342, p.y * 360)),
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

  // Honest Theoretical Eigenfrequency Solver + Live Acoustic Excitation Sweep + Sand Re-Forming
  const runEigenSolverAndSweep = useCallback(() => {
    if (isSolving || !loaded) return;
    setIsSolving(true);
    scatterSandGrains();

    const modes = computeAllModes(
      material,
      thicknessMm,
      plateGeo.areaMm2,
      plateGeo.aspectRatio,
      0
    );
    setAllModes(modes);
    const target =
      modes.find((m) => m.m === activeMode.m && m.n === activeMode.n) ?? modes[2] ?? modes[0];
    const solvedHz = Math.max(100, Math.min(3500, target.freqHz));
    setFrequency(solvedHz);
    setFreqSource("theoretical");
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_peak_freq", String(solvedHz));
    }

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
      `Kirchhoff-Love FEA Mode ${target.indices} excited at ${solvedHz} Hz — watch the Chladni sand particles migrate to the zero-displacement nodal lines.`
    );
    void speak(`Exciting mode ${target.indices} at ${solvedHz} hertz.`, { interrupt: false });
    setTimeout(() => setIsSolving(false), 750);
  }, [isSolving, loaded, material, thicknessMm, plateGeo, activeMode.m, activeMode.n, scatterSandGrains]);

  useAutoAdvance(false, 2800, () => router.push("/tuner"));

  // Toggle Live Microphone-Coupled AR Vibration
  const toggleMicDrive = async () => {
    if (isMicDriveOn) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      micCtxRef.current?.close().catch(() => {});
      micCtxRef.current = null;
      micAnalyserRef.current = null;
      micGainRef.current = 1.0;
      setIsMicDriveOn(false);
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AudioCtx();
        if (ac.state === "suspended") await ac.resume();
        const src = ac.createMediaStreamSource(stream);
        const an = ac.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        micStreamRef.current = stream;
        micCtxRef.current = ac;
        micAnalyserRef.current = an;
        setIsMicDriveOn(true);
        scatterSandGrains();
        setAiMessage("Live Mic Drive active — tap your board or speak to drive the Chladni sand & 3D mesh live!");
      }
    } catch {
      setAiMessage("Microphone unavailable for live drive.");
    }
  };

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
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // Spatial AR Laser Vibrometer + 1,800-Particle Chladni Sand Physics + 3D Surface
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
    let prevTrackState = null as ReturnType<typeof detectQuadFromSource>["track"];
    const cols = viewMode === "ar" ? 22 : 26;
    const rows = cols;
    const evalAmp = (nx: number, ny: number) =>
      chladniAmplitude(nx, ny, activeMode.m, activeMode.n);

    // Anchor immediately to the user's scanned board polygon from Screen 2
    let trackedQuad: Point2D[] = quad.map((p) => ({ ...p }));
    const workCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const micBuf = new Float32Array(256);
    const normW = plateGeo.aspectRatio >= 1 ? 1.0 : Math.max(0.45, plateGeo.aspectRatio);
    const normH = plateGeo.aspectRatio >= 1 ? Math.max(0.45, 1.0 / plateGeo.aspectRatio) : 1.0;
    const baseGain = Math.min(2.2, 0.55 + activeMode.resonanceGain * 0.14);

    // Physical peak deflection in micrometers (µm) for HUD telemetry
    const omega = 2 * Math.PI * Math.max(100, frequency);
    const maxDeflectionUm = Math.round(((activeMode.resonanceGain * 3.5 * 9.81) / (omega * omega)) * 1e6 * 10) / 10;

    type P = { sx: number; sy: number; amp: number; w: number; depth: number };

    const draw = () => {
      // Sample live microphone energy if Mic Drive is active
      if (micAnalyserRef.current) {
        micAnalyserRef.current.getFloatTimeDomainData(micBuf);
        let sum = 0;
        for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
        const rms = Math.sqrt(sum / micBuf.length);
        micGainRef.current = 0.55 + Math.min(2.4, rms * 18);
      } else {
        micGainRef.current = 1.0;
      }

      const gainScale = baseGain * micGainRef.current;
      phase += 0.14 * Math.min(1.6, micGainRef.current);
      frameTick++;

      // Smoothly refine AR quad when camera detects strong board edges (unless user locked the anchor)
      if (
        !arAnchorLocked &&
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
        if (res.corners && res.corners.length === 4 && res.confidence >= 55) {
          setArTargetVisible(true);
          trackedQuad = trackedQuad.map((p, idx) => {
            const delta = Math.hypot(res.corners![idx].x - p.x, res.corners![idx].y - p.y);
            const alpha = delta < 2 ? 0 : delta < 8 ? 0.15 : 0.28;
            return {
              x: p.x * (1 - alpha) + res.corners![idx].x * alpha,
              y: p.y * (1 - alpha) + res.corners![idx].y * alpha,
            };
          });
        }
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, 360, 360);

      const H = computeHomography(trackedQuad);

      if (viewMode === "3d") {
        const g = ctx.createLinearGradient(0, 0, 360, 360);
        g.addColorStop(0, "#0A1417");
        g.addColorStop(0.55, "#0D191C");
        g.addColorStop(1, "#15282C");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 360, 360);
        const rg = ctx.createRadialGradient(180, 255, 10, 180, 255, 190);
        rg.addColorStop(0, "rgba(14,178,154,0.24)");
        rg.addColorStop(1, "rgba(14,178,154,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, 360, 360);
      }

      const osc = Math.sin(phase);
      if (viewMode === "3d" && !userOrbitedRef.current) {
        orbitYawRef.current += 0.007;
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
          const z = w * osc * gainScale * (viewMode === "ar" ? 10 : 24);
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

      // Collect quads
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

      // Draw Laser Vibrometer surface field + Nodal zero-crossing contour lines
      for (const q of quads) {
        const hue = heatHue(q.amp);
        const light = viewMode === "3d" ? 42 + q.amp * 14 : 52;
        const fillAlpha =
          viewMode === "ar"
            ? arStyle === "sand"
              ? 0.08 + Math.min(0.22, q.amp * 0.18)
              : 0.18 + Math.min(0.36, q.amp * 0.3)
            : 0.92;

        ctx.fillStyle =
          viewMode === "ar"
            ? `hsla(${hue}, 95%, ${light}%, ${fillAlpha})`
            : `hsl(${hue}, 88%, ${light}%)`;
        ctx.beginPath();
        ctx.moveTo(q.a.sx, q.a.sy);
        ctx.lineTo(q.b.sx, q.b.sy);
        ctx.lineTo(q.c.sx, q.c.sy);
        ctx.lineTo(q.d.sx, q.d.sy);
        ctx.closePath();
        ctx.fill();

        if (viewMode === "3d" || arStyle === "mesh") {
          ctx.strokeStyle =
            viewMode === "ar"
              ? `hsla(${hue}, 100%, 70%, 0.65)`
              : "rgba(255,255,255,0.22)";
          ctx.lineWidth = viewMode === "ar" ? 0.8 : 0.6;
          ctx.stroke();
        }

        // Draw crisp Kirchhoff-Love Nodal Zero-Crossing Contours (W(x,y) = 0) in BOTH AR and 3D
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
          ctx.strokeStyle =
            viewMode === "ar" ? "rgba(103, 232, 249, 0.75)" : "rgba(248, 250, 252, 0.88)";
          ctx.lineWidth = viewMode === "ar" ? 1.5 : 1.4;
          ctx.beginPath();
          ctx.moveTo(hits[0].x, hits[0].y);
          ctx.lineTo(hits[1].x, hits[1].y);
          ctx.stroke();
        }
      }

      // Update & Render 1,800 Physical Chladni Sand Particles migrating to nodal lines (W(u,v) = 0)
      if (arStyle === "sand") {
        const grains = sandGrainsRef.current;
        const eps = 0.008;
        const driveStrength = Math.min(2.0, 0.65 + micGainRef.current * 0.55);

        for (let i = 0; i < grains.length; i++) {
          const g = grains[i];
          const w0 = Math.abs(evalAmp(g.u, g.v));

          if (w0 > 0.03) {
            // Finite-difference gradient of |W(u,v)| -> particles drift downhill toward nodal lines
            const wu = Math.abs(evalAmp(Math.min(0.99, g.u + eps), g.v)) - w0;
            const wv = Math.abs(evalAmp(g.u, Math.min(0.99, g.v + eps))) - w0;
            const step = 0.018 * driveStrength;
            g.u -= (wu / eps) * step * w0 + (Math.random() - 0.5) * 0.022 * w0 * driveStrength;
            g.v -= (wv / eps) * step * w0 + (Math.random() - 0.5) * 0.022 * w0 * driveStrength;
            g.u = Math.max(0.015, Math.min(0.985, g.u));
            g.v = Math.max(0.015, Math.min(0.985, g.v));
          }

          let sx = 0;
          let sy = 0;
          const jitterZ = w0 > 0.08 ? Math.sin(phase * 1.8 + i) * w0 * 4.5 * driveStrength : 0;

          if (viewMode === "ar") {
            const p = applyHomography(H, g.u, g.v);
            sx = p.x;
            sy = p.y - jitterZ;
          } else {
            const wSigned = evalAmp(g.u, g.v);
            const z = wSigned * osc * gainScale * 24;
            const cx = (g.u - 0.5) * normW;
            const cy = (g.v - 0.5) * normH;
            const rx = cx * cosY - cy * sinY;
            const ry = cx * sinY + cy * cosY;
            sx = 180 + rx * 230;
            sy = 196 + ry * cosP * 205 - (z + jitterZ) * sinP;
          }

          // Settled nodal sand grains glow crisp gold/cream; flying antinode grains are warm orange
          ctx.fillStyle =
            w0 < 0.09 ? "rgba(245, 240, 196, 0.94)" : "rgba(251, 191, 36, 0.62)";
          ctx.fillRect(sx - 0.9, sy - 0.9, 1.9, 1.9);
        }
      }

      if (viewMode === "ar") {
        ctx.globalCompositeOperation = "source-over";

        // Precision Laser Vibrometer Perimeter Lock & Corner Fiducials P1..P4
        ctx.strokeStyle = "#22D3EE";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        trackedQuad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();

        trackedQuad.forEach((p, idx) => {
          ctx.fillStyle = "#0D191C";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#4ADE80";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#F8FAFC";
          ctx.font = "bold 8px JetBrains Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`P${idx + 1}`, p.x, p.y + 3);
        });

        // Laser Doppler Scanner Line
        const scanV = (Math.sin(phase * 0.42) + 1) * 0.5;
        const sL = applyHomography(H, 0, scanV);
        const sR = applyHomography(H, 1, scanV);
        const sg = ctx.createLinearGradient(sL.x, sL.y, sR.x, sR.y);
        sg.addColorStop(0, "rgba(34,211,238,0.1)");
        sg.addColorStop(0.5, "rgba(74,222,128,0.95)");
        sg.addColorStop(1, "rgba(34,211,238,0.1)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sL.x, sL.y);
        ctx.lineTo(sR.x, sR.y);
        ctx.stroke();

        // Bottom-center Laser Vibrometer Telemetry HUD Bar inside AR view
        ctx.fillStyle = "rgba(10, 20, 23, 0.86)";
        ctx.beginPath();
        ctx.roundRect(46, 304, 268, 22, 7);
        ctx.fill();
        ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#DDF0C2";
        ctx.font = "bold 9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          `LDV MODE ${activeMode.label} // MAX DEFLECTION ±${maxDeflectionUm} µm // Q=${activeMode.qFactor}`,
          180,
          318
        );
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [
    viewMode,
    arStyle,
    arAnchorLocked,
    cameraActive,
    frequency,
    activeMode.m,
    activeMode.n,
    activeMode.label,
    activeMode.qFactor,
    activeMode.resonanceGain,
    plateGeo.aspectRatio,
    quad,
  ]);

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
            {viewMode === "ar"
              ? arAnchorLocked
                ? "AR QUAD LOCKED"
                : arTargetVisible && cameraActive
                ? "LIVE AR TRACKED"
                : "SCANNED QUAD AR"
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
          {/* Fallback to scanned board photo if camera is unavailable during presentation */}
          {viewMode === "ar" && !cameraActive && scanThumbUrl && (
            <img
              src={scanThumbUrl}
              alt="Scanned workpiece background"
              className="absolute inset-0 w-full h-full object-cover opacity-55 blur-[1px]"
            />
          )}
          {viewMode === "ar" && !cameraActive && <div className="absolute inset-0 ar-grid-bg opacity-25" />}

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
            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/15 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-300 animate-pulse" />
              <div className="leading-tight">
                <span className="text-[9px] text-white/75 block font-semibold">
                  {freqSource === "measured" ? "MIC MEASURED" : "KIRCHHOFF-LOVE FEA"}
                </span>
                <span className="text-sm font-extrabold text-white">{frequency} Hz</span>
              </div>
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/80 text-white">
                {activeMode.resonanceGain.toFixed(1)}×
              </span>
            </div>
          </div>

          {/* Top-right AR / 3D physics controls */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            {viewMode !== "2d" && (
              <button
                onClick={() => {
                  setArStyle((s) => (s === "sand" ? "mesh" : "sand"));
                  scatterSandGrains();
                }}
                className="px-2.5 py-1 rounded-full bg-black/60 border border-white/20 text-[10px] font-mono font-bold text-amber-200 hover:bg-black/80"
                title="Toggle Chladni Sand Particles vs Mesh"
              >
                {arStyle === "sand" ? "SAND + LDV" : "FEA MESH"}
              </button>
            )}
            {viewMode === "ar" && (
              <button
                onClick={() => setArAnchorLocked((v) => !v)}
                className="p-1.5 rounded-full bg-black/60 border border-white/20 text-cyan-300 hover:bg-black/80"
                title={arAnchorLocked ? "Unlock AR Quad Tracking" : "Lock AR Quad in Place"}
              >
                {arAnchorLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            )}
            {viewMode !== "2d" && (
              <button
                onClick={scatterSandGrains}
                className="p-1.5 rounded-full bg-black/60 border border-white/20 text-white/90 hover:bg-black/80"
                title="Re-scatter Chladni Sand Grains"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Bottom-left Audio & Live Mic Drive buttons */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5">
            <button
              onClick={toggleAudioDrive}
              className={`px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 backdrop-blur-md transition-colors ${
                isAudioOn ? "brand-gradient text-white shadow-md" : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              {isAudioOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{isAudioOn ? "Tone On" : "Tone"}</span>
            </button>

            <button
              onClick={toggleMicDrive}
              className={`px-2.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 backdrop-blur-md transition-colors ${
                isMicDriveOn
                  ? "bg-emerald-500 text-slate-950 shadow-md"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{isMicDriveOn ? "Mic Live" : "Mic React"}</span>
            </button>
          </div>

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
                    scatterSandGrains();
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
          <span className="text-[11px] font-semibold text-slate-600 dark:text-[#8C999A]">
            Nodal Line (Sand settles)
          </span>
          <div
            className="flex-1 h-2.5 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, hsl(185,100%,55%), hsl(120,100%,50%), hsl(60,100%,55%), hsl(0,100%,55%))",
            }}
          />
          <span className="text-[11px] font-semibold text-slate-600 dark:text-[#8C999A]">
            Antinode Peak
          </span>
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
          <span>Excite Mode &amp; Migrate Chladni Sand</span>
        </HudButton>

        {/* Advanced manual slider */}
        <button
          onClick={() => setShowFineTune((v) => !v)}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-[#8C999A]"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {showFineTune ? "Hide manual control" : "Manual frequency sweep (optional)"}
        </button>

        {showFineTune && (
          <ChamferedCard className="p-4 space-y-2 pop-in">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Drive Frequency</span>
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
              onChange={(e) => {
                setFrequency(Number(e.target.value));
              }}
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
