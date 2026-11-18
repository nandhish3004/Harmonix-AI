"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface ChladniShaderConfig {
  frequency: number;
  modeM?: number;
  modeN?: number;
  damping?: number;
  particleCount?: number;
}

export interface ChladniShaderState {
  isWebGPUSupported: boolean;
  fps: number;
  particleCount: number;
  mountCanvas: (canvas: HTMLCanvasElement) => void;
  updateParameters: (freq: number, m?: number, n?: number, showSdf?: boolean) => void;
}

/**
 * Evaluate Chladni standing wave amplitude W(x,y) and gradient.
 * Uses symmetric superposition for m !== n and rectangular nodal lattice when m === n
 * (since sin(n*pi*x)sin(m*pi*y) - sin(m*pi*x)sin(n*pi*y) vanishes identically when m === n).
 */
function evalChladni(normX: number, normY: number, m: number, n: number) {
  const pi = Math.PI;
  if (m === n) {
    const sx = Math.sin(m * pi * normX);
    const sy = Math.sin(n * pi * normY);
    const cx = Math.cos(m * pi * normX);
    const cy = Math.cos(n * pi * normY);
    const w = sx * sy + 0.35 * cx * cy;
    const gradX = m * pi * (cx * sy - 0.35 * sx * cy);
    const gradY = n * pi * (sx * cy - 0.35 * cx * sy);
    return { w, gradX, gradY };
  }
  const w =
    Math.sin(n * pi * normX) * Math.sin(m * pi * normY) -
    Math.sin(m * pi * normX) * Math.sin(n * pi * normY);
  const gradX =
    n * pi * Math.cos(n * pi * normX) * Math.sin(m * pi * normY) -
    m * pi * Math.cos(m * pi * normX) * Math.sin(n * pi * normY);
  const gradY =
    m * pi * Math.sin(n * pi * normX) * Math.cos(m * pi * normY) -
    n * pi * Math.sin(m * pi * normX) * Math.cos(n * pi * normY);
  return { w, gradX, gradY };
}

export function useChladniShader(
  initialFrequency: number = 740,
  initialModeM: number = 2,
  initialModeN: number = 2
): ChladniShaderState {
  const [isWebGPUSupported, setIsWebGPUSupported] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const particleCount = 32768;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const freqRef = useRef<number>(initialFrequency);
  const modeMRef = useRef<number>(initialModeM);
  const modeNRef = useRef<number>(initialModeN);
  const showSdfRef = useRef<boolean>(true);
  const scatterBurstRef = useRef<number>(0);
  const animRef = useRef<number | null>(null);

  const updateParameters = useCallback(
    (freq: number, m?: number, n?: number, showSdf?: boolean) => {
      const modeChanged =
        (m !== undefined && m !== modeMRef.current) ||
        (n !== undefined && n !== modeNRef.current);
      freqRef.current = freq;
      if (m !== undefined) modeMRef.current = m;
      if (n !== undefined) modeNRef.current = n;
      if (showSdf !== undefined) showSdfRef.current = showSdf;
      if (modeChanged) {
        scatterBurstRef.current = 1.0;
      }
    },
    []
  );

  const mountCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
    }
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    setIsWebGPUSupported(Boolean(hasWebGPU));

    const count = 32768;
    const particles = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      particles[i * 4] = (Math.random() - 0.5) * 2;
      particles[i * 4 + 1] = (Math.random() - 0.5) * 2;
      particles[i * 4 + 2] = 0;
      particles[i * 4 + 3] = 0;
    }

    let lastTime = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const render = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsUpdate = now;
      }

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      // Meta-style dark glass plate: neon colors pop in both light & dark app themes
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(13, 25, 28, 0.30)";
      ctx.fillRect(0, 0, width, height);

      const m = modeMRef.current;
      const n = modeNRef.current;
      const freq = freqRef.current;
      const burst = scatterBurstRef.current;
      if (scatterBurstRef.current > 0) {
        scatterBurstRef.current = Math.max(0, scatterBurstRef.current - 0.08);
      }

      // Rainbow nodal-line glow (SDF): hue follows position for a colorful aurora effect
      if (showSdfRef.current) {
        const gridStep = 6;
        for (let sy = 0; sy < height; sy += gridStep) {
          const ny = sy / height;
          for (let sx = 0; sx < width; sx += gridStep) {
            const nx = sx / width;
            const { w } = evalChladni(nx, ny, m, n);
            if (Math.abs(w) < 0.09) {
              ctx.fillStyle = `hsla(${Math.round((nx + ny) * 180 + 170)}, 95%, 60%, 0.22)`;
              ctx.fillRect(sx, sy, gridStep, gridStep);
            }
          }
        }
      }

      const drive = 0.0018 + Math.min(0.004, freq * 0.0000018);

      // Bucket particles by displacement so each color is drawn with a single fill
      const buckets: number[][] = [[], [], [], []];
      const BUCKET_COLORS = ["#38BDF8", "#0EB29A", "#DDF0C2", "#F59E0B"];

      for (let i = 0; i < count; i += 2) {
        let px = particles[i * 4];
        let py = particles[i * 4 + 1];
        let vx = particles[i * 4 + 2];
        let vy = particles[i * 4 + 3];
        let absW = 1;

        if (burst > 0.85) {
          px = (Math.random() - 0.5) * 2;
          py = (Math.random() - 0.5) * 2;
          vx = 0;
          vy = 0;
        } else {
          const normX = (px + 1) * 0.5;
          const normY = (py + 1) * 0.5;
          const { w, gradX, gradY } = evalChladni(normX, normY, m, n);
          absW = Math.abs(w);

          // Gradient force toward nodal lines (w = 0) + stochastic acoustic vibration where |w| is large
          const jitter = absW * 0.012;
          const jx = (Math.random() - 0.5) * jitter;
          const jy = (Math.random() - 0.5) * jitter;

          vx = vx * 0.8 - w * gradX * drive * dt * 60 + jx;
          vy = vy * 0.8 - w * gradY * drive * dt * 60 + jy;

          px += vx;
          py += vy;

          if (px < -1) px = -1 + Math.random() * 0.05;
          if (px > 1) px = 1 - Math.random() * 0.05;
          if (py < -1) py = -1 + Math.random() * 0.05;
          if (py > 1) py = 1 - Math.random() * 0.05;
        }

        particles[i * 4] = px;
        particles[i * 4 + 1] = py;
        particles[i * 4 + 2] = vx;
        particles[i * 4 + 3] = vy;

        const screenX = (px + 1) * 0.5 * width;
        const screenY = (py + 1) * 0.5 * height;
        const b = absW < 0.12 ? 0 : absW < 0.5 ? 1 : absW < 1.0 ? 2 : 3;
        buckets[b].push(screenX, screenY);
      }

      ctx.globalCompositeOperation = "lighter";
      for (let b = 0; b < 4; b++) {
        const arr = buckets[b];
        if (arr.length === 0) continue;
        ctx.fillStyle = BUCKET_COLORS[b];
        ctx.beginPath();
        const size = b === 0 ? 1.8 : 1.4;
        for (let k = 0; k < arr.length; k += 2) {
          ctx.rect(arr[k], arr[k + 1], size, size);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  return {
    isWebGPUSupported,
    fps,
    particleCount,
    mountCanvas,
    updateParameters,
  };
}
