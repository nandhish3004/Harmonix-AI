"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Radio,
  Volume2,
  ArrowRight,
  Music,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useAudioPitch } from "@/hooks/useAudioPitch";

export default function AudioPitchTunerPage() {
  const router = useRouter();
  const [targetFrequency, setTargetFrequency] = useState<number>(740);
  const [detuneCents, setDetuneCents] = useState<number>(-4);

  const {
    frequency,
    isResonant,
    note,
    volume,
    isListening,
    startListening,
    stopListening,
    setTargetResonance,
  } = useAudioPitch(targetFrequency);

  useEffect(() => {
    setTargetResonance(targetFrequency, 12);
    const diff = frequency - targetFrequency;
    setDetuneCents(Math.min(50, Math.max(-50, Math.round(diff * 1.8))));
  }, [frequency, targetFrequency, setTargetResonance]);

  return (
    <div className="min-h-screen bg-[#0D191C] flex flex-col">
      <HudHeader
        title="PITCH DETECTOR"
        step="SCREEN 05 // 10"
        subtitle="Acoustic Frequency Tuning & Lock"
        backHref="/viewport"
        rightAction={
          <HudBadge variant={isResonant ? "safe" : "danger"} dot>
            {isResonant ? "RESONANCE LOCKED" : "OFF-PEAK"}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Main Central Pitch Strobe Gauge */}
        <div className="relative w-full py-8 bg-[#15282C] rounded-[20px] border border-[#294044] flex flex-col items-center justify-center shadow-lg">
          {/* Note Display */}
          <div className="text-center space-y-1">
            <span className="text-[10px] font-mono tracking-widest text-[#0EB29A] uppercase">
              FUNDAMENTAL NOTE
            </span>
            <div className="text-5xl font-black font-mono text-[#F5FDFF] tracking-tighter flex items-center justify-center gap-1">
              <span>{note}</span>
              <span className="text-xs text-[#8C999A] font-normal">
                {detuneCents >= 0 ? `+${detuneCents}` : detuneCents}¢
              </span>
            </div>
            <div className="text-sm font-mono font-bold text-[#DDF0C2]">
              {frequency} Hz
            </div>
          </div>

          {/* Cents Tuning Meter */}
          <div className="w-64 mt-6">
            <div className="flex justify-between text-[10px] font-mono text-[#8C999A] mb-1.5">
              <span>-50¢ (FLAT)</span>
              <span className="text-[#0EB29A]">IN TUNE</span>
              <span>+50¢ (SHARP)</span>
            </div>
            <div className="relative w-full h-2.5 bg-[#101F23] rounded-full border border-[#233A3D] overflow-hidden">
              {/* Center in-tune tick */}
              <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-[#0EB29A] -translate-x-1/2 z-10" />
              {/* Pointer indicator */}
              <div
                className={`absolute top-0 bottom-0 w-3 rounded-full transition-all duration-150 ${
                  isResonant ? "bg-[#4ADE80] shadow-[0_0_10px_#4ADE80]" : "bg-[#FF4444]"
                }`}
                style={{
                  left: `${Math.min(95, Math.max(5, 50 + detuneCents))}%`,
                  transform: "translateX(-50%)",
                }}
              />
            </div>
          </div>

          {/* Audio input level readout */}
          <div className="flex items-center gap-2 mt-5 text-[10px] font-mono text-[#8C999A]">
            <Volume2 className="w-3.5 h-3.5 text-[#0EB29A]" />
            <span>MIC LEVEL:</span>
            <div className="w-20 h-1.5 bg-[#101F23] rounded-full overflow-hidden border border-[#233A3D]">
              <div
                className="h-full bg-[#0EB29A] transition-all duration-150"
                style={{ width: `${Math.min(100, volume * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Microphone Stream Toggle */}
        <div className="grid grid-cols-1">
          <HudButton
            variant={isListening ? "danger" : "primary"}
            size="md"
            onClick={isListening ? stopListening : startListening}
            className="flex items-center justify-center gap-2"
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>DISCONNECT MICROPHONE STREAM</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-[#0D191C]" />
                <span>ENABLE LIVE MICROPHONE DETECTION</span>
              </>
            )}
          </HudButton>
        </div>

        {/* Target Frequency Slider Control */}
        <ChamferedCard className="p-4 bg-[#15282C] border-[#294044] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#8C999A] uppercase tracking-wider">
              TARGET HARMONIC LOCK (f₀)
            </span>
            <span className="text-sm font-mono font-bold text-[#0EB29A]">
              {targetFrequency} HZ
            </span>
          </div>

          <input
            type="range"
            min="100"
            max="3000"
            step="1"
            value={targetFrequency}
            onChange={(e) => setTargetFrequency(Number(e.target.value))}
            className="w-full accent-[#0EB29A] bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-[#8C999A]">
            <span>100 HZ</span>
            <span className="text-[#DDF0C2]">FINE RESOLUTION ±1 HZ</span>
            <span>3000 HZ</span>
          </div>
        </ChamferedCard>

        {/* Target Resonance Status Card */}
        <ChamferedCard
          variant={isResonant ? "safe" : "danger"}
          className="p-3.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            {isResonant ? (
              <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-[#FF4444]" />
            )}
            <div>
              <span className="text-xs font-mono font-bold uppercase block">
                {isResonant ? "NATURAL FREQUENCY MATCHED" : "SEEKING HARMONIC RESONANCE"}
              </span>
              <span className="text-[10px] font-mono opacity-80">
                {isResonant
                  ? "Acoustic energy concentrated into stable Chladni nodal lines."
                  : "Frequency deviation > 12 Hz. Adjust slider to match peak."}
              </span>
            </div>
          </div>
        </ChamferedCard>

        {/* Proceed CTA */}
        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => router.push("/modes")}
            className="flex items-center justify-center gap-2"
          >
            <span>INSPECT HARMONIC MODES GALLERY</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}

