"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, ArrowRight, Volume2, VolumeX, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { analyzeTapWithAst } from "@/utils/aiClient";
import {
  computeAllModes,
  getStoredMaterial,
  getStoredPlateGeometry,
  getStoredThickness,
} from "@/utils/physics";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function freqToNote(freq: number): string {
  if (freq <= 0) return "--";
  const n = Math.round(12 * Math.log2(freq / 440)) + 69;
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

type Phase = "idle" | "listening" | "analyzing" | "done" | "failed";

export default function FindItsNotePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState<number>(0);
  const [resultHz, setResultHz] = useState<number | null>(null);
  const [resultQ, setResultQ] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isToneOn, setIsToneOn] = useState<boolean>(false);
  const [estimatedHz, setEstimatedHz] = useState<number>(740);

  const toneCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const cancelRef = useRef<boolean>(false);

  // Physics-based estimate used as an honest fallback when the mic can't hear a tap
  useEffect(() => {
    const modes = computeAllModes(
      getStoredMaterial(),
      getStoredThickness(),
      getStoredPlateGeometry().areaMm2,
      getStoredPlateGeometry().aspectRatio,
      0
    );
    const m22 = modes.find((m) => m.id === "mode-2-2") ?? modes[2];
    setEstimatedHz(m22.freqHz);
    return () => {
      cancelRef.current = true;
      oscRef.current?.stop();
      toneCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const saveResult = (hz: number, q: number | null) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("harmonix_measured_freq", String(hz));
    localStorage.setItem("harmonix_peak_freq", String(hz));
    if (q) localStorage.setItem("harmonix_measured_q", String(q));
  };

  const useEstimate = () => {
    setResultHz(estimatedHz);
    setResultQ(null);
    saveResult(estimatedHz, null);
    setPhase("done");
    setMessage(
      `Using the physics estimate (${estimatedHz} Hz) calculated from your material, thickness and scanned size.`
    );
  };

  const runTapListen = async () => {
    cancelRef.current = false;
    setResultHz(null);
    setResultQ(null);
    setPhase("listening");
    setMessage("Tap your board once with a pen or finger — I'm listening…");

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("failed");
      setMessage("This browser can't access the microphone.");
      return;
    }

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const sampleRate = ctx.sampleRate;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      // Measure ambient noise for ~0.4s, then wait up to 6s for a clear impact
      let ambient = 0.004;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 60));
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let k = 0; k < buf.length; k++) s += buf[k] * buf[k];
        ambient = Math.max(ambient, Math.sqrt(s / buf.length));
      }
      const threshold = Math.max(0.03, ambient * 4);

      let impactFound = false;
      const startT = performance.now();
      while (performance.now() - startT < 6000 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 25));
        analyser.getFloatTimeDomainData(buf);
        let s = 0;
        for (let k = 0; k < buf.length; k++) s += buf[k] * buf[k];
        const rms = Math.sqrt(s / buf.length);
        setLevel(Math.min(1, rms * 12));
        if (rms > threshold) {
          impactFound = true;
          break;
        }
      }

      if (!impactFound) {
        setPhase("failed");
        setMessage(
          cancelRef.current
            ? ""
            : "I didn't hear a tap. Try tapping closer to the phone's mic, or use the physics estimate."
        );
        return;
      }

      setPhase("analyzing");
      setMessage("Got it! Analyzing the ring…");
      await new Promise((r) => setTimeout(r, 180));
      analyser.getFloatTimeDomainData(buf);
      const samples = Array.from(buf);

      // Try the Python AI backend (Hugging Face AST) first, then local DFT
      const ai = await analyzeTapWithAst(samples, sampleRate, estimatedHz);
      let hz = 0;
      let q: number | null = null;
      if (ai && ai.peak_hz > 0) {
        hz = Math.round(ai.peak_hz);
      } else {
        // Hann-windowed DFT sweep + −3 dB bandwidth Q estimate
        const N = 4096;
        const spec: { f: number; p: number }[] = [];
        let bestI = 0;
        let bestP = -1;
        for (let f = 100; f <= 3000; f += 8) {
          let re = 0;
          let im = 0;
          const w = (2 * Math.PI * f) / sampleRate;
          for (let i = 0; i < N; i += 2) {
            const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
            const v = samples[i] * hann;
            re += v * Math.cos(w * i);
            im -= v * Math.sin(w * i);
          }
          const p = re * re + im * im;
          if (p > bestP) {
            bestP = p;
            bestI = spec.length;
          }
          spec.push({ f, p });
        }
        hz = spec[bestI]?.f ?? estimatedHz;
        const half = bestP * 0.5;
        let l = bestI;
        while (l > 0 && spec[l].p > half) l--;
        let r = bestI;
        while (r < spec.length - 1 && spec[r].p > half) r++;
        const bw = Math.max(8, spec[r].f - spec[l].f);
        q = Math.max(5, Math.round(hz / bw));
      }

      setResultHz(hz);
      setResultQ(q);
      saveResult(hz, q);
      setPhase("done");
      setMessage("");
    } catch {
      setPhase("failed");
      setMessage("Microphone permission was blocked. Allow it in your browser, or use the physics estimate.");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    }
  };

  const togglePlay = async () => {
    const hz = resultHz ?? estimatedHz;
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
    if (toneCtxRef.current.state === "suspended") await toneCtxRef.current.resume();
    const osc = toneCtxRef.current.createOscillator();
    const gain = toneCtxRef.current.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, toneCtxRef.current.currentTime);
    gain.gain.setValueAtTime(0.35, toneCtxRef.current.currentTime);
    osc.connect(gain);
    gain.connect(toneCtxRef.current.destination);
    osc.start();
    oscRef.current = osc;
    setIsToneOn(true);
  };

  const ringQuality =
    resultQ === null ? null : resultQ >= 60 ? "Long, clean ring — board feels solid ✓" : resultQ >= 25 ? "Normal ring" : "Short, dull ring — possible damping or damage ⚠";

  return (
    <div className="min-h-screen flex flex-col">
      <HudHeader title="Find Its Note" step="SCREEN 05 // 10" backHref="/viewport" />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        {/* Hero tap button */}
        <ChamferedCard className="py-8 px-4 flex flex-col items-center text-center gap-4 overflow-hidden">
          <div className="relative">
            {phase === "listening" && (
              <>
                <span className="absolute inset-0 rounded-full brand-gradient opacity-30 animate-ping" />
                <span
                  className="absolute -inset-3 rounded-full border-4 border-fuchsia-400/60"
                  style={{ transform: `scale(${1 + level * 0.35})`, transition: "transform 60ms" }}
                />
              </>
            )}
            <button
              onClick={runTapListen}
              disabled={phase === "listening" || phase === "analyzing"}
              className="relative w-36 h-36 rounded-full brand-gradient shadow-2xl shadow-fuchsia-500/40 text-white flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-90"
            >
              <Mic className="w-9 h-9" />
              <span className="text-sm font-extrabold">
                {phase === "listening" ? "Listening…" : phase === "analyzing" ? "Analyzing…" : phase === "done" ? "Tap again" : "Tap & Listen"}
              </span>
            </button>
          </div>

          {message && <p className="text-sm font-semibold text-slate-700 dark:text-[#DDF0C2] px-2">{message}</p>}

          {phase === "idle" && (
            <p className="text-xs text-slate-500 dark:text-[#8C999A] px-4">
              Press the button, then tap your board once. AI listens for the ring and finds its natural note.
            </p>
          )}

          {phase === "failed" && (
            <HudButton variant="secondary" size="md" onClick={useEstimate} className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Use AI physics estimate</span>
            </HudButton>
          )}
        </ChamferedCard>

        {/* Plain-English result */}
        {phase === "done" && resultHz && (
          <ChamferedCard variant="safe" className="p-4 space-y-2 pop-in">
            <div className="flex items-center gap-2 font-extrabold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Your board's note: {freqToNote(resultHz)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-white/70 dark:bg-black/20 p-3">
                <span className="text-[11px] text-slate-500 block">Pitch</span>
                <span className="text-xl font-extrabold">{resultHz} Hz</span>
              </div>
              <div className="rounded-2xl bg-white/70 dark:bg-black/20 p-3">
                <span className="text-[11px] text-slate-500 block">Ring quality</span>
                <span className="text-xl font-extrabold">{resultQ ? `Q ${resultQ}` : "—"}</span>
              </div>
            </div>
            {ringQuality && <p className="text-xs font-semibold">{ringQuality}</p>}

            <button
              onClick={togglePlay}
              className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-700 dark:text-[#F9A8D4]"
            >
              {isToneOn ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {isToneOn ? "Stop sound" : "Play this note"}
            </button>
          </ChamferedCard>
        )}

        {phase === "failed" && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 px-1">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Tip: a quiet room and a firm single tap near the mic work best.</span>
          </div>
        )}

        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              if (!resultHz) saveResult(estimatedHz, null);
              if (isToneOn) togglePlay();
              router.push("/modes");
            }}
            className="flex items-center justify-center gap-2"
          >
            <span>{resultHz ? "Next: Vibration Shapes" : "Skip — let AI estimate"}</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
