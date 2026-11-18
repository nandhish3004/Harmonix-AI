"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Mic, ArrowRight, Volume2, VolumeX, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance, useAutopilot } from "@/context/autopilot";
import { classifyTapHF } from "@/utils/aiClient";
import { analyzeTapSignal, encodeWav, isSharpTapImpulse, median, resampleTo16k } from "@/utils/audioAnalysis";
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
  const { enabled: autopilotOn } = useAutopilot();

  const [guideOpen, setGuideOpen] = useState<boolean>(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState<number>(0);
  const [tapCount, setTapCount] = useState<number>(0);
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
  const autopilotRef = useRef<boolean>(autopilotOn);
  autopilotRef.current = autopilotOn;

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

  const saveResult = useCallback((hz: number, q: number | null, label?: string | null) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("harmonix_measured_freq", String(hz));
    localStorage.setItem("harmonix_peak_freq", String(hz));
    if (q) localStorage.setItem("harmonix_measured_q", String(q));
    if (label) localStorage.setItem("harmonix_ast_class", label);
  }, []);

  const useEstimate = useCallback(() => {
    setResultHz(estimatedHz);
    setResultQ(null);
    setSnrDb(null);
    saveResult(estimatedHz, null, null);
    setPhase("done");
    setMessage(
      `Using the physics estimate (${estimatedHz} Hz) calculated from your material, thickness and scanned size.`
    );
    void speak(`Using physics estimate ${estimatedHz} hertz.`, { interrupt: false });
  }, [estimatedHz, saveResult]);

  const runTapListen = useCallback(async () => {
    cancelRef.current = false;
    setResultHz(null);
    setResultQ(null);
    setSnrDb(null);
    setAstLabel(null);
    setTapCount(0);
    setPhase("listening");
    setMessage("Tap your board up to 3 times — I'm listening…");
    void speak("Tap your board once now.", { interrupt: false });

    if (!navigator.mediaDevices?.getUserMedia) {
      if (autopilotRef.current) {
        useEstimate();
      } else {
        setPhase("failed");
        setMessage("This browser can't access the microphone.");
      }
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

      // Measure ambient RMS noise floor (~350 ms)
      let ambient = 0.003;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 55));
        analyser.getFloatTimeDomainData(shortBuf);
        let s = 0;
        for (let k = 0; k < shortBuf.length; k++) s += shortBuf[k] * shortBuf[k];
        ambient = Math.max(ambient, Math.sqrt(s / shortBuf.length));
      }
      const threshold = Math.max(0.022, ambient * 3.8);

      const capturedFreqs: number[] = [];
      const capturedQs: number[] = [];
      const capturedSnrs: number[] = [];
      let bestAudioSample: Float32Array | null = null;

      const maxWaitMs = autopilotRef.current ? 4500 : 7500;
      const startT = performance.now();

      while (
        capturedFreqs.length < 3 &&
        performance.now() - startT < (capturedFreqs.length === 0 ? maxWaitMs : 7500) &&
        !cancelRef.current
      ) {
        await new Promise((r) => setTimeout(r, 25));
        analyser.getFloatTimeDomainData(shortBuf);
        let s = 0;
        for (let k = 0; k < shortBuf.length; k++) s += shortBuf[k] * shortBuf[k];
        const rms = Math.sqrt(s / shortBuf.length);
        setLevel(Math.min(1, rms * 14));

        if (isSharpTapImpulse(shortBuf, ambient) && rms > threshold) {
          // Wait ~220ms for post-impact ring-down to fill buffer cleanly
          await new Promise((r) => setTimeout(r, 220));
          analyser.getFloatTimeDomainData(buf);
          const analysis = analyzeTapSignal(buf, sampleRate, 100, 3800);
          if (analysis && analysis.snrDb >= 6) {
            capturedFreqs.push(analysis.peakHz);
            capturedQs.push(analysis.qFactor);
            capturedSnrs.push(analysis.snrDb);
            if (!bestAudioSample || analysis.snrDb >= Math.max(...capturedSnrs)) {
              bestAudioSample = new Float32Array(buf);
            }
            setTapCount(capturedFreqs.length);
            setMessage(
              `Heard tap ${capturedFreqs.length}/3 (${analysis.peakHz} Hz)… ${
                capturedFreqs.length < 3 ? "tap again or wait" : "analyzing!"
              }`
            );
          }
          // Brief refractory period so one impact doesn't trigger twice
          await new Promise((r) => setTimeout(r, 320));
        }
      }

      if (cancelRef.current) return;

      if (capturedFreqs.length === 0) {
        if (autopilotRef.current) {
          useEstimate();
        } else {
          setPhase("failed");
          setMessage(
            "I didn't hear a clear tap. Try tapping closer to the phone's mic, or use the physics estimate."
          );
        }
        return;
      }

      const finalHz = Math.round(median(capturedFreqs) * 10) / 10;
      const finalQ = Math.round(median(capturedQs));
      const finalSnr = Math.round(median(capturedSnrs));
      const instantLabel = getInstantAcousticLabel(finalHz, finalQ);

      setResultHz(finalHz);
      setResultQ(finalQ);
      setSnrDb(finalSnr);
      setAstLabel(instantLabel);
      saveResult(finalHz, finalQ, instantLabel);
      setPhase("done");
      setMessage("");
      void speak(
        `Detected ${freqToNote(finalHz)} at ${Math.round(finalHz)} hertz.`,
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
          saveResult(finalHz, finalQ, topAst);
        });
      }
    } catch {
      if (autopilotRef.current) {
        useEstimate();
      } else {
        setPhase("failed");
        setMessage(
          "Microphone permission was blocked. Allow it in your browser, or use the physics estimate."
        );
      }
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    }
  }, [saveResult, useEstimate]);

  // Automatically start listening right after the guide closes
  useEffect(() => {
    if (guideOpen || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const t = setTimeout(() => {
      void runTapListen();
    }, 350);
    return () => clearTimeout(t);
  }, [guideOpen, runTapListen]);

  // 🤖 Autopilot: move to Modes screen once tap analysis completes
  useAutoAdvance(phase === "done" && !guideOpen, 2600, () => router.push("/modes"));

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
              Tap your board 1–3 times. 65k-FFT + Hugging Face AST locks onto the natural pitch.
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
            <div className="flex items-center justify-between gap-2 font-extrabold">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Your board&apos;s note: {freqToNote(resultHz)}
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
                <span className="text-[11px] text-slate-500 block">Ring quality</span>
                <span className="text-xl font-extrabold">{resultQ ? `Q ${resultQ}` : "—"}</span>
              </div>
            </div>
            {ringQuality && <p className="text-xs font-semibold">{ringQuality}</p>}
            {astLabel && (
              <p className="text-[11px] text-slate-600 dark:text-[#8C999A]">
                Hugging Face AST audio class: <b>{astLabel}</b>
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
            <span>Tip: a quiet room and a firm tap 5 cm from the mic work best.</span>
          </div>
        )}

        <div className="pt-2 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              cancelRef.current = true;
              if (!resultHz) saveResult(estimatedHz, null);
              if (isToneOn) void togglePlay();
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
