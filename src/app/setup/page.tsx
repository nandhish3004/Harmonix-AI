"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Mic,
  Sun,
  Activity,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";

export default function SetupCalibrationPage() {
  const router = useRouter();
  const [micStatus, setMicStatus] = useState<"testing" | "passed" | "error">("testing");
  const [cameraStatus, setCameraStatus] = useState<"testing" | "passed" | "error">("testing");
  const [luxLevel, setLuxLevel] = useState<number>(420);
  const [noiseFloorDbfs, setNoiseFloorDbfs] = useState<number>(-42);
  const [sweepHz, setSweepHz] = useState<number>(440);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(true);

  useEffect(() => {
    // Simulate real hardware diagnostics initialization
    const timer = setTimeout(() => {
      setMicStatus("passed");
      setCameraStatus("passed");
      setIsCalibrating(false);
    }, 1500);

    const interval = setInterval(() => {
      setNoiseFloorDbfs(Math.floor(-44 + Math.random() * 4));
      setLuxLevel(Math.floor(415 + Math.random() * 12));
    }, 1200);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col">
      <HudHeader
        title="CALIBRATION"
        step="SCREEN 01 // 10"
        subtitle="Acoustic & Optical Telemetry Setup"
        backHref="/auth"
      />

      <div className="p-4 space-y-4 flex-1">
        {/* Hardware Status Banner */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-[#8C999A] uppercase tracking-wider">
              HARDWARE CALIBRATION STATUS
            </span>
            <HudBadge variant={micStatus === "passed" && cameraStatus === "passed" ? "safe" : "warning"} dot>
              {isCalibrating ? "RUNNING CHECKS" : "READY FOR ACQUISITION"}
            </HudBadge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Camera Diagnostics */}
            <div className="p-3 bg-[#101F23] rounded-[12px] border border-[#233A3D]">
              <div className="flex items-center justify-between mb-2">
                <Camera className="w-4 h-4 text-[#0EB29A]" />
                {cameraStatus === "passed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#F5C518] animate-spin" />
                )}
              </div>
              <div className="text-xs font-mono font-bold text-[#F5FDFF]">OPTICAL SENSOR</div>
              <div className="text-[10px] font-mono text-[#8C999A] mt-0.5">
                1080P @ 60 FPS // FOV 78°
              </div>
            </div>

            {/* Mic Diagnostics */}
            <div className="p-3 bg-[#101F23] rounded-[12px] border border-[#233A3D]">
              <div className="flex items-center justify-between mb-2">
                <Mic className="w-4 h-4 text-[#0EB29A]" />
                {micStatus === "passed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#F5C518] animate-spin" />
                )}
              </div>
              <div className="text-xs font-mono font-bold text-[#F5FDFF]">ACOUSTIC TRANSDUCER</div>
              <div className="text-[10px] font-mono text-[#8C999A] mt-0.5">
                48 kHz / 24-BIT LINEAR PCM
              </div>
            </div>
          </div>
        </ChamferedCard>

        {/* Ambient Noise Floor Telemetry */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-[#8C999A] uppercase tracking-wider">
              AMBIENT NOISE FLOOR
            </span>
            <span className="text-xs font-mono font-bold text-[#DDF0C2]">
              {noiseFloorDbfs} dBFS
            </span>
          </div>

          {/* Level meter bar */}
          <div className="w-full h-3 bg-[#101F23] rounded-full overflow-hidden border border-[#233A3D] p-0.5 flex items-center">
            <div
              className="h-full bg-gradient-to-r from-[#0EB29A] via-[#DDF0C2] to-[#FF4444] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(10, (noiseFloorDbfs + 90) * 1.5))}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-[#8C999A] mt-2">
            <span>-90 dBFS (SILENT)</span>
            <span className="text-[#4ADE80]">OPTIMAL TEST RANGE</span>
            <span>0 dBFS (CLIPPING)</span>
          </div>
        </ChamferedCard>

        {/* Ambient Illumination Check */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-[#F5C518]" />
              <span className="text-xs font-mono text-[#8C999A] uppercase tracking-wider">
                LIGHTING ILLUMINANCE
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-[#F5FDFF]">
              {luxLevel} LUX
            </span>
          </div>
          <div className="text-[11px] font-mono text-[#8C999A]">
            Surface reflectivity within tolerance. High-contrast edge segmentation enabled.
          </div>
        </ChamferedCard>

        {/* Transducer Frequency Calibration */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0EB29A]" />
              <span className="text-xs font-mono text-[#8C999A] uppercase tracking-wider">
                TEST SWEEP FREQUENCY
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-[#0EB29A]">
              {sweepHz} HZ
            </span>
          </div>

          <input
            type="range"
            min="200"
            max="3000"
            step="10"
            value={sweepHz}
            onChange={(e) => setSweepHz(Number(e.target.value))}
            className="w-full accent-[#0EB29A] bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-[#8C999A] mt-1.5">
            <span>200 HZ</span>
            <span>SWEEP RANGE</span>
            <span>3000 HZ</span>
          </div>
        </ChamferedCard>

        {/* Calibration Checklist */}
        <div className="p-3 bg-[#101F23]/80 rounded-[12px] border border-[#233A3D] space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-[#DDF0C2]">
            <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
            <span>OPTICAL DISTORTION CORRECTION: ACTIVE</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#DDF0C2]">
            <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
            <span>FFT WINDOW: HANNING // 2048 SAMPLES</span>
          </div>
        </div>

        {/* Proceed CTA */}
        <div className="pt-2">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/scan")}
            className="flex items-center justify-center gap-2"
          >
            <span>CALIBRATION COMPLETE → PROCEED TO SCAN</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}

