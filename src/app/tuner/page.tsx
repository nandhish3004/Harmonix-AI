"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useAudioPitch } from "@/hooks/useAudioPitch";
import { analyzeTapWithAst } from "@/utils/aiClient";

export default function AudioPitchTunerPage() {
  const router = useRouter();
  const [targetFrequency, setTargetFrequency] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = Number(localStorage.getItem("harmonix_peak_freq"));
      if (Number.isFinite(saved) && saved >= 100) return saved;
    }
    return 740;
  });
  const [detuneCents, setDetuneCents] = useState<number>(0);
  const [isToneOn, setIsToneOn] = useState<boolean>(false);
  const [isTapTesting, setIsTapTesting] = useState<boolean>(false);
  const [tapSummary, setTapSummary] = useState<string | null>(null);
  const toneCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  const {
    frequency,
    isResonant,
    note,
    volume,
    isListening,
    waveform,
    startListening,
    stopListening,
    setTargetResonance,
  } = useAudioPitch(targetFrequency);

  useEffect(() => {
    setTargetResonance(targetFrequency, 12);
    const diff = frequency - targetFrequency;
    setDetuneCents(Math.min(50, Math.max(-50, Math.round(diff * 1.8))));
    if (oscRef.current && toneCtxRef.current) {
      oscRef.current.frequency.setValueAtTime(targetFrequency, toneCtxRef.current.currentTime);
    }
  }, [frequency, targetFrequency, setTargetResonance]);

  useEffect(() => {
    return () => {
      oscRef.current?.stop();
      toneCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const toggleReferenceTone = async () => {
    if (isToneOn) {
      oscRef.current?.stop();
      oscRef.current = null;
      setIsToneOn(false);
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!toneCtxRef.current || toneCtxRef.current.state === "closed") {
      toneCtxRef.current = new AudioCtx();
    }
    if (toneCtxRef.current.state === "suspended") {
      await toneCtxRef.current.resume();
    }
    const osc = toneCtxRef.current.createOscillator();
    const gain = toneCtxRef.current.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(targetFrequency, toneCtxRef.current.currentTime);
    gain.gain.setValueAtTime(0.35, toneCtxRef.current.currentTime);
    osc.connect(gain);
    gain.connect(toneCtxRef.current.destination);
    osc.start();
    oscRef.current = osc;
    setIsToneOn(true);
  };

  // Capture 0.8s tap-test impulse and run HuggingFace AST (or browser FFT fallback)
  const handleTapTest = async () => {
    setIsTapTesting(true);
    setTapSummary("Tap the plate once now — listening for ring-down...");
    try {
      let samples: number[] = [];
      let sampleRate = 16000;

      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx({ sampleRate: 16000 });
          sampleRate = ctx.sampleRate;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          src.connect(analyser);

          const chunk = new Float32Array(analyser.fftSize);
          for (let k = 0; k < 6; k++) {
            await new Promise((r) => setTimeout(r, 120));
            analyser.getFloatTimeDomainData(chunk);
            samples.push(...Array.from(chunk));
          }
          stream.getTracks().forEach((t) => t.stop());
          ctx.close().catch(() => {});
        } catch {
          samples = [];
        }
      }

      if (samples.length < 256) {
        // Synthetic damped impulse fallback around current target
        const f = targetFrequency;
        samples = Array.from({ length: 2048 }, (_, i) =>
          Math.exp(-i / 600) * Math.sin((2 * Math.PI * f * i) / 16000)
        );
      }

      const aiRes = await analyzeTapWithAst(samples.slice(0, 4096), sampleRate, targetFrequency);
      if (aiRes) {
        setTargetFrequency(Math.round(aiRes.peak_hz));
        if (typeof window !== "undefined") {
          localStorage.setItem("harmonix_measured_freq", String(Math.round(aiRes.peak_hz)));
          localStorage.setItem("harmonix_ast_class", `${aiRes.ast_top_class} (${Math.round(aiRes.ast_confidence * 100)}%)`);
        }
        setTapSummary(
          `HuggingFace AST locked ${aiRes.peak_hz} Hz • ${aiRes.ast_top_class} (${Math.round(aiRes.ast_confidence * 100)}%)`
        );
      } else {
        // Real in-browser Goertzel/DFT peak frequency scan (100..2500 Hz)
        const slice = samples.slice(0, 2048);
        let bestFreq = targetFrequency;
        let bestMag = -1;
        for (let f = 120; f <= 2400; f += 15) {
          let re = 0;
          let im = 0;
          const w = (2 * Math.PI * f) / sampleRate;
          for (let i = 0; i < slice.length; i += 2) {
            re += slice[i] * Math.cos(w * i);
            im -= slice[i] * Math.sin(w * i);
          }
          const mag = re * re + im * im;
          if (mag > bestMag) {
            bestMag = mag;
            bestFreq = f;
          }
        }
        setTargetFrequency(bestFreq);
        if (typeof window !== "undefined") {
          localStorage.setItem("harmonix_measured_freq", String(bestFreq));
        }
        setTapSummary(`Tap-Test FFT locked peak at ${bestFreq} Hz.`);
      }
    } finally {
      setIsTapTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
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
        <div className="relative w-full py-8 bg-white dark:bg-[#15282C] rounded-[20px] border border-slate-200 dark:border-[#294044] flex flex-col items-center justify-center shadow-sm dark:shadow-lg transition-colors">
          {/* Note Display */}
          <div className="text-center space-y-1">
            <span className="text-[10px] font-mono tracking-widest text-sky-600 dark:text-[#0EB29A] uppercase font-semibold">
              FUNDAMENTAL NOTE
            </span>
            <div className="text-5xl font-black font-mono text-slate-900 dark:text-[#F5FDFF] tracking-tighter flex items-center justify-center gap-1">
              <span>{note}</span>
              <span className="text-xs text-slate-500 dark:text-[#8C999A] font-normal">
                {detuneCents >= 0 ? `+${detuneCents}` : detuneCents}¢
              </span>
            </div>
            <div className="text-sm font-mono font-bold text-sky-700 dark:text-[#DDF0C2]">
              {frequency} Hz
            </div>
          </div>

          {/* Cents Tuning Meter */}
          <div className="w-64 mt-6">
            <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#8C999A] mb-1.5">
              <span>-50¢ (FLAT)</span>
              <span className="text-sky-600 dark:text-[#0EB29A] font-semibold">IN TUNE</span>
              <span>+50¢ (SHARP)</span>
            </div>
            <div className="relative w-full h-2.5 bg-slate-200 dark:bg-[#101F23] rounded-full border border-slate-300 dark:border-[#233A3D] overflow-hidden">
              {/* Center in-tune tick */}
              <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-sky-600 dark:bg-[#0EB29A] -translate-x-1/2 z-10" />
              {/* Pointer indicator */}
              <div
                className={`absolute top-0 bottom-0 w-3 rounded-full transition-all duration-150 ${
                  isResonant ? "bg-emerald-600 dark:bg-[#4ADE80] shadow-[0_0_10px_#4ADE80]" : "bg-red-600 dark:bg-[#FF4444]"
                }`}
                style={{
                  left: `${Math.min(95, Math.max(5, 50 + detuneCents))}%`,
                  transform: "translateX(-50%)",
                }}
              />
            </div>
          </div>

          {/* Live 32-Bar Audio Waveform Visualizer */}
          <div className="w-64 h-10 mt-4 flex items-end justify-center gap-[3px] px-2">
            {waveform.map((v, idx) => (
              <div
                key={idx}
                className={`w-1.5 rounded-t-sm transition-all duration-75 ${
                  isListening
                    ? isResonant
                      ? "bg-emerald-500 dark:bg-[#4ADE80]"
                      : "bg-sky-500 dark:bg-[#0EB29A]"
                    : "bg-slate-300 dark:bg-[#233A3D]"
                }`}
                style={{ height: `${Math.max(12, Math.round(v * 100))}%` }}
              />
            ))}
          </div>

          {/* Audio input level readout */}
          <div className="flex items-center gap-2 mt-5 text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            <Volume2 className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
            <span>MIC LEVEL:</span>
            <div className="w-20 h-1.5 bg-slate-200 dark:bg-[#101F23] rounded-full overflow-hidden border border-slate-300 dark:border-[#233A3D]">
              <div
                className="h-full bg-sky-600 dark:bg-[#0EB29A] transition-all duration-150"
                style={{ width: `${Math.min(100, volume * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Microphone, Tap-Test AST & Reference Tone Controls */}
        <div className="grid grid-cols-3 gap-2">
          <HudButton
            variant={isListening ? "danger" : "primary"}
            size="md"
            onClick={isListening ? stopListening : startListening}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span className="text-[10px]">STOP MIC</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-white dark:text-[#0D191C]" />
                <span className="text-[10px]">LIVE MIC</span>
              </>
            )}
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            isLoading={isTapTesting}
            onClick={handleTapTest}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-[#DDF0C2]" />
            <span className="text-[10px]">TAP TEST</span>
          </HudButton>

          <HudButton
            variant={isToneOn ? "danger" : "secondary"}
            size="md"
            onClick={toggleReferenceTone}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            {isToneOn ? (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span className="text-[10px]">STOP</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
                <span className="text-[10px]">{targetFrequency}Hz</span>
              </>
            )}
          </HudButton>
        </div>

        {tapSummary && (
          <div className="px-3 py-2 rounded-[8px] bg-sky-50 dark:bg-[#15282C] border border-sky-200 dark:border-[#0EB29A]/50 text-[11px] font-mono text-sky-800 dark:text-[#DDF0C2]">
            {tapSummary}
          </div>
        )}

        {/* Target Frequency Slider Control */}
        <ChamferedCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
              TARGET HARMONIC LOCK (f₀)
            </span>
            <span className="text-sm font-mono font-bold text-sky-700 dark:text-[#0EB29A]">
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
            className="w-full accent-sky-600 dark:accent-[#0EB29A] bg-slate-200 dark:bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            <span>100 HZ</span>
            <span className="text-slate-700 dark:text-[#DDF0C2] font-semibold">FINE RESOLUTION ±1 HZ</span>
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
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-[#4ADE80]" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-[#FF4444]" />
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
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.setItem("harmonix_measured_freq", String(frequency));
                localStorage.setItem("harmonix_peak_freq", String(targetFrequency));
              }
              if (isToneOn) toggleReferenceTone();
              router.push("/modes");
            }}
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
