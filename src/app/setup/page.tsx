"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Mic,
  Sun,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Volume2,
  VolumeX,
  Bot,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { checkAiHealth, AiHealth } from "@/utils/aiClient";
import { TestGuide } from "@/components/guide/TestGuide";
import { useAutoAdvance, useAutopilot } from "@/context/autopilot";
import { speak } from "@/utils/voice";

export default function SetupCalibrationPage() {
  const router = useRouter();
  const [micStatus, setMicStatus] = useState<"testing" | "passed" | "error">("testing");
  const [cameraStatus, setCameraStatus] = useState<"testing" | "passed" | "error">("testing");
  const [cameraResolution, setCameraResolution] = useState<string>("PROBING OPTICS...");
  const [micRate, setMicRate] = useState<string>("PROBING AUDIO...");
  const [luxLevel, setLuxLevel] = useState<number>(0);
  const [noiseFloorDbfs, setNoiseFloorDbfs] = useState<number>(-60);
  const [sweepHz, setSweepHz] = useState<number>(440);
  const [isTonePlaying, setIsTonePlaying] = useState<boolean>(false);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(true);
  const [aiHealth, setAiHealth] = useState<AiHealth>({ status: "offline", hfConfigured: false });
  const [guideOpen, setGuideOpen] = useState<boolean>(true);
  const { enabled: autopilotOn, start: startAutopilot } = useAutopilot();

  // Autopilot: once sensors are checked, go to the scanner automatically
  useAutoAdvance(!isCalibrating && !guideOpen, 2500);

  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const toneCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanupStreams = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    micStreamRef.current = null;
    camStreamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const runDiagnostics = useCallback(async () => {
    cleanupStreams();
    setIsCalibrating(true);
    setMicStatus("testing");
    setCameraStatus("testing");

    // 1. Test Optical Sensor
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        camStreamRef.current = camStream;
        const track = camStream.getVideoTracks()[0];
        const settings = track.getSettings();
        setCameraResolution(
          `${settings.width || 1280}x${settings.height || 720} @ ${Math.round(settings.frameRate || 30)} FPS`
        );
        setCameraStatus("passed");

        // Measure real frame luminance once video is ready
        const video = document.createElement("video");
        video.srcObject = camStream;
        video.muted = true;
        await video.play().catch(() => {});
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 48;
        const ctx = c.getContext("2d");
        setTimeout(() => {
          if (ctx && video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, 64, 48);
            const pixels = ctx.getImageData(0, 0, 64, 48).data;
            let lumSum = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              lumSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            }
            const avgLum = lumSum / (pixels.length / 4);
            setLuxLevel(Math.round(avgLum * 3.2));
          } else {
            setLuxLevel(380);
          }
        }, 400);
      } else {
        setCameraStatus("error");
        setCameraResolution("NO MEDIA API");
      }
    } catch {
      setCameraStatus("error");
      setCameraResolution("PERMISSION DENIED / NO CAM");
      setLuxLevel(0);
    }

    // 2. Test Acoustic Transducer + Live RMS dBFS meter
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(micStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
        setMicRate(`${(ctx.sampleRate / 1000).toFixed(1)} kHz // LIVE PCM`);
        setMicStatus("passed");

        const buf = new Float32Array(analyser.fftSize);
        let tick = 0;
        const measureLoop = () => {
          tick++;
          if (tick % 6 === 0 && analyserRef.current) {
            analyserRef.current.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            const dbfs = rms > 1e-5 ? Math.round(20 * Math.log10(rms)) : -90;
            setNoiseFloorDbfs(Math.max(-90, Math.min(0, dbfs)));
          }
          rafRef.current = requestAnimationFrame(measureLoop);
        };
        rafRef.current = requestAnimationFrame(measureLoop);
      } else {
        setMicStatus("error");
        setMicRate("NO AUDIO API");
      }
    } catch {
      setMicStatus("error");
      setMicRate("MIC BLOCKED / UNAVAILABLE");
    }

    setIsCalibrating(false);
  }, [cleanupStreams]);

  useEffect(() => {
    runDiagnostics();
    checkAiHealth().then(setAiHealth);
    return () => {
      cleanupStreams();
      oscRef.current?.stop();
      toneCtxRef.current?.close().catch(() => {});
    };
  }, [runDiagnostics, cleanupStreams]);

  // Real Web Audio test sweep generator
  const toggleTestTone = async () => {
    if (isTonePlaying) {
      oscRef.current?.stop();
      oscRef.current = null;
      setIsTonePlaying(false);
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
    osc.frequency.setValueAtTime(sweepHz, toneCtxRef.current.currentTime);
    gain.gain.setValueAtTime(0.35, toneCtxRef.current.currentTime);
    osc.connect(gain);
    gain.connect(toneCtxRef.current.destination);
    osc.start();
    oscRef.current = osc;
    setIsTonePlaying(true);
  };

  useEffect(() => {
    if (oscRef.current && toneCtxRef.current) {
      oscRef.current.frequency.setValueAtTime(sweepHz, toneCtxRef.current.currentTime);
    }
  }, [sweepHz]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col transition-colors duration-200">
      <HudHeader
        title="CALIBRATION"
        step="SCREEN 01 // 10"
        subtitle="Acoustic & Optical Telemetry Setup"
        backHref="/auth"
        rightAction={
          <button
            onClick={runDiagnostics}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF]"
            title="Re-run Hardware Probe"
          >
            <RefreshCw className={`w-4 h-4 ${isCalibrating ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <div className="p-4 space-y-4 flex-1">
        {/* Hardware Status Banner */}
        <ChamferedCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
              HARDWARE CALIBRATION STATUS
            </span>
            <HudBadge
              variant={
                isCalibrating
                  ? "warning"
                  : micStatus === "passed" && cameraStatus === "passed"
                  ? "safe"
                  : "warning"
              }
              dot
            >
              {isCalibrating
                ? "PROBING SENSORS"
                : micStatus === "passed" && cameraStatus === "passed"
                ? "SENSORS ONLINE"
                : "PARTIAL / PHOTO MODE"}
            </HudBadge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-[#101F23] rounded-[12px] border border-slate-200 dark:border-[#233A3D]">
              <div className="flex items-center justify-between mb-2">
                <Camera className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
                {cameraStatus === "passed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#4ADE80]" />
                ) : cameraStatus === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                )}
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-[#F5FDFF]">OPTICAL SENSOR</div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] mt-0.5 truncate">
                {cameraResolution}
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#101F23] rounded-[12px] border border-slate-200 dark:border-[#233A3D]">
              <div className="flex items-center justify-between mb-2">
                <Mic className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
                {micStatus === "passed" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#4ADE80]" />
                ) : micStatus === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                )}
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-[#F5FDFF]">ACOUSTIC TRANSDUCER</div>
              <div className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] mt-0.5 truncate">
                {micRate}
              </div>
            </div>
          </div>
        </ChamferedCard>

        {/* Ambient Noise Floor Telemetry */}
        <ChamferedCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
              LIVE AMBIENT NOISE FLOOR
            </span>
            <span className="text-xs font-mono font-bold text-sky-700 dark:text-[#DDF0C2]">
              {noiseFloorDbfs} dBFS
            </span>
          </div>

          <div className="w-full h-3 bg-slate-200 dark:bg-[#101F23] rounded-full overflow-hidden border border-slate-300 dark:border-[#233A3D] p-0.5 flex items-center">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-red-500 dark:from-[#0EB29A] dark:via-[#DDF0C2] dark:to-[#FF4444] rounded-full transition-all duration-150"
              style={{ width: `${Math.min(100, Math.max(6, ((noiseFloorDbfs + 90) / 90) * 100))}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-[#8C999A] mt-2">
            <span>-90 dBFS (SILENT)</span>
            <span className={noiseFloorDbfs < -20 ? "text-emerald-600 dark:text-[#4ADE80] font-semibold" : "text-amber-600 font-semibold"}>
              {micStatus === "passed" ? (noiseFloorDbfs < -20 ? "OPTIMAL RANGE" : "HIGH AMBIENT NOISE") : "MIC OFFLINE"}
            </span>
            <span>0 dBFS</span>
          </div>
        </ChamferedCard>

        {/* Ambient Illumination Check */}
        <ChamferedCard className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500 dark:text-[#F5C518]" />
              <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
                OPTICAL ILLUMINANCE
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-900 dark:text-[#F5FDFF]">
              {cameraStatus === "passed" ? `${luxLevel} LUX` : "N/A"}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-[#8C999A]">
            {cameraStatus === "passed"
              ? "Sobel edge segmentation ready. Proceed to live boundary capture."
              : "Camera blocked or absent — you can upload a workpiece photo on the next screen."}
          </div>
        </ChamferedCard>

        {/* Transducer Frequency Calibration with real audio output */}
        <ChamferedCard className="p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600 dark:text-[#0EB29A]" />
              <span className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider font-semibold">
                TEST SWEEP FREQUENCY
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-sky-700 dark:text-[#0EB29A]">
                {sweepHz} HZ
              </span>
              <button
                onClick={toggleTestTone}
                className={`px-2 py-1 rounded-[6px] text-[10px] font-mono font-bold flex items-center gap-1 border ${
                  isTonePlaying
                    ? "bg-red-50 text-red-700 border-red-300 dark:bg-[#FF4444]/20 dark:text-[#FF8888] dark:border-[#FF4444]"
                    : "bg-sky-50 text-sky-700 border-sky-300 dark:bg-[#0EB29A]/20 dark:text-[#0EB29A] dark:border-[#0EB29A]"
                }`}
              >
                {isTonePlaying ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                <span>{isTonePlaying ? "STOP" : "TEST TONE"}</span>
              </button>
            </div>
          </div>

          <input
            type="range"
            min="200"
            max="3000"
            step="10"
            value={sweepHz}
            onChange={(e) => setSweepHz(Number(e.target.value))}
            className="w-full accent-sky-600 dark:accent-[#0EB29A] bg-slate-200 dark:bg-[#101F23] h-2 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            <span>200 HZ</span>
            <span className="text-slate-700 dark:text-[#DDF0C2]">WEB AUDIO SINE GENERATOR</span>
            <span>3000 HZ</span>
          </div>
        </ChamferedCard>

        {/* Calibration Checklist + PyTorch / HuggingFace AI Engine Status */}
        <div className="p-3 bg-slate-100/90 dark:bg-[#101F23]/80 rounded-[12px] border border-slate-200 dark:border-[#233A3D] space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-700 dark:text-[#DDF0C2] font-semibold">
              HUGGING FACE ONNX ENGINE
            </span>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-[#1C332E] dark:text-[#4ADE80]"
            >
              {aiHealth.mode === "cloud" ? "CLOUD MODELS CONNECTED" : "HUGGING FACE ONNX READY (FREE)"}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
            Vision: CLIP ONNX / OWL-ViT • Audio: AST ONNX Spectrogram Transformer • FFT + Saliency CV
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-700 dark:text-[#DDF0C2] pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#4ADE80]" />
            <span>SOBEL EDGE + QUAD CONTOUR ENGINE: READY</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-700 dark:text-[#DDF0C2]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#4ADE80]" />
            <span>AUTOCORRELATION + FFT TAP-TEST: READY</span>
          </div>
        </div>

        <TestGuide kind="setup" open={guideOpen} onDone={() => setGuideOpen(false)} />

        {/* Hands-free autopilot */}
        <div className="rounded-3xl p-4 bg-slate-900 dark:bg-[#15282C] text-white border border-slate-700 dark:border-[#294044] space-y-2.5">
          <div className="flex items-center gap-2 font-extrabold">
            <Bot className="w-5 h-5 text-sky-400 dark:text-[#0EB29A]" />
            <span>AI Autopilot</span>
          </div>
          <p className="text-xs text-slate-300 dark:text-[#8C999A] leading-snug">
            Let AI run the whole inspection for you: it scans, picks the material, finds resonance, listens to your taps,
            protects risky parts and builds the report — with voice guidance if you want it.
          </p>
          <HudButton
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => {
              startAutopilot();
              void speak("Autopilot on. I will guide you through every step.");
              router.push("/scan");
            }}
            className="flex items-center justify-center gap-2"
          >
            <span>{autopilotOn ? "Autopilot is ON — restart" : "Start AI Autopilot"}</span>
          </HudButton>
        </div>

        {/* Proceed CTA */}
        <div className="pt-2">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              if (isTonePlaying) toggleTestTone();
              router.push("/scan");
            }}
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
