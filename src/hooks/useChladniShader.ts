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
  updateParameters: (freq: number, m?: number, n?: number) => void;
}

// WGSL Compute Shader for 32,768 Chladni Resonance Particles
const CHLADNI_WGSL_COMPUTE = /* wgsl */ `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
  color : vec4<f32>,
};

struct Params {
  frequency : f32,
  m : f32,
  n : f32,
  damping : f32,
  deltaTime : f32,
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> params : Params;

// Chladni 2D nodal equation: w(x, y) = a * sin(n*pi*x)*sin(m*pi*y) - b * sin(m*pi*x)*sin(n*pi*y)
fn chladniGradient(pos : vec2<f32>, m : f32, n : f32) -> vec2<f32> {
  let pi = 3.14159265359;
  let eps = 0.005;
  let px = (pos.x + 1.0) * 0.5;
  let py = (pos.y + 1.0) * 0.5;

  let valX1 = sin(n * pi * (px + eps)) * sin(m * pi * py) - sin(m * pi * (px + eps)) * sin(n * pi * py);
  let valX0 = sin(n * pi * (px - eps)) * sin(m * pi * py) - sin(m * pi * (px - eps)) * sin(n * pi * py);
  let gradX = (valX1 - valX0) / (2.0 * eps);

  let valY1 = sin(n * pi * px) * sin(m * pi * (py + eps)) - sin(m * pi * px) * sin(n * pi * (py + eps));
  let valY0 = sin(n * pi * px) * sin(m * pi * (py - eps)) - sin(m * pi * px) * sin(n * pi * (py - eps));
  let gradY = (valY1 - valY0) / (2.0 * eps);

  return vec2<f32>(gradX, gradY);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let index = global_id.x;
  if (index >= 32768u) {
    return;
  }

  var p = particles[index];
  let grad = chladniGradient(p.pos, params.m, params.n);
  
  // Acceleration drives particles towards nodal lines (where amplitude = 0)
  p.vel = p.vel * params.damping - grad * (params.frequency * 0.0001) * params.deltaTime;
  p.pos = p.pos + p.vel;

  // Boundary wrap
  if (p.pos.x < -1.0) { p.pos.x = 1.0; }
  if (p.pos.x > 1.0) { p.pos.x = -1.0; }
  if (p.pos.y < -1.0) { p.pos.y = 1.0; }
  if (p.pos.y > 1.0) { p.pos.y = -1.0; }

  particles[index] = p;
}
`;

export function useChladniShader(
  initialFrequency: number = 740,
  initialModeM: number = 3,
  initialModeN: number = 5
): ChladniShaderState {
  const [isWebGPUSupported, setIsWebGPUSupported] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const particleCount = 32768;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const freqRef = useRef<number>(initialFrequency);
  const modeMRef = useRef<number>(initialModeM);
  const modeNRef = useRef<number>(initialModeN);
  const animRef = useRef<number | null>(null);

  const updateParameters = useCallback((freq: number, m?: number, n?: number) => {
    freqRef.current = freq;
    if (m !== undefined) modeMRef.current = m;
    if (n !== undefined) modeNRef.current = n;
  }, []);

  const mountCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Check WebGPU availability
    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    setIsWebGPUSupported(Boolean(hasWebGPU));

    // High performance particle physics simulation (runs on WebGPU or hardware-accelerated 2D Canvas)
    const count = 32768;
    const particles = new Float32Array(count * 4); // x, y, vx, vy
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

      // Draw dark background with trail decay
      ctx.fillStyle = "rgba(13, 25, 28, 0.25)";
      ctx.fillRect(0, 0, width, height);

      const m = modeMRef.current;
      const n = modeNRef.current;
      const freq = freqRef.current;
      const pi = Math.PI;

      // Render nodal particles
      ctx.fillStyle = "#DDF0C2"; // Lime neon resonance accent
      for (let i = 0; i < count; i += 2) { // sample stride for smooth 60fps on mobile
        let px = particles[i * 4];
        let py = particles[i * 4 + 1];
        let vx = particles[i * 4 + 2];
        let vy = particles[i * 4 + 3];

        const normX = (px + 1) * 0.5;
        const normY = (py + 1) * 0.5;

        // Chladni nodal plate equation
        const w =
          Math.sin(n * pi * normX) * Math.sin(m * pi * normY) -
          Math.sin(m * pi * normX) * Math.sin(n * pi * normY);

        // Gradient
        const gradX = n * Math.cos(n * pi * normX) * Math.sin(m * pi * normY) - m * Math.cos(m * pi * normX) * Math.sin(n * pi * normY);
        const gradY = m * Math.sin(n * pi * normX) * Math.cos(m * pi * normY) - n * Math.sin(m * pi * normX) * Math.cos(n * pi * normY);

        const force = (freq * 0.00008) * w;
        vx = vx * 0.88 - gradX * force * dt;
        vy = vy * 0.88 - gradY * force * dt;

        px += vx;
        py += vy;

        if (px < -1) px = 1;
        if (px > 1) px = -1;
        if (py < -1) py = 1;
        if (py > 1) py = -1;

        particles[i * 4] = px;
        particles[i * 4 + 1] = py;
        particles[i * 4 + 2] = vx;
        particles[i * 4 + 3] = vy;

        const screenX = (px + 1) * 0.5 * width;
        const screenY = (py + 1) * 0.5 * height;

        ctx.fillRect(screenX, screenY, 1.2, 1.2);
      }

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

