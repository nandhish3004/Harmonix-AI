"use client";

import React, { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Unlock,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Upload,
  Eye,
  Video,
  X,
  Cpu,
} from "lucide-react";
import { HudHeader } from "@/components/ui/HudHeader";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { useBoundaryDetection } from "@/hooks/useBoundaryDetection";
import { segmentPlateWithDinoV2 } from "@/utils/aiClient";

export default function WorkpieceScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const edgeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    polygonCoords,
    isLocked,
    isAutoTracking,
    cameraActive,
    cameraError,
    edgeConfidence,
    aspectRatio,
    areaMm2,
    uploadedImageUrl,
    startVideoTracking,
    setAutoTracking,
    detectOnce,
    processImageFile,
    clearUploadedImage,
    lockBoundary,
    unlockBoundary,
    updateCornerPoint,
    resetDefaultBoundary,
  } = useBoundaryDetection();

  const [activePinIndex, setActivePinIndex] = useState<number | null>(null);
  const [showEdgeOverlay, setShowEdgeOverlay] = useState<boolean>(true);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isAiRunning, setIsAiRunning] = useState<boolean>(false);

  useEffect(() => {
    if (videoRef.current) {
      startVideoTracking(videoRef.current, edgeCanvasRef.current, containerRef.current);
    }
  }, [startVideoTracking]);

  // 🤖 AUTOMATION 1: if there's no camera/photo after 4s, load a sample board so users never get stuck
  const userTouchedRef = useRef<boolean>(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!userTouchedRef.current && !cameraActive && !uploadedImageUrl) {
        handleLoadSamplePcb();
        setScanMessage("No camera found — I loaded a sample board so you can try the app.");
      }
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, uploadedImageUrl]);

  // 🤖 AUTOMATION 2b: for photos/sample boards, lock automatically once confidence is good
  useEffect(() => {
    if (!uploadedImageUrl || isLocked || edgeConfidence < 60) return;
    const t = setTimeout(() => {
      lockBoundary();
      setScanMessage("✅ AI outlined your board. Tap Continue — or Unlock to adjust.");
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedImageUrl, edgeConfidence, isLocked]);

  // 🤖 AUTOMATION 2: auto-lock the outline once the AI detection stays stable for ~1 second
  const lastPolyRef = useRef<{ x: number; y: number }[] | null>(null);
  const stableCountRef = useRef<number>(0);
  useEffect(() => {
    if (isLocked || edgeConfidence < 60 || activePinIndex !== null) {
      stableCountRef.current = 0;
      lastPolyRef.current = polygonCoords;
      return;
    }
    const prev = lastPolyRef.current;
    if (prev && prev.length === polygonCoords.length) {
      const maxDelta = polygonCoords.reduce(
        (m, p, i) => Math.max(m, Math.hypot(p.x - prev[i].x, p.y - prev[i].y)),
        0
      );
      stableCountRef.current = maxDelta < 4 ? stableCountRef.current + 1 : 0;
    }
    lastPolyRef.current = polygonCoords;
    if (stableCountRef.current >= 14) {
      lockBoundary();
      stableCountRef.current = 0;
      setScanMessage("✅ AI locked onto your board automatically. Tap Continue!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygonCoords, edgeConfidence, isLocked, activePinIndex]);

  const handlePointerDown = (index: number) => {
    userTouchedRef.current = true;
    if (isLocked) return;
    setActivePinIndex(index);
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePinIndex === null || isLocked || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(rect.width - 10, e.clientX - rect.left));
    const y = Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top));
    updateCornerPoint(activePinIndex, Math.round(x), Math.round(y));
  };

  const handlePointerUp = () => {
    setActivePinIndex(null);
  };

  const handleAutoSegment = async () => {
    if (isLocked) unlockBoundary();
    setIsAiRunning(true);
    try {
      // Try Hugging Face DINOv2 backend first if video/image frame is available
      if (containerRef.current && (cameraActive || uploadedImageUrl)) {
        const snap = document.createElement("canvas");
        snap.width = 360;
        snap.height = 380;
        const sCtx = snap.getContext("2d");
        if (sCtx) {
          if (uploadedImageUrl) {
            const imgEl = new Image();
            imgEl.src = uploadedImageUrl;
            await new Promise((r) => { imgEl.onload = r; });
            sCtx.drawImage(imgEl, 0, 0, 360, 380);
          } else if (videoRef.current && videoRef.current.readyState >= 2) {
            sCtx.drawImage(videoRef.current, 0, 0, 360, 380);
          }
          const blob = await new Promise<Blob | null>((r) => snap.toBlob(r, "image/png"));
          if (blob) {
            const rect = containerRef.current.getBoundingClientRect();
            const aiRes = await segmentPlateWithDinoV2(blob, Math.round(rect.width), Math.round(rect.height));
            if (aiRes && aiRes.corners.length === 4) {
              aiRes.corners.forEach((c, idx) => updateCornerPoint(idx, c.x, c.y));
              setScanMessage(`HuggingFace ${aiRes.model} segmented workpiece (${aiRes.confidence}% conf).`);
              setTimeout(() => setScanMessage(null), 3500);
              return;
            }
          }
        }
      }

      // Instant Browser Sobel CV fallback
      const found = detectOnce();
      if (found) {
        setScanMessage("Browser Sobel CV snapped P1–P4 to strongest workpiece edges.");
      } else if (!cameraActive && !uploadedImageUrl) {
        setScanMessage("No camera/photo yet — click SAMPLE PCB or PHOTO below to test CV!");
      } else {
        setScanMessage("Low edge contrast — adjust lighting or drag P1–P4 manually.");
      }
      setTimeout(() => setScanMessage(null), 3500);
    } finally {
      setIsAiRunning(false);
    }
  };

  const handleLoadSamplePcb = () => {
    if (isLocked) unlockBoundary();
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 500;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // Neutral light-gray workbench background
    ctx.fillStyle = "#E2E8F0";
    ctx.fillRect(0, 0, 480, 500);

    // Slight perspective PCB rectangle
    ctx.fillStyle = "#0F5132";
    ctx.beginPath();
    ctx.moveTo(75, 85);
    ctx.lineTo(410, 72);
    ctx.lineTo(422, 420);
    ctx.lineTo(62, 412);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Copper traces & IC chips
    ctx.strokeStyle = "#20C997";
    ctx.lineWidth = 2;
    for (let y = 130; y < 370; y += 35) {
      ctx.beginPath();
      ctx.moveTo(105, y);
      ctx.lineTo(375, y);
      ctx.stroke();
    }
    // BGA MCU
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(190, 195, 95, 95);
    ctx.fillStyle = "#CBD5E1";
    ctx.font = "bold 12px monospace";
    ctx.fillText("MCU-BGA", 210, 246);
    // Crystal
    ctx.fillStyle = "#94A3B8";
    ctx.fillRect(120, 140, 44, 24);
    // Mounting holes
    ctx.fillStyle = "#EAB308";
    [[95, 105], [388, 95], [398, 398], [85, 390]].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    c.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "sample-pcb.png", { type: "image/png" });
        processImageFile(file);
        setScanMessage("Sample FR4 PCB loaded — Sobel CV extracted P1–P4 automatically.");
        setTimeout(() => setScanMessage(null), 3500);
      }
    }, "image/png");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    userTouchedRef.current = true;
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
      setScanMessage("Image loaded — Sobel edge contour extracted.");
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  const handleConfirmAndProceed = () => {
    lockBoundary();
    if (typeof window !== "undefined") {
      localStorage.setItem("harmonix_boundary", JSON.stringify(polygonCoords));
      localStorage.setItem("harmonix_plate_area", String(areaMm2));
      localStorage.setItem("harmonix_aspect_ratio", String(aspectRatio));
    }
    router.push("/material");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] flex flex-col select-none transition-colors duration-200">
      <HudHeader
        title="EDGE DETECTION"
        step="SCREEN 02 // 10"
        subtitle="Workpiece Boundary Segmentation"
        backHref="/setup"
        rightAction={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowEdgeOverlay((v) => !v)}
              className={`w-8 h-8 flex items-center justify-center rounded-[8px] border transition-colors ${
                showEdgeOverlay
                  ? "bg-sky-50 border-sky-300 text-sky-700 dark:bg-[#0EB29A]/20 dark:border-[#0EB29A] dark:text-[#0EB29A]"
                  : "bg-slate-100 dark:bg-[#15282C] border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A]"
              }`}
              title="Toggle Sobel Edge Overlay"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={resetDefaultBoundary}
              className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-slate-100 dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF] hover:border-slate-300 dark:hover:border-[#0EB29A]"
              title="Reset Pins"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* AR Viewport Frame */}
        <div
          ref={containerRef}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="relative w-full h-[380px] bg-slate-200 dark:bg-[#101F23] rounded-[16px] border border-slate-300 dark:border-[#294044] overflow-hidden flex items-center justify-center cursor-crosshair touch-none shadow-sm"
        >
          {/* Live camera stream */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${
              uploadedImageUrl ? "hidden" : cameraActive ? "opacity-90" : "opacity-20"
            }`}
          />

          {/* Uploaded image fallback */}
          {uploadedImageUrl && (
            <img
              src={uploadedImageUrl}
              alt="Workpiece target"
              className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
          )}

          {/* Real-time Sobel CV Edge Detection Overlay */}
          <canvas
            ref={edgeCanvasRef}
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity ${
              showEdgeOverlay ? "opacity-80" : "opacity-0"
            }`}
          />

          {/* AR grid */}
          <div className="absolute inset-0 ar-grid-bg opacity-35 dark:opacity-25 pointer-events-none" />

          {/* No-camera helper */}
          {!cameraActive && !uploadedImageUrl && (
            <div className="z-10 text-center px-6 py-3 bg-white/90 dark:bg-[#0D191C]/90 rounded-[12px] border border-slate-300 dark:border-[#294044] max-w-[260px] shadow-sm">
              <Video className="w-5 h-5 text-sky-600 dark:text-[#0EB29A] mx-auto mb-1" />
              <div className="text-[11px] font-mono font-bold text-slate-900 dark:text-[#F5FDFF]">
                {cameraError ? "CAMERA UNAVAILABLE" : "INITIALIZING OPTICS..."}
              </div>
              <p className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A] mt-0.5">
                Upload a PCB/plate photo below or drag P1–P4 manually.
              </p>
            </div>
          )}

          {/* SVG Polygon overlay connecting P1 -> P2 -> P3 -> P4 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <polygon
              points={polygonCoords.map((p) => `${p.x},${p.y}`).join(" ")}
              className={
                isLocked
                  ? "fill-emerald-500/15 stroke-emerald-600 dark:fill-[#4ADE80]/15 dark:stroke-[#4ADE80]"
                  : "fill-sky-500/10 stroke-sky-600 dark:fill-[#0EB29A]/15 dark:stroke-[#0EB29A]"
              }
              strokeWidth="2.5"
              strokeDasharray={isLocked ? "none" : "5 5"}
            />
          </svg>

          {/* Draggable Corner Pins */}
          {polygonCoords.map((pt, idx) => (
            <div
              key={idx}
              onPointerDown={() => handlePointerDown(idx)}
              style={{
                left: `${pt.x}px`,
                top: `${pt.y}px`,
                transform: "translate(-50%, -50%)",
              }}
              className={`absolute w-7 h-7 rounded-full flex items-center justify-center font-mono text-[10px] font-bold cursor-grab active:cursor-grabbing transition-transform ${
                activePinIndex === idx ? "scale-125 z-30" : "z-20"
              } ${
                isLocked
                  ? "bg-emerald-600 text-white shadow-md dark:bg-[#4ADE80] dark:text-[#0D191C]"
                  : "bg-sky-600 text-white shadow-md dark:bg-[#0EB29A] dark:text-[#0D191C]"
              }`}
            >
              P{idx + 1}
            </div>
          ))}

          {/* Live Floating Telemetry Overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
            <HudBadge variant={isLocked ? "safe" : cameraActive || uploadedImageUrl ? "teal" : "warning"} dot>
              {isLocked
                ? "POLYGON LOCKED"
                : uploadedImageUrl
                ? `IMAGE CV // ${edgeConfidence}% CONF`
                : cameraActive
                ? isAutoTracking
                  ? `LIVE CV TRACKING // ${edgeConfidence}%`
                  : "MANUAL PIN MODE"
                : "MANUAL MODE"}
            </HudBadge>
            <div className="bg-white/95 dark:bg-[#0D191C]/85 backdrop-blur-md px-2.5 py-1 rounded-[8px] border border-slate-200 dark:border-[#294044] text-[10px] font-mono text-slate-600 dark:text-[#8C999A] shadow-xs">
              RATIO: <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">{aspectRatio}:1</span> // AREA:{" "}
              <span className="text-sky-700 dark:text-[#DDF0C2] font-bold">{areaMm2} mm²</span>
            </div>
          </div>

          {uploadedImageUrl && (
            <button
              onClick={clearUploadedImage}
              className="absolute top-3 right-3 z-20 px-2 py-1 rounded-[6px] bg-white/90 dark:bg-[#0D191C]/90 border border-slate-300 dark:border-[#294044] text-[10px] font-mono text-slate-700 dark:text-[#F5FDFF] flex items-center gap-1"
            >
              <X className="w-3 h-3" /> CLEAR PHOTO
            </button>
          )}
        </div>

        {scanMessage && (
          <div className="px-3 py-2 rounded-[8px] bg-sky-50 dark:bg-[#15282C] border border-sky-200 dark:border-[#0EB29A]/50 text-[11px] font-mono text-sky-800 dark:text-[#DDF0C2]">
            {scanMessage}
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="grid grid-cols-4 gap-2">
          <HudButton
            variant="secondary"
            size="md"
            isLoading={isAiRunning}
            onClick={handleAutoSegment}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-[#DDF0C2]" />
            <span className="text-[10px]">AI SNAP</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            onClick={handleLoadSamplePcb}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-600 dark:text-[#4ADE80]" />
            <span className="text-[10px]">SAMPLE</span>
          </HudButton>

          <HudButton
            variant="secondary"
            size="md"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
            <span className="text-[10px]">PHOTO</span>
          </HudButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <HudButton
            variant={isLocked ? "safe" : "secondary"}
            size="md"
            onClick={isLocked ? unlockBoundary : lockBoundary}
            className="flex items-center justify-center gap-1 px-1.5"
          >
            {isLocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-emerald-600 dark:text-inherit" />
                <span className="text-[10px]">UNLOCK</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-sky-600 dark:text-[#0EB29A]" />
                <span className="text-[10px]">LOCK</span>
              </>
            )}
          </HudButton>
        </div>

        {/* Live CV Auto-Track toggle when camera is active */}
        {cameraActive && !uploadedImageUrl && !isLocked && (
          <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-[#15282C] rounded-[10px] border border-slate-200 dark:border-[#294044] text-[11px] font-mono">
            <span className="text-slate-600 dark:text-[#8C999A]">CONTINUOUS LIVE CV TRACKING</span>
            <button
              onClick={() => setAutoTracking(!isAutoTracking)}
              className={`px-2.5 py-0.5 rounded font-bold border ${
                isAutoTracking
                  ? "bg-sky-600 text-white border-sky-600 dark:bg-[#0EB29A] dark:text-[#0D191C] dark:border-[#0EB29A]"
                  : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-[#101F23] dark:text-[#8C999A] dark:border-[#294044]"
              }`}
            >
              {isAutoTracking ? "ON" : "PAUSED"}
            </button>
          </div>
        )}

        {/* Geometric Telemetry Card */}
        <ChamferedCard className="p-3.5 space-y-2">
          <div className="text-xs font-mono text-slate-600 dark:text-[#8C999A] uppercase tracking-wider flex items-center justify-between font-semibold">
            <span>EDGE VECTOR COORDINATES</span>
            <span className="text-sky-600 dark:text-[#0EB29A]">SOBEL QUAD FIT</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            {polygonCoords.map((pt, i) => (
              <div
                key={i}
                className="p-2 bg-slate-50 dark:bg-[#101F23] rounded-[8px] border border-slate-200 dark:border-[#233A3D] flex justify-between"
              >
                <span className="text-slate-500 dark:text-[#8C999A]">PIN P{i + 1}:</span>
                <span className="text-slate-900 dark:text-[#F5FDFF] font-bold">
                  [{pt.x}, {pt.y}]
                </span>
              </div>
            ))}
          </div>
        </ChamferedCard>

        {/* Bottom CTA to proceed */}
        <div className="pt-1 mt-auto">
          <HudButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleConfirmAndProceed}
            className="flex items-center justify-center gap-2"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </HudButton>
        </div>
      </div>
    </div>
  );
}
