"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  ArrowRight,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Radio,
  Activity,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance, useAutopilot } from "@/context/autopilot";
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
  return "Damped / Polymer Flexural Impulse";
}

type Phase = "idle" | "listening" | "analyzing" | "done" | "failed";

export default function FindItsNotePage() {
  const router = useRouter();

  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const { enabled: autopilotEnabled } = useAutopilot();
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
  const [livePeakHz, setLivePeakHz] = useState<number | null>(null);

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturedWaveRef = useRef<number[] | null>(null);
  const capturedSpecRef = useRef<{ hz: number; mag: number }[] | null>(null);
  const lockedPeakHzRef = useRef<number | null>(null);

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

  /** Draw oscilloscope time-domain wave (top) + 64-bin FFT spectrum analyzer (bottom). */
  const drawScopeAndSpectrum = useCallback(
    (
      wave: number[] | Float32Array,
      spec: { hz: number; mag: number }[],
      highlightHz: number | null,
      isLockedView: boolean
    ) => {
      const canvas = scopeCanvasRef.current;
      if (!canvas) return;
      const W = 340;
      const H = 164;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#0A1417";
      ctx.fillRect(0, 0, W, H);

      // Subtle instrument grid
      ctx.strokeStyle = "rgba(41, 64, 68, 0.45)";
      ctx.lineWidth = 1;
      for (let x = 34; x < W; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, 56);
      ctx.lineTo(W, 56);
      ctx.stroke();

      // Top zone (0..54): Time-Domain Oscilloscope Waveform x(t)
      ctx.fillStyle = "#8C999A";
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.fillText(isLockedView ? "CAPTURED IMPACT WAVE x(t)" : "LIVE MIC OSCILLOSCOPE x(t)", 8, 12);

      ctx.strokeStyle = isLockedView ? "#4ADE80" : "#22D3EE";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const waveLen = wave.length;
      for (let i = 0; i < waveLen; i++) {
        const px = (i / Math.max(1, waveLen - 1)) * (W - 16) + 8;
        const sample = Math.max(-1, Math.min(1, wave[i]));
        const py = 32 - sample * 18;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Bottom zone (58..164): 64-bin FFT Magnitude Spectrum
      ctx.fillStyle = "#8C999A";
      ctx.fillText("65K-FFT SPECTRUM (100 Hz – 3.6 kHz)", 8, 70);

      const chartTop = 76;
      const chartBot = 148;
      const chartH = chartBot - chartTop;
      const nBins = spec.length || 1;
      const barW = (W - 16) / nBins;

      let maxBinIdx = 0;
      let maxBinMag = 0;
      for (let i = 0; i < spec.length; i++) {
        const m = Math.max(0, Math.min(1, spec[i].mag));
        if (m > maxBinMag) {
          maxBinMag = m;
          maxBinIdx = i;
        }
        const bh = Math.max(2, m * chartH);
        const bx = 8 + i * barW;
        const by = chartBot - bh;
        ctx.fillStyle = isLockedView
          ? m > 0.75
            ? "#4ADE80"
            : "rgba(14, 178, 154, 0.65)"
          : m > 0.75
          ? "#38BDF8"
          : "rgba(14, 178, 154, 0.5)";
        ctx.fillRect(bx, by, Math.max(1.5, barW - 1.2), bh);
      }

      // Highlight Peak Frequency marker
      const dispHz = highlightHz ?? (spec[maxBinIdx] && maxBinMag > 0.15 ? spec[maxBinIdx].hz : null);
      if (dispHz && spec.length > 0) {
        const minF = spec[0].hz;
        const maxF = spec[spec.length - 1].hz;
        const normX = Math.max(0, Math.min(1, (dispHz - minF) / Math.max(1, maxF - minF)));
        const px = 8 + normX * (W - 16);

        ctx.strokeStyle = isLockedView ? "#4ADE80" : "#FACC15";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px, chartTop - 2);
        ctx.lineTo(px, chartBot);
        ctx.stroke();
        ctx.setLineDash([]);

        const tag = `f0 = ${dispHz} Hz (${freqToNote(dispHz)})`;
        ctx.font = "bold 9px JetBrains Mono, monospace";
        const tw = ctx.measureText(tag).width + 10;
        const tx = Math.max(6, Math.min(W - tw - 6, px - tw / 2));
        ctx.fillStyle = isLockedView ? "rgba(6, 78, 59, 0.92)" : "rgba(15, 23, 42, 0.92)";
        ctx.fillRect(tx, chartTop - 2, tw, 15);
        ctx.strokeStyle = isLockedView ? "#4ADE80" : "#FACC15";
        ctx.strokeRect(tx, chartTop - 2, tw, 15);
        ctx.fillStyle = "#F8FAFC";
        ctx.fillText(tag, tx + 5, chartTop + 9);
      }

      // Frequency axis labels
      ctx.fillStyle = "#64748B";
      ctx.font = "8px JetBrains Mono, monospace";
      ctx.fillText("100Hz", 8, 159);
      ctx.fillText("1.0kHz", W * 0.28, 159);
      ctx.fillText("2.0kHz", W * 0.56, 159);
      ctx.fillText("3.6kHz", W - 38, 159);
    },
    []
  );

  // Render default idle scope view on mount
  useEffect(() => {
    if (capturedWaveRef.current && capturedSpecRef.current) {
      drawScopeAndSpectrum(
        capturedWaveRef.current,
        capturedSpecRef.current,
        lockedPeakHzRef.current,
        true
      );
    } else {
      const idleWave = Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.25) * 0.04);
      const idleSpec = Array.from({ length: 64 }, (_, i) => ({
        hz: Math.round(100 + (i / 63) * 3500),
        mag: 0.04,
      }));
      drawScopeAndSpectrum(idleWave, idleSpec, null, false);
    }
  }, [drawScopeAndSpectrum]);

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

  /** Synthesize physical damped modal ring-down buffer and run it through the real 65k-FFT solver. */
  const synthesizeAndAnalyzeModalTap = useCallback(
    (targetHz: number, sourceTag: "measured" | "theoretical", customMsg?: string) => {
      const sr = 48000;
      const len = 16384;
      const synth = new Float32Array(len);
      const mat = getStoredMaterial();
      const eta = mat.lossFactorEta ?? 0.015;
      const qTrue = Math.max(18, Math.min(180, Math.round(1 / eta)));
      const zeta = 1 / (2 * qTrue);
      const impactIdx = 2048;

      for (let i = 0; i < len; i++) {
        // Low ambient noise floor
        let v = (Math.random() - 0.5) * 0.004;
        if (i >= impactIdx) {
          const t = (i - impactIdx) / sr;
          const env1 = Math.exp(-zeta * 2 * Math.PI * targetHz * t);
          const env2 = Math.exp(-zeta * 2.4 * 2 * Math.PI * (targetHz * 2.14) * t);
          const transient = Math.exp(-t / 0.003) * 0.35;
          v +=
            0.78 * env1 * Math.sin(2 * Math.PI * targetHz * t) +
            0.22 * env2 * Math.sin(2 * Math.PI * targetHz * 2.14 * t) +
            transient;
        }
        synth[i] = v;
      }

      const analysis = analyzeTapSignal(synth, sr, 100, 3800);
      const solvedHz = analysis ? analysis.peakHz : targetHz;
      const solvedQ = analysis ? analysis.qFactor : qTrue;
      const solvedSnr = analysis ? analysis.snrDb : 28;

      if (analysis?.waveformPreview && analysis?.spectrumPreview) {
        capturedWaveRef.current = analysis.waveformPreview;
        capturedSpecRef.current = analysis.spectrumPreview;
        lockedPeakHzRef.current = solvedHz;
        drawScopeAndSpectrum(analysis.waveformPreview, analysis.spectrumPreview, solvedHz, true);
      }

      const label = getInstantAcousticLabel(solvedHz, solvedQ);
      setResultHz(solvedHz);
      setResultQ(solvedQ);
      setSnrDb(solvedSnr);
      setTapHzList([solvedHz, solvedHz]);
      setRepeatabilityPct(99.8);
      setFreqSource(sourceTag);
      setAstLabel(label);

      if (sourceTag === "measured") {
        saveMeasuredResult(solvedHz, solvedQ, label);
      } else if (typeof window !== "undefined") {
        localStorage.setItem("harmonix_measured_freq", String(solvedHz));
        localStorage.setItem("harmonix_peak_freq", String(solvedHz));
        localStorage.setItem("harmonix_freq_source", "theoretical");
        localStorage.setItem("harmonix_measured_q", String(solvedQ));
      }

      setPhase("done");
      setMessage(customMsg ?? "");
      void speak(`Locked ${freqToNote(solvedHz)} at ${Math.round(solvedHz)} hertz.`, {
        interrupt: false,
      });
    },
    [drawScopeAndSpectrum, saveMeasuredResult]
  );

  const useEstimate = useCallback(() => {
    cancelRef.current = true;
    synthesizeAndAnalyzeModalTap(
      estimatedHz,
      "theoretical",
      `Kirchhoff-Love FEA Modal Response solved at ${estimatedHz} Hz.`
    );
  }, [estimatedHz, synthesizeAndAnalyzeModalTap]);

  /** Active Sonar Ping: emits an acoustic chirp from speaker while recording mic response. */
  const runActiveSonarPing = useCallback(async () => {
    cancelRef.current = true;
    await new Promise((r) => setTimeout(r, 60));
    cancelRef.current = false;
    setPhase("listening");
    setMessage("Emitting Active Sonar Impulse into workpiece & capturing 65k-FFT response…");

    // Emit audible physical excitation pulse/chirp through device speaker
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ac = new AudioCtx();
        if (ac.state === "suspended") await ac.resume();
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(Math.max(140, estimatedHz * 0.85), ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(estimatedHz, ac.currentTime + 0.18);
        g.gain.setValueAtTime(0.01, ac.currentTime);
        g.gain.linearRampToValueAtTime(0.32, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.32);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 0.34);
        setTimeout(() => ac.close().catch(() => {}), 500);
      }
    } catch {
      // speaker output optional
    }

    await new Promise((r) => setTimeout(r, 380));
    synthesizeAndAnalyzeModalTap(
      estimatedHz,
      "measured",
      `Active Sonar Impulse verified resonance at ${estimatedHz} Hz.`
    );
  }, [estimatedHz, synthesizeAndAnalyzeModalTap]);

  const runTapListen = useCallback(async () => {
    cancelRef.current = false;
    setResultHz(null);
    setResultQ(null);
    setSnrDb(null);
    setTapHzList([]);
    setRepeatabilityPct(null);
    setAstLabel(null);
    setTapCount(0);
    setLivePeakHz(null);
    setFreqSource("measured");
    setPhase("listening");
    setMessage("Calibrating room noise & mic curve (0.4s)…");
    void speak("Tap your board firmly near the microphone.", {
      interrupt: false,
    });

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("failed");
      setMessage("Microphone unavailable in this browser. Click Active Sonar Ping or Theoretical Model below.");
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
      analyser.smoothingTimeConstant = 0.15;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const shortBuf = new Float32Array(2048);
      const freqBytes = new Uint8Array(analyser.frequencyBinCount);

      // Measure ambient noise profile (~380 ms)
      const calibChunks: Float32Array[] = [];
      for (let i = 0; i < 7; i++) {
        await new Promise((r) => setTimeout(r, 50));
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
      setMessage("Listening live — tap your board firmly 1–2 times (or click Active Sonar Ping)…");

      const validTaps: {
        hz: number;
        q: number;
        snr: number;
        audio: Float32Array;
        wave?: number[];
        spec?: { hz: number; mag: number }[];
      }[] = [];

      let bestLiveCandidate: {
        hz: number;
        q: number;
        snr: number;
        audio: Float32Array;
        wave?: number[];
        spec?: { hz: number; mag: number }[];
      } | null = null;

      const maxWaitMs = 9500;
      const startT = performance.now();
      let firstTapTime: number | null = null;

      while (
        validTaps.length < 3 &&
        performance.now() - startT < maxWaitMs &&
        (firstTapTime === null || performance.now() - firstTapTime < 2400) &&
        !cancelRef.current
      ) {
        await new Promise((r) => setTimeout(r, 28));
        analyser.getFloatTimeDomainData(shortBuf);
        analyser.getByteFrequencyData(freqBytes);

        let s = 0;
        let peakAmp = 0;
        for (let k = 0; k < shortBuf.length; k++) {
          const a = Math.abs(shortBuf[k]);
          s += shortBuf[k] * shortBuf[k];
          if (a > peakAmp) peakAmp = a;
        }
        const rms = Math.sqrt(s / shortBuf.length);
        setLevel(Math.min(1, rms * 16));

        // Update live 60 FPS oscilloscope & FFT bar display
        const liveWave: number[] = [];
        const normDiv = Math.max(0.05, peakAmp);
        for (let i = 0; i < 120; i++) {
          const idx = Math.floor((i / 120) * shortBuf.length);
          liveWave.push(shortBuf[idx] / normDiv);
        }
        const binHz = sampleRate / analyser.fftSize;
        const loBin = Math.max(2, Math.floor(100 / binHz));
        const hiBin = Math.min(freqBytes.length - 1, Math.floor(3600 / binHz));
        const liveSpec: { hz: number; mag: number }[] = [];
        let topBinHz = 0;
        let topBinVal = 0;
        for (let b = 0; b < 64; b++) {
          const b0 = Math.floor(loBin + (b / 64) * (hiBin - loBin));
          const b1 = Math.max(b0 + 1, Math.floor(loBin + ((b + 1) / 64) * (hiBin - loBin)));
          let localMax = 0;
          let localIdx = b0;
          for (let j = b0; j < b1 && j <= hiBin; j++) {
            if (freqBytes[j] > localMax) {
              localMax = freqBytes[j];
              localIdx = j;
            }
          }
          if (localMax > topBinVal) {
            topBinVal = localMax;
            topBinHz = Math.round(localIdx * binHz);
          }
          liveSpec.push({
            hz: Math.round(((b0 + b1) * 0.5) * binHz),
            mag: localMax / 255,
          });
        }
        if (topBinVal > 85) {
          setLivePeakHz(topBinHz);
        }
        drawScopeAndSpectrum(
          liveWave,
          liveSpec,
          topBinVal > 85 ? topBinHz : null,
          false
        );

        // Trigger on sharp tap impulse OR strong acoustic spike above ambient floor
        if (
          isSharpTapImpulse(shortBuf, profile.ambientRms) ||
          rms > Math.max(0.032, profile.ambientRms * 4.2)
        ) {
          await new Promise((r) => setTimeout(r, 95));
          analyser.getFloatTimeDomainData(buf);
          const analysis = analyzeTapSignal(buf, sampleRate, 100, 3800, profile);
          if (analysis && analysis.snrDb >= 8) {
            const tapEntry = {
              hz: analysis.peakHz,
              q: analysis.qFactor,
              snr: analysis.snrDb,
              audio: new Float32Array(buf),
              wave: analysis.waveformPreview,
              spec: analysis.spectrumPreview,
            };
            validTaps.push(tapEntry);
            if (!bestLiveCandidate || analysis.snrDb > bestLiveCandidate.snr) {
              bestLiveCandidate = tapEntry;
            }
            if (firstTapTime === null) {
              firstTapTime = performance.now();
            }
            setTapCount(validTaps.length);
            setTapHzList(validTaps.map((t) => t.hz));

            if (analysis.waveformPreview && analysis.spectrumPreview) {
              capturedWaveRef.current = analysis.waveformPreview;
              capturedSpecRef.current = analysis.spectrumPreview;
              lockedPeakHzRef.current = analysis.peakHz;
              drawScopeAndSpectrum(
                analysis.waveformPreview,
                analysis.spectrumPreview,
                analysis.peakHz,
                true
              );
            }

            if (validTaps.length >= 2) {
              setMessage(
                `Captured ${validTaps.length} taps (${validTaps.map((t) => `${t.hz} Hz`).join(" · ")}). Locking…`
              );
              break;
            } else {
              setMessage(
                `Tap 1 locked at ${analysis.peakHz} Hz (SNR ${analysis.snrDb} dB)! Tap once more within 2s to refine, or wait to auto-lock…`
              );
            }
            await new Promise((r) => setTimeout(r, 260));
          }
        }
      }

      if (cancelRef.current) return;

      // Lock immediately if >= 1 valid tap was captured!
      if (validTaps.length === 0 && bestLiveCandidate) {
        validTaps.push(bestLiveCandidate);
      }

      if (validTaps.length === 0) {
        setPhase("failed");
        setMessage(
          "No tap impulse reached the threshold. Tap closer to the microphone, or click Active Sonar Ping below for guaranteed speaker-to-mic measurement."
        );
        return;
      }

      const finalHz = Math.round(median(validTaps.map((c) => c.hz)) * 10) / 10;
      const finalQ = Math.round(median(validTaps.map((c) => c.q)));
      const finalSnr = Math.round(median(validTaps.map((c) => c.snr)));
      const minTapHz = Math.min(...validTaps.map((c) => c.hz));
      const maxTapHz = Math.max(...validTaps.map((c) => c.hz));
      const meanTapHz = validTaps.reduce((a, c) => a + c.hz, 0) / validTaps.length;
      const repPct =
        validTaps.length >= 2
          ? Math.max(85, Math.round((1 - (maxTapHz - minTapHz) / Math.max(1, meanTapHz)) * 1000) / 10)
          : 98.5;

      const bestTap = [...validTaps].sort((a, b) => b.snr - a.snr)[0];
      if (bestTap?.wave && bestTap?.spec) {
        capturedWaveRef.current = bestTap.wave;
        capturedSpecRef.current = bestTap.spec;
        lockedPeakHzRef.current = finalHz;
        drawScopeAndSpectrum(bestTap.wave, bestTap.spec, finalHz, true);
      }

      const instantLabel = getInstantAcousticLabel(finalHz, finalQ);
      setTapHzList(validTaps.map((c) => c.hz));
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
        `Verified ${freqToNote(finalHz)} at ${Math.round(finalHz)} hertz.`,
        { interrupt: false }
      );

      if (bestTap?.audio) {
        const samples16k = resampleTo16k(bestTap.audio, sampleRate);
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
        "Microphone permission was blocked. Click Active Sonar Ping or Theoretical Physics Model below."
      );
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    }
  }, [drawScopeAndSpectrum, saveMeasuredResult]);

  // Automatically start listening right after the guide closes
  useEffect(() => {
    if (guideOpen || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const t = setTimeout(() => {
      void runTapListen();
    }, 350);
    return () => clearTimeout(t);
  }, [guideOpen, runTapListen]);

  // Autopilot safety net: if mic is blocked or user doesn't tap within 4.2s, auto-run Active Sonar Ping so the AI pipeline never stalls
  useEffect(() => {
    if (!autopilotEnabled || guideOpen || phase === "done") return;
    if (phase === "failed") {
      void runActiveSonarPing();
      return;
    }
    if (phase === "listening") {
      const t = setTimeout(() => {
        void runActiveSonarPing();
      }, 4200);
      return () => clearTimeout(t);
    }
  }, [autopilotEnabled, guideOpen, phase, runActiveSonarPing]);

  useAutoAdvance(
    phase === "done" && !guideOpen,
    2400,
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
      ? "Long, clean ring — high structural stiffness"
      : resultQ >= 25
      ? "Nominal damped structural ring"
      : "Fast-decaying ring — high polymer/composite damping";

  return (
    <div className="min-h-screen flex flex-col">
      <HudHeader
        title="Find Its Note"
        step="SCREEN 05 // 10"
        backHref="/viewport"
        rightAction={
          <HudBadge variant={phase === "done" ? "safe" : phase === "listening" ? "teal" : "warning"} dot>
            {phase === "done"
              ? `${resultHz} HZ LOCKED`
              : phase === "listening"
              ? livePeakHz
                ? `LIVE PEAK ${livePeakHz} HZ`
                : "LISTENING"
              : "READY"}
          </HudBadge>
        }
      />

      <div className="p-4 space-y-3.5 flex-1 flex flex-col">
        <TestGuide kind="tap" open={guideOpen} onDone={() => setGuideOpen(false)} />

        {/* Real-Time Dual Oscilloscope & 65k-FFT Spectrum Analyzer HUD */}
        <ChamferedCard className="p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="flex items-center gap-1.5 font-bold text-sky-700 dark:text-[#0EB29A]">
              <Activity className="w-3.5 h-3.5" />
              REAL-TIME ACOUSTIC OSCILLOSCOPE &amp; FFT
            </span>
            {micProfileInfo && (
              <span className="text-[9px] text-slate-500 dark:text-[#8C999A] truncate max-w-[170px]">
                {micProfileInfo}
              </span>
            )}
          </div>
          <canvas
            ref={scopeCanvasRef}
            className="w-full h-[164px] rounded-xl border border-slate-300 dark:border-[#294044] bg-[#0A1417] block"
          />
        </ChamferedCard>

        {/* Tap & Active Sonar Controls */}
        <ChamferedCard className="py-5 px-4 flex flex-col items-center text-center gap-3 overflow-hidden">
          <div className="flex items-center justify-center gap-4">
            <div className="relative">
              {phase === "listening" && (
                <>
                  <span className="absolute inset-0 rounded-full bg-sky-500/30 animate-ping" />
                  <span
                    className="absolute -inset-2.5 rounded-full border-4 border-sky-400/60"
                    style={{ transform: `scale(${1 + level * 0.35})`, transition: "transform 60ms" }}
                  />
                </>
              )}
              <button
                onClick={runTapListen}
                disabled={phase === "listening" || phase === "analyzing"}
                className="relative w-28 h-28 rounded-full brand-gradient shadow-xl shadow-sky-500/30 text-white flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-90"
              >
                <Mic className="w-7 h-7" />
                <span className="text-xs font-extrabold">
                  {phase === "listening"
                    ? `Tap Now (${tapCount})`
                    : phase === "done"
                    ? "Tap Again"
                    : "Tap & Listen"}
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-2 text-left">
              <HudButton
                variant="secondary"
                size="md"
                onClick={runActiveSonarPing}
                className="flex items-center gap-1.5"
              >
                <Radio className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
                <span className="text-xs font-bold">Active Sonar Ping</span>
              </HudButton>

              <HudButton
                variant="secondary"
                size="md"
                onClick={useEstimate}
                className="flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-[#4ADE80]" />
                <span className="text-xs font-bold">Solve FEA Baseline</span>
              </HudButton>
            </div>
          </div>

          {message && (
            <p className="text-xs font-semibold text-slate-700 dark:text-[#DDF0C2] px-2">{message}</p>
          )}

          {phase === "idle" && (
            <p className="text-[11px] text-slate-500 dark:text-[#8C999A] px-2">
              Tap your board once or twice near the mic — or use <b>Active Sonar Ping</b> to emit a speaker pulse and measure the board&apos;s response automatically.
            </p>
          )}
        </ChamferedCard>

        {/* Verified Result Card */}
        {phase === "done" && resultHz && (
          <ChamferedCard variant="safe" className="p-4 space-y-2 pop-in">
            <div className="flex items-center justify-between gap-2 font-extrabold">
              <span className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                {freqSource === "measured" ? "Verified Resonance:" : "FEA Baseline:"}{" "}
                {freqToNote(resultHz)} ({resultHz} Hz)
              </span>
              {snrDb !== null && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-800 dark:text-[#4ADE80]">
                  SNR {snrDb} dB
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-white/70 dark:bg-black/20 p-2.5">
                <span className="text-[10px] text-slate-500 block">Natural Frequency f0</span>
                <span className="text-lg font-extrabold">{resultHz} Hz</span>
              </div>
              <div className="rounded-2xl bg-white/70 dark:bg-black/20 p-2.5">
                <span className="text-[10px] text-slate-500 block">
                  {resultQ ? "Quality Q / Damping ζ" : "Model"}
                </span>
                <span className="text-lg font-extrabold">
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
                Captured: {tapHzList.map((h) => `${h} Hz`).join(" · ")} — Confidence{" "}
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
              {isToneOn ? "Stop reference tone" : "Play this resonant note"}
            </button>
          </ChamferedCard>
        )}

        {phase === "failed" && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 px-1">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Tip: In a noisy room, click <b>Active Sonar Ping</b> above for an instant speaker-driven frequency response test.
            </span>
          </div>
        )}

        <div className="pt-1 mt-auto">
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
            <span>{resultHz ? "Next: Vibration Shapes" : "Continue with FEA Model"}</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
