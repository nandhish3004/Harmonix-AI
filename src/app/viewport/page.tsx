"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Sliders,
  Eye,
  Radio,
  Layers,
  Sparkles,
  ArrowRight,
  Maximize,
  Volume2,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useChladniShader } from "@/hooks/useChladniShader";

export default function ChladniViewportPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frequency, setFrequency] = useState<number>(740);
  const [showNodalGrid, setShowNodalGrid] = useState<boolean>(true);
  const [splDb, setSplDb] = useState<number>(82.4);

  const { isWebGPUSupported, fps, particleCount, mountCanvas, updateParameters } =
    useChladniShader(frequency, 2, 2);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = 360;
      canvasRef.current.height = 360;
      mountCanvas(canvasRef.current);
    }
  }, [mountCanvas]);

  useEffect(() => {
    updateParameters(frequency, 2, 2);
  }, [frequency, updateParameters]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSplDb(parseFloat((82.0 + Math.random() * 1.5).toFixed(1)));
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col">
      <HudHeader
        title="AR CHLADNI VIEWPORT"
        step="SCREEN 04 // 10"
        subtitle="Real-time WebGPU Nodal Simulation"
        backHref="/material"
        rightAction={
          <HudBadge variant={isWebGPUSupported ? "teal" : "lime"} dot>
            {isWebGPUSupported ? "WEBGPU ACCEL" : "CANVAS-2D // 60 FPS"}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Core AR WebGPU Chladni Viewport */}
        <div className="relative w-full aspect-square bg-[#0D191C] rounded-[20px] border border-[#294044] overflow-hidden flex items-center justify-center shadow-2xl">
          {/* WebGPU / 2D Canvas */}
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain cursor-grab"
          />

          {/* AR overlay reticle and corners */}
          <div className="absolute inset-2 border border-[#294044]/40 rounded-[14px] pointer-events-none" />
          <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-[#0EB29A] pointer-events-none" />
          <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-[#0EB29A] pointer-events-none" />
          <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-[#0EB29A] pointer-events-none" />
          <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-[#0EB29A] pointer-events-none" />

          {/* Floating Live Frequency Telemetry Badge */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-none">
            <div className="bg-[#0D191C]/90 backdrop-blur-md px-3 py-1.5 rounded-[10px] border border-[#0EB29A]/50 flex items-center gap-2 shadow-[0_0_12px_rgba(14,178,154,0.3)]">
              <Radio className="w-4 h-4 text-[#0EB29A] animate-pulse" />
              <div>
                <span className="text-[10px] font-mono tracking-widest text-[#8C999A] block leading-none">
                  EXCITATION FREQUENCY
                </span>
                <span className="text-sm font-bold font-mono text-[#DDF0C2]">
                  {frequency} Hz // MODE (2,2)
                </span>
              </div>
            </div>

            <div className="bg-[#0D191C]/80 px-2.5 py-1 rounded-[6px] border border-[#294044] text-[9px] font-mono text-[#8C999A]">
              PARTICLES: <span className="text-[#F5FDFF] font-bold">{particleCount.toLocaleString()}</span> // FPS:{" "}
              <span className="text-[#4ADE80] font-bold">{fps}</span>
            </div>
          </div>

          {/* Sound Pressure Level readout at bottom left */}
          <div className="absolute bottom-4 left-4 z-20 bg-[#0D191C]/90 backdrop-blur-md px-2.5 py-1.5 rounded-[8px] border border-[#294044] text-[10px] font-mono flex items-center gap-2 pointer-events-none">
            <Volume2 className="w-3.5 h-3.5 text-[#0EB29A]" />
            <span className="text-[#8C999A]">SPL:</span>
            <span className="text-[#F5FDFF] font-bold">{splDb} dBA</span>
          </div>

          {/* Nodal Line overlay toggle status */}
          <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
            <button
              onClick={() => setShowNodalGrid(!showNodalGrid)}
              className="bg-[#15282C]/90 hover:bg-[#1C332E] text-xs font-mono text-[#8C999A] hover:text-[#F5FDFF] px-2.5 py-1.5 rounded-[8px] border border-[#294044] flex items-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-[#0EB29A]" />
              <span>{showNodalGrid ? "SDF ON" : "SDF OFF"}</span>
            </button>
          </div>
        </div>

        {/* Live Frequency Slider Fine Tuner */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#8C999A] uppercase tracking-wider">
              REAL-TIME ACOUSTIC DRIVE
            </span>
            <span className="text-sm font-mono font-bold text-[#0EB29A]">
              {frequency} HZ
            </span>
          </div>

          <input
            type="range"
            min="200"
            max="2500"
            step="5"
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
            className="w-full accent-[#0EB29A] bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-[#8C999A]">
            <span>200 HZ (MODE 1,1)</span>
            <span className="text-[#DDF0C2]">SWEEP HARMONICS</span>
            <span>2500 HZ (MODE 4,2)</span>
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
            <Activity className="w-4 h-4 text-[#0EB29A]" />
            <span>OPEN PITCH TUNER</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            onClick={() => router.push("/modes")}
            className="flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4 text-[#DDF0C2]" />
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

