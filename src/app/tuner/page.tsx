"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Mic, ArrowRight, Volume2, VolumeX, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance } from "@/context/autopilot";
import { classifyTapHF } from "@/utils/aiClient";
import {
  analyzeTapSignal,
  buildAmbientProfile,
  encodeWav,
  isSharpTapImpulse,
  median,
  resampleTo16k,
} from "@/utils/audioAnalysis";
import { speak } from "@/utils/voice";
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

function getInstantAcousticLabel(hz: number, q: number): string {
  if (q >= 65) return hz >= 650 ? "High-Q Metallic / Crystal Resonance" : "Resonant Rigid Plate Impulse";
  if (q >= 30) return hz >= 550 ? "Crisp PCB / Composite Tap" : "Mid-Q Structural Panel Knock";
  return "Damped / Polymer Knock";
}

type Phase = "idle" | "listening" | "analyzing" | "done" | "failed";

export default function FindItsNotePage() {
  const router = useRouter();

  const [guideOpen, setGuideOpen] = useState<boolean>(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState<number>(0);
  const [tapCount, setTapCount] = useState<number>(0);
  const [tapHzList, setTapHzList] = useState<number[]>([]);
  const [repeatabilityPct, setRepeatabilityPct] = useState<number | null>(null);
  const [micProfileInfo, setMicProfileInfo] = useState<string | null>(null);
  const [freqSource, setFreqSource] = useState<"measured" | "theoretical">("measured");
  const [resultHz, setResultHz] = useState<number | null>(null);
  const [resultQ, setResultQ] = useState<number | null>(null);
  const [snrDb, setSnrDb] = useState<number | null>(null);
  const [astLabel, setAstLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isToneOn, setIsToneOn] = useState<boolean>(false);
  const [estimatedHz, setEstimatedHz] = useState<number>(740);

  const toneCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const cancelRef = useRef<boolean>(false);
  const autoStartedRef = useRef<boolean>(false);

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

  const saveMeasuredResult = useCallback(
    (hz: number, q: number | null, label?: string | null) => {
      if (typeof window === "undefined") return;
      localStorage.setItem("harmonix_measured_freq", String(hz));
      localStorage.setItem("harmonix_freq_source", "measured");
      if (q) {
        localStorage.setItem("harmonix_measured_q", String(q));
        localStorage.setItem("harmonix_damping_zeta", (1 / (2 * q)).toFixed(5));
      }
      if (label) localStorage.setItem("harmonix_ast_class", label);
    },
    []
  );

  const useEstimate = useCallback(() => {
    setResultHz(estimatedHz);
    setResultQ(null);
    setSnrDb(null);
    setRepeatabilityPct(null);
    setFreqSource("theoretical");
    setAstLabel("Kirchhoff-Love Theoretical Eigenmode");
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_measured_freq", String(estimatedHz));
      localStorage.setItem("harmonix_peak_freq", String(estimatedHz));
      localStorage.setItem("harmonix_freq_source", "theoretical");
    }
    setPhase("done");
    setMessage(
      `Using Kirchhoff-Love Theoretical Physics Model (${estimatedHz} Hz). Run 2 consistent physical taps for empirical verification.`
    );
    void speak(`Using theoretical model ${estimatedHz} hertz.`, { interrupt: false });
  }, [estimatedHz]);

  const runTapListen = useCallback(async () => {
    cancelRef.current = false;
    setResultHz(null);
    setResultQ(null);
    setSnrDb(null);
    setTapHzList([]);
    setRepeatabilityPct(null);
    setAstLabel(null);
    setTapCount(0);
    setFreqSource("measured");
    setPhase("listening");
    setMessage("Calibrating room noise & mic curve (0.5s)… stay quiet briefly.");
    void speak("Calibrating microphone. Stay quiet for half a second, then tap twice.", {
      interrupt: false,
    });

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("failed");
      setMessage("This browser cannot access the microphone. Use Theoretical Physics Model below.");
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
      analyser.fftSize = 16384;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const shortBuf = new Float32Array(2048);

      // Measure ambient noise profile + MEMS hardware roll-off (~550 ms)
      const calibChunks: Float32Array[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 55));
        analyser.getFloatTimeDomainData(shortBuf);
        calibChunks.push(new Float32Array(shortBuf));
      }
      const profile = buildAmbientProfile(calibChunks, sampleRate);
      setMicProfileInfo(
        `${
          profile.micType === "mems-mobile"
            ? "MEMS Mobile Mic (+3dB/oct LF comp)"
            : "Wideband Acoustic Mic"
        } · Floor ${profile.noiseFloorDb} dBFS`
      );
      setMessage("Mic calibrated — tap your board firmly 2–3 times (3–5 cm away)…");

      const validTaps: { hz: number; q: number; snr: number; audio: Float32Array }[] = [];
      const findConsistentPair = (
        taps: { hz: number; q: number; snr: number; audio: Float32Array }[]
      ) => {
        for (let i = taps.length - 1; i >= 1; i--) {
          const matches = taps.filter(
            (t) => Math.abs(t.hz - taps[i].hz) / Math.max(t.hz, taps[i].hz) <= 0.05
          );
          if (matches.length >= 2) return matches;
        }
        return null;
      };

      const maxWaitMs = 11000;
      const startT = performance.now();

      while (
        validTaps.length < 4 &&
        performance.now() - startT < maxWaitMs &&
        !cancelRef.current
      ) {
        await new Promise((r) => setTimeout(r, 25));
        analyser.getFloatTimeDomainData(shortBuf);
        let s = 0;
        for (let k = 0; k < shortBuf.length; k++) s += shortBuf[k] * shortBuf[k];
        const rms = Math.sqrt(s / shortBuf.length);
        setLevel(Math.min(1, rms * 14));

        if (isSharpTapImpulse(shortBuf, profile.ambientRms)) {
          // Wait ~220ms for post-impact ring-down to populate buffer cleanly
          await new Promise((r) => setTimeout(r, 220));
          analyser.getFloatTimeDomainData(buf);
          const analysis = analyzeTapSignal(buf, sampleRate, 100, 3800, profile);
          if (analysis && analysis.snrDb >= 13) {
            validTaps.push({
              hz: analysis.peakHz,
              q: analysis.qFactor,
              snr: analysis.snrDb,
              audio: new Float32Array(buf),
            });
            setTapCount(validTaps.length);
            setTapHzList(validTaps.map((t) => t.hz));

            const cluster = findConsistentPair(validTaps);
            if (cluster && cluster.length >= 2) {
              setMessage(
                `Matched ${cluster.length} taps within ±5% (${cluster.map((c) => `${c.hz} Hz`).join(", ")}). Locking…`
              );
              break;
            } else {
              setMessage(
                validTaps.length === 1
                  ? `Tap 1 captured (${analysis.peakHz} Hz, SNR ${analysis.snrDb} dB) — tap once more steadily`
                  : `Tap ${validTaps.length} differed (${analysis.peakHz} Hz vs ${validTaps[0].hz} Hz > 5%) — tap again`
              );
            }
          }
          // Refractory window so one impact does not double-trigger
          await new Promise((r) => setTimeout(r, 340));
        }
      }

      if (cancelRef.current) return;

      const consistent = findConsistentPair(validTaps);
      if (!consistent || consistent.length < 2) {
        setPhase("failed");
        if (validTaps.length === 0) {
          setMessage(
            "No valid physical tap detected (ambient noise rejected). Place board center on towel, tap firmly 3–5 cm from mic, or select Theoretical Physics Model."
          );
        } else if (validTaps.length === 1) {
          setMessage(
            `Only 1 valid tap heard (${validTaps[0].hz} Hz). At least 2 matching taps within ±5% are required for repeatability.`
          );
        } else {
          setMessage(
            `Taps disagreed by more than 5% (${validTaps.map((t) => `${t.hz} Hz`).join(" vs ")}). Tap consistently or use Theoretical Physics Model.`
          );
        }
        return;
      }

      const finalHz = Math.round(median(consistent.map((c) => c.hz)) * 10) / 10;
      const finalQ = Math.round(median(consistent.map((c) => c.q)));
      const finalSnr = Math.round(median(consistent.map((c) => c.snr)));
      const minTapHz = Math.min(...consistent.map((c) => c.hz));
      const maxTapHz = Math.max(...consistent.map((c) => c.hz));
      const meanTapHz = consistent.reduce((a, c) => a + c.hz, 0) / consistent.length;
      const repPct = Math.round((1 - (maxTapHz - minTapHz) / Math.max(1, meanTapHz)) * 1000) / 10;
      const bestAudioSample = [...consistent].sort((a, b) => b.snr - a.snr)[0]?.audio ?? null;
      const instantLabel = getInstantAcousticLabel(finalHz, finalQ);

      setTapHzList(consistent.map((c) => c.hz));
      setRepeatabilityPct(repPct);
      setResultHz(finalHz);
      setResultQ(finalQ);
      setSnrDb(finalSnr);
      setAstLabel(instantLabel);
      setFreqSource("measured");
      saveMeasuredResult(finalHz, finalQ, instantLabel);
      setPhase("done");
      setMessage("");
      void speak(
        `Verified ${freqToNote(finalHz)} at ${Math.round(finalHz)} hertz with ${repPct} percent repeatability.`,
        { interrupt: false }
      );

      if (bestAudioSample) {
        const samples16k = resampleTo16k(bestAudioSample, sampleRate);
        const wav = encodeWav(samples16k, 16000);
        void classifyTapHF(wav, samples16k).then((hfRes) => {
          if (cancelRef.current || !hfRes || hfRes.labels.length === 0) return;
          const top = hfRes.labels[0];
          const topAst = `${top.label} (${Math.round(top.score * 100)}%)`;
          setAstLabel(topAst);
          saveMeasuredResult(finalHz, finalQ, topAst);
        });
      }
    } catch {
      setPhase("failed");
      setMessage(
        "Microphone permission was blocked or unavailable. Allow mic access, or click Use Theoretical Physics Model below."
      );
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    }
  }, [saveMeasuredResult]);

  // Automatically start listening right after the guide closes
  useEffect(() => {
    if (guideOpen || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const t = setTimeout(() => {
      void runTapListen();
    }, 350);
    return () => clearTimeout(t);
  }, [guideOpen, runTapListen]);

  // Autopilot advances only after genuine 2-tap empirical verification (never skips empty mic)
  useAutoAdvance(
    phase === "done" && freqSource === "measured" && !guideOpen,
    2600,
    () => router.push("/modes")
  );

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
    resultQ === null
      ? null
      : resultQ >= 60
      ? "Long, clean ring — board feels solid"
      : resultQ >= 25
      ? "Normal ring"
      : "Short, dull ring — possible damping or damage";

  return (
    <div className="min-h-screen flex flex-col">
      <HudHeader title="Find Its Note" step="SCREEN 05 // 10" backHref="/viewport" />

      <div className="p-4 space-y-4 flex-1 flex flex-col">
        <TestGuide kind="tap" open={guideOpen} onDone={() => setGuideOpen(false)} />

        {/* Hero tap button */}
        <ChamferedCard className="py-8 px-4 flex flex-col items-center text-center gap-4 overflow-hidden">
          <div className="relative">
            {phase === "listening" && (
              <>
                <span className="absolute inset-0 rounded-full bg-sky-500/30 animate-ping" />
                <span
                  className="absolute -inset-3 rounded-full border-4 border-sky-400/60"
                  style={{ transform: `scale(${1 + level * 0.35})`, transition: "transform 60ms" }}
                />
              </>
            )}
            <button
              onClick={runTapListen}
              disabled={phase === "listening" || phase === "analyzing"}
              className="relative w-36 h-36 rounded-full brand-gradient shadow-xl shadow-sky-500/30 text-white flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-90"
            >
              <Mic className="w-9 h-9" />
              <span className="text-sm font-extrabold">
                {phase === "listening"
                  ? `Listening (${tapCount}/3)`
                  : phase === "analyzing"
                  ? "Analyzing…"
                  : phase === "done"
                  ? "Tap again"
                  : "Tap & Listen"}
              </span>
            </button>
          </div>

          {message && (
            <p className="text-sm font-semibold text-slate-700 dark:text-[#DDF0C2] px-2">{message}</p>
          )}

          {phase === "idle" && (
            <p className="text-xs text-slate-500 dark:text-[#8C999A] px-4">
              Tap your board 2–3 times. 65k-FFT + Spectral Pre-Whitening locks only on consistent physical strikes.
            </p>
          )}

          {micProfileInfo && (
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#101F23] text-slate-600 dark:text-[#8C999A] border border-slate-200 dark:border-[#294044]">
              {micProfileInfo}
            </span>
          )}

          {phase === "failed" && (
            <div className="flex flex-col items-center gap-2">
              <HudButton variant="secondary" size="md" onClick={useEstimate} className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Use Theoretical Physics Model</span>
              </HudButton>
              <span className="text-[11px] font-mono text-slate-500 dark:text-[#8C999A]">
                Or tap the mic button above to retry
              </span>
            </div>
          )}
        </ChamferedCard>

        {/* Plain-English result */}
        {phase === "done" && resultHz && (
          <ChamferedCard variant="safe" className="p-4 space-y-2 pop-in">
            <div className="flex items-center justify-between gap-2 font-extrabold">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {freqSource === "measured" ? "Verified tap pitch:" : "Theoretical pitch:"}{" "}
                {freqToNote(resultHz)}
              </span>
              {snrDb !== null && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-800 dark:text-[#4ADE80]">
                  SNR {snrDb} dB
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-white/70 dark:bg-black/20 p-3">
                <span className="text-[11px] text-slate-500 block">Pitch</span>
                <span className="text-xl font-extrabold">{resultHz} Hz</span>
              </div>
              <div className="rounded-2xl bg-white/70 dark:bg-black/20 p-3">
                <span className="text-[11px] text-slate-500 block">
                  {resultQ ? "Q / Damping ζ" : "Model"}
                </span>
                <span className="text-xl font-extrabold">
                  {resultQ ? `Q ${resultQ}` : "FEA Baseline"}
                </span>
                {resultQ && (
                  <span className="text-[10px] font-mono text-slate-500 block">
                    ζ = {(1 / (2 * resultQ)).toFixed(4)}
                  </span>
                )}
              </div>
            </div>
            {tapHzList.length > 0 && repeatabilityPct !== null && (
              <div className="text-[11px] font-mono text-emerald-800 dark:text-[#DDF0C2] bg-emerald-500/10 rounded-xl px-3 py-1.5">
                Taps: {tapHzList.map((h) => `${h} Hz`).join(" · ")} — Repeatability{" "}
                <b>{repeatabilityPct}%</b>
              </div>
            )}
            {ringQuality && <p className="text-xs font-semibold">{ringQuality}</p>}
            {astLabel && (
              <p className="text-[11px] text-slate-600 dark:text-[#8C999A]">
                Acoustic signature: <b>{astLabel}</b>
              </p>
            )}

            <button
              onClick={togglePlay}
              className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-[#0EB29A]"
            >
              {isToneOn ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {isToneOn ? "Stop sound" : "Play this note"}
            </button>
          </ChamferedCard>
        )}

        {phase === "failed" && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 px-1">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Tip: rest the center on a soft towel and give 2 crisp taps 3–5 cm from the bottom mic.</span>
          </div>
        )}

        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              cancelRef.current = true;
              if (!resultHz && typeof window !== "undefined") {
                localStorage.setItem("harmonix_measured_freq", String(estimatedHz));
                localStorage.setItem("harmonix_peak_freq", String(estimatedHz));
                localStorage.setItem("harmonix_freq_source", "theoretical");
              }
              if (isToneOn) void togglePlay();
              router.push("/modes");
            }}
            className="flex items-center justify-center gap-2"
          >
            <span>{resultHz ? "Next: Vibration Shapes" : "Skip — Use Theoretical Physics Model"}</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
