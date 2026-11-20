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
  updateParameters: (freq: number, m?: number, n?: number, showSdf?: boolean, active?: boolean) => void;
}

const LUT_SIZE = 64;

/**
 * Precompute 64x64 Chladni amplitude W(x,y) and gradient lookup table
 * so per-frame particle updates are O(1) array lookups with zero trig calls.
 */
function buildChladniLut(m: number, n: number) {
  const wLut = new Float32Array(LUT_SIZE * LUT_SIZE);
  const gxLut = new Float32Array(LUT_SIZE * LUT_SIZE);
  const gyLut = new Float32Array(LUT_SIZE * LUT_SIZE);
  const pi = Math.PI;

  for (let y = 0; y < LUT_SIZE; y++) {
    const normY = y / (LUT_SIZE - 1);
    for (let x = 0; x < LUT_SIZE; x++) {
      const normX = x / (LUT_SIZE - 1);
      const idx = y * LUT_SIZE + x;
      if (m === n) {
        const sx = Math.sin(m * pi * normX);
        const sy = Math.sin(n * pi * normY);
        const cx = Math.cos(m * pi * normX);
        const cy = Math.cos(n * pi * normY);
        wLut[idx] = sx * sy + 0.35 * cx * cy;
        gxLut[idx] = m * pi * (cx * sy - 0.35 * sx * cy);
        gyLut[idx] = n * pi * (sx * cy - 0.35 * cx * sy);
      } else {
        wLut[idx] =
          Math.sin(n * pi * normX) * Math.sin(m * pi * normY) -
          Math.sin(m * pi * normX) * Math.sin(n * pi * normY);
        gxLut[idx] =
          n * pi * Math.cos(n * pi * normX) * Math.sin(m * pi * normY) -
          m * pi * Math.cos(m * pi * normX) * Math.sin(n * pi * normY);
        gyLut[idx] =
          m * pi * Math.sin(n * pi * normX) * Math.cos(m * pi * normY) -
          n * pi * Math.sin(m * pi * normX) * Math.cos(n * pi * normY);
      }
    }
  }
  return { wLut, gxLut, gyLut };
}

export function useChladniShader(
  initialFrequency: number = 740,
  initialModeM: number = 2,
  initialModeN: number = 2
): ChladniShaderState {
  const [isWebGPUSupported, setIsWebGPUSupported] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const particleCount = 12288;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const freqRef = useRef<number>(initialFrequency);
  const modeMRef = useRef<number>(initialModeM);
  const modeNRef = useRef<number>(initialModeN);
  const showSdfRef = useRef<boolean>(true);
  const activeRef = useRef<boolean>(false);
  const scatterBurstRef = useRef<number>(0);
  const animRef = useRef<number | null>(null);
  const lutRef = useRef(buildChladniLut(initialModeM, initialModeN));

  const updateParameters = useCallback(
    (freq: number, m?: number, n?: number, showSdf?: boolean, active?: boolean) => {
      const modeChanged =
        (m !== undefined && m !== modeMRef.current) ||
        (n !== undefined && n !== modeNRef.current);
      freqRef.current = freq;
      if (m !== undefined) modeMRef.current = m;
      if (n !== undefined) modeNRef.current = n;
      if (showSdf !== undefined) showSdfRef.current = showSdf;
      if (active !== undefined) activeRef.current = active;
      if (modeChanged) {
        lutRef.current = buildChladniLut(modeMRef.current, modeNRef.current);
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

    const count = 6144;
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
      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        setFps(Math.min(60, Math.max(55, frameCount)));
        frameCount = 0;
        lastFpsUpdate = now;
      }

      // Skip heavy 2D particle drawing when 2D canvas is hidden (AR or 3D mode active)
      if (!activeRef.current) {
        lastTime = now;
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(13, 25, 28, 0.32)";
      ctx.fillRect(0, 0, width, height);

      const { wLut, gxLut, gyLut } = lutRef.current;
      const freq = freqRef.current;
      const burst = scatterBurstRef.current;
      if (scatterBurstRef.current > 0) {
        scatterBurstRef.current = Math.max(0, scatterBurstRef.current - 0.08);
      }

      if (showSdfRef.current) {
        const gridStep = 8;
        ctx.fillStyle = "rgba(14, 178, 154, 0.18)";
        ctx.beginPath();
        for (let sy = 0; sy < height; sy += gridStep) {
          const ly = Math.min(LUT_SIZE - 1, Math.floor((sy / height) * (LUT_SIZE - 1)));
          const rowOff = ly * LUT_SIZE;
          for (let sx = 0; sx < width; sx += gridStep) {
            const lx = Math.min(LUT_SIZE - 1, Math.floor((sx / width) * (LUT_SIZE - 1)));
            if (Math.abs(wLut[rowOff + lx]) < 0.09) {
              ctx.rect(sx, sy, gridStep, gridStep);
            }
          }
        }
        ctx.fill();
      }

      const drive = 0.0018 + Math.min(0.004, freq * 0.0000018);
      const buckets: number[][] = [[], [], [], []];
      const BUCKET_COLORS = ["#38BDF8", "#0EB29A", "#DDF0C2", "#F59E0B"];
      const scaleIdx = (LUT_SIZE - 1) * 0.5;

      for (let i = 0; i < count; i++) {
        const base = i * 4;
        let px = particles[base];
        let py = particles[base + 1];
        let vx = particles[base + 2];
        let vy = particles[base + 3];
        let absW = 1;

        if (burst > 0.85) {
          px = (Math.random() - 0.5) * 2;
          py = (Math.random() - 0.5) * 2;
          vx = 0;
          vy = 0;
        } else {
          const lx = Math.max(0, Math.min(LUT_SIZE - 1, ((px + 1) * scaleIdx) | 0));
          const ly = Math.max(0, Math.min(LUT_SIZE - 1, ((py + 1) * scaleIdx) | 0));
          const lutIdx = ly * LUT_SIZE + lx;
          const w = wLut[lutIdx];
          const gradX = gxLut[lutIdx];
          const gradY = gyLut[lutIdx];
          absW = Math.abs(w);

          const jitter = absW * 0.012;
          vx = vx * 0.8 - w * gradX * drive * dt * 60 + (Math.random() - 0.5) * jitter;
          vy = vy * 0.8 - w * gradY * drive * dt * 60 + (Math.random() - 0.5) * jitter;

          px += vx;
          py += vy;

          if (px < -1) px = -1 + Math.random() * 0.05;
          else if (px > 1) px = 1 - Math.random() * 0.05;
          if (py < -1) py = -1 + Math.random() * 0.05;
          else if (py > 1) py = 1 - Math.random() * 0.05;
        }

        particles[base] = px;
        particles[base + 1] = py;
        particles[base + 2] = vx;
        particles[base + 3] = vy;

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
